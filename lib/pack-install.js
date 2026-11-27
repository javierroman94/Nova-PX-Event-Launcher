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
const px = require('./mods-px');
const { pool, retry, shouldRetry } = require('./descargas');

const hash = (buf, algorithm) => crypto.createHash(algorithm).update(buf).digest('hex');

// Huellas de un mod o archivo: sha1 (manifiestos antiguos) y/o sha256 (preferida en los nuevos).
// Hace falta al menos una; si vienen las dos, se comprueban las dos.
function digestsOf(item, label) {
  const sha1 = item && item.sha1 ? String(item.sha1).toLowerCase() : '';
  const sha256 = item && item.sha256 ? String(item.sha256).toLowerCase() : '';
  if (!sha1 && !sha256) throw new Error(`Falta el sha1 o sha256 del mod ${label}: no se instala un mod sin huella para comprobarlo.`);
  if (sha1 && !/^[0-9a-f]{40}$/.test(sha1)) throw new Error(`El sha1 del mod ${label} no es válido.`);
  if (sha256 && !/^[0-9a-f]{64}$/.test(sha256)) throw new Error(`El sha256 del mod ${label} no es válido.`);
  return { sha1, sha256 };
}
// Identificador del mod en la caché y en mods/: su sha1 si lo tiene (así sirven las cachés ya guardadas), si no su sha256.
const modKey = (m) => String((m && (m.sha1 || m.sha256)) || '').toLowerCase();

