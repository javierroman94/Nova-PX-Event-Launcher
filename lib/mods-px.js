'use strict';

/*
 * Mods de eventos protegidos en formato .px.
 *
 * - Un .px es el mod tal como se publica cifrado (AES-256-GCM con la clave del
 *   modpack, que solo se obtiene abriendo el sobre con la contraseña vía scrypt),
 *   precedido de una cabecera propia. El nonce es aleatorio por archivo y el
 *   nombre real del mod va en el AAD: un .px de otro mod no se acepta.
 * - Los .px viven en la caché del launcher (userData/pack-cache/<evento>/), fuera
 *   de la carpeta del juego. Nunca se escriben .jar descifrados ahí.
 * - Para jugar (Fabric) se descifran en una carpeta temporal propia con nombres
 *   aleatorios, se le pasa a Fabric con -Dfabric.addMods y se borra al cerrar.
 *
 * Límite (documentado en docs/SEGURIDAD.md): mientras Minecraft corre, los .jar
 * descifrados existen en disco y en la memoria de Java. Quien controla su propio
 * equipo puede copiarlos en ese momento. Esto lo hace difícil, no imposible.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const pc = require('./pack-crypto');

const MAGIC = Buffer.from('NPXPX\u0001', 'latin1'); // «NPXPX» + versión 1
const RUN_PREFIX = 'npx-run-';
const MARKER = '.novapx-run';
const HASH16 = /^[0-9a-f]{16}$/;

const pxName = (sha1) => {
  const h = String(sha1 || '').toLowerCase().slice(0, 16);
  if (!HASH16.test(h)) throw new Error('Huella de mod no válida.');
  return `${h}.px`;
};

// Envuelve el archivo cifrado tal como llega (iv + datos + etiqueta) con la cabecera .px.
function wrap(encrypted) {
  if (!Buffer.isBuffer(encrypted) || encrypted.length < 12 + 16) throw new Error('Archivo cifrado incompleto.');
  return Buffer.concat([MAGIC, encrypted]);
}

function isPx(buf) {
  return Buffer.isBuffer(buf) && buf.length >= MAGIC.length + 12 + 16 && buf.subarray(0, MAGIC.length).equals(MAGIC);
}

// Descifra un .px. Falla si la cabecera no es la nuestra, si la clave no es la
// del evento o si un solo byte cambió (GCM), antes de devolver nada.
function open(buf, packKeyB64, realName) {
  if (!isPx(buf)) throw new Error('No es un archivo .px de Nova PX.');
  return pc.decryptFile(buf.subarray(MAGIC.length), packKeyB64, realName);
}

// Comprueba el contenido descifrado con las huellas del sobre: SHA-1 siempre y
// SHA-256 cuando el evento la trae (eventos publicados desde esta versión).
function checkHashes(plain, { sha1, sha256 }) {
  const h1 = crypto.createHash('sha1').update(plain).digest('hex');
  if (h1 !== String(sha1 || '').toLowerCase()) return false;
  if (sha256) {
    const want = String(sha256).toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(want)) return false;
    if (crypto.createHash('sha256').update(plain).digest('hex') !== want) return false;
  }
  return true;
}

// Migra la caché antigua (<huella>.bin) al formato .px sin descargar de nuevo.
function migrateBin(cacheDir, sha1) {
  const bin = path.join(cacheDir, `${String(sha1).toLowerCase().slice(0, 16)}.bin`);
  const px = path.join(cacheDir, pxName(sha1));
  if (fs.existsSync(px) || !fs.existsSync(bin)) return false;
  fs.writeFileSync(px, wrap(fs.readFileSync(bin)), { mode: 0o600 });
  fs.rmSync(bin, { force: true });
  return true;
}

const runRootDefault = () => os.tmpdir();

// Crea la carpeta temporal de una partida: nombre aleatorio, solo para este
// usuario (0700; en Windows %TEMP% ya es del usuario) y con una marca propia
// para que la limpieza nunca borre carpetas ajenas.
function createRunDir(runRoot = runRootDefault()) {
  const dir = path.join(runRoot, RUN_PREFIX + crypto.randomBytes(8).toString('hex'));
  fs.mkdirSync(dir, { mode: 0o700 });
  try { fs.chmodSync(dir, 0o700); } catch {}
  fs.writeFileSync(path.join(dir, MARKER), JSON.stringify({ pid: process.pid, created: Date.now() }), { mode: 0o600 });
  return dir;
}

// Escribe un mod descifrado con un nombre que no revela cuál es.
function writeRunJar(dir, plain) {
  if (!isOurRunDir(dir)) throw new Error('Carpeta temporal no válida.');
  const file = path.join(dir, `m-${crypto.randomBytes(6).toString('hex')}.jar`);
  fs.writeFileSync(file, plain, { mode: 0o600 });
  return file;
}

function isOurRunDir(dir, runRoot) {
  try {
    const abs = path.resolve(String(dir || ''));
    if (!path.basename(abs).startsWith(RUN_PREFIX) || !/^npx-run-[0-9a-f]{16}$/.test(path.basename(abs))) return false;
    if (runRoot && path.dirname(abs) !== path.resolve(runRoot)) return false;
    const st = fs.lstatSync(abs);
    if (!st.isDirectory() || st.isSymbolicLink()) return false;
    return fs.existsSync(path.join(abs, MARKER));
  } catch { return false; }
}

// Borra la carpeta temporal de una partida (solo si es nuestra). Devuelve true si ya no existe.
function removeRunDir(dir, runRoot) {
  if (!dir) return true;
  if (!isOurRunDir(dir, runRoot)) return !fs.existsSync(String(dir));
  try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); } catch {}
  return !fs.existsSync(dir);
}

// Al abrir el launcher (o tras un cierre inesperado): borra las carpetas de
// partidas anteriores que quedaron. Solo las que tienen nuestra marca.
function sweepRunDirs(runRoot = runRootDefault(), keep = null) {
  let removed = 0;
  let names = [];
  try { names = fs.readdirSync(runRoot); } catch { return 0; }
  for (const n of names) {
    if (!n.startsWith(RUN_PREFIX)) continue;
    const dir = path.join(runRoot, n);
    if (keep && path.resolve(dir) === path.resolve(keep)) continue;
    if (isOurRunDir(dir, runRoot) && removeRunDir(dir, runRoot)) removed++;
  }
  return removed;
}

// ¿Quedó algún .jar descifrado en carpetas de partidas? (para comprobarlo tras cerrar).
function leftoverJars(runRoot = runRootDefault()) {
  const out = [];
  let names = [];
  try { names = fs.readdirSync(runRoot); } catch { return out; }
  for (const n of names) {
    if (!/^npx-run-[0-9a-f]{16}$/.test(n)) continue;
    try { for (const f of fs.readdirSync(path.join(runRoot, n))) if (/\.jar$/i.test(f)) out.push(path.join(runRoot, n, f)); } catch {}
  }
  return out;
}

module.exports = {
  MAGIC, RUN_PREFIX, MARKER,
  pxName, wrap, isPx, open, checkHashes, migrateBin,
  createRunDir, writeRunJar, isOurRunDir, removeRunDir, sweepRunDirs, leftoverJars
};
