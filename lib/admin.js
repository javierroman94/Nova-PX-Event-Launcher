'use strict';
/*
 * Lógica del modo administrador (pura, sin red): preparar el modpack cifrado del evento y limpiar
 * lo que el administrador escribe en los formularios antes de publicarlo en data/*.json.
 */
const crypto = require('crypto');
const pc = require('./pack-crypto');
const { isSafeVersion } = require('./loaders');
const { slugify } = require('./modpacks');

const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');
const str = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
const httpsUrl = (u) => (/^https:\/\/[^\s]+$/i.test(String(u || '')) ? String(u).slice(0, 300) : '');

function sameAsBefore(prot, password) {
  if (!pc.isEnvelope(prot)) return false;
  try {
    pc.openEnvelope(prot, pc.deriveKey(password, prot.salt));
    return true;
  } catch {
    return false;
  }
}

/**
 * Cifra los mods y arma el bloque "protected" del manifest.
 * jars: [{ file, data(Buffer) }]. Devuelve { envelope, assets: [{ name, data }], reusedSalt }.
 */
function buildProtectedEvent({ jars, password, previous, baseUrl }) {
  const problem = pc.passwordProblem(password);
  if (problem) throw new Error(problem);
  if (!jars.length) throw new Error('No hay mods para publicar.');
  if (!/^https:\/\//i.test(baseUrl)) throw new Error('Dirección de descarga no válida.');
  const reuse = sameAsBefore(previous, password);
  const salt = reuse ? previous.salt : pc.newSalt();
  const packKey = pc.newPackKey();
  const assets = [];
  const mods = jars.map(({ file, data }) => {
    if (file !== require('path').basename(file) || !/\.jar$/i.test(file) || /[\\/\0]/.test(file)) throw new Error(`Nombre de mod no válido: ${file}`);
    assets.push({ name: `${file}.enc`, data: pc.encryptFile(data, packKey, file) });
    return { name: file.replace(/\.jar$/i, ''), file, url: `${baseUrl.replace(/\/+$/, '')}/${encodeURIComponent(`${file}.enc`)}`, sha1: sha1(data) };
  });
  return { envelope: pc.createEnvelope({ packKey, mods }, pc.deriveKey(password, salt), salt), assets, reusedSalt: reuse };
}

// Datos del evento que el administrador puede cambiar desde el launcher.
function mergeManifest(current, form) {
  const out = JSON.parse(JSON.stringify(current || {}));
  const f = form || {};
  out.event = { ...(out.event || {}) };
  if (f.name !== undefined) {
    out.event.name = str(f.name, 80);
    if (!out.event.name) throw new Error('El evento necesita un nombre.');
  }
  if (f.tagline !== undefined) out.event.tagline = str(f.tagline, 300);
  if (f.active !== undefined) out.event.active = !!f.active;
  if (f.startsAt !== undefined) {
    const s = str(f.startsAt, 40);
    if (s && Number.isNaN(Date.parse(s))) throw new Error('La fecha de inicio no es válida.');
    out.event.startsAt = s;
  }
  if (f.newEvent) out.event.id = `${slugify(out.event.name || 'evento')}-${new Date().toISOString().slice(0, 10)}`.slice(0, 40);
  if (f.minecraftVersion !== undefined) {
    if (!isSafeVersion(str(f.minecraftVersion, 20))) throw new Error('La versión de Minecraft no es válida.');
    out.minecraftVersion = str(f.minecraftVersion, 20);
  }
  if (f.loader !== undefined) {
    const type = str(f.loader.type, 10).toLowerCase();
    if (!['vanilla', 'fabric', 'forge'].includes(type)) throw new Error('Loader no soportado.');
    out.loader = { type, version: str(f.loader.version, 40) };
  }
  if (f.server !== undefined) {
    const host = str(f.server.host, 253);
    if (host && !/^[A-Za-z0-9.-]+$/.test(host)) throw new Error('La dirección del servidor no es válida.');
    const port = Number(f.server.port) || 25565;
    if (port < 1 || port > 65535) throw new Error('El puerto no es válido.');
    out.server = { host, port };
  }
  if (f.links !== undefined) {
    out.links = (Array.isArray(f.links) ? f.links : []).slice(0, 10).map((l) => ({ name: str(l.name, 40), url: httpsUrl(l.url) })).filter((l) => l.name && l.url);
  }
  return out;
}

function sanitizeTeam(list) {
  const seen = new Set();
  const out = [];
  for (const m of (Array.isArray(list) ? list : []).slice(0, 60)) {
    const nick = str(m.nick, 16);
    if (!/^[A-Za-z0-9_]{1,16}$/.test(nick) || seen.has(nick.toLowerCase())) continue;
    seen.add(nick.toLowerCase());
    out.push({ nick, role: str(m.role, 80), ...(m.featured ? { featured: true } : {}) });
  }
  if (!out.length) throw new Error('El equipo no puede quedar vacío.');
  return out;
}

// Tipo de imagen por sus primeros bytes (no por la extensión, que se puede falsear).
function imageKind(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}
const MAX_IMAGE = 3 * 1024 * 1024;

function sanitizeEvents(list) {
  const out = [];
  for (const e of (Array.isArray(list) ? list : []).slice(0, 200)) {
    const name = str(e.name, 80);
    if (!name) continue;
    const date = str(e.date, 10);
    const image = String(e.image || '');
    const winners = [];
    for (const w of [...(Array.isArray(e.winners) ? e.winners : []), ...(e.winner ? [e.winner] : [])]) {
      const n = str(w, 16);
      if (/^[A-Za-z0-9_]{1,16}$/.test(n) && !winners.some((x) => x.toLowerCase() === n.toLowerCase())) winners.push(n);
    }
    const participants = Math.max(0, Math.min(9999, Math.round(Number(e.participants) || 0)));
    out.push({
      name, date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '',
      image: /^images\/[A-Za-z0-9._-]{1,90}\.(png|jpg|jpeg|webp|gif)$/i.test(image) ? image : httpsUrl(image),
      description: str(e.description, 800),
      ...(participants ? { participants } : {}),
      ...(winners.length ? { winners: winners.slice(0, 12) } : {})
    });
  }
  return out;
}

function sanitizeNews(list) {
  return (Array.isArray(list) ? list : []).slice(0, 30).map((n) => {
    const date = str(n.date, 10);
    return { title: str(n.title, 100), date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10), text: str(n.text, 600) };
  }).filter((n) => n.title);
}

