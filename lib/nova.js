'use strict';
const fs = require('fs');
const path = require('path');
/*
 * Perfil "Nova": Fabric + los mods de rendimiento que usan los packs optimizados (Keo Optimized y similares).
 * Todo viene de Modrinth. Si un mod no existe para esa versión de Minecraft se salta y el resto se instala igual.
 */

// slug de Modrinth -> para qué sirve (se muestra en la instancia).
const NOVA_MODS = [
  ['sodium', 'Motor de render: muchos más FPS'],
  ['lithium', 'Optimiza la lógica del juego'],
  ['ferrite-core', 'Menos uso de memoria RAM'],
  ['modernfix', 'Arranque rápido y menos tirones'],
  ['entityculling', 'No dibuja lo que no se ve'],
  ['scalablelux', 'Iluminación mucho más rápida'],
  ['immersive-optimization', 'Menos carga con muchas entidades'],
  ['badoptimizations', 'Pequeñas mejoras de rendimiento'],
  ['saturn', 'Menos memoria en entidades y modelos'],
  ['reeses-sodium-options', 'Menú de vídeo claro para Sodium'],
  ['iris', 'Shaders (compatible con Sodium)']
];

const PRESETS = ['nova', 'optifine'];

// Instala los mods del preset. install(slug) debe instalar un mod (lanza error si no hay versión compatible).
async function installNovaMods(install, { onStatus = () => {}, mods = NOVA_MODS } = {}) {
  const installed = [];
  const skipped = [];
  for (const [slug] of mods) {
    onStatus(`Instalando ${slug}…`);
    try {
      const r = await install(slug);
      for (const f of (r && r.installed) || []) installed.push(f);
    } catch {
      skipped.push(slug);
    }
  }
  return { installed: [...new Set(installed)], skipped };
}

// ---- Nova Client (el mod propio): se baja de la última release de GitHub ----
const CLIENT_REPO = 'javierroman94/Nova-Client';

// Elige el .jar de la release que sirve para esa versión de Minecraft (nova-client-X.Y.Z+mc1.21.1.jar).
function pickClientAsset(release, mc) {
  const want = new RegExp(`^nova-client-[0-9A-Za-z._-]+\\+mc${String(mc).replace(/[^0-9A-Za-z]/g, (c) => '\\' + c)}\\.jar$`);
  for (const a of (release && release.assets) || []) {
    if (!a || !want.test(String(a.name))) continue;
    try {
      const u = new URL(a.browser_download_url);
      if (u.protocol === 'https:' && u.hostname === 'github.com' && u.pathname.startsWith(`/${CLIENT_REPO}/releases/download/`)) return { name: a.name, url: a.browser_download_url };
    } catch {}
  }
  return null;
}

// Descarga Nova Client en la carpeta mods de la instancia (reemplaza versiones anteriores). Devuelve el nombre o null.
async function installNovaClient({ request, download, dir, mc }) {
  const release = await request(`https://api.github.com/repos/${CLIENT_REPO}/releases/latest`);
  const asset = pickClientAsset(release, mc);
  if (!asset) return null;
  const mods = path.join(dir, 'mods');
  fs.mkdirSync(mods, { recursive: true });
  for (const f of fs.readdirSync(mods)) if (/^nova-client-.*\.jar(\.disabled)?$/i.test(f) && f !== asset.name) fs.rmSync(path.join(mods, f), { force: true });
  const dest = path.join(mods, asset.name);
  if (!fs.existsSync(dest)) fs.writeFileSync(dest, await download(asset.url));
  return asset.name;
}


// ---- Sodium e Iris: elegir una pareja que no se rompa entre sí ----
// Sodium a veces sale hoy con «rompe Iris <= X» y la última Iris estable es más vieja: el juego no abre.
// Se leen los fabric.mod.json de los jars, se prueban versiones anteriores de Sodium y, si ninguna sirve, se quita Iris.
const { readZip } = require('./zip');

function modInfoFromJar(buf) {
  try {
    const z = readZip(buf);
    if (!z.has('fabric.mod.json')) return null;
    const j = JSON.parse(z.read('fabric.mod.json').toString('utf8').replace(/^﻿/, ''));
    return { id: j.id, version: String(j.version || ''), depends: j.depends || {}, breaks: j.breaks || {} };
  } catch { return null; }
}

function verParts(v) { return String(v).split('+')[0].split('-')[0].split('.').map((x) => (/^\d+$/.test(x) ? Number(x) : 0)); }
function verCmp(a, b) { const x = verParts(a), y = verParts(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d < 0 ? -1 : 1; } return 0; }

