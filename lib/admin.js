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
// Límites del texto de un evento: lo que se ve en la cabecera y las tarjetas. La descripción va en una sola línea (sin saltos).
const EVENT_NAME_MAX = 60;
const EVENT_TAGLINE_MAX = 220;
const oneLine = (v, max) => str(String(v == null ? '' : v).replace(/\s+/g, ' '), max);
const str = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
const httpsUrl = (u) => (/^https:\/\/[^\s]+$/i.test(String(u || '')) ? String(u).slice(0, 300) : '');

function sameAsBefore(prot, password) {
  if (!pc.isEnvelope(prot)) return false;
  try {
    pc.openEnvelope(prot, pc.deriveKey(password, prot.salt, pc.kdfOf(prot)));
    return true;
  } catch {
    return false;
  }
}

/**
 * Cifra los mods y arma el bloque "protected" del manifest.
 * jars: [{ file, data(Buffer) }]. Devuelve { envelope, assets: [{ name, data }], reusedSalt }.
 */
function buildProtectedEvent({ jars, password, previous, baseUrl, extras = [] }) {
  const problem = pc.passwordProblem(password);
  if (problem) throw new Error(problem);
  if (!jars.length) throw new Error('No hay mods para publicar.');
  if (!/^https:\/\//i.test(baseUrl)) throw new Error('Dirección de descarga no válida.');
  const reuse = sameAsBefore(previous, password);
  const salt = reuse ? previous.salt : pc.newSalt();
  // Si se reutiliza la sal, se conservan los parámetros del sobre anterior: así la llave que los jugadores ya guardaron sigue sirviendo.
  const kdf = reuse ? pc.kdfOf(previous) : pc.KDF_STRONG;
  const packKey = pc.newPackKey();
  const assets = [];
  const mods = jars.map(({ file, data }) => {
    if (file !== require('path').basename(file) || !/\.jar$/i.test(file) || /[\\/\0]/.test(file)) throw new Error(`Nombre de mod no válido: ${file}`);
    assets.push({ name: `${file}.enc`, data: pc.encryptFile(data, packKey, file) });
    return { name: file.replace(/\.jar$/i, ''), file, url: `${baseUrl.replace(/\/+$/, '')}/${encodeURIComponent(`${file}.enc`)}`, sha1: sha1(data) };
  });
  // Configuración del evento (config/…: FancyMenu, layouts, etc.): un solo paquete cifrado.
  let extra = null;
  const clean = (extras || []).filter((x) => x && /^config\/[^\0\\]+$/.test(x.rel) && !x.rel.split('/').includes('..'));
  if (clean.length) {
    const bundle = Buffer.from(JSON.stringify(clean.map((x) => ({ rel: x.rel, b64: Buffer.from(x.data).toString('base64') }))), 'utf8');
    assets.push({ name: 'config.bin.enc', data: pc.encryptFile(bundle, packKey, 'config.bin') });
    extra = { url: `${baseUrl.replace(/\/+$/, '')}/config.bin.enc`, sha1: sha1(bundle), count: clean.length };
  }
  return { envelope: pc.createEnvelope({ packKey, mods, ...(extra ? { extra } : {}) }, pc.deriveKey(password, salt, kdf), salt, kdf), assets, reusedSalt: reuse, extraCount: clean.length };
}

// Datos del evento que el administrador puede cambiar desde el launcher.
function mergeManifest(current, form) {
  const out = JSON.parse(JSON.stringify(current || {}));
  const f = form || {};
  out.event = { ...(out.event || {}) };
  if (f.name !== undefined) {
    out.event.name = oneLine(f.name, EVENT_NAME_MAX);
    if (!out.event.name) throw new Error('El evento necesita un nombre.');
  }
  if (f.tagline !== undefined) out.event.tagline = oneLine(f.tagline, EVENT_TAGLINE_MAX);
  if (f.active !== undefined) out.event.active = !!f.active;
  // Estado: próximamente | activo | finalizado (el banner y el logo se ven en los tres).
  if (f.status !== undefined) {
    const st = ['soon', 'active', 'ended'].includes(f.status) ? f.status : 'soon';
    out.event.status = st;
    out.event.active = st === 'active';
  }
  // Programado: queda como "próximamente" y el launcher lo abre solo a la hora de startsAt.
  if (f.autoStart !== undefined) out.event.autoStart = !!f.autoStart && out.event.status === 'soon';
  else if (f.status !== undefined && f.status !== 'soon') out.event.autoStart = false;
  if (f.image !== undefined) out.event.image = bgOf(f.image);
  if (f.logo !== undefined) out.event.logo = bgOf(f.logo);
  // Tamaño del título en imagen (el «logo» reemplaza al nombre en grande): 40 a 160 %.
  if (f.titleSize !== undefined) out.event.titleSize = titleSizeOf(f.titleSize);
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
  // La IP del servidor va dentro del modpack (servers.dat) y nunca en data/manifest.json, que es público en GitHub.
  // Si un manifest antiguo la traía, se borra al publicar.
  delete out.server;
  if (f.lockPack !== undefined) out.lockPack = !!f.lockPack;
  if (f.sponsors !== undefined) out.sponsors = sanitizeSponsors(f.sponsors);
  if (f.links !== undefined) {
    out.links = (Array.isArray(f.links) ? f.links : []).slice(0, 10).map((l) => ({ name: str(l.name, 40), url: httpsUrl(l.url) })).filter((l) => l.name && l.url);
  }
  return out;
}

// Enlaces (redes, portafolio): [{ name, url }], solo https.
function titleSizeOf(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(160, Math.max(40, n)) : 100;
}

// Patrocinadores y créditos del evento: [{ role, name, url?, logo?, text? }]
const SPONSOR_KINDS = ['host', 'sponsor', 'credit'];
const DEFAULT_ROLE = { host: 'Servidor hospedado por', sponsor: 'Evento patrocinado por', credit: 'Evento creado por' };
// Sin "kind" (datos antiguos) se deduce del rol.
function sponsorKind(x) {
  const k = String((x && x.kind) || '');
  if (SPONSOR_KINDS.includes(k)) return k;
  const r = String((x && x.role) || '').toLowerCase();
  return /hospedad|hosting|servidor/.test(r) ? 'host' : /patrocin|presenta/.test(r) ? 'sponsor' : 'credit';
}
function sanitizeSponsors(arr) {
  const out = [];
  for (const x of (Array.isArray(arr) ? arr : []).slice(0, 16)) {
    const name = str(x && x.name, 60);
    if (!name) continue;
    const kind = sponsorKind(x);
    const role = str(x.role, 60) || DEFAULT_ROLE[kind];
    const url = httpsUrl(x.url);
    const logo = bgOf(x.logo);
    const text = str(x.text, 160);
    const nick = /^[A-Za-z0-9_]{3,16}$/.test(String((x && x.nick) || '').trim()) ? String(x.nick).trim() : '';
    out.push({ kind, role, name, ...(url ? { url } : {}), ...(logo ? { logo } : {}), ...(text ? { text } : {}), ...(nick ? { nick } : {}), ...skinFields(x) });
  }
  return out;
}
function sanitizeLinks(arr) {
  return (Array.isArray(arr) ? arr : []).slice(0, 6).map((l) => ({ name: str(l && l.name, 30), url: httpsUrl(l && l.url) })).filter((l) => l.name && l.url);
}
// Skin subida por el administrador (para quien no tiene cuenta premium): images/xxx.png + modelo.
function skinFields(p) {
  const s = String((p && p.skin) || '');
  return /^images\/[A-Za-z0-9._-]{1,90}\.png$/i.test(s) ? { skin: s, ...(p.slim ? { slim: true } : {}) } : {};
}
// Personas nombradas (participantes / colaboradores): [{ nick, role?, links? }]
function sanitizePeople(arr, max) {
  const seen = new Set();
  const out = [];
  for (const p of (Array.isArray(arr) ? arr : []).slice(0, max)) {
    const nick = str(p && p.nick, 16);
    if (!/^[A-Za-z0-9_]{1,16}$/.test(nick) || seen.has(nick.toLowerCase())) continue;
    seen.add(nick.toLowerCase());
    const links = sanitizeLinks(p.links);
    const role = str(p.role, 60);
    out.push({ nick, ...(role ? { role } : {}), ...(links.length ? { links } : {}), ...skinFields(p) });
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
    out.push({
      nick, role: str(m.role, 80), ...(m.featured ? { featured: true } : {}),
      ...(sanitizeLinks(m.links).length ? { links: sanitizeLinks(m.links) } : {}),
      ...skinFields(m),
      // Perfil: nombre real, foto (no de Minecraft) y presentación corta.
      ...(str(m.name, 40) ? { name: str(m.name, 40) } : {}),
      ...(str(m.bio, 300) ? { bio: str(m.bio, 300) } : {}),
      ...(/^images\/[A-Za-z0-9._-]{1,90}\.(png|jpg|jpeg|webp|gif)$/i.test(String(m.avatar || '')) ? { avatar: String(m.avatar) } : httpsUrl(m.avatar) ? { avatar: httpsUrl(m.avatar) } : {}),
      // Homenaje: tarjeta especial arriba del todo en la pestaña Equipo.
      ...(m.tribute ? { tribute: true, years: str(m.years, 30), tributeText: str(m.tributeText, 300) } : {})
    });
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

// Fondo del evento: imagen del repositorio o https.
function bgOf(v) {
  const s = String(v || '');
  return /^images\/[A-Za-z0-9._-]{1,90}\.(png|jpg|jpeg|webp|gif)$/i.test(s) ? s : httpsUrl(s);
}
// Quien comisionó el evento: nombre y enlace a su canal (YouTube, X…).
function commissionerOf(c) {
  const name = str(c && c.name, 60);
  const url = httpsUrl(c && c.url);
  const nick = /^[A-Za-z0-9_]{1,16}$/.test(String((c && c.nick) || '').trim()) ? String(c.nick).trim() : '';
  return name ? { name, ...(url ? { url } : {}), ...(nick ? { nick } : {}) } : null;
}

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
      ...(winners.length ? { winners: winners.slice(0, 12) } : {}),
      ...(bgOf(e.background) ? { background: bgOf(e.background) } : {}),
      ...(commissionerOf(e.commissioner) ? { commissioner: commissionerOf(e.commissioner) } : {}),
      ...(sanitizeLinks(e.posts).length ? { posts: sanitizeLinks(e.posts).slice(0, 4) } : {}),
      ...(sanitizePeople(e.roster, 80).length ? { roster: sanitizePeople(e.roster, 80) } : {}),
      ...(sanitizePeople(e.collabs, 30).length ? { collabs: sanitizePeople(e.collabs, 30) } : {})
    });
  }
  return out;
}