// Lista de personas con permiso para ver el modo administrador: [{ nick, uuid }]. El uuid va sin guiones.
function sanitizeAdmins(list) {
  const seen = new Set();
  const out = [];
  for (const a of (Array.isArray(list) ? list : []).slice(0, 30)) {
    const nick = str(a.nick, 16);
    const uuid = String(a.uuid || '').replace(/-/g, '').toLowerCase();
    if (!/^[A-Za-z0-9_]{1,16}$/.test(nick) || !/^[0-9a-f]{32}$/.test(uuid) || seen.has(uuid)) continue;
    seen.add(uuid);
    out.push({ nick, uuid });
  }
  return out;
}

// ¿Esta sesión puede ver el modo administrador? Solo cuentas premium (verificadas por Microsoft):
// un nick no premium lo puede escribir cualquiera.
function isAllowedAdmin(session, owners, admins) {
  if (!session || session.mode !== 'premium') return false;
  const uuid = String(session.uuid || '').replace(/-/g, '').toLowerCase();
  const name = String(session.name || '').toLowerCase();
  if ((owners || []).some((o) => String(o).toLowerCase() === name)) return true;
  return (admins || []).some((a) => a && String(a.uuid || '').toLowerCase() === uuid);
}

module.exports = { imageKind, MAX_IMAGE, sanitizeEvents, sanitizeAdmins, isAllowedAdmin, buildProtectedEvent, mergeManifest, sanitizeTeam, sanitizeNews, sameAsBefore };