// ¿Es un nombre de .jar seguro para guardar en mods/? Se aceptan los nombres reales de los mods
// («Level Up! 2-1.1.23.jar», «Mod [Forge] 1.0.jar», «Mod's.jar»), pero nunca carpetas, «..»,
// caracteres que Windows no admite (<>:"/\\|?*), de control, ni nombres que empiecen con punto o espacio.
function isSafeJarName(name) {
  const n = String(name || '');
  return n.length <= 200 && n === n.trim() && !/^[.\s-]/.test(n) && !/[<>:"/\\|?*\u0000-\u001f\u007f]/.test(n) && /\.jar$/i.test(n) && !/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(n);
}

// La lista de mods viene de internet: solo enlaces https y nombres de .jar seguros.
function modFileName(mod) {
  if (!/^https:\/\//i.test(String(mod.url || ''))) {
    throw new Error(`El mod ${mod.name || mod.url} no tiene un enlace https válido.`);
  }
  let fileName;
  // Se corta por / y \ en cualquier sistema (path.basename de Windows trataría «a:b.jar» como unidad «a:»).
  try { fileName = String(decodeURIComponent(mod.file || new URL(mod.url).pathname)).split(/[\\/]/).pop(); } catch { fileName = ''; }
  if (!isSafeJarName(fileName)) {
    throw new Error(`El archivo ${fileName} no es un .jar válido.`);
  }
  return fileName;
}

// Descarga los mods nuevos o cambiados y borra SOLO los que el launcher instaló antes
// y ya no están en la lista (nunca toca mods que el jugador puso a mano).
// pxMode (eventos protegidos con Fabric): los mods quedan solo como .px en la caché y
// no se escribe ningún .jar en la carpeta del juego; se descifran al jugar (prepareRun).
async function syncMods({ modsDir, stateFile, mods, download, packKey, onStatus, cacheDir, pxMode = false }) {
  if (pxMode && (!packKey || !cacheDir)) throw new Error('El modo .px necesita la clave del evento y la caché.');
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
    const { sha1: want1, sha256: want256 } = digestsOf(mod, label);
    const want = want1 || want256; // identificador en la caché y en mods/
    if (pxMode) {
      if (cacheDir) px.migrateBin(cacheDir, want);
      const pxFile = path.join(cacheDir, px.pxName(want));
      // Un .px de una publicación anterior puede estar cifrado con otra clave del modpack:
      // solo se reutiliza si abre con la clave actual y su huella cuadra; si no, se vuelve a bajar.
      if (fs.existsSync(pxFile)) {
        try { if (px.checkHashes(px.open(fs.readFileSync(pxFile), packKey, realName), { sha1: want1, sha256: want256 })) continue; } catch {}
        fs.rmSync(pxFile, { force: true });
      }
      todo.push({ mod, realName, label, want, want1, want256, dest: null, pxFile });
      continue;
    }
    // En un evento protegido el archivo en disco tiene un nombre neutro: la carpeta mods no revela qué mods son.
    const fileName = packKey ? `${want.slice(0, 16)}.jar` : realName;
    const dest = path.join(modsDir, fileName);
    current.push(fileName);
    hashes[fileName] = want;
    if (fs.existsSync(dest) && px.checkHashes(fs.readFileSync(dest), { sha1: want1, sha256: want256 })) continue;
    todo.push({ mod, realName, label, want, want1, want256, dest });
  }

  // Después se descargan los que faltan, varios a la vez y con reintentos (antes iban de uno en uno).
  if (onStatus && todo.length) onStatus(`Mods 0/${todo.length}`);
  await pool(todo, async ({ mod, realName, label, want, want1, want256, dest }) => {
    // Evento protegido: el mod se guarda cifrado en la caché como .px; así se puede borrar el .jar al cerrar el juego y volver a ponerlo sin descargar.
    if (packKey && cacheDir) px.migrateBin(cacheDir, want);
    const cacheFile = packKey && cacheDir ? path.join(cacheDir, px.pxName(want)) : '';
    const fetchFresh = async () => {
      const enc = await retry(() => download(mod.url), { tries: 3, delayMs: 800, shouldRetry });
      const wrapped = packKey ? px.wrap(enc) : enc;
      if (cacheFile) { fs.mkdirSync(cacheDir, { recursive: true }); fs.writeFileSync(cacheFile, wrapped, { mode: 0o600 }); }
      return wrapped;
    };
    let buf;
    let fromCache = false;
    if (cacheFile && fs.existsSync(cacheFile)) { buf = fs.readFileSync(cacheFile); fromCache = true; } else buf = await fetchFresh();
    if (packKey) {
      let plain = null;
      try { plain = px.open(buf, packKey, realName); } catch {}
      // La copia guardada puede ser de una publicación anterior (otra clave): se baja una vez más.
      if (!plain && fromCache) { fs.rmSync(cacheFile, { force: true }); try { plain = px.open(await fetchFresh(), packKey, realName); } catch {} }
      if (!plain) {
        if (cacheFile) fs.rmSync(cacheFile, { force: true });
        throw new Error(`No se pudo descifrar el mod ${label}. Puede que se haya subido un archivo equivocado.`);
      }
      buf = plain;
    }
    if (!px.checkHashes(buf, { sha1: want1, sha256: want256 })) {
      if (cacheFile) fs.rmSync(cacheFile, { force: true });
      throw new Error(`El mod ${label} no coincide con su huella (${[want1 && 'sha1', want256 && 'sha256'].filter(Boolean).join(' y ')}). Descarga cancelada.`);
    }
    if (!dest) return; // modo .px: comprobado y descartado; queda solo cifrado en la caché
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
 *  - pxMode (Fabric): los mods quedan solo como .px en la caché y en cada partida se descifran en una
 *    carpeta temporal (runRoot) que se devuelve como runDir para pasarla con -Dfabric.addMods.
 */
const pxPresent = (payload, cacheDir) => !!cacheDir && (payload.mods || []).every((m) => {
  try { px.migrateBin(cacheDir, modKey(m)); return fs.existsSync(path.join(cacheDir, px.pxName(modKey(m)))); } catch { return false; }
});

function readState(gameDir) {
  try { return JSON.parse(fs.readFileSync(path.join(gameDir, '.pack-state.json'), 'utf8')) || {}; } catch { return {}; }
}

// ¿Hay que instalar o actualizar el evento protegido en esta carpeta? (si no, no hace falta contraseña)
function needsInstall(prot, gameDir, cacheDir) {
  const state = readState(gameDir);
  if (state.rev !== prot.rev || !Array.isArray(state.files)) return true;
  if (state.mode === 'px') {
    return !cacheDir || !(state.px || []).every((n) => /^[0-9a-f]{16}\.px$/.test(String(n)) && fs.existsSync(path.join(cacheDir, String(n))));
  }
  const modsDir = path.join(gameDir, 'mods');
  return !state.files.every((f) => fs.existsSync(path.join(modsDir, path.basename(f))));
}

// Configuración del evento (config/...): se guarda cifrada como config.px y se escribe al jugar.
async function applyExtraConfig({ payload, gameDir, download, cacheDir, onStatus }) {
  if (!payload.extra || !payload.extra.url) return;
  if (!/^https:\/\//i.test(String(payload.extra.url))) throw new Error('El evento trae un enlace de configuración no válido.');
  if (onStatus) onStatus('Configuración del evento…');
  // Se comprueban las huellas que traiga (sha1 y/o sha256).
  const extraOk = (buf) => ['sha1', 'sha256'].every((a) => !payload.extra[a] || hash(buf, a) === String(payload.extra[a]).toLowerCase());
  let raw;
  try {
    const cf = cacheDir ? path.join(cacheDir, 'config.px') : '';
    const oldCf = cacheDir ? path.join(cacheDir, 'config.bin') : '';
    if (cf && !fs.existsSync(cf) && fs.existsSync(oldCf)) { fs.writeFileSync(cf, px.wrap(fs.readFileSync(oldCf)), { mode: 0o600 }); fs.rmSync(oldCf, { force: true }); }
    let enc = null;
    if (cf && fs.existsSync(cf)) {
      try { raw = px.open(fs.readFileSync(cf), payload.packKey, 'config.bin'); } catch { raw = null; }
      if (raw && !extraOk(raw)) raw = null;
    }
    if (!raw) {
      enc = await download(payload.extra.url);
      if (cf) { fs.mkdirSync(cacheDir, { recursive: true }); fs.writeFileSync(cf, px.wrap(enc), { mode: 0o600 }); }
      raw = pc.decryptFile(enc, payload.packKey, 'config.bin');
    }
  } catch {
    throw new Error('No se pudo descifrar la configuración del evento.');
  }
  if (!extraOk(raw)) throw new Error('La configuración del evento no coincide con su huella.');
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

// Descifra los .px del evento en una carpeta temporal nueva. Si algo no cuadra
// (archivo alterado, clave distinta, huella distinta) borra la carpeta y no deja nada.
function prepareRun({ payload, cacheDir, runRoot }) {
  const dir = px.createRunDir(runRoot);
  try {
    const mods = payload.mods || [];
    for (let i = 0; i < mods.length; i++) {
      const m = mods[i];
      const realName = modFileName(m);
      let plain;
      try { plain = px.open(fs.readFileSync(path.join(cacheDir, px.pxName(modKey(m)))), payload.packKey, realName); } catch {
        throw new Error(`No se pudo descifrar el mod n.º ${i + 1}. Vuelve a instalar el evento.`);
      }
      if (!px.checkHashes(plain, digestsOf(m, `n.º ${i + 1}`))) throw new Error(`El mod n.º ${i + 1} no coincide con su huella.`);
      px.writeRunJar(dir, plain);
    }
    return dir;
  } catch (err) {
    px.removeRunDir(dir, runRoot);
    throw err;
  }
}

async function installProtected({ prot, password, gameDir, download, keyStore, onStatus, cacheDir, pxMode = false, runRoot }) {
  if (!pc.isEnvelope(prot)) throw new Error('El evento protegido está dañado o tiene un formato desconocido.');
  const usePx = !!pxMode && !!cacheDir;
  const modsDir = path.join(gameDir, 'mods');
  const packStateFile = path.join(gameDir, '.pack-state.json');
  const state = readState(gameDir);
  const wantMode = usePx ? 'px' : 'mods';
  const installed = (state.mode || 'mods') === wantMode && !needsInstall(prot, gameDir, cacheDir);
  if (installed && !usePx) return { status: 'ready' };

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

  if (!installed || !pxPresent(payload, cacheDir)) {
    const files = await syncMods({
      modsDir,
      stateFile: path.join(gameDir, '.managed-mods.json'),
      mods: payload.mods || [],
      download,
      packKey: payload.packKey,
      onStatus,
      cacheDir,
      pxMode: usePx
    });
    if (!usePx) await applyExtraConfig({ payload, gameDir, download, cacheDir, onStatus });
    keyStore.save(prot.salt, key);
    fs.mkdirSync(gameDir, { recursive: true });
    const pxList = usePx ? (payload.mods || []).map((m) => px.pxName(modKey(m))) : undefined;
    fs.writeFileSync(packStateFile, JSON.stringify({ rev: prot.rev, files, mode: wantMode, ...(pxList ? { px: pxList } : {}) }, null, 2));
  }
  if (!usePx) return { status: 'ready' };

  // Modo .px: la config se vuelve a escribir y los mods se descifran solo para esta partida.
  await applyExtraConfig({ payload, gameDir, download, cacheDir, onStatus });
  if (onStatus) onStatus('Preparando los mods del evento…');
  const runDir = prepareRun({ payload, cacheDir, runRoot });
  return { status: 'ready', runDir };
}

// ¿Se puede volver a poner el evento desde la caché cifrada con la clave guardada, sin pedir contraseña ni descargar?
function canRestoreFromCache({ prot, gameDir, keyStore, cacheDir }) {
  try {
    const state = readState(gameDir);
    if (state.rev !== prot.rev || !cacheDir) return false;
    const key = keyStore.load(prot.salt);
    if (!key) return false;
    const payload = pc.openEnvelope(prot, key);
    const cfgOk = !payload.extra || fs.existsSync(path.join(cacheDir, 'config.px')) || fs.existsSync(path.join(cacheDir, 'config.bin'));
    return pxPresent(payload, cacheDir) && cfgOk;
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
  canRestoreFromCache, prepareRun,
  wipeProtected, syncMods, installProtected, needsInstall, modFileName, isSafeJarName };
