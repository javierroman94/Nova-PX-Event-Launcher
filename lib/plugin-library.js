'use strict';
/*
 * Biblioteca de plugins propios de Nova PX. El administrador sube .jar; el catálogo (data/plugins.json) es público
 * y muestra el nombre de cada plugin. Los plugins «bloqueados» se publican CIFRADOS (AES-256-GCM) con una clave que solo
 * abre quien conoce la contraseña de la biblioteca, así que el archivo público no sirve sin autorización.
 * Los plugins sin bloquear son públicos: cualquiera con el enlace puede descargarlos.
 * Todo lo que toca la red se recibe como parámetro para poder probarlo sin internet.
 */
const crypto = require('crypto');
const pc = require('./pack-crypto');

const MAX_PLUGINS = 40;
const MAX_BYTES = 60 * 1024 * 1024;
const SERVER_TYPES = ['paper', 'purpur', 'spigot'];
const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');
const str = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
const httpsUrl = (u) => (/^https:\/\/[^\s]+$/i.test(String(u || '')) ? String(u).slice(0, 400) : '');
const imageOf = (v) => {
  const x = String(v || '');
  return /^images\/[A-Za-z0-9._-]{1,90}\.(png|jpg|jpeg|webp|gif)$/i.test(x) ? x : httpsUrl(x);
};
const linksOf = (list) => (Array.isArray(list) ? list : []).map((l) => ({ label: str(l && l.label, 30), url: httpsUrl(l && l.url) })).filter((l) => l.url).map((l) => ({ ...l, label: l.label || 'Enlace' })).slice(0, 4);
const creatorOf = (c) => ({ name: str(c && c.name, 60), url: httpsUrl(c && c.url) });
// Datos que se ven en el catálogo aunque el plugin esté bloqueado (la descarga sigue protegida).
const infoFields = (o) => ({ info: str(o && o.info, 800), image: imageOf(o && o.image), creator: creatorOf(o && o.creator), links: linksOf(o && o.links) });
const SAFE_JAR = /^[A-Za-z0-9._+()-][A-Za-z0-9 ._+()-]{0,120}\.jar$/i;

