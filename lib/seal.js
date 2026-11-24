'use strict';
/*
 * Sellado de informes: se cifran con una llave pública (RSA-OAEP + AES-256-GCM). Solo quien tiene la llave privada,
 * que NO está en el repositorio, puede abrirlos. Así el informe de un evento protegido no lo lee cualquiera.
 */
const crypto = require('crypto');

const MAGIC = Buffer.from('NPXS1');
const OAEP = { padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' };

function seal(buffer, publicKeyPem) {
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const wrapped = crypto.publicEncrypt({ key: publicKeyPem, ...OAEP }, key);
  const len = Buffer.alloc(2);
  len.writeUInt16BE(wrapped.length);
  return Buffer.concat([MAGIC, len, wrapped, iv, data, cipher.getAuthTag()]);
}

function unseal(blob, privateKeyPem) {
  if (!Buffer.isBuffer(blob) || blob.length < MAGIC.length + 2 + 12 + 16 || !blob.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('Informe sellado no válido.');
  }
  const n = blob.readUInt16BE(MAGIC.length);
  const start = MAGIC.length + 2;
  const wrapped = blob.subarray(start, start + n);
  const iv = blob.subarray(start + n, start + n + 12);
  const tag = blob.subarray(blob.length - 16);
  const data = blob.subarray(start + n + 12, blob.length - 16);
  const key = crypto.privateDecrypt({ key: privateKeyPem, ...OAEP }, wrapped);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

module.exports = { seal, unseal };
