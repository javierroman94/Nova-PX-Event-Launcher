'use strict';

/*
 * Instalación de mods (públicos o protegidos con contraseña).
 * Todo lo que toca internet o el llavero del sistema se recibe como parámetro,
 * así se puede probar sin abrir el launcher.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pc = require('./pack-crypto');
const { pool, retry, shouldRetry } = require('./descargas');

const hash = (buf, algorithm) => crypto.createHash(algorithm).update(buf).digest('hex');

// La lista de mods viene de internet: solo enlaces https y nombres de .jar simples.
function modFileName(mod) {
  if (!/^https:\/\//i.test(String(mod.url || ''))) {
    throw new Error(`El mod ${mod.name || mod.url} no tiene un enlace https válido.`);
  }
  const fileName = path.basename(decodeURIComponent(mod.file || new URL(mod.url).pathname));
  if (!/^[A-Za-z0-9._+()-][A-Za-z0-9 ._+()-]*\.jar$/i.test(fileName)) {
    throw new Error(`El archivo ${fileName} no es un .jar válido.`);
  }
  return fileName;
}

// Descarga los mods nuevos o cambiados y borra SOLO los que el launcher instaló antes
// y ya no están en la lista (nunca toca mods que el jugador puso a mano).
async function syncMods({ modsDir, stateFile, mods, download, packKey, onStatus, cacheDir }) {
  fs.mkdirSync(modsDir, { recursive: true });

  let previous = [];
  try {
    previous = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {}

  const current = [];
  const hashes = {};
  const todo = [];
  // Primero se revisa la lista completa (sin descargar nada): si un mod no tiene huella válida, no se baja ninguno.
  for (let i = 0; i < mods.length; i++) {
    const mod = mods[i];
    const realName = modFileName(mod); // nombre real: solo para descifrar (va en la autenticación del cifrado)
    // En un evento protegido nadie debe ver qué mods lleva: ni en el progreso ni en los errores.
    const label = packKey ? `n.º ${i + 1}` : mod.name || realName;
    const algorithm = mod.sha256 !== undefined ? 'sha256' : 'sha1';
    const want = mod[algorithm] ? String(mod[algorithm]).toLowerCase() : '';
    const validHash = algorithm === 'sha256' ? /^[0-9a-f]{64}$/ : /^[0-9a-f]{40}$/;
    if (!want) throw new Error(`Falta el sha1 o sha256 del mod ${label}: no se instala un mod sin huella para comprobarlo.`);
    if (!validHash.test(want)) throw new Error(`El ${algorithm} del mod ${label} no es válido.`);
    // En un evento protegido el archivo en disco tiene un nombre neutro: la carpeta mods no revela qué mods son.
    const fileName = packKey ? `${want.slice(0, 16)}.jar` : realName;
    const dest = path.join(modsDir, fileName);
    current.push(fileName);
    hashes[fileName] = want;
    if (fs.existsSync(dest) && hash(fs.readFileSync(dest), algorithm) === want) continue;
    todo.push({ mod, realName, label, want, algorithm, dest });
  }

  // Después se descargan los que faltan, varios a la vez y con reintentos (antes iban de uno en uno).
  if (onStatus && todo.length) onStatus(`Mods 0/${todo.length}`);
  await pool(todo, async ({ mod, realName, label, want, algorithm, dest }) => {
    // Evento protegido: el mod cifrado se guarda en una caché aparte; así se puede borrar el .jar al cerrar el juego y volver a ponerlo sin descargar.
    const cacheFile = packKey && cacheDir ? path.join(cacheDir, `${want.slice(0, 16)}.bin`) : '';
    let buf;
    if (cacheFile && fs.existsSync(cacheFile)) buf = fs.readFileSync(cacheFile);
    else {
      buf = await retry(() => download(mod.url), { tries: 3, delayMs: 800, shouldRetry });
      if (cacheFile) { fs.mkdirSync(cacheDir, { recursive: true }); fs.writeFileSync(cacheFile, buf); }
    }
    if (packKey) {
      try {
        buf = pc.decryptFile(buf, packKey, realName);
      } catch {
        if (cacheFile) fs.rmSync(cacheFile, { force: true });
        throw new Error(`No se pudo descifrar el mod ${label}. Puede que se haya subido un archivo equivocado.`);
      }
    }
    if (hash(buf, algorithm) !== want) {
      if (cacheFile) fs.rmSync(cacheFile, { force: true });
      throw new Error(`El mod ${label} no coincide con su ${algorithm}. Descarga cancelada.`);
    }
    fs.writeFileSync(dest, buf);
  }, { concurrency: 4, onProgress: (done, total, it) => onStatus && onStatus(packKey ? `Mods ${done}/${total}` : `Mods ${done}/${total}: ${it.label}`) });

  for (const old of previous) {
    if (!current.includes(old)) {
      try {
        fs.unlinkSync(path.join(modsDir, path.basename(old)));
      } catch {}
    }
  }
  fs.writeFileSync(stateFile, JSON.stringify(current, null, 2));
  // Huellas de lo instalado: sirven para detectar mods cambiados a mano (bloqueo del modpack del evento).
  fs.writeFileSync(path.join(path.dirname(stateFile), '.managed-hashes.json'), JSON.stringify(hashes, null, 2));
  return current;
}

/*
 * Instala un modpack protegido.
 *  - Si ya está instalado y es la misma versión (rev), NO pide contraseña.
 *  - Si es la primera instalación o hay una actualización, usa la contraseña escrita o la clave guardada
 *    en el llavero del sistema (keyStore). Si no hay ninguna, responde que hace falta la contraseña.
 */