function slugId(name) {
  return String(name).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

function sanitizeLibrary(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const seen = new Set();
  const plugins = [];
  for (const p of Array.isArray(o.plugins) ? o.plugins : []) {
    if (!p || typeof p !== 'object') continue;
    const id = /^[a-z0-9][a-z0-9-]{0,39}$/.test(String(p.id)) ? String(p.id) : '';
    const file = SAFE_JAR.test(String(p.file || '')) ? String(p.file) : '';
    const url = httpsUrl(p.url);
    const hash = /^[0-9a-f]{40}$/.test(String(p.sha1)) ? String(p.sha1) : '';
    if (!id || !file || !url || !hash || seen.has(id)) continue;
    seen.add(id);
    plugins.push({
      id, name: str(p.name, 60) || id, description: str(p.description, 240), ...infoFields(p), file, url, sha1: hash,
      size: Math.max(0, Math.min(MAX_BYTES, Number(p.size) || 0)), locked: !!p.locked,
      asset: str(p.asset, 160), added: /^\d{4}-\d{2}-\d{2}/.test(String(p.added)) ? String(p.added).slice(0, 10) : ''
    });
    if (plugins.length >= MAX_PLUGINS) break;
  }
  const lock = pc.isEnvelope(o.lock) ? o.lock : null;
  return { plugins, lock };
}

const assetNameOf = (id, file, locked) => `${id}__${file.replace(/[^A-Za-z0-9._+-]/g, '_')}${locked ? '.enc' : ''}`;

// ¿La contraseña abre este candado? Devuelve la clave del paquete o lanza Error('BAD_KEY').
function openLock(lock, password) {
  if (!pc.isEnvelope(lock)) throw new Error('La biblioteca no tiene plugins bloqueados.');
  const payload = pc.openEnvelope(lock, pc.deriveKey(password, lock.salt));
  if (!payload || typeof payload.packKey !== 'string') throw new Error('BAD_KEY');
  return payload.packKey;
}

/**
 * Prepara un plugin para publicar. Devuelve { entry, asset:{name,data}, lock }.
 * Si es bloqueado y ya había candado, la contraseña tiene que ser la misma (si no, los bloqueados anteriores quedarían ilegibles).
 */
function buildPlugin({ name, description, info, image, creator, links, file, data, locked, password, previousLock, baseUrl, now = new Date() }) {
  const title = str(name, 60);
  if (!title) throw new Error('Ponle un nombre al plugin.');
  const id = slugId(title);
  if (!id) throw new Error('El nombre del plugin no es válido.');
  if (!SAFE_JAR.test(String(file || ''))) throw new Error('El archivo tiene que ser un .jar con un nombre sencillo.');
  if (!Buffer.isBuffer(data) || data.length < 4 || data.readUInt32LE(0) !== 0x04034b50) throw new Error('Ese archivo no es un .jar válido.');
  if (data.length > MAX_BYTES) throw new Error(`El plugin pesa más de ${Math.round(MAX_BYTES / 1048576)} MB.`);
  if (!/^https:\/\//i.test(String(baseUrl || ''))) throw new Error('Dirección de descarga no válida.');
  const assetName = assetNameOf(id, file, !!locked);
  let lock = pc.isEnvelope(previousLock) ? previousLock : null;
  let body = data;
  if (locked) {
    const problem = pc.passwordProblem(password);
    if (problem) throw new Error(problem);
    let packKey;
    if (lock) {
      try { packKey = openLock(lock, password); } catch { throw new Error('Esa contraseña no es la de la biblioteca. Usa la misma que en los otros plugins bloqueados.'); }
    } else {
      const salt = pc.newSalt();
      packKey = pc.newPackKey();
      lock = pc.createEnvelope({ packKey }, pc.deriveKey(password, salt), salt);
    }
    body = pc.encryptFile(data, packKey, assetName);
  }
  const entry = {
    id, name: title, description: str(description, 240), ...infoFields({ info, image, creator, links }), file, url: `${baseUrl.replace(/\/+$/, '')}/${encodeURIComponent(assetName)}`,
    sha1: sha1(data), size: data.length, locked: !!locked, asset: assetName, added: now.toISOString().slice(0, 10)
  };
  return { entry, asset: { name: assetName, data: body }, lock };
}

// Agrega o reemplaza por id. Devuelve { library, staleAssets } (nombres de assets viejos que hay que borrar del release).
function upsert(library, entry, lock) {
  const lib = sanitizeLibrary(library);
  const old = lib.plugins.find((p) => p.id === entry.id);
  const stale = old && old.asset && old.asset !== entry.asset ? [old.asset] : [];
  const plugins = [...lib.plugins.filter((p) => p.id !== entry.id), entry].sort((a, b) => a.name.localeCompare(b.name));
  if (plugins.length > MAX_PLUGINS) throw new Error(`Máximo ${MAX_PLUGINS} plugins en la biblioteca.`);
  return { library: { plugins, lock: lock || lib.lock }, staleAssets: stale };
}

// Cambia solo lo que se ve (nombre, descripción, imagen, creador, enlaces); no toca el archivo ni su bloqueo.
function updateInfo(library, id, f) {
  const lib = sanitizeLibrary(library);
  const old = lib.plugins.find((p) => p.id === id);
  if (!old) throw new Error('Ese plugin no está en la biblioteca.');
  const name = str(f && f.name, 60) || old.name;
  const next = { ...old, name, description: str(f && f.description, 240), ...infoFields(f) };
  return { library: { plugins: lib.plugins.map((p) => (p.id === id ? next : p)).sort((a, b) => a.name.localeCompare(b.name)), lock: lib.lock }, staleAssets: [] };
}

function remove(library, id) {
  const lib = sanitizeLibrary(library);
  const old = lib.plugins.find((p) => p.id === id);
  if (!old) throw new Error('Ese plugin no está en la biblioteca.');
  const plugins = lib.plugins.filter((p) => p.id !== id);
  const stillLocked = plugins.some((p) => p.locked);
  return { library: { plugins, lock: stillLocked ? lib.lock : null }, staleAssets: old.asset ? [old.asset] : [] };
}

// Descarga y deja listo el .jar (descifra si está bloqueado) y comprueba que sea el archivo publicado.
async function fetchPlugin({ entry, lock, password, download }) {
  let buf = await download(entry.url);
  if (entry.locked) {
    if (!password) throw new Error('LOCKED');
    let key;
    try { key = openLock(lock, password); } catch (e) { throw new Error(e.message === 'BAD_KEY' ? 'BAD_KEY' : e.message); }
    try { buf = pc.decryptFile(buf, key, entry.asset); } catch { throw new Error('No se pudo descifrar el plugin. Puede que se haya subido un archivo equivocado.'); }
  }
  if (sha1(buf) !== entry.sha1) throw new Error('El plugin descargado no coincide con el publicado (archivo dañado).');
  return buf;
}

module.exports = { MAX_PLUGINS, MAX_BYTES, SERVER_TYPES, slugId, sanitizeLibrary, assetNameOf, openLock, buildPlugin, upsert, updateInfo, remove, fetchPlugin };
