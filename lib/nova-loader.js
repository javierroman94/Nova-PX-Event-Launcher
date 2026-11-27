'use strict';
/*
 * Loader Nova: una lista fija de mods probados por versión de Minecraft (data/nova-loader.json).
 * La arma tools/nova-loader.js una vez por semana: elige versiones de Modrinth que no chocan entre sí.
 * Aquí se lee esa lista (tratándola como dato de internet: se sanea), se instala con huella SHA-512
 * y se sabe qué versión de Nova tiene cada perfil para ofrecer "Actualizar Nova".
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MARK = '.nova-loader.json';
const VERSION_RE = /^\d{1,3}\.\d{1,3}\.\d{1,4}$/;
const MC_RE = /^[0-9][0-9A-Za-z._-]{0,20}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const MODID_RE = /^[a-z][a-z0-9_-]{0,63}$/;
const PROJECT_RE = /^[A-Za-z0-9]{6,16}$/;
const FILE_RE = /^[\w.+\-]{1,120}\.jar$/;
const SHA512_RE = /^[a-f0-9]{128}$/;
const MAX_MODS = 60;

function okUrl(u) {
  try {
    const x = new URL(String(u));
    return x.protocol === 'https:' && x.hostname === 'cdn.modrinth.com' && x.pathname.startsWith('/data/');
  } catch { return false; }
}

function cleanMod(m) {
  if (!m || typeof m !== 'object') return null;
  const slug = String(m.slug || '');
  const file = String(m.file || '');
  const sha512 = String(m.sha512 || '').toLowerCase();
  if (!SLUG_RE.test(slug) || !FILE_RE.test(file) || !SHA512_RE.test(sha512) || !okUrl(m.url)) return null;
  const size = Number(m.size);
  return {
    slug,
    id: MODID_RE.test(String(m.id || '')) ? String(m.id) : '',
    project: PROJECT_RE.test(String(m.project || '')) ? String(m.project) : '',
    name: String(m.name || slug).replace(/[\u0000-\u001f<>]/g, '').slice(0, 60),
    version: String(m.version || '').replace(/[^\w.+\- ]/g, '').slice(0, 60),
    file, url: String(m.url), sha512,
    size: Number.isFinite(size) && size > 0 && size < 200 * 1024 * 1024 ? size : 0
  };
}

// Sanea la lista que llega de internet. Devuelve null si no sirve.
function cleanLock(raw) {
  if (!raw || typeof raw !== 'object' || !VERSION_RE.test(String(raw.version || ''))) return null;
  const out = { version: String(raw.version), generated: String(raw.generated || '').slice(0, 40), mc: {} };
  const src = raw.mc && typeof raw.mc === 'object' ? raw.mc : {};
  for (const [mc, e] of Object.entries(src).slice(0, 200)) {
    if (!MC_RE.test(mc) || !e || !Array.isArray(e.mods)) continue;
    const seen = new Set();
    const mods = [];
    for (const m of e.mods.slice(0, MAX_MODS)) {
      const c = cleanMod(m);
      if (!c || seen.has(c.file.toLowerCase())) continue;
      seen.add(c.file.toLowerCase());
      mods.push(c);
    }
    if (mods.length) out.mc[mc] = { mods };
  }
  return out;
}

function entryFor(lock, mc) {
  return (lock && lock.mc && Object.prototype.hasOwnProperty.call(lock.mc, mc) && lock.mc[mc]) || null;
}

function readMark(dir) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dir, MARK), 'utf8'));
    if (!VERSION_RE.test(String(j.version || ''))) return null;
    return { version: String(j.version), mc: String(j.mc || ''), files: Array.isArray(j.files) ? j.files.filter((f) => FILE_RE.test(String(f))).slice(0, MAX_MODS) : [] };
  } catch { return null; }
}

function cmpVersion(a, b) {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0) ? -1 : 1;
  return 0;
}

// ¿Hay una versión de Nova más nueva para este perfil? Un perfil Nova creado antes del loader (sin marca) también se ofrece.
function updateFor(dir, lock, mc) {
  const mark = readMark(dir);
  const entry = entryFor(lock, mc);
  if (!entry) return null;
  if (!mark) return { from: null, to: lock.version, changed: entry.mods.map((m) => m.name) };
  if (cmpVersion(lock.version, mark.version) <= 0) return null;
  const have = new Set(mark.files.map((f) => f.toLowerCase()));
  const changed = entry.mods.filter((m) => !have.has(m.file.toLowerCase()));
  return changed.length ? { from: mark.version, to: lock.version, changed: changed.map((m) => m.name) } : null;
}

/* Instala (o actualiza) los mods del loader Nova en <dir>/mods.
   Solo toca los archivos que puso el propio loader: los mods que agregó el jugador se respetan.
   deps: { download(url) -> Buffer, onStatus(text), modIdOf(jarPath) -> id de fabric.mod.json } */
async function installLock({ lock, mc, dir, download, onStatus = () => {}, modIdOf = () => null }) {
  const entry = entryFor(lock, mc);
  if (!entry) return null;
  const modsDir = path.join(dir, 'mods');
  fs.mkdirSync(modsDir, { recursive: true });
  const prev = readMark(dir);
  const want = new Set(entry.mods.map((m) => m.file.toLowerCase()));
  const present = new Set();
  try { for (const f of fs.readdirSync(modsDir)) present.add(f.toLowerCase()); } catch {}

  // Primero se descarga y verifica todo; si algo falla, el perfil queda como estaba.
  const fresh = [];
  for (const m of entry.mods) {
    if (present.has(m.file.toLowerCase()) || present.has(`${m.file.toLowerCase()}.disabled`)) continue;
    onStatus(`Descargando ${m.name}…`);
    const data = await download(m.url);
    const got = crypto.createHash('sha512').update(data).digest('hex');
    if (got !== m.sha512) throw new Error(`La huella de ${m.file} no coincide; no se instaló nada.`);
    fresh.push([m.file, data]);
  }
  for (const [file, data] of fresh) fs.writeFileSync(path.join(modsDir, file), data);
  // Lo que puso la versión anterior del loader y ya no está en la lista se quita (con su copia desactivada).
  const removed = [];
  for (const f of (prev && prev.files) || []) {
    if (want.has(f.toLowerCase())) continue;
    for (const name of [f, `${f}.disabled`]) {
      const p = path.join(modsDir, name);
      if (fs.existsSync(p)) { fs.rmSync(p, { force: true }); removed.push(name); }
    }
  }
  // Otras copias de los mismos mods (de un perfil Nova viejo o puestas a mano) chocarían: se quitan.
  const ids = new Set(entry.mods.map((m) => m.id).filter(Boolean));
  if (ids.size) {
    let names = [];
    try { names = fs.readdirSync(modsDir).filter((f) => /\.jar(\.disabled)?$/i.test(f)); } catch {}
    for (const f of names) {
      if (want.has(f.toLowerCase().replace(/\.disabled$/, ''))) continue;
      let id = null;
      try { id = modIdOf(path.join(modsDir, f)); } catch {}
      if (id && ids.has(id)) { fs.rmSync(path.join(modsDir, f), { force: true }); removed.push(f); }
    }
  }
  fs.writeFileSync(path.join(dir, MARK), JSON.stringify({ version: lock.version, mc, files: entry.mods.map((m) => m.file), at: new Date().toISOString() }, null, 2));
  return { version: lock.version, installed: fresh.map(([f]) => f), removed };
}

module.exports = { MARK, cleanLock, entryFor, readMark, updateFor, installLock, cmpVersion, okUrl };
