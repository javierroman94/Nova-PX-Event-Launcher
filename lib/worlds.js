'use strict';
/*
 * Mundos de Minecraft: lee los datos básicos de level.dat, lista los mundos de una carpeta saves,
 * busca mundos en otros launchers (para importarlos) y los copia a un modpack del usuario.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const launchers = require('./launchers');
const { readZip } = require('./zip');

/* ---------- NBT mínimo (solo lo necesario de level.dat) ---------- */
function parseNbt(buf) {
  let p = 0;
  const need = (n) => { if (p + n > buf.length) throw new Error('level.dat dañado.'); };
  const str = () => { need(2); const n = buf.readUInt16BE(p); p += 2; need(n); const s = buf.toString('utf8', p, p + n); p += n; return s; };
  const val = (t, depth) => {
    if (depth > 12) throw new Error('level.dat demasiado anidado.');
    switch (t) {
      case 1: need(1); return buf.readInt8(p++);
      case 2: need(2); p += 2; return buf.readInt16BE(p - 2);
      case 3: need(4); p += 4; return buf.readInt32BE(p - 4);
      case 4: need(8); p += 8; return Number(buf.readBigInt64BE(p - 8));
      case 5: need(4); p += 4; return buf.readFloatBE(p - 4);
      case 6: need(8); p += 8; return buf.readDoubleBE(p - 8);
      case 7: { need(4); const n = buf.readInt32BE(p); p += 4; need(n); p += n; return null; }
      case 8: return str();
      case 9: {
        need(5); const it = buf.readUInt8(p); const n = buf.readInt32BE(p + 1); p += 5; const out = [];
        for (let i = 0; i < n; i++) { if (it === 0) break; out.push(val(it, depth + 1)); }
        return out;
      }
      case 10: {
        const o = {};
        for (;;) { need(1); const tt = buf.readUInt8(p++); if (tt === 0) break; const k = str(); o[k] = val(tt, depth + 1); }
        return o;
      }
      case 11: { need(4); const n = buf.readInt32BE(p); p += 4; need(n * 4); p += n * 4; return null; }
      case 12: { need(4); const n = buf.readInt32BE(p); p += 4; need(n * 8); p += n * 8; return null; }
      default: throw new Error('level.dat con formato desconocido.');
    }
  };
  need(3);
  if (buf.readUInt8(p++) !== 10) throw new Error('level.dat no es válido.');
  str();
  return val(10, 0);
}

const GAME_MODES = ['Supervivencia', 'Creativo', 'Aventura', 'Espectador'];

// { lastPlayed, version, gameMode, hardcore } o null si no hay level.dat legible.
function readLevel(dir) {
  try {
    const raw = fs.readFileSync(path.join(dir, 'level.dat'));
    if (raw.length > 4 * 1024 * 1024) return null;
    const data = parseNbt(zlib.gunzipSync(raw, { maxOutputLength: 32 * 1024 * 1024 })).Data || {};
    return {
      lastPlayed: Number(data.LastPlayed) || 0,
      version: (data.Version && data.Version.Name) || '',
      gameMode: GAME_MODES[data.GameType] || '',
      hardcore: !!data.hardcore
    };
  } catch { return null; }
}

function icon(dir) {
  try {
    const f = path.join(dir, 'icon.png');
    const st = fs.statSync(f);
    if (st.size > 200 * 1024) return '';
    return `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`;
  } catch { return ''; }
}

function folderSize(dir, limit = 5e9) {
  let total = 0;
  const stack = [dir];
  while (stack.length && total < limit) {
    const d = stack.pop();
    let items; try { items = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const it of items) {
      const f = path.join(d, it.name);
      if (it.isSymbolicLink()) continue;
      if (it.isDirectory()) stack.push(f);
      else { try { total += fs.statSync(f).size; } catch { /* ignorar */ } }
    }
  }
  return total;
}

// Mundos de una carpeta saves: [{ name, mtime, lastPlayed, version, gameMode, hardcore, icon, size }]
function listWorlds(savesDir) {
  let items; try { items = fs.readdirSync(savesDir, { withFileTypes: true }); } catch { return []; }
  return items.filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => {
    const dir = path.join(savesDir, d.name);
    const lv = readLevel(dir) || {};
    let mtime = 0; try { mtime = fs.statSync(dir).mtimeMs; } catch { /* ignorar */ }
    return { name: d.name, mtime, lastPlayed: lv.lastPlayed || mtime, version: lv.version || '', gameMode: lv.gameMode || '', hardcore: !!lv.hardcore, icon: icon(dir), size: folderSize(dir) };
  });
}

/* ---------- mundos de otros launchers ---------- */
function savesCandidates(instDir) {
  return [path.join(instDir, 'saves'), path.join(instDir, 'minecraft', 'saves'), path.join(instDir, '.minecraft', 'saves')];
}