// ¿Hay que instalar o actualizar el evento protegido en esta carpeta? (si no, no hace falta contraseña)
function needsInstall(prot, gameDir) {
  let state = {};
  try { state = JSON.parse(fs.readFileSync(path.join(gameDir, '.pack-state.json'), 'utf8')); } catch {}
  const modsDir = path.join(gameDir, 'mods');
  return !(state.rev === prot.rev && Array.isArray(state.files) && state.files.every((f) => fs.existsSync(path.join(modsDir, path.basename(f)))));
}

async function installProtected({ prot, password, gameDir, download, keyStore, onStatus, cacheDir }) {
  if (!pc.isEnvelope(prot)) throw new Error('El evento protegido está dañado o tiene un formato desconocido.');

  const modsDir = path.join(gameDir, 'mods');
  const packStateFile = path.join(gameDir, '.pack-state.json');
  let state = {};
  try {
    state = JSON.parse(fs.readFileSync(packStateFile, 'utf8'));
  } catch {}

  const installed =
    state.rev === prot.rev &&
    Array.isArray(state.files) &&
    state.files.every((f) => fs.existsSync(path.join(modsDir, path.basename(f))));
  if (installed) return { status: 'ready' };

  const typed = typeof password === 'string' && password.length > 0;
  const key = typed ? pc.deriveKey(password, prot.salt, pc.kdfOf(prot)) : keyStore.load(prot.salt);
  if (!key) return { status: 'need-password', wrong: false };

  let payload;
  try {
    payload = pc.openEnvelope(prot, key);
  } catch (err) {
    if (err.message !== 'BAD_KEY') throw err;
    if (!typed) keyStore.clear();
    return { status: 'need-password', wrong: typed };
  }

  const files = await syncMods({
    modsDir,
    stateFile: path.join(gameDir, '.managed-mods.json'),
    mods: payload.mods || [],
    download,
    packKey: payload.packKey,
    onStatus,
    cacheDir
  });
  if (payload.extra && payload.extra.url) {
    if (!/^https:\/\//i.test(String(payload.extra.url))) throw new Error('El evento trae un enlace de configuración no válido.');
    if (onStatus) onStatus('Configuración del evento…');
    let raw;
    try {
      const cf = cacheDir ? path.join(cacheDir, 'config.bin') : '';
      const algorithm = payload.extra.sha256 !== undefined ? 'sha256' : 'sha1';
      const want = String(payload.extra[algorithm] || '').toLowerCase();
      let enc;
      if (cf && fs.existsSync(cf) && want && hash(pc.decryptFile(fs.readFileSync(cf), payload.packKey, 'config.bin'), algorithm) === want) enc = fs.readFileSync(cf);
      else { enc = await download(payload.extra.url); if (cf) { fs.mkdirSync(cacheDir, { recursive: true }); fs.writeFileSync(cf, enc); } }
      raw = pc.decryptFile(enc, payload.packKey, 'config.bin');
    } catch {
      throw new Error('No se pudo descifrar la configuración del evento.');
    }
    const extraAlgorithm = payload.extra.sha256 !== undefined ? 'sha256' : 'sha1';
    const extraWant = String(payload.extra[extraAlgorithm] || '').toLowerCase();
    if (extraWant && hash(raw, extraAlgorithm) !== extraWant) throw new Error(`La configuración del evento no coincide con su ${extraAlgorithm}.`);
    const root = path.resolve(gameDir);
    const wroteCfg = [];
    for (const f of JSON.parse(raw.toString('utf8'))) {
      const rel = String(f.rel || '');
      const target = path.resolve(root, rel);
      if (!/^config\//.test(rel) || !target.startsWith(path.join(root, 'config') + path.sep)) continue;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, Buffer.from(String(f.b64 || ''), 'base64'));
      wroteCfg.push(rel);
    }
    fs.writeFileSync(path.join(gameDir, '.managed-config.json'), JSON.stringify(wroteCfg));
  }
  keyStore.save(prot.salt, key);
  fs.mkdirSync(gameDir, { recursive: true });
  fs.writeFileSync(packStateFile, JSON.stringify({ rev: prot.rev, files }, null, 2));
  return { status: 'ready' };
}

// ¿Se puede volver a poner el evento desde la caché cifrada con la clave guardada, sin pedir contraseña ni descargar?
function canRestoreFromCache({ prot, gameDir, keyStore, cacheDir }) {
  try {
    const state = JSON.parse(fs.readFileSync(path.join(gameDir, '.pack-state.json'), 'utf8'));
    if (state.rev !== prot.rev || !cacheDir) return false;
    const key = keyStore.load(prot.salt);
    if (!key) return false;
    const payload = pc.openEnvelope(prot, key);
    const ok = (payload.mods || []).every((m) => {
      const digest = m.sha256 !== undefined ? m.sha256 : m.sha1;
      return digest && fs.existsSync(path.join(cacheDir, `${String(digest).toLowerCase().slice(0, 16)}.bin`));
    });
    return ok && (!payload.extra || fs.existsSync(path.join(cacheDir, 'config.bin')));
  } catch { return false; }
}

// Al cerrar el juego: se borran los mods y la config del evento de la carpeta (quedan solo cifrados en la caché).
function wipeProtected(gameDir) {
  let n = 0;
  const rm = (f) => { try { fs.rmSync(f, { force: true }); n++; } catch {} };
  try {
    const names = JSON.parse(fs.readFileSync(path.join(gameDir, '.managed-mods.json'), 'utf8'));
    for (const f of names) rm(path.join(gameDir, 'mods', path.basename(String(f))));
  } catch {}
  try {
    for (const rel of JSON.parse(fs.readFileSync(path.join(gameDir, '.managed-config.json'), 'utf8'))) {
      const t = path.resolve(gameDir, rel);
      if (t.startsWith(path.join(path.resolve(gameDir), 'config') + path.sep)) rm(t);
    }
  } catch {}
  return n;
}

module.exports = {
  canRestoreFromCache,
  wipeProtected, syncMods, installProtected, needsInstall, modFileName };
