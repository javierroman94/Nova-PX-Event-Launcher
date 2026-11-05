'use strict';
/*
 * Lee servers.dat (la lista de servidores de Minecraft, NBT sin comprimir) de una instancia para saber a qué
 * servidor se conecta ese modpack. La dirección NUNCA se muestra: solo se usa para consultar si está activo.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const MAX_DEPTH = 8;

function readNbt(buf) {
  let o = 0;
  const need = (n) => { if (o + n > buf.length) throw new Error('NBT truncado'); };
  const readers = {
    1: () => { need(1); return buf.readInt8(o++); },
    2: () => { need(2); const v = buf.readInt16BE(o); o += 2; return v; },
    3: () => { need(4); const v = buf.readInt32BE(o); o += 4; return v; },
    4: () => { need(8); o += 8; return 0; },
    5: () => { need(4); o += 4; return 0; },
    6: () => { need(8); o += 8; return 0; },
    8: () => { need(2); const n = buf.readUInt16BE(o); o += 2; need(n); const s = buf.toString('utf8', o, o + n); o += n; return s; }
  };
  const payload = (type, depth) => {
    if (depth > MAX_DEPTH) throw new Error('NBT demasiado profundo');
    if (readers[type]) return readers[type]();
    if (type === 7 || type === 11 || type === 12) {
      need(4); const n = buf.readInt32BE(o); o += 4;
      const size = type === 7 ? n : type === 11 ? n * 4 : n * 8;
      if (n < 0) throw new Error('NBT inválido');
      need(size); o += size; return null;
    }
    if (type === 9) {
      need(5); const t = buf.readInt8(o); const n = buf.readInt32BE(o + 1); o += 5;
      if (n < 0 || n > 10000) throw new Error('NBT inválido');
      const out = [];
      for (let i = 0; i < n; i++) out.push(payload(t, depth + 1));
      return out;
    }
    if (type === 10) {
      const obj = {};
      for (;;) {
        need(1); const t = buf.readInt8(o++);
        if (t === 0) break;
        const name = readers[8]();
        obj[name] = payload(t, depth + 1);
      }
      return obj;
    }
    throw new Error('Tipo NBT desconocido');
  };
  need(1);
  if (buf.readInt8(o++) !== 10) throw new Error('No es un servers.dat');
  readers[8]();
  return payload(10, 0);
}

// -> [{ name, host, port }]
function parseServersDat(buffer) {
  let buf = buffer;
  if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  const root = readNbt(buf);
  const out = [];
  for (const s of Array.isArray(root.servers) ? root.servers : []) {
    if (!s || typeof s.ip !== 'string') continue;
    const addr = parseAddress(s.ip);
    if (addr) out.push({ name: typeof s.name === 'string' ? s.name.slice(0, 60) : '', ...addr });
  }
  return out;
}

// "mc.ejemplo.com", "mc.ejemplo.com:25566", "[::1]:25565" -> { host, port } o null si no es válida.
function parseAddress(raw) {
  const t = String(raw || '').trim();
  if (!t || t.length > 260) return null;
  const m = /^\[([0-9a-f:]+)\](?::(\d{1,5}))?$/i.exec(t) || /^([A-Za-z0-9._-]+)(?::(\d{1,5}))?$/.exec(t);
  if (!m) return null;
  const port = m[2] ? Number(m[2]) : 25565;
  if (port < 1 || port > 65535) return null;
  return { host: m[1].toLowerCase(), port };
}

// Servidor al que apunta la instancia: el primero de su lista (el que el autor dejó configurado).
function findPackServer(root) {
  try {
    const file = path.join(root, 'servers.dat');
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > 1024 * 1024) return null;
    return parseServersDat(fs.readFileSync(file))[0] || null;
  } catch {
    return null;
  }
}

module.exports = { parseServersDat, parseAddress, findPackServer };
