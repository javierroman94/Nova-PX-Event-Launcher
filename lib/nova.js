'use strict';
const fs = require('fs');
const path = require('path');
/*
 * Perfil "Nova": Fabric + los mods de rendimiento que usan los packs optimizados (Keo Optimized y similares).
 * Todo viene de Modrinth. Si un mod no existe para esa versión de Minecraft se salta y el resto se instala igual.
 */

// slug de Modrinth -> para qué sirve (se muestra en la instancia).
const NOVA_MODS = [
  ['fabric-api', 'Base que necesitan Nova Client y muchos mods Fabric'],
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
  ['iris', 'Shaders (compatible con Sodium)'],
  ['moreculling', 'Descarta más caras que no se ven: menos carga'],
  ['ixeris', 'Entrada y ventana más fluidas (menos tirones del ratón)'],
  ['modmenu', 'Lista y ajustes de tus mods dentro del juego'],
  ['cloth-config', 'Pantallas de ajustes que usan varios mods']
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
    // eslint-disable-next-line no-irregular-whitespace -- el carácter es el BOM (U+FEFF) que hay que quitar del JSON
    const j = JSON.parse(z.read('fabric.mod.json').toString('utf8').replace(/^﻿/, ''));
    return { id: j.id, version: String(j.version || ''), depends: j.depends || {}, breaks: j.breaks || {}, provides: Array.isArray(j.provides) ? j.provides.map((x) => (typeof x === 'string' ? x : x && x.id)).filter(Boolean) : [] };
  } catch { return null; }
}

function verParts(v) { return String(v).split('+')[0].split('-')[0].split('.').map((x) => (/^\d+$/.test(x) ? Number(x) : 0)); }
// Versión previa ("beta.3" en 0.9.3-beta.3): una previa es menor que la versión final, como en semver.
function verPre(v) { const m = /^[^+]*?-([^+]+)/.exec(String(v)); return m ? m[1].split('.') : null; }
function verCmp(a, b) {
  const x = verParts(a), y = verParts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d < 0 ? -1 : 1; }
  const pa = verPre(a), pb = verPre(b);
  if (!pa && !pb) return 0;
  if (!pa) return 1;
  if (!pb) return -1;
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const u = pa[i], w = pb[i];
    if (u === undefined) return -1;
    if (w === undefined) return 1;
    const nu = /^\d+$/.test(u), nw = /^\d+$/.test(w);
    if (nu && nw) { if (Number(u) !== Number(w)) return Number(u) < Number(w) ? -1 : 1; } else if (u !== w) return u < w ? -1 : 1;
  }
  return 0;
}

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

// Complementos de Sodium que son solo interfaz: si exigen otra versión de Sodium, se quitan antes que Iris o Sodium.
const SODIUM_ADDONS = new Set(['reeses-sodium-options', 'sodium-extra', 'sodiumextra', 'sodium-options-api']);

// Mods (que no sean Sodium ni Iris) que piden una versión de Sodium que no es la dada.
function sodiumDependentsBroken(sodium, others) {
  if (!sodium) return [];
  return others.filter((o) => {
    const r = o.info.depends && o.info.depends.sodium;
    const b = o.info.breaks && o.info.breaks.sodium;
    return (r && !matchesRange(sodium.version, r)) || (b && matchesRange(sodium.version, b));
  });
}

/* Revisa <modsDir>: si Sodium choca con Iris o con un mod que depende de él, prueba otra versión de Sodium;
   los complementos de interfaz que no encajen se quitan y, si nada sirve, se quita Iris.
   deps: { listSodium(): [{ version_number, files:[{url,filename,primary}] }], download(url): Buffer, log(text) }.
   Devuelve { changed, action } (action: 'sodium' | 'iris-removed' | 'addons-removed' | '') */
