'use strict';

/*
 * Cifrado del modpack protegido con contraseña.
 *
 * - La contraseña no se guarda en ningún sitio. Con ella y una "sal" aleatoria se deriva una clave (scrypt).
 * - Esa clave abre un "sobre" cifrado (AES-256-GCM) que está dentro de data/manifest.json y contiene la
 *   lista de mods, sus enlaces y una clave aleatoria del modpack.
 * - Cada .jar se sube cifrado (.jar.enc) con la clave del modpack. Sin la contraseña no hay forma de
 *   leer los enlaces ni de abrir los archivos, aunque el repositorio y el launcher sean públicos.
 * - GCM además detecta si alguien modifica los archivos: si no cuadra, falla en vez de instalar.
 */

const crypto = require('crypto');

// Sobres antiguos: N=2^15 (no llevan campo "kdf"). Sobres nuevos: N=2^17 y lo guardan en "kdf" (así cada sobre dice cómo abrirse).
const KDF_LEGACY = { N: 32768, r: 8, p: 1 };
const KDF_STRONG = { N: 131072, r: 8, p: 1 };
const MIN_PASSWORD = 10;

function newSalt() {
  return crypto.randomBytes(16).toString('base64');
}

function newPackKey() {
  return crypto.randomBytes(32).toString('base64');
}

// Parámetros de scrypt de un sobre. Un sobre manipulado no puede pedir más de 2^18 (evita agotar la memoria del jugador).
function kdfOf(env) {
  const k = env && env.kdf;
  if (!k || typeof k !== 'object') return KDF_LEGACY;
  const ok = Number.isInteger(k.N) && k.N >= 32768 && k.N <= 262144 && (k.N & (k.N - 1)) === 0 && k.r === 8 && k.p === 1;
  if (!ok) throw new Error('El evento protegido trae parámetros de cifrado no válidos.');
  return { N: k.N, r: 8, p: 1 };
}

function deriveKey(password, saltB64, kdf = KDF_LEGACY) {
  if (typeof password !== 'string' || !password) throw new Error('Falta la contraseña.');
  return crypto.scryptSync(password.normalize('NFKC'), Buffer.from(String(saltB64), 'base64'), 32, { ...kdf, maxmem: 160 * kdf.N * kdf.r });
}

function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    return `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres. Una frase de varias palabras es lo más seguro.`;
  }
  return null;
}

function revOf(iv, data) {
  return crypto.createHash('sha256').update(iv).update(data).digest('hex').slice(0, 16);
}

// Crea el sobre cifrado que se guarda en manifest.protected.
function createEnvelope(payload, key, saltB64, kdf = KDF_LEGACY) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    rev: revOf(iv.toString('base64'), data.toString('base64')),
    ...(kdf && kdf.N !== KDF_LEGACY.N ? { kdf: { N: kdf.N, r: kdf.r, p: kdf.p } } : {}),
    salt: saltB64,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: data.toString('base64')
  };
}

function isEnvelope(env) {
  return (
    !!env &&
    env.v === 1 &&
    ['rev', 'salt', 'iv', 'tag', 'data'].every((k) => typeof env[k] === 'string' && env[k].length > 0)
  );
}

// Abre el sobre con una clave. Lanza Error('BAD_KEY') si la contraseña es incorrecta o el sobre fue alterado.
function openEnvelope(env, key) {
  if (!isEnvelope(env)) throw new Error('El evento protegido está dañado o tiene un formato desconocido.');
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(env.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(env.tag, 'base64'));
    const plain = Buffer.concat([decipher.update(Buffer.from(env.data, 'base64')), decipher.final()]);
    return JSON.parse(plain.toString('utf8'));
  } catch {
    throw new Error('BAD_KEY');
  }
}

// Cifra un archivo (formato: 12 bytes de iv + datos cifrados + 16 bytes de etiqueta).
// "aad" es el nombre del archivo: evita que alguien intercambie un mod por otro.
function encryptFile(buffer, packKeyB64, aad) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(packKeyB64, 'base64'), iv);
  cipher.setAAD(Buffer.from(String(aad)));
  const data = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return Buffer.concat([iv, data, cipher.getAuthTag()]);
}

function decryptFile(buffer, packKeyB64, aad) {
  if (buffer.length < 12 + 16) throw new Error('Archivo cifrado incompleto.');
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(buffer.length - 16);
  const data = buffer.subarray(12, buffer.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(packKeyB64, 'base64'), iv);
  decipher.setAAD(Buffer.from(String(aad)));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

module.exports = {
  MIN_PASSWORD,
  newSalt,
  newPackKey,
  KDF_LEGACY,
  KDF_STRONG,
  kdfOf,
  deriveKey,
  passwordProblem,
  createEnvelope,
  openEnvelope,
  isEnvelope,
  encryptFile,
  decryptFile
};
