'use strict';

/*
 * Funciones puras para elegir versiones de Java y de Forge.
 * Están separadas de main.js para poder probarlas sin abrir el launcher (npm test).
 */

// "1.20.4" -> [1, 20, 4]    "1.21" -> [1, 21, 0]    "26.1" -> [26, 1, 0]
function parseMc(version) {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(String(version || ''));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] || 0)] : null;
}

function compare(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

// Versión mínima de Java que pide cada versión de Minecraft. Devuelve null si no la reconoce
// (por ejemplo, un snapshot como "24w14a"); en ese caso el launcher no bloquea nada.
function requiredJavaMajor(mcVersion) {
  const v = parseMc(mcVersion);
  if (!v) return null;
  if (v[0] >= 26) return 25;
  if (compare(v, [1, 20, 5]) >= 0) return 21;
  if (compare(v, [1, 18, 0]) >= 0) return 17;
  if (compare(v, [1, 17, 0]) >= 0) return 16;
  return 8;
}

// ¿Sirve este Java para este modpack? Forge en Minecraft 1.16.5 o anterior solo funciona bien con Java 8.
function javaIsOk(have, mcVersion, loaderType) {
  const need = requiredJavaMajor(mcVersion);
  if (!need || !have) return false;
  if (have < need) return false;
  if (String(loaderType).toLowerCase() === 'forge' && need === 8 && have !== 8) return false;
  return true;
}

// Versión de Java que se descarga cuando hace falta instalarlo (no existe un Temurin 16: se usa el 17).
function javaInstallMajor(mcVersion) {
  const need = requiredJavaMajor(mcVersion);
  if (!need) return null;
  return need === 16 ? 17 : need;
}

// Lee la salida de `java -version`: "1.8.0_391" -> 8, "17.0.9" -> 17, "21" -> 21.
function parseJavaMajor(output) {
  const m = /version "(\d+)(?:\.(\d+))?/.exec(String(output || ''));
  if (!m) return null;
  const first = Number(m[1]);
  return first === 1 ? Number(m[2] || 8) : first;
}

// Las versiones llegan de un archivo en internet y terminan en rutas y enlaces: solo caracteres seguros.
function isSafeVersion(v) {
  return typeof v === 'string' && /^[0-9A-Za-z][0-9A-Za-z._+-]{0,40}$/.test(v);
}

// Minecraft 1.12.2 y anteriores usan el jar "universal" de Forge; desde 1.13 se usa el "installer".
function forgeKind(mcVersion) {
  const v = parseMc(mcVersion);
  return v && compare(v, [1, 13, 0]) < 0 ? 'universal' : 'installer';
}

// promos = contenido de promotions_slim.json de Forge: { promos: { "1.20.1-recommended": "47.2.0", ... } }
function pickForgeVersion(promos, mcVersion, wanted) {
  if (wanted) return isSafeVersion(String(wanted)) ? String(wanted) : null;
  const p = (promos && promos.promos) || {};
  const found = p[`${mcVersion}-recommended`] || p[`${mcVersion}-latest`] || null;
  return found && isSafeVersion(found) ? found : null;
}

function forgeFileName(mcVersion, forgeVersion) {
  return `forge-${mcVersion}-${forgeVersion}-${forgeKind(mcVersion)}.jar`;
}

function forgeUrl(mcVersion, forgeVersion) {
  const full = `${mcVersion}-${forgeVersion}`;
  return `https://maven.minecraftforge.net/net/minecraftforge/forge/${full}/${forgeFileName(mcVersion, forgeVersion)}`;
}

// Loaders que el launcher sabe instalar. Cualquier otro se rechaza con un mensaje claro.
const SUPPORTED_LOADERS = ['vanilla', 'fabric', 'forge'];

const LOADER_LABELS = { vanilla: 'Vanilla', fabric: 'Fabric', forge: 'Forge' };

module.exports = {
  parseMc,
  requiredJavaMajor,
  javaIsOk,
  javaInstallMajor,
  parseJavaMajor,
  isSafeVersion,
  forgeKind,
  pickForgeVersion,
  forgeFileName,
  forgeUrl,
  SUPPORTED_LOADERS,
  LOADER_LABELS
};
