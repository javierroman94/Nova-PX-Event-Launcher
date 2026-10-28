'use strict';

/* Validación de archivos de skin antes de enviarlos a Mojang. */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_BYTES = 1024 * 1024;

// Lee el ancho y el alto de un PNG sin librerías (están en el bloque IHDR, justo después de la firma).
function pngSize(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 24 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// Una skin válida es un PNG de 64x64 (moderna) o 64x32 (antigua).
function validateSkin(buf) {
  if (!Buffer.isBuffer(buf) || buf.length === 0) throw new Error('El archivo está vacío.');
  if (buf.length > MAX_BYTES) throw new Error('El archivo pesa demasiado para ser una skin.');
  const size = pngSize(buf);
  if (!size) throw new Error('El archivo no es una imagen PNG válida.');
  const ok = size.width === 64 && (size.height === 64 || size.height === 32);
  if (!ok) throw new Error(`La skin debe medir 64x64 píxeles (o 64x32), y esta mide ${size.width}x${size.height}.`);
  return size;
}

// Las texturas de skins y capas solo se aceptan desde el servidor oficial de Mojang.
function safeTextureUrl(url) {
  const m = /^https?:\/\/textures\.minecraft\.net\/texture\/[0-9a-f]+$/i.exec(String(url || ''));
  return m ? String(url).replace(/^http:/i, 'https:') : null;
}

// Deja solo los datos que la interfaz necesita del perfil que devuelve Mojang.
function cleanProfile(p) {
  const skins = (p && p.skins) || [];
  const capes = (p && p.capes) || [];
  const activeSkin = skins.find((s) => s.state === 'ACTIVE') || skins[0] || null;
  return {
    id: String((p && p.id) || ''),
    name: String((p && p.name) || ''),
    skin: activeSkin
      ? { url: safeTextureUrl(activeSkin.url), variant: activeSkin.variant === 'SLIM' ? 'slim' : 'classic' }
      : null,
    capes: capes
      .map((c) => ({
        id: String(c.id || ''),
        name: String(c.alias || 'Capa').slice(0, 40),
        url: safeTextureUrl(c.url),
        active: c.state === 'ACTIVE'
      }))
      .filter((c) => c.id && c.url)
  };
}

module.exports = { pngSize, validateSkin, safeTextureUrl, cleanProfile, MAX_BYTES };
