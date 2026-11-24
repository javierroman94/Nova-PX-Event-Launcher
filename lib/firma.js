'use strict';
/*
 * Firma de los datos críticos (Ed25519). Los archivos de data/ llegan de GitHub y cualquiera que controle el
 * repositorio o la cuenta de administrador podría cambiarlos. Los que deciden qué se descarga o se ejecuta
 * se firman con una llave privada que NO está en el repositorio; el launcher trae la pública y rechaza lo que no cuadre.
 *
 * La firma va en un archivo aparte (data/<nombre>.firma.json) y cubre los bytes exactos del archivo, su nombre y la fecha.
 */
const crypto = require('crypto');

const FIRMADOS = ['manifest', 'plugins', 'recommended', 'launcher', 'admins'];
const PREFIJO = 'NPX-DATA1';

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const mensaje = (nombre, firmadoEn, hash) => Buffer.from(`${PREFIJO}\n${nombre}\n${firmadoEn}\n${hash}`, 'utf8');

function esFirmado(nombre) {
  return FIRMADOS.includes(nombre);
}

// Ruta de la firma de un archivo: data/manifest.json -> data/manifest.firma.json
function rutaFirma(ruta) {
  return String(ruta).replace(/\.json$/, '.firma.json');
}

function firmar(nombre, bytes, llavePrivadaPem, ahora = new Date()) {
  if (!esFirmado(nombre)) throw new Error(`"${nombre}" no es un archivo firmado.`);
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes, 'utf8');
  const firmadoEn = ahora.toISOString();
  const hash = sha256(buf);
  const firma = crypto.sign(null, mensaje(nombre, firmadoEn, hash), llavePrivadaPem).toString('base64');
  return { v: 1, nombre, firmadoEn, sha256: hash, firma };
}

// Devuelve { firmadoEn } si todo cuadra; si no, lanza un error con el motivo.
function verificar(nombre, bytes, sig, llavePublicaPem) {
  if (!sig || typeof sig !== 'object' || sig.v !== 1) throw new Error('Firma ausente o con formato desconocido.');
  if (sig.nombre !== nombre) throw new Error('La firma es de otro archivo.');
  if (typeof sig.firmadoEn !== 'string' || Number.isNaN(Date.parse(sig.firmadoEn))) throw new Error('Fecha de firma no válida.');
  if (typeof sig.firma !== 'string' || sig.firma.length > 200) throw new Error('Firma no válida.');
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes, 'utf8');
  const hash = sha256(buf);
  if (sig.sha256 !== hash) throw new Error('El contenido no coincide con su firma.');
  let ok = false;
  try {
    ok = crypto.verify(null, mensaje(nombre, sig.firmadoEn, hash), llavePublicaPem, Buffer.from(sig.firma, 'base64'));
  } catch {
    ok = false;
  }
  if (!ok) throw new Error('La firma no es válida.');
  return { firmadoEn: sig.firmadoEn };
}

// ¿Esta llave privada es Ed25519 y corresponde a esta pública?
function llaveCoincide(llavePrivadaPem, llavePublicaPem) {
  try {
    const priv = crypto.createPrivateKey(llavePrivadaPem);
    if (priv.asymmetricKeyType !== 'ed25519') return false;
    const a = crypto.createPublicKey(priv).export({ type: 'spki', format: 'der' });
    const b = crypto.createPublicKey(llavePublicaPem).export({ type: 'spki', format: 'der' });
    return a.equals(b);
  } catch {
    return false;
  }
}

module.exports = { FIRMADOS, esFirmado, rutaFirma, firmar, verificar, llaveCoincide, sha256 };