// ¿La versión cumple UNA condición de Fabric ("<=1.12.0", ">=0.9", "0.9.x", "*", "1.2.3")?
function matchesOne(version, cond) {
  const c = String(cond).trim();
  if (!c || c === '*') return true;
  let m = /^(<=|>=|<|>|=|~|\^)?\s*(.+)$/.exec(c);
  if (!m) return false;
  const op = m[1] || '='; const target = m[2].trim();
  if (/[xX*]$/.test(target)) { const base = verParts(target.replace(/[.][xX*]$/, '')); const v = verParts(version); return base.every((n, i) => v[i] === n); }
  const k = verCmp(version, target);
  if (op === '<=') return k <= 0;
  if (op === '>=') return k >= 0;
  if (op === '<') return k < 0;
  if (op === '>') return k > 0;
  if (op === '~' || op === '^') { const t = verParts(target); const v = verParts(version); return k >= 0 && v[0] === t[0] && (op === '^' || v[1] === t[1]); }
  return k === 0;
}
function matchesRange(version, range) {
  const list = Array.isArray(range) ? range : [range];
  return list.some((r) => String(r).split(/\s+/).filter(Boolean).every((c) => matchesOne(version, c)));
}

// Devuelve el problema entre Sodium e Iris, o null si conviven bien.
function sodiumIrisConflict(sodium, iris) {
  if (!sodium || !iris) return null;
  if (sodium.breaks.iris && matchesRange(iris.version, sodium.breaks.iris)) return `Sodium ${sodium.version} no funciona con Iris ${iris.version}`;
  if (iris.breaks.sodium && matchesRange(sodium.version, iris.breaks.sodium)) return `Iris ${iris.version} no funciona con Sodium ${sodium.version}`;
  if (iris.depends.sodium && !matchesRange(sodium.version, iris.depends.sodium)) return `Iris ${iris.version} necesita otra versión de Sodium`;
  return null;
}

/* Revisa <modsDir>: si Sodium e Iris chocan, prueba versiones anteriores de Sodium y, si no hay ninguna, quita Iris.
   deps: { listSodium(): [{ version_number, files:[{url,filename,primary}] }], download(url): Buffer, log(text) }.
   Devuelve { changed, action } (action: 'sodium' | 'iris-removed' | '') */
async function fixSodiumIris(modsDir, deps) {
  let names = [];
  try { names = fs.readdirSync(modsDir).filter((f) => /\.jar$/i.test(f)); } catch { return { changed: false, action: '' }; }
  const read = (f) => { try { return modInfoFromJar(fs.readFileSync(path.join(modsDir, f))); } catch { return null; } };
  let sodiumFile = null, irisFile = null, sodium = null, iris = null;
  for (const f of names) { const i = read(f); if (!i) continue; if (i.id === 'sodium') { sodiumFile = f; sodium = i; } else if (i.id === 'iris') { irisFile = f; iris = i; } }
  const problem = sodiumIrisConflict(sodium, iris);
  if (!problem) return { changed: false, action: '' };
  deps.log(`[Nova] ${problem}; buscando una pareja compatible…`);
  let versions = [];
  try { versions = (await deps.listSodium()) || []; } catch {}
  for (const v of versions.slice(0, 12)) {
    const file = (v.files || []).find((x) => x.primary) || (v.files || [])[0];
    if (!file || !/^https:\/\/cdn\.modrinth\.com\//.test(file.url) || !/^[\w.+\-]+\.jar$/.test(file.filename)) continue;
    let buf;
    try { buf = await deps.download(file.url); } catch { continue; }
    const cand = modInfoFromJar(buf);
    if (!cand || cand.id !== 'sodium' || sodiumIrisConflict(cand, iris)) continue;
    fs.writeFileSync(path.join(modsDir, file.filename), buf);
    if (sodiumFile !== file.filename) fs.rmSync(path.join(modsDir, sodiumFile), { force: true });
    deps.log(`[Nova] Sodium cambiado a ${cand.version} para que funcione con Iris ${iris.version}.`);
    return { changed: true, action: 'sodium' };
  }
  fs.rmSync(path.join(modsDir, irisFile), { force: true });
  deps.log(`[Nova] No hay una versión de Sodium compatible con Iris ${iris.version}; se quitó Iris (los shaders) para que el juego abra. Se volverá a poder usar cuando Iris se actualice.`);
  return { changed: true, action: 'iris-removed' };
}

module.exports = { NOVA_MODS, PRESETS, CLIENT_REPO, installNovaMods, pickClientAsset, installNovaClient, modInfoFromJar, matchesRange, sodiumIrisConflict, fixSodiumIris };
