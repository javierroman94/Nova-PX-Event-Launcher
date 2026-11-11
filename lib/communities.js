'use strict';
/*
 * Comunidades: cada evento/equipo vive en su propio repositorio y el launcher solo lo muestra a quien tenga el código.
 * data/communities.json (en el repositorio del launcher) guarda, por cada código, los datos de la comunidad CIFRADOS con ese código:
 *   { version: 1, entries: { "<sha256 del código>": { salt, iv, tag, data } } }
 * Sin el código no se ve el nombre ni el repositorio. (La clave sale del código con scrypt; usa códigos largos.)
 */
const crypto = require('crypto');

const ID_RE = /^[a-z0-9][a-z0-9-]{1,31}$/;
const REPO_BASE_RE = /^https:\/\/raw\.githubusercontent\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\/[A-Za-z0-9._/-]+$/;
const NICK_RE = /^[A-Za-z0-9_]{3,16}$/;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I para evitar confusiones

// "nova-7k3q 92xd" -> "NOVA7K3Q92XD"
function normalizeCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
function codeId(code) {
  return crypto.createHash('sha256').update(`sagitta-community-v1:${normalizeCode(code)}`).digest('hex');
}
// Código legible de 16 caracteres (80 bits): XXXX-XXXX-XXXX-XXXX
function makeCode() {
  const b = crypto.randomBytes(16);
  let s = '';
  for (let i = 0; i < 16; i++) s += ALPHABET[b[i] % ALPHABET.length];
  return s.match(/.{4}/g).join('-');
}

function sanitizeCommunity(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').toLowerCase();
  const remoteBase = String(raw.remoteBase || '').replace(/\/$/, '');
  if (!ID_RE.test(id) || !REPO_BASE_RE.test(remoteBase)) return null;
  const name = String(raw.name || '').trim().slice(0, 40);
  if (!name) return null;
  return {
    id,
    name,
    remoteBase,
    owners: (Array.isArray(raw.owners) ? raw.owners : []).map(String).filter((n) => NICK_RE.test(n)).slice(0, 20),
    description: String(raw.description || '').slice(0, 200),
    // el código se guarda en el equipo del jugador solo para refrescar los permisos de su comunidad
    ...(/^[A-Z0-9]{8,40}$/.test(String(raw.code || '')) ? { code: String(raw.code) } : {})
  };
}

function encryptEntry(community, code) {
  const c = sanitizeCommunity(community);
  if (!c) throw new Error('Datos de comunidad no válidos.');
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(normalizeCode(code), salt, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(c), 'utf8'), cipher.final()]);
  return { salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
}

function decryptEntry(entry, code) {
  try {
    const key = crypto.scryptSync(normalizeCode(code), Buffer.from(entry.salt, 'base64'), 32);
    const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(entry.iv, 'base64'));
    d.setAuthTag(Buffer.from(entry.tag, 'base64'));
    const json = Buffer.concat([d.update(Buffer.from(entry.data, 'base64')), d.final()]).toString('utf8');
    return sanitizeCommunity(JSON.parse(json));
  } catch {
    return null;
  }
}

// -> comunidad o null (código desconocido)
function lookup(registry, code) {
  if (normalizeCode(code).length < 8) return null;
  const entry = registry && registry.entries && registry.entries[codeId(code)];
  return entry ? decryptEntry(entry, code) : null;
}

function addEntry(registry, community, code) {
  const reg = registry && registry.entries ? { version: 1, entries: { ...registry.entries } } : { version: 1, entries: {} };
  reg.entries[codeId(code)] = encryptEntry(community, code);
  return reg;
}

function removeEntry(registry, code) {
  const reg = registry && registry.entries ? { version: 1, entries: { ...registry.entries } } : { version: 1, entries: {} };
  delete reg.entries[codeId(code)];
  return reg;
}

// "javierroman94/Mi-Repo" (+ rama) -> remoteBase
function baseFromRepo(owner, repo, branch = 'main') {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/data`;
}
function parseRepoInput(text) {
  const t = String(text || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/$/, '');
  const m = /^([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)(?:[#@:]([A-Za-z0-9._/-]+))?$/.exec(t);
  return m ? { owner: m[1], repo: m[2], branch: m[3] || 'main' } : null;
}

module.exports = { normalizeCode, codeId, makeCode, sanitizeCommunity, encryptEntry, decryptEntry, lookup, addEntry, removeEntry, baseFromRepo, parseRepoInput, ID_RE };
