'use strict';
// Lector mínimo de .zip (sin dependencias): suficiente para .mrpack y modpacks de CurseForge.
// No admite zip64 ni archivos cifrados, y limita lo que se descomprime para evitar "bombas zip".
const zlib = require('zlib');

const MAX_ENTRY_BYTES = 1024 * 1024 * 1024; // 1 GB por archivo

function readZip(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw new Error('El archivo no es un zip válido.');
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('El archivo no es un zip válido.');
  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (total === 0xffff || p === 0xffffffff) throw new Error('Los zip de más de 4 GB no están soportados.');
  const entries = new Map();
  for (let n = 0; n < total; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new Error('El zip está dañado.');
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28);
    const elen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    entries.set(name, { name, flags, method, csize, size, offset, dir: name.endsWith('/') });
    p += 46 + nlen + elen + clen;
  }
  return {
    names: () => [...entries.keys()],
    has: (name) => entries.has(name),
    size: (name) => (entries.get(name) || {}).size,
    read(name) {
      const e = entries.get(name);
      if (!e) throw new Error(`Falta ${name} en el zip.`);
      if (e.flags & 1) throw new Error('El zip está cifrado.');
      if (e.size > MAX_ENTRY_BYTES) throw new Error(`${name} es demasiado grande.`);
      if (buf.readUInt32LE(e.offset) !== 0x04034b50) throw new Error('El zip está dañado.');
      const start = e.offset + 30 + buf.readUInt16LE(e.offset + 26) + buf.readUInt16LE(e.offset + 28);
      const raw = buf.subarray(start, start + e.csize);
      if (e.method === 0) return Buffer.from(raw);
      if (e.method === 8) return zlib.inflateRawSync(raw, { maxOutputLength: Math.max(1, e.size) });
      throw new Error(`Compresión no soportada (${e.method}).`);
    }
  };
}

module.exports = { readZip };