function sanitizeNews(list) {
  return (Array.isArray(list) ? list : []).slice(0, 30).map((n) => {
    const date = str(n.date, 10);
    const image = String(n.image || '');
    const img = /^images\/[A-Za-z0-9._-]{1,90}\.(png|jpg|jpeg|webp|gif)$/i.test(image) ? image : httpsUrl(image);
    const links = sanitizeLinks(n.links);
    return {
      title: str(n.title, 100), date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10), text: str(n.text, 600),
      ...(img ? { image: img } : {}), ...(links.length ? { links } : {})
    };
  }).filter((n) => n.title);
}

// Publicidad: [{ id, name, image, url, text, where, from, to, enabled }]. Siempre se muestra con la etiqueta "Publicidad".
const AD_WHERE = ['home', 'event', 'both'];
function sanitizeAds(list) {
  const seen = new Set();
  const out = [];
  for (const a of (Array.isArray(list) ? list : []).slice(0, 12)) {
    const name = str(a && a.name, 60);
    if (!name) continue;
    let id = String((a && a.id) || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
    if (!id || seen.has(id)) id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'ad'}-${Math.random().toString(36).slice(2, 6)}`;
    seen.add(id);
    const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
    const image = bgOf(a.image);
    const url = httpsUrl(a.url);
    const text = str(a.text, 120);
    out.push({
      id, name, ...(image ? { image } : {}), ...(url ? { url } : {}), ...(text ? { text } : {}),
      where: AD_WHERE.includes(a.where) ? a.where : 'both', from: date(a.from), to: date(a.to), enabled: a.enabled !== false
    });
  }
  return out;
}

// Lista de personas con permiso para ver el modo administrador: [{ nick, uuid }]. El uuid va sin guiones.
// Biblioteca de eventos del panel (data/biblioteca-eventos.json): borradores y eventos pasados, cada uno con todos sus datos.
// Es solo de administradores: los jugadores leen únicamente data/manifest.json. Nunca guarda contraseñas.
function sanitizeEventLibrary(list) {
  const seen = new Set();
  const out = [];
  for (const e of (Array.isArray(list) ? list : []).slice(0, 40)) {
    if (!e || typeof e !== 'object') continue;
    const name = oneLine(e.name, EVENT_NAME_MAX);
    const id = String(e.id || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
    if (!name || !id || seen.has(id)) continue;
    seen.add(id);
    const startsAt = str(e.startsAt, 40);
    out.push({
      id, name, tagline: oneLine(e.tagline, EVENT_TAGLINE_MAX),
      startsAt: startsAt && !Number.isNaN(Date.parse(startsAt)) ? startsAt : '',
      status: ['soon', 'active', 'ended'].includes(e.status) ? e.status : 'soon',
      image: bgOf(e.image), logo: bgOf(e.logo), titleSize: titleSizeOf(e.titleSize),
      sponsors: sanitizeSponsors(e.sponsors),
      lockPack: e.lockPack !== false,
      publishedId: String(e.publishedId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60),
      instanceId: String(e.instanceId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60),
      updatedAt: new Date().toISOString()
    });
  }
  return out;
}

function sanitizeAdmins(list) {
  const seen = new Set();
  const out = [];
  for (const a of (Array.isArray(list) ? list : []).slice(0, 30)) {
    const nick = str(a.nick, 16);
    const uuid = String(a.uuid || '').replace(/-/g, '').toLowerCase();
    if (!/^[A-Za-z0-9_]{1,16}$/.test(nick) || !/^[0-9a-f]{32}$/.test(uuid) || seen.has(uuid)) continue;
    seen.add(uuid);
    const entry = { nick, uuid };
    const P = require('./permisos');
    if (a.rol === 'moderador') entry.rol = 'moderador';
    if (Array.isArray(a.permisos)) entry.permisos = [...new Set(a.permisos.filter((x) => P.TODOS.includes(x) && x !== 'permisos'))];
    out.push(entry);
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

module.exports = { EVENT_NAME_MAX, EVENT_TAGLINE_MAX, sanitizeSponsors, imageKind, MAX_IMAGE, sanitizeEvents, sanitizeAdmins, sanitizeEventLibrary, isAllowedAdmin, buildProtectedEvent, mergeManifest, sanitizeTeam, sanitizeNews, sanitizeAds, sameAsBefore };
