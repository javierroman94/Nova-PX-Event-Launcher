'use strict';
/*
 * Ping directo a servidores de Minecraft Java (protocolo «Server List Ping», 1.7 o más nuevo).
 * Da la latencia real desde tu PC, los jugadores en línea, la versión y el mensaje del servidor,
 * sin depender de páginas de terceros. Todo lo que responde el servidor se trata como no confiable.
 */

const net = require('net');
const dns = require('dns');

const MAX_PACKET = 256 * 1024; // un estado normal ocupa unos pocos KB (con el icono, hasta ~60 KB)

function varInt(n) {
  const out = [];
  let v = n >>> 0; // -1 se escribe como 5 bytes, igual que hace Minecraft
  do {
    let b = v & 0x7f;
    v >>>= 7;
    if (v) b |= 0x80;
    out.push(b);
  } while (v);
  return Buffer.from(out);
}

// Lee un VarInt; null si todavía no llegaron todos sus bytes.
function readVarInt(buf, offset = 0) {
  let value = 0;
  let shift = 0;
  let pos = offset;
  for (;;) {
    if (pos >= buf.length) return null;
    const b = buf[pos++];
    value |= (b & 0x7f) << shift;
    if (!(b & 0x80)) return { value: value | 0, size: pos - offset };
    shift += 7;
    if (shift > 28) throw new Error('VarInt demasiado largo.');
  }
}

const str = (s) => {
  const b = Buffer.from(String(s), 'utf8');
  return Buffer.concat([varInt(b.length), b]);
};
function packet(id, ...parts) {
  const body = Buffer.concat([varInt(id), ...parts]);
  return Buffer.concat([varInt(body.length), body]);
}
function handshake(host, port) {
  const p = Buffer.alloc(2);
  p.writeUInt16BE(Number(port) & 0xffff, 0);
  return packet(0x00, varInt(-1), str(host), p, varInt(1));
}
const statusRequest = () => packet(0x00);
function pingRequest(payload) {
  const b = Buffer.alloc(8);
  b.writeBigInt64BE(BigInt(payload), 0);
  return packet(0x01, b);
}

// Intenta sacar un paquete completo del principio de buf. -> { id, body, rest } o null si falta.
function takePacket(buf) {
  const len = readVarInt(buf, 0);
  if (!len) return null;
  if (len.value < 1 || len.value > MAX_PACKET) throw new Error('Respuesta no válida.');
  if (buf.length < len.size + len.value) return null;
  const body = buf.subarray(len.size, len.size + len.value);
  const id = readVarInt(body, 0);
  if (!id) throw new Error('Respuesta no válida.');
  return { id: id.value, body: body.subarray(id.size), rest: buf.subarray(len.size + len.value) };
}

// Texto plano del mensaje del servidor (puede venir como texto o como componente de chat con "extra").
function chatText(c, depth = 0) {
  if (depth > 8 || c === null || c === undefined) return '';
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((x) => chatText(x, depth + 1)).join('');
  if (typeof c !== 'object') return String(c);
  let out = typeof c.text === 'string' ? c.text : typeof c.translate === 'string' ? c.translate : '';
  if (Array.isArray(c.extra)) out += c.extra.map((x) => chatText(x, depth + 1)).join('');
  return out;
}
const stripCodes = (s) => (typeof s === 'string' ? s : '').replace(/§[0-9a-fk-orx]/gi, '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '');
function motdText(desc) {
  return stripCodes(chatText(desc)).split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 2).join('\n').slice(0, 200);
}

const FAVICON = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
const num = (v, max = 1e7) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0;
};

