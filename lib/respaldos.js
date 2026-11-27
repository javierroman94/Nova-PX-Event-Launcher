'use strict';
/*
 * Copias automáticas de los mundos (saves/) de una instancia.
 *  - Solo se copia un mundo si cambió desde su última copia automática.
 *  - Se guardan las últimas `keep` copias por mundo (las manuales no se tocan).
 *  - El zip se escribe sin bloquear el launcher (lectura, compresión y huella asíncronas).
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');
const { crc32 } = require('./zipwrite');
const { slugify } = require('./modpacks');

const deflateRaw = promisify(zlib.deflateRaw);
const crcOf = (buf) => (typeof zlib.crc32 === 'function' ? zlib.crc32(buf) >>> 0 : crc32(buf));
// Archivos que ya vienen comprimidos: se guardan tal cual (más rápido y casi igual de pequeño).
const STORED = /\.(mca|mcc|dat|dat_old|png|jpe?g|zip|gz|jar)$/i;
const MAX_FILES = 40000;

function dosTime(d) {
  const date = ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  return { date, time };
}

// Archivos del mundo (sin session.lock), con tope para no recorrer carpetas gigantes.
async function listWorld(dir) {
  const out = [];
  let latest = 0;
  let bytes = 0;
  const walk = async (abs, rel) => {
    let entries = [];
    try { entries = await fs.promises.readdir(abs, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (out.length >= MAX_FILES) return;
      if (e.isSymbolicLink()) continue;
      const a = path.join(abs, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(a, r);
      else if (e.isFile() && r !== 'session.lock') {
        try {
          const st = await fs.promises.stat(a);
          out.push({ rel: r, abs: a, size: st.size, mtime: st.mtime });
          latest = Math.max(latest, st.mtimeMs);
          bytes += st.size;
        } catch {}
      }
    }
  };
  await walk(dir, '');
  return { files: out, latest, bytes, truncated: out.length >= MAX_FILES };
}

// Zip sin bloquear: escribe en un archivo .part y lo renombra al terminar (una copia a medias nunca parece válida).
async function writeZipAsync(dest, entries, { maxBytes = 3.5 * 1024 ** 3 } = {}) {
  const part = `${dest}.part`;
  const fh = await fs.promises.open(part, 'w');
  const central = [];
  let offset = 0;
  let total = 0;
  try {
    for (const e of entries) {
      const name = Buffer.from(String(e.name).replace(/\\/g, '/'), 'utf8');
      const raw = await fs.promises.readFile(e.abs);
      total += raw.length;
      if (total > maxBytes) throw new Error('El mundo es demasiado grande para copiarlo automáticamente.');
      let body = raw;
      let method = 0;
      if (!STORED.test(e.name) && raw.length > 64) {
        const comp = await deflateRaw(raw, { level: 1 });
        if (comp.length < raw.length) { body = comp; method = 8; }
      }
      const crc = crcOf(raw);
      const { date, time } = dosTime(e.mtime instanceof Date ? e.mtime : new Date());
      const head = Buffer.alloc(30);
      head.writeUInt32LE(0x04034b50, 0);
      head.writeUInt16LE(20, 4);
      head.writeUInt16LE(0x0800, 6);
      head.writeUInt16LE(method, 8);
      head.writeUInt16LE(time, 10);
      head.writeUInt16LE(date, 12);
      head.writeUInt32LE(crc, 14);
      head.writeUInt32LE(body.length, 18);
      head.writeUInt32LE(raw.length, 22);
      head.writeUInt16LE(name.length, 26);
      await fh.write(Buffer.concat([head, name]));
      await fh.write(body);
      central.push({ name, crc, csize: body.length, size: raw.length, method, time, date, offset });
      offset += 30 + name.length + body.length;
      if (offset > 0xfffffff0) throw new Error('El mundo es demasiado grande para copiarlo automáticamente.');
    }
    const cdStart = offset;
    const parts = [];
    for (const c of central) {
      const h = Buffer.alloc(46);
      h.writeUInt32LE(0x02014b50, 0);
      h.writeUInt16LE(20, 4);
      h.writeUInt16LE(20, 6);
      h.writeUInt16LE(0x0800, 8);
      h.writeUInt16LE(c.method, 10);
      h.writeUInt16LE(c.time, 12);
      h.writeUInt16LE(c.date, 14);
      h.writeUInt32LE(c.crc, 16);
      h.writeUInt32LE(c.csize, 20);
      h.writeUInt32LE(c.size, 24);
      h.writeUInt16LE(c.name.length, 28);
      h.writeUInt32LE(c.offset, 42);
      parts.push(h, c.name);
      offset += 46 + c.name.length;
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(Math.min(central.length, 0xffff), 8);
    end.writeUInt16LE(Math.min(central.length, 0xffff), 10);
    end.writeUInt32LE(offset - cdStart, 12);
    end.writeUInt32LE(cdStart, 16);
    parts.push(end);
    await fh.write(Buffer.concat(parts));
    await fh.close();
    await fs.promises.rename(part, dest);
    return { files: central.length, bytes: total };
  } catch (err) {
    try { await fh.close(); } catch {}
    await fs.promises.rm(part, { force: true }).catch(() => {});
    throw err;
  }
}

const safeWorld = (n) => {
  const s = String(n || '');
  return s && s === path.basename(s) && !/[\\/\0]/.test(s) && !s.startsWith('.') ? s : null;
};
const autoPrefix = (world) => `auto-${slugify(world) || 'mundo'}-`;
const isAuto = (name) => /^auto-.+-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.zip$/i.test(String(name));

// Copias automáticas de un mundo, de la más nueva a la más vieja.
function listAuto(backupsDir, world) {
  const prefix = autoPrefix(world);
  let names = [];
  try { names = fs.readdirSync(backupsDir); } catch { return []; }
  return names.filter((f) => f.startsWith(prefix) && isAuto(f) && f.slice(prefix.length).length === 23)
    .map((f) => { try { return { name: f, mtime: fs.statSync(path.join(backupsDir, f)).mtimeMs }; } catch { return null; } })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime || b.name.localeCompare(a.name));
}

function rotate(backupsDir, world, keep) {
  const removed = [];
  for (const old of listAuto(backupsDir, world).slice(Math.max(1, keep))) {
    try { fs.rmSync(path.join(backupsDir, old.name), { force: true }); removed.push(old.name); } catch {}
  }
  return removed;
}

/*
 * Copia los mundos de `root` que cambiaron. -> { made: [{ world, name, bytes }], skipped: [{ world, reason }] }
 * keep: copias automáticas por mundo. maxBytes: un mundo más grande que esto no se copia solo (se avisa).
 */
