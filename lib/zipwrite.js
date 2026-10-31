'use strict';
/*
 * Escritor de zip mínimo (deflate, sin zip64) para respaldos de mundos y para exportar.
 * Escribe directo a disco archivo por archivo, así no se carga todo en memoria.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(d) {
  const date = ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  return { date, time };
}

// Recorre una carpeta y devuelve [{rel, abs, size, mtime}] con "/" como separador. No sigue enlaces simbólicos.
function walk(dir, base = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(abs, rel));
    else if (e.isFile()) {
      const st = fs.statSync(abs);
      out.push({ rel, abs, size: st.size, mtime: st.mtime });
    }
  }
  return out;
}

/**
 * Crea un zip en `dest` con la lista `entries` ([{name, abs} | {name, data}]).
 * maxBytes limita el total sin comprimir. Devuelve { files, bytes }.
 */
function writeZip(dest, entries, { maxBytes = 1024 ** 3 } = {}) {
  const fd = fs.openSync(dest, 'w');
  const central = [];
  let offset = 0;
  let total = 0;
  try {
    for (const e of entries) {
      const name = Buffer.from(String(e.name).replace(/\\/g, '/'), 'utf8');
      let raw;
      let mtime = new Date();
      if (e.data !== undefined) raw = Buffer.isBuffer(e.data) ? e.data : Buffer.from(String(e.data));
      else {
        mtime = fs.statSync(e.abs).mtime;
        raw = fs.readFileSync(e.abs);
      }
      total += raw.length;
      if (total > maxBytes) throw new Error('Es demasiado grande para empaquetarlo (límite 1 GB).');
      const comp = zlib.deflateRawSync(raw);
      const useDeflate = comp.length < raw.length;
      const body = useDeflate ? comp : raw;
      const crc = crc32(raw);
      const { date, time } = dosTime(mtime);
      const head = Buffer.alloc(30);
      head.writeUInt32LE(0x04034b50, 0);
      head.writeUInt16LE(20, 4);
      head.writeUInt16LE(0x0800, 6); // nombres UTF-8
      head.writeUInt16LE(useDeflate ? 8 : 0, 8);
      head.writeUInt16LE(time, 10);
      head.writeUInt16LE(date, 12);
      head.writeUInt32LE(crc, 14);
      head.writeUInt32LE(body.length, 18);
      head.writeUInt32LE(raw.length, 22);
      head.writeUInt16LE(name.length, 26);
      fs.writeSync(fd, head);
      fs.writeSync(fd, name);
      fs.writeSync(fd, body);
      central.push({ name, crc, csize: body.length, size: raw.length, method: useDeflate ? 8 : 0, time, date, offset });
      offset += 30 + name.length + body.length;
    }
    const cdStart = offset;
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
      fs.writeSync(fd, h);
      fs.writeSync(fd, c.name);
      offset += 46 + c.name.length;
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(central.length, 8);
    end.writeUInt16LE(central.length, 10);
    end.writeUInt32LE(offset - cdStart, 12);
    end.writeUInt32LE(cdStart, 16);
    fs.writeSync(fd, end);
  } catch (err) {
    fs.closeSync(fd);
    fs.rmSync(dest, { force: true });
    throw err;
  }
  fs.closeSync(fd);
  return { files: central.length, bytes: total };
}

module.exports = { crc32, walk, writeZip };