// [{ launcher, instance, name, dir, mtime, lastPlayed, version, gameMode, size }] (solo carpetas con level.dat)
function findSources(opts = {}) {
  const home = opts.home || os.homedir();
  const platform = opts.platform || process.platform;
  const env = opts.env || process.env;
  const out = []; const seen = new Set();
  const add = (launcher, instance, savesDir) => {
    let items; try { items = fs.readdirSync(savesDir, { withFileTypes: true }); } catch { return; }
    for (const d of items) {
      if (!d.isDirectory() || d.name.startsWith('.')) continue;
      const dir = path.join(savesDir, d.name);
      if (seen.has(dir) || !fs.existsSync(path.join(dir, 'level.dat'))) continue;
      seen.add(dir);
      const lv = readLevel(dir) || {};
      let mtime = 0; try { mtime = fs.statSync(dir).mtimeMs; } catch { /* ignorar */ }
      out.push({ launcher, instance, name: d.name, dir, mtime, lastPlayed: lv.lastPlayed || mtime, version: lv.version || '', gameMode: lv.gameMode || '', size: 0 });
    }
  };
  const appdata = env.APPDATA || path.join(home, 'AppData', 'Roaming');
  const official = platform === 'win32' ? path.join(appdata, '.minecraft') : platform === 'darwin' ? path.join(home, 'Library', 'Application Support', 'minecraft') : path.join(home, '.minecraft');
  add('Minecraft oficial', 'Launcher de Mojang', path.join(official, 'saves'));
  for (const inst of launchers.scan({ platform, env, home })) {
    for (const s of savesCandidates(inst.dir)) add(inst.launcher, inst.name, s);
  }
  return out.sort((a, b) => b.lastPlayed - a.lastPlayed);
}

/* ---------- importar ---------- */
const safeName = (n) => { const s = String(n || '').replace(/[\\/:*?"<>|\0]/g, '_').trim(); return s && !s.startsWith('.') ? s.slice(0, 100) : 'Mundo importado'; };

function uniqueName(savesDir, base) {
  let name = base;
  for (let i = 2; fs.existsSync(path.join(savesDir, name)); i++) name = `${base} (${i})`;
  return name;
}

// Copia una carpeta de mundo a root/saves. Nunca copia el bloqueo de sesión ni enlaces simbólicos.
function importFolder(srcDir, root) {
  const src = path.resolve(String(srcDir || ''));
  let st; try { st = fs.lstatSync(src); } catch { throw new Error('No se encontró esa carpeta.'); }
  if (!st.isDirectory() || st.isSymbolicLink()) throw new Error('Elige la carpeta de un mundo.');
  if (!fs.existsSync(path.join(src, 'level.dat'))) throw new Error('Esa carpeta no es un mundo de Minecraft (falta level.dat).');
  const saves = path.join(root, 'saves');
  fs.mkdirSync(saves, { recursive: true });
  const name = uniqueName(saves, safeName(path.basename(src)));
  fs.cpSync(src, path.join(saves, name), { recursive: true, filter: (f) => { try { return path.basename(f) !== 'session.lock' && !fs.lstatSync(f).isSymbolicLink(); } catch { return false; } } });
  return { name };
}

// Importa un .zip que contiene un mundo (con o sin carpeta raíz).
function importZip(zipPath, root) {
  const stat = fs.statSync(zipPath);
  if (stat.size > 2 * 1024 * 1024 * 1024) throw new Error('El zip es demasiado grande.');
  const zip = readZip(fs.readFileSync(zipPath));
  const names = zip.names().filter((n) => !n.startsWith('__MACOSX/'));
  const lv = names.find((n) => /(^|\/)level\.dat$/.test(n) && n.split('/').length <= 3);
  if (!lv) throw new Error('El zip no contiene un mundo de Minecraft (falta level.dat).');
  const prefix = lv.slice(0, lv.length - 'level.dat'.length);
  const saves = path.join(root, 'saves');
  fs.mkdirSync(saves, { recursive: true });
  const base = safeName(prefix ? prefix.replace(/\/$/, '').split('/').pop() : path.basename(zipPath, path.extname(zipPath)));
  const name = uniqueName(saves, base);
  const dest = path.join(saves, name);
  let count = 0;
  try {
    for (const n of names) {
      if (!n.startsWith(prefix) || n.endsWith('/')) continue;
      const rel = n.slice(prefix.length);
      if (!rel || rel === 'session.lock') continue;
      const out = path.resolve(dest, rel);
      if (out !== dest && !out.startsWith(dest + path.sep)) continue;
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, zip.read(n));
      if (++count > 200000) throw new Error('El zip tiene demasiados archivos.');
    }
  } catch (e) { fs.rmSync(dest, { recursive: true, force: true }); throw e; }
  return { name };
}

module.exports = { parseNbt, readLevel, listWorlds, findSources, importFolder, importZip, folderSize };
