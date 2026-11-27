#!/usr/bin/env node
'use strict';
/*
 * Arma data/nova-loader.json: para cada versión de Minecraft con Nova Client, la lista de mods del loader Nova
 * en versiones que se llevan bien entre sí (lee el fabric.mod.json de cada .jar: depends y breaks).
 * Si algo choca prueba versiones anteriores; si no hay arreglo, deja fuera el mod menos importante.
 * Uso: node tools/nova-loader.js [--only 1.21.1,1.20.1]
 * La versión de Nova (1.0.N) sube sola cuando cambia algún archivo.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readZip } = require('../lib/zip');
const { NOVA_MODS, matchesRange } = require('../lib/nova');

const API = 'https://api.modrinth.com/v2';
const UA = 'javierroman94/Nova-PX-Event-Launcher (nova-loader)';
const OUT = path.join(__dirname, '..', 'data', 'nova-loader.json');
const CLIENT_REPO = 'javierroman94/Nova-Client';
// Ids que pone el propio juego o Fabric: no son mods de la lista.
const BUILTIN = new Set(['minecraft', 'java', 'fabricloader', 'fabric-loader', 'mixinextras']);
const MAX_TRIES = 10;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, asBuffer = false) {
  for (let i = 0; i < 6; i++) {
    const headers = { 'User-Agent': UA };
    if (process.env.GITHUB_TOKEN && url.startsWith('https://api.github.com/')) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const r = await fetch(url, { headers });
    if (r.status === 429 || r.status >= 500) { await sleep(2000 * (i + 1)); continue; }
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return asBuffer ? Buffer.from(await r.arrayBuffer()) : r.json();
  }
  throw new Error(`sin respuesta: ${url}`);
}

// Lee el fabric.mod.json de un .jar y de los .jar que trae dentro (Fabric API trae sus módulos así).
function jarInfo(buf, depth = 0) {
  let z;
  try { z = readZip(buf); } catch { return null; }
  if (!z.has('fabric.mod.json')) return null;
  let j;
  try { j = JSON.parse(z.read('fabric.mod.json').toString('utf8').replace(/^\uFEFF/, '')); } catch { return null; }
  const info = { id: String(j.id || ''), version: String(j.version || ''), depends: j.depends || {}, breaks: j.breaks || {}, provides: new Map() };
  info.provides.set(info.id, info.version);
  for (const p of Array.isArray(j.provides) ? j.provides : []) { const id = typeof p === 'string' ? p : p && p.id; if (id) info.provides.set(id, info.version); }
  if (depth < 2) {
    for (const n of Array.isArray(j.jars) ? j.jars : []) {
      const file = n && n.file;
      if (!file || !z.has(file)) continue;
      try {
        const sub = jarInfo(z.read(file), depth + 1);
        if (sub) for (const [k, v] of sub.provides) if (!info.provides.has(k)) info.provides.set(k, v);
      } catch {}
    }
  }
  return info;
}

const jarCache = new Map();
async function jarFor(version) {
  const file = (version.files || []).find((f) => f.primary) || (version.files || [])[0];
  if (!file || !/^https:\/\/cdn\.modrinth\.com\/data\//.test(file.url) || !(file.hashes && file.hashes.sha512)) return null;
  if (!jarCache.has(file.url)) {
    const buf = await get(file.url, true);
    if (crypto.createHash('sha512').update(buf).digest('hex') !== file.hashes.sha512) throw new Error(`huella distinta ${file.url}`);
    jarCache.set(file.url, { info: jarInfo(buf), size: buf.length });
  }
  const c = jarCache.get(file.url);
  return c.info ? { file, info: c.info, size: c.size } : null;
}

async function candidates(project, mc) {
  const q = `loaders=${encodeURIComponent('["fabric"]')}&game_versions=${encodeURIComponent(JSON.stringify([mc]))}`;
  const list = await get(`${API}/project/${encodeURIComponent(project)}/version?${q}`);
  const rel = list.filter((v) => v.version_type === 'release');
  const other = list.filter((v) => v.version_type !== 'release');
  return [...rel, ...other].slice(0, MAX_TRIES);
}

async function resolve(mc) {
  // nodo: { slug, project, prio, cands, idx, cur }
  const nodes = new Map();
  async function add(project, slug, prio, depth) {
    if (nodes.has(project) || depth > 3) return;
    const cands = await candidates(project, mc);
    if (!cands.length) return;
    const node = { slug, title: null, project: cands[0].project_id, prio, cands, idx: 0, cur: null };
    nodes.set(project, node);
    node.cur = await jarFor(cands[0]);
    for (const d of cands[0].dependencies || []) {
      if (d.dependency_type === 'required' && d.project_id) await add(d.project_id, null, prio, depth + 1);
    }
  }
  for (let i = 0; i < NOVA_MODS.length; i++) {
    const slug = NOVA_MODS[i][0];
    const proj = await get(`${API}/project/${slug}`).catch(() => null);
    if (proj) await add(proj.id, slug, i, 0);
  }
  for (const n of nodes.values()) {
    const p = await get(`${API}/project/${n.project}`).catch(() => null);
    if (!n.slug) n.slug = (p && p.slug) || n.project.toLowerCase();
    n.title = (p && p.title) || n.slug;
  }
  const dropped = [];
  const live = () => [...nodes.values()].filter((n) => n.cur);

  function problems() {
    const provided = new Map();
    const owner = new Map();
    for (const n of live()) for (const [id, v] of n.cur.info.provides) { provided.set(id, v); owner.set(id, n); }
    for (const n of live()) {
      for (const [id, range] of Object.entries(n.cur.info.depends)) {
        if (BUILTIN.has(id)) continue;
        if (!provided.has(id)) return { kind: 'missing', a: n, id };
        if (!matchesRange(provided.get(id), range)) return { kind: 'range', a: n, b: owner.get(id), id };
      }
      for (const [id, range] of Object.entries(n.cur.info.breaks)) {
        if (provided.has(id) && owner.get(id) !== n && matchesRange(provided.get(id), range)) return { kind: 'breaks', a: n, b: owner.get(id), id };
      }
    }
    return null;
  }
  const sameProblem = (p, q) => q && q.kind === p.kind && q.a === p.a && q.id === p.id;
  async function tryOlder(node, p) {
    const start = node.idx;
    const keep = node.cur;
    for (let i = start + 1; i < node.cands.length; i++) {
      const cur = await jarFor(node.cands[i]).catch(() => null);
      if (!cur || cur.info.id !== keep.info.id) continue;
      node.idx = i; node.cur = cur;
      if (!sameProblem(p, problems())) return true;
    }
    node.idx = start; node.cur = keep;
    return false;
  }
  for (let guard = 0; guard < 40; guard++) {
    const p = problems();
    if (!p) break;
    let fixed = false;
    if (p.b) fixed = (await tryOlder(p.b, p)) || (await tryOlder(p.a, p));
    if (!fixed) {
      const loser = !p.b ? p.a : (p.a.prio >= p.b.prio ? p.a : p.b);
      dropped.push(loser.slug);
      console.log(`  ${mc}: fuera ${loser.slug} (${p.kind} ${p.id})`);
      loser.cur = null;
    }
  }
  if (problems()) throw new Error(`${mc}: no se pudo dejar una lista sin choques`);
  const mods = live().sort((x, y) => x.prio - y.prio).map((n) => {
    const v = n.cands[n.idx];
    return { slug: n.slug, id: n.cur.info.id, project: n.project, name: String(n.title).slice(0, 60), version: v.version_number, file: n.cur.file.filename, url: n.cur.file.url, sha512: n.cur.file.hashes.sha512, size: n.cur.size };
  });
  return { mods, dropped };
}

async function mcVersions() {
  const rel = await get(`https://api.github.com/repos/${CLIENT_REPO}/releases/latest`);
  const set = new Set();
  for (const a of rel.assets || []) { const m = /\+mc([0-9][0-9A-Za-z._-]*)\.jar$/.exec(a.name); if (m && !/sources/.test(a.name)) set.add(m[1]); }
  return [...set];
}

(async () => {
  const onlyArg = process.argv.indexOf('--only');
  const list = onlyArg > 0 ? process.argv[onlyArg + 1].split(',') : await mcVersions();
  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch {}
  const mcOut = onlyArg > 0 && prev ? { ...prev.mc } : {};
  for (const mc of list) {
    try {
      console.log(`Minecraft ${mc}…`);
      const r = await resolve(mc);
      if (r.mods.length) mcOut[mc] = r;
    } catch (err) {
      console.log(`  ${mc}: ${err.message}`);
      if (prev && prev.mc && prev.mc[mc]) mcOut[mc] = prev.mc[mc]; // se conserva la lista anterior
    }
  }
  const sorted = Object.fromEntries(Object.keys(mcOut).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).map((k) => [k, mcOut[k]]));
  const sig = (m) => crypto.createHash('sha256').update(JSON.stringify(Object.entries(m).map(([k, v]) => [k, v.mods.map((x) => x.sha512)]))).digest('hex');
  let version = '1.0.0';
  if (prev && /^\d+\.\d+\.\d+$/.test(prev.version)) {
    const [a, b, c] = prev.version.split('.').map(Number);
    version = sig(prev.mc || {}) === sig(sorted) ? prev.version : `${a}.${b}.${c + 1}`;
    if (version === prev.version) { console.log(`Sin cambios: Nova ${version}.`); return; }
  }
  fs.writeFileSync(OUT, JSON.stringify({ version, generated: new Date().toISOString(), mc: sorted }, null, 1) + '\n');
  console.log(`Nova ${version}: ${Object.keys(sorted).length} versiones de Minecraft.`);
})().catch((e) => { console.error(e); process.exit(1); });
