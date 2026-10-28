'use strict';

/*
 * Skins y capas con la API oficial de Mojang (solo cuentas premium).
 * Documentación: https://wiki.vg/Mojang_API  (Minecraft services: /minecraft/profile)
 */

const API = 'https://api.minecraftservices.com';
const MAX_SKIN_BYTES = 200 * 1024;

// Lee el ancho y alto de un PNG sin librerías (cabecera IHDR).
function pngSize(buf) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!Buffer.isBuffer(buf) || buf.length < 24 || !buf.subarray(0, 8).equals(signature)) return null;
  if (buf.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// Una skin válida es un PNG de 64x64 (o 64x32 en el formato antiguo).
function validateSkinPng(buf) {
  if (buf.length > MAX_SKIN_BYTES) throw new Error('El archivo es demasiado grande para ser una skin.');
  const size = pngSize(buf);
  if (!size) throw new Error('El archivo no es una imagen PNG.');
  const ok = size.width === 64 && (size.height === 64 || size.height === 32);
  if (!ok) throw new Error(`La skin debe medir 64x64 píxeles (la tuya mide ${size.width}x${size.height}).`);
  return size;
}

function friendlyError(status, body) {
  if (status === 401) return 'SESSION_EXPIRED: Tu sesión de Microsoft caducó. Inicia sesión otra vez desde Cuenta.';
  if (status === 429) return 'Mojang limita los cambios de skin. Espera unos minutos e inténtalo de nuevo.';
  if (status === 400) return 'Mojang rechazó el cambio (la skin o la capa no son válidas para tu cuenta).';
  if (status === 403) return 'Mojang no permite este cambio ahora mismo.';
  return `Mojang respondió con un error (${status}).`;
}

async function call(token, method, pathname, { json, form } = {}, { base = API, fetchImpl = fetch } = {}) {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  let body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form) {
    body = form;
  }
  const res = await fetchImpl(`${base}${pathname}`, { method, headers, body });
  if (!res.ok) throw new Error(friendlyError(res.status));
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Mojang entrega las texturas con http://; se usan siempre por https.
function toHttps(url) {
  return typeof url === 'string' ? url.replace(/^http:\/\//i, 'https://') : url;
}

function normalizeProfile(p) {
  const skins = (p.skins || []).map((s) => ({
    id: s.id,
    state: s.state,
    url: toHttps(s.url),
    variant: String(s.variant || 'CLASSIC').toLowerCase() === 'slim' ? 'slim' : 'classic'
  }));
  const capes = (p.capes || []).map((c) => ({ id: c.id, state: c.state, url: toHttps(c.url), alias: c.alias || 'Capa' }));
  return {
    id: p.id,
    name: p.name,
    skins,
    capes,
    activeSkin: skins.find((s) => s.state === 'ACTIVE') || skins[0] || null,
    activeCape: capes.find((c) => c.state === 'ACTIVE') || null
  };
}

async function getProfile(token, opts) {
  return normalizeProfile(await call(token, 'GET', '/minecraft/profile', {}, opts));
}

async function uploadSkin(token, buf, variant, opts) {
  validateSkinPng(buf);
  const form = new FormData();
  form.append('variant', variant === 'slim' ? 'slim' : 'classic');
  form.append('file', new Blob([buf], { type: 'image/png' }), 'skin.png');
  await call(token, 'POST', '/minecraft/profile/skins', { form }, opts);
}

async function setCape(token, capeId, opts) {
  await call(token, 'PUT', '/minecraft/profile/capes/active', { json: { capeId } }, opts);
}

async function hideCape(token, opts) {
  await call(token, 'DELETE', '/minecraft/profile/capes/active', {}, opts);
}

module.exports = { pngSize, validateSkinPng, normalizeProfile, getProfile, uploadSkin, setCape, hideCape, friendlyError };