async function autoBackup(root, { keep = 3, maxBytes = 1.5 * 1024 ** 3, now = () => new Date(), onStatus } = {}) {
  const savesDir = path.join(root, 'saves');
  const backupsDir = path.join(root, 'backups');
  const made = [];
  const skipped = [];
  let worlds = [];
  try {
    worlds = (await fs.promises.readdir(savesDir, { withFileTypes: true })).filter((e) => e.isDirectory() && !e.isSymbolicLink()).map((e) => e.name);
  } catch { return { made, skipped }; }
  for (const w of worlds) {
    const world = safeWorld(w);
    if (!world) continue;
    const dir = path.join(savesDir, world);
    if (!fs.existsSync(path.join(dir, 'level.dat'))) continue; // no es un mundo
    const info = await listWorld(dir);
    if (!info.files.length) continue;
    const last = listAuto(backupsDir, world)[0];
    if (last && last.mtime >= info.latest) { skipped.push({ world, reason: 'sin-cambios' }); continue; }
    if (info.bytes > maxBytes || info.truncated) { skipped.push({ world, reason: 'grande' }); continue; }
    if (onStatus) onStatus(world);
    await fs.promises.mkdir(backupsDir, { recursive: true });
    const stamp = now().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    const name = `${autoPrefix(world)}${stamp}.zip`;
    const dest = path.join(backupsDir, name);
    try {
      await writeZipAsync(dest, info.files.map((f) => ({ name: `${world}/${f.rel}`, abs: f.abs, mtime: f.mtime })), { maxBytes: maxBytes * 1.05 });
      made.push({ world, name, bytes: (await fs.promises.stat(dest)).size });
      rotate(backupsDir, world, keep);
    } catch (err) {
      skipped.push({ world, reason: 'error', error: String((err && err.message) || err).slice(0, 160) });
    }
  }
  return { made, skipped };
}

module.exports = { listWorld, writeZipAsync, autoBackup, listAuto, rotate, isAuto, autoPrefix };