// Lo que se muestra: nada del JSON original pasa sin limpiar.
function parseStatus(json) {
  const d = json && typeof json === 'object' ? json : {};
  const p = d.players && typeof d.players === 'object' ? d.players : {};
  const sample = Array.isArray(p.sample) ? p.sample : [];
  const icon = typeof d.favicon === 'string' ? d.favicon.replace(/\s+/g, '') : '';
  return {
    online: true,
    players: {
      online: num(p.online),
      max: num(p.max),
      sample: sample.slice(0, 12).map((s) => stripCodes(s && s.name).trim().slice(0, 40)).filter(Boolean)
    },
    version: stripCodes(d.version && d.version.name).trim().slice(0, 40),
    protocol: num(d.version && d.version.protocol, 100000),
    motd: motdText(d.description),
    icon: icon.length <= 120000 && FAVICON.test(icon) ? icon : ''
  };
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

// Registro SRV (_minecraft._tcp.host): muchos servidores lo usan para no escribir el puerto.
async function resolveTarget(host, port, { explicitPort = false, resolver = dns.promises } = {}) {
  if (explicitPort || net.isIP(host) || !/\./.test(host)) return { host, port };
  try {
    const recs = await withTimeout(resolver.resolveSrv(`_minecraft._tcp.${host}`), 1500);
    if (Array.isArray(recs) && recs.length) {
      const r = [...recs].sort((a, b) => a.priority - b.priority || b.weight - a.weight)[0];
      if (r && r.name && r.port > 0 && r.port < 65536) return { host: String(r.name).replace(/\.$/, ''), port: r.port };
    }
  } catch {}
  return { host, port };
}

/*
 * Pregunta el estado a un servidor. -> { online: true, ms, players, version, motd, icon }
 * Lanza un error si no responde a tiempo (servidor apagado, dirección mal escrita o red bloqueada).
 */
async function ping(host, port = 25565, { timeout = 4000, explicitPort = false, connect = net.connect, resolver } = {}) {
  const target = await resolveTarget(String(host), Number(port) || 25565, { explicitPort, resolver });
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    let status = null;
    let requestAt = 0;
    let statusMs = 0;
    let pingAt = 0;
    let finished = false;
    const sock = connect({ host: target.host, port: target.port });
    const done = (err, ms) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { sock.destroy(); } catch {}
      if (err && !status) reject(err);
      else resolve({ ...status, ms: Math.max(1, Math.round(ms || statusMs || 1)) });
    };
    const timer = setTimeout(() => done(new Error('El servidor no respondió a tiempo.')), timeout);
    sock.setNoDelay && sock.setNoDelay(true);
    sock.on('connect', () => {
      requestAt = Date.now();
      sock.write(Buffer.concat([handshake(host, target.port), statusRequest()]));
    });
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      try {
        if (buf.length > MAX_PACKET + 16) throw new Error('Respuesta demasiado grande.');
        for (let pk = takePacket(buf); pk; pk = takePacket(buf)) {
          buf = pk.rest;
          if (pk.id === 0x00 && !status) {
            const len = readVarInt(pk.body, 0);
            if (!len || len.value < 0 || len.size + len.value > pk.body.length) throw new Error('Respuesta no válida.');
            const text = pk.body.subarray(len.size, len.size + len.value).toString('utf8');
            status = parseStatus(JSON.parse(text));
            statusMs = Date.now() - requestAt;
            pingAt = Date.now();
            sock.write(pingRequest(pingAt));
          } else if (pk.id === 0x01 && status) {
            done(null, Date.now() - pingAt);
            return;
          }
        }
      } catch (err) {
        done(err);
      }
    });
    sock.on('error', (err) => done(err));
    sock.on('close', () => done(new Error('El servidor cerró la conexión.')));
  });
}

// Igual que ping(), pero recuerda la respuesta unos segundos (la biblioteca y la ficha piden el mismo servidor varias veces).
const recent = new Map();
async function pingCached(host, port = 25565, opts = {}) {
  const key = `${String(host).toLowerCase()}:${Number(port) || 25565}`;
  const ttl = opts.ttl || 20000;
  const hit = recent.get(key);
  if (hit && hit.at && Date.now() - hit.at < ttl) {
    if (hit.err) throw hit.err;
    return hit.value;
  }
  if (hit && hit.pending) return hit.pending;
  const pending = ping(host, port, { explicitPort: Number(port) !== 25565, ...opts });
  recent.set(key, { at: 0, pending });
  try {
    const value = await pending;
    recent.set(key, { at: Date.now(), value });
    return value;
  } catch (err) {
    recent.set(key, { at: Date.now(), err });
    throw err;
  } finally {
    if (recent.size > 200) recent.delete(recent.keys().next().value);
  }
}

// Cómo entrar directo a un servidor al abrir el juego: 1.20 o más nuevo usa Quick Play; antes, --server y --port.
function mcAtLeast(v, want) {
  const a = String(v || '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const b = String(want).split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return true;
}
function joinOptions(mcVersion, host, port) {
  const p = Number(port) || 25565;
  if (mcAtLeast(mcVersion, '1.20')) return { quickPlay: { type: 'multiplayer', identifier: p === 25565 ? host : `${host}:${p}` } };
  return { server: { host, port: String(p) } };
}

module.exports = { varInt, readVarInt, handshake, statusRequest, pingRequest, takePacket, chatText, motdText, parseStatus, resolveTarget, ping, pingCached, mcAtLeast, joinOptions, MAX_PACKET };