async function fixSodiumIris(modsDir, deps) {
  let names = [];
  try { names = fs.readdirSync(modsDir).filter((f) => /\.jar$/i.test(f)); } catch { return { changed: false, action: '' }; }
  const read = (f) => { try { return modInfoFromJar(fs.readFileSync(path.join(modsDir, f))); } catch { return null; } };
  let sodiumFile = null, irisFile = null, sodium = null, iris = null;
  const others = [];
  for (const f of names) {
    const i = read(f); if (!i) continue;
    if (i.id === 'sodium') { sodiumFile = f; sodium = i; } else if (i.id === 'iris') { irisFile = f; iris = i; } else others.push({ file: f, info: i });
  }
  if (!sodium) return { changed: false, action: '' };
  const irisProblem = sodiumIrisConflict(sodium, iris);
  const broken = sodiumDependentsBroken(sodium, others);
  if (!irisProblem && !broken.length) return { changed: false, action: '' };
  const why = irisProblem || `${broken.map((b) => b.info.id).join(', ')} necesita otra versión de Sodium (${sodium.version})`;
  deps.log(`[Nova] ${why}; buscando una pareja compatible…`);

  const removeAddons = (list) => {
    for (const b of list) { fs.rmSync(path.join(modsDir, b.file), { force: true }); deps.log(`[Nova] Se quitó ${b.info.id} porque necesita otra versión de Sodium.`); }
  };
  let versions = [];
  try { versions = (await deps.listSodium()) || []; } catch {}
  // Primero la versión que contente a Iris y a todos los demás; si no existe, una que contente a Iris y solo deje fuera complementos de interfaz.
  const cands = [];
  for (const v of versions.slice(0, 12)) {
    const file = (v.files || []).find((x) => x.primary) || (v.files || [])[0];
    if (!file || !/^https:\/\/cdn\.modrinth\.com\//.test(file.url) || !/^[\w.+\-]+\.jar$/.test(file.filename)) continue;
    cands.push({ file, v });
  }
  const tryPick = async (strict) => {
    for (const c of cands) {
      let buf;
      try { buf = await deps.download(c.file.url); } catch { continue; }
      const cand = modInfoFromJar(buf);
      if (!cand || cand.id !== 'sodium' || sodiumIrisConflict(cand, iris)) continue;
      const bad = sodiumDependentsBroken(cand, others);
      if (strict ? bad.length : bad.some((b) => !SODIUM_ADDONS.has(b.info.id))) continue;
      if (sodiumFile !== c.file.filename) {
        fs.writeFileSync(path.join(modsDir, c.file.filename), buf);
        fs.rmSync(path.join(modsDir, sodiumFile), { force: true });
      }
      removeAddons(bad);
      deps.log(`[Nova] Sodium ${sodiumFile === c.file.filename ? 'se mantiene en' : 'cambiado a'} ${cand.version}${iris ? ` para que funcione con Iris ${iris.version}` : ''}.`);
      return true;
    }
    return false;
  };
  if (await tryPick(true) || await tryPick(false)) return { changed: true, action: 'sodium' };
  // Sin Iris no hay choque con él: basta con quitar los complementos que no encajan.
  if (irisFile && !broken.some((b) => !SODIUM_ADDONS.has(b.info.id))) {
    fs.rmSync(path.join(modsDir, irisFile), { force: true });
    removeAddons(broken);
    deps.log(`[Nova] No hay una versión de Sodium compatible con Iris ${iris.version}; se quitó Iris (los shaders) para que el juego abra.`);
    return { changed: true, action: 'iris-removed' };
  }
  if (!irisProblem && broken.length && broken.every((b) => SODIUM_ADDONS.has(b.info.id))) { removeAddons(broken); return { changed: true, action: 'addons-removed' }; }
  return { changed: false, action: '' };
}

/* Fabric API de Minecraft <= 1.19.1 se llama «fabric» (no «fabric-api»): un mod que pida «fabric-api» no la ve.
   Devuelve qué falta para Nova Client: { client: archivo|null, needs: 'fabric-api'|null, hasApi: bool, hasLegacy: bool }. */
function novaClientApiState(modsDir) {
  const out = { client: null, needs: null, hasApi: false, hasLegacy: false };
  let names = [];
  try { names = fs.readdirSync(modsDir).filter((f) => /\.jar$/i.test(f)); } catch { return out; }
  for (const f of names) {
    let info = null;
    try { info = modInfoFromJar(fs.readFileSync(path.join(modsDir, f))); } catch {}
    if (!info) continue;
    if (info.id === 'nova_client') { out.client = f; if (info.depends['fabric-api']) out.needs = 'fabric-api'; }
    if (info.id === 'fabric-api' || info.provides.includes('fabric-api')) out.hasApi = true;
    if (info.id === 'fabric') out.hasLegacy = true;
  }
  return out;
}

module.exports = { novaClientApiState, NOVA_MODS, PRESETS, CLIENT_REPO, installNovaMods, pickClientAsset, installNovaClient, modInfoFromJar, matchesRange, sodiumIrisConflict, fixSodiumIris };
