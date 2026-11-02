const { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, nativeImage, safeStorage, Notification } = require('electron');
const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Client } = require('minecraft-launcher-core');
const { Auth } = require('msmc');
const { autoUpdater } = require('electron-updater');
const { execFile } = require('child_process');
const loaders = require('./lib/loaders');
const packInstall = require('./lib/pack-install');
const { analyzeCrash } = require('./lib/crash');
const { instanceDir } = require('./lib/instance');
const { DiscordRpc, buildActivity } = require('./lib/discord-rpc');
const skinsApi = require('./lib/skins');
const { classifyNetworkError } = require('./lib/errors');
const { repairInstance } = require('./lib/repair');
const modrinth = require('./lib/modrinth');
const modpacks = require('./lib/modpacks');
const providers = require('./lib/providers');
const content = require('./lib/content');
const packs = require('./lib/packs');
const { GithubRepo } = require('./lib/github');
const adminLib = require('./lib/admin');
const importers = require('./lib/importers');
const { readZip } = require('./lib/zip');
const { installJava, findJavaBinary } = require('./lib/javaRuntime');

const config = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'config', 'launcher.config.json'), 'utf8')
);
const GAME_DIR = path.join(app.getPath('appData'), config.gameFolderName);
const RUNTIME_DIR = path.join(GAME_DIR, 'runtime');
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
const KEYS_FILE = path.join(app.getPath('userData'), 'unlock.json');
const ACCOUNT_FILE = path.join(app.getPath('userData'), 'account.json');
const BACKGROUND_FILE = path.join(app.getPath('userData'), 'background.jpg');
const DATA_CACHE_DIR = path.join(app.getPath('userData'), 'data-cache');
const ALLOWED_DATA = ['news', 'events', 'team', 'manifest', 'recommended'];
const ICON = path.join(__dirname, 'build', 'icon.png');

let mainWindow = null;
let tray = null;
let session = null; // { mode, name, uuid, auth }
let launching = false;
let currentTarget = null; // qué se está jugando: { kind: 'event' | 'pack', title, icon }
let gameStartedAt = 0;
let pendingClose = null; // resultado de la última partida, por si la ventana estaba cerrada
let pendingSkin = null; // skin elegida en el selector, aún sin subir a Mojang
let lastProfile = null;
const logBuffer = [];
const memoryKeys = new Map();

// Doble clic en un archivo .novapx: el launcher lo abre y ofrece importarlo.
function novapxFromArgv(argv) {
  return (argv || []).slice(1).find((a) => typeof a === 'string' && /\.novapx$/i.test(a) && fs.existsSync(a)) || null;
}
let pendingImportFile = novapxFromArgv(process.argv);
function openImportFile(file) {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoading()) send('import:open', { path: file });
  else pendingImportFile = file;
}

// Solo una copia del launcher a la vez (cada copia gasta memoria).
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    showWindow();
    const f = novapxFromArgv(argv);
    if (f) openImportFile(f);
  });
}

/* ---------- ajustes ---------- */

function defaultSettings() {
  return {
    lastNick: '',
    ramGb: config.defaultRamGb,
    joinServer: true,
    javaPath: config.javaPath || '',
    autoJava: true,
    jvmArgs: '',
    width: 854,
    height: 480,
    fullscreen: false,
    // minimize: minimiza | tray: cierra la ventana y deja un icono (ahorra más memoria) | keep: no hace nada
    gameBehavior: process.platform === 'linux' ? 'minimize' : 'tray',
    theme: 'dark',
    accent: '#f2b84b',
    bgDim: 55,
    bgBlur: 6,
    effects: true,
    discordRpc: true,
    notifyEvents: true,
    playSeconds: 0
  };
}

function readSettings() {
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  } catch {}
  // Ajuste de versiones anteriores: "minimizar al jugar" pasó a ser gameBehavior.
  if (saved.gameBehavior === undefined && saved.minimizeOnLaunch !== undefined) {
    saved.gameBehavior = saved.minimizeOnLaunch ? 'minimize' : 'keep';
  }
  return cleanSettings({ ...defaultSettings(), ...saved });
}

function cleanSettings(s) {
  const d = defaultSettings();
  const num = (v, min, max, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  return {
    lastNick: String(s.lastNick || '').slice(0, 16),
    ramGb: num(s.ramGb, 1, 32, d.ramGb),
    joinServer: !!s.joinServer,
    javaPath: String(s.javaPath || '').trim().slice(0, 500),
    autoJava: s.autoJava !== false,
    jvmArgs: String(s.jvmArgs || '').slice(0, 500),
    width: num(s.width, 640, 7680, d.width),
    height: num(s.height, 360, 4320, d.height),
    fullscreen: !!s.fullscreen,
    gameBehavior: ['minimize', 'tray', 'keep'].includes(s.gameBehavior) ? s.gameBehavior : d.gameBehavior,
    theme: s.theme === 'light' ? 'light' : 'dark',
    accent: /^#[0-9a-f]{6}$/i.test(String(s.accent)) ? String(s.accent).toLowerCase() : d.accent,
    bgDim: num(s.bgDim, 0, 90, d.bgDim),
    bgBlur: num(s.bgBlur, 0, 24, d.bgBlur),
    effects: s.effects !== false,
    discordRpc: s.discordRpc !== false,
    notifyEvents: s.notifyEvents !== false,
    playSeconds: Math.max(0, Math.floor(Number(s.playSeconds) || 0))
  };
}

function writeSettings(s) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2));
}

/* ---------- utilidades ---------- */

async function fetchWithTimeout(url, ms = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url) {
  return (await fetchWithTimeout(url)).json();
}

// Orden de lectura: 1) GitHub (siempre lo más nuevo), 2) última copia descargada (sin internet),
// 3) copia incluida en el instalador. Así el launcher nunca se queda sin datos.
async function loadData(name) {
  if (config.remoteBase) {
    const cacheFile = path.join(DATA_CACHE_DIR, `${name}.json`);
    try {
      const remote = await fetchJson(`${config.remoteBase.replace(/\/$/, '')}/${name}.json?t=${Date.now()}`);
      try {
        fs.mkdirSync(DATA_CACHE_DIR, { recursive: true });
        fs.writeFileSync(cacheFile, JSON.stringify(remote));
      } catch {}
      return remote;
    } catch (err) {
      console.warn(`No se pudo leer ${name} remoto:`, err.message);
      try {
        return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      } catch {}
    }
  }
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', `${name}.json`), 'utf8'));
}

function sha1OfFile(file) {
  return crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
}

function sha1OfBuffer(buf) {
  return crypto.createHash('sha1').update(buf).digest('hex');
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function pushLog(source, line) {
  logBuffer.push(`[${source}] ${line}`);
  if (logBuffer.length > 1500) logBuffer.shift();
  send('game:log', { source, line });
}

/* ---------- contraseña de instalación y mods ---------- */

// La clave derivada de la contraseña se guarda cifrada con el almacén del sistema (DPAPI, Keychain...).
// Si el sistema no ofrece ese almacén, solo se recuerda mientras el launcher está abierto.
const keyStore = {
  load(salt) {
    if (memoryKeys.has(salt)) return memoryKeys.get(salt);
    if (!safeStorage.isEncryptionAvailable()) return null;
    try {
      const all = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
      if (!all[salt]) return null;
      const key = Buffer.from(safeStorage.decryptString(Buffer.from(all[salt], 'base64')), 'base64');
      memoryKeys.set(salt, key);
      return key;
    } catch {
      return null;
    }
  },
  save(salt, key) {
    memoryKeys.set(salt, key);
    if (!safeStorage.isEncryptionAvailable()) return;
    try {
      let all = {};
      try {
        all = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
      } catch {}
      all[salt] = safeStorage.encryptString(key.toString('base64')).toString('base64');
      fs.mkdirSync(path.dirname(KEYS_FILE), { recursive: true });
      fs.writeFileSync(KEYS_FILE, JSON.stringify(all));
    } catch {}
  },
  clear() {
    memoryKeys.clear();
    try {
      fs.unlinkSync(KEYS_FILE);
    } catch {}
  }
};

async function downloadBuffer(url) {
  const res = await fetchWithTimeout(url, 180000);
  return Buffer.from(await res.arrayBuffer());
}

// Instala o actualiza los mods. Con modpack protegido pide la contraseña solo si hace falta
// (primera instalación o actualización); quien ya lo tiene instalado juega sin escribirla.
async function installMods(manifest, password, gameDir) {
  const onStatus = (text) => send('game:status', { text });
  if (manifest.protected) {
    const r = await packInstall.installProtected({
      prot: manifest.protected,
      password,
      gameDir,
      download: downloadBuffer,
      keyStore,
      onStatus
    });
    if (r.status === 'need-password') {
      throw new Error(
        r.wrong
          ? 'WRONG_PASSWORD: La contraseña no es correcta.'
          : 'NEEDS_PASSWORD: Este modpack necesita la contraseña de instalación.'
      );
    }
    return;
  }
  await packInstall.syncMods({
    modsDir: path.join(gameDir, 'mods'),
    stateFile: path.join(gameDir, '.managed-mods.json'),
    mods: manifest.mods || [],
    download: downloadBuffer,
    onStatus
  });
}

/* ---------- loader (Fabric) ---------- */

async function ensureFabric(mcVersion, loaderVersion) {
  if (!loaderVersion) {
    const list = await fetchJson(`https://meta.fabricmc.net/v2/versions/loader/${mcVersion}`);
    if (!list.length) throw new Error(`Fabric no soporta Minecraft ${mcVersion}`);
    const stable = list.find((x) => x.loader.stable) || list[0];
    loaderVersion = stable.loader.version;
  }
  const id = `fabric-loader-${loaderVersion}-${mcVersion}`;
  const dir = path.join(GAME_DIR, 'versions', id);
  const file = path.join(dir, `${id}.json`);
  if (!fs.existsSync(file)) {
    const profile = await fetchJson(
      `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${loaderVersion}/profile/json`
    );
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(profile));
  }
  return id;
}

/* ---------- loader (Forge) ---------- */

// Descarga el instalador de Forge (o el jar "universal" en Minecraft 1.12.2 y anteriores) y
// devuelve su ruta. minecraft-launcher-core se encarga de instalarlo al iniciar el juego.
async function ensureForge(mcVersion, wantedVersion) {
  if (!loaders.isSafeVersion(mcVersion)) throw new Error(`La versión de Minecraft "${mcVersion}" no es válida.`);

  const dir = path.join(GAME_DIR, 'installers');
  fs.mkdirSync(dir, { recursive: true });

  let forgeVersion = null;
  try {
    const promos = wantedVersion
      ? null
      : await fetchJson('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json');
    forgeVersion = loaders.pickForgeVersion(promos, mcVersion, wantedVersion);
  } catch (err) {
    // Sin internet: se reutiliza el instalador de Forge que ya se descargó para esta versión.
    const cached = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith(`forge-${mcVersion}-`))
      .sort()
      .pop();
    if (cached) return path.join(dir, cached);
    throw new Error(`No se pudo consultar las versiones de Forge: ${err.message}`);
  }
  if (!forgeVersion) {
    throw new Error(
      wantedVersion
        ? `La versión de Forge "${wantedVersion}" no es válida.`
        : `Forge no tiene una versión publicada para Minecraft ${mcVersion}.`
    );
  }

  const url = loaders.forgeUrl(mcVersion, forgeVersion);
  const dest = path.join(dir, loaders.forgeFileName(mcVersion, forgeVersion));
  if (fs.existsSync(dest)) return dest;

  send('game:status', { text: `Descargando Forge ${forgeVersion}…` });
  fs.writeFileSync(dest, await downloadBuffer(url));

  // Forge publica el hash sha1 junto a cada archivo: si está disponible, se comprueba.
  try {
    const expected = (await (await fetchWithTimeout(`${url}.sha1`)).text()).trim().split(/\s+/)[0].toLowerCase();
    if (/^[0-9a-f]{40}$/.test(expected) && sha1OfFile(dest).toLowerCase() !== expected) {
      fs.unlinkSync(dest);
      throw new Error('El instalador de Forge descargado está dañado (no coincide su sha1). Inténtalo de nuevo.');
    }
  } catch (err) {
    if (!fs.existsSync(dest)) throw err;
  }
  return dest;
}

/* ---------- Java ---------- */

function readJavaVersionOutput(javaBin) {
  return new Promise((resolve) => {
    execFile(javaBin, ['-version'], { timeout: 10000, windowsHide: true }, (err, stdout, stderr) => {
      resolve(err && !stderr ? null : String(stderr || stdout));
    });
  });
}

function managedJavaPath(major) {
  return findJavaBinary(path.join(RUNTIME_DIR, `java-${major}`));
}

// Elige el Java correcto para el modpack. Orden: el que el jugador eligió en Ajustes, el que instaló
// el launcher, el del sistema. Si ninguno sirve, lo descarga (si el jugador no lo desactivó).
// Devuelve la ruta de Java, o undefined para usar el Java del sistema.
async function resolveJava(manifest, loaderType, st = readSettings()) {
  const mc = manifest.minecraftVersion;
  const need = loaders.requiredJavaMajor(mc);
  const explicit = st.javaPath || config.javaPath || '';
  if (!need) return explicit || undefined;

  const installMajor = loaders.javaInstallMajor(mc);
  const candidates = [];
  if (explicit) candidates.push(explicit);
  const managed = managedJavaPath(installMajor);
  if (managed) candidates.push(managed);
  candidates.push('java');

  let foundMajor = null;
  for (const bin of candidates) {
    const major = loaders.parseJavaMajor(await readJavaVersionOutput(bin));
    if (major && !foundMajor) foundMajor = major;
    if (loaders.javaIsOk(major, mc, loaderType)) return bin === 'java' ? undefined : bin;
  }

  if (st.autoJava) {
    return installJava({
      rootDir: RUNTIME_DIR,
      major: installMajor,
      onStatus: (text) => send('game:status', { text }),
      onProgress: (percent) => send('game:progress', { type: 'java', task: percent, total: 100 })
    });
  }

  if (!foundMajor) {
    throw new Error(
      `No encontré Java. Minecraft ${mc} necesita Java ${need} o superior. ` +
        'Activa "Instalar Java automáticamente" en Ajustes o elige su ruta.'
    );
  }
  throw new Error(
    `Este evento usa Minecraft ${mc}, que necesita Java ${need}${need === 8 && loaderType === 'forge' ? ' (exactamente)' : ' o superior'}, ` +
      `y tu Java es el ${foundMajor}. Activa "Instalar Java automáticamente" en Ajustes o elige otro Java.`
  );
}

/* ---------- ventana y bandeja ---------- */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 720,
    minWidth: 940,
    minHeight: 620,
    title: config.launcherName,
    icon: ICON,
    backgroundColor: '#0d0f16',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingImportFile) {
      send('import:open', { path: pendingImportFile });
      pendingImportFile = null;
    }
    if (pendingClose) {
      send('game:close', pendingClose);
      pendingClose = null;
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    // Si el jugador cierra la ventana en plena partida, queda un icono para volver a abrirla.
    if (launching && !tray) createTray();
  });
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  if (tray) return;
  const image = nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 });
  tray = new Tray(image);
  tray.setToolTip(`${config.launcherName} (jugando)`);
  tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Mostrar launcher', click: showWindow }]));
  tray.on('click', showWindow);
}

function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

// Mientras se juega: minimiza, o cierra la ventana por completo (libera la memoria de la interfaz).
function enterGameMode() {
  const behavior = readSettings().gameBehavior;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (behavior === 'minimize') {
    mainWindow.minimize();
  } else if (behavior === 'tray') {
    createTray();
    mainWindow.destroy();
  }
}

function leaveGameMode() {
  destroyTray();
  showWindow();
}

/* ---------- actualizaciones del programa ---------- */

let updateState = { state: 'idle' };

function setUpdate(s) {
  updateState = s;
  send('update:state', s);
}

function checkForUpdates() {
  if (!app.isPackaged) return Promise.resolve();
  return autoUpdater.checkForUpdates().catch(() => {});
}

// Solo funciona en la versión instalada (npm run dist), que consulta los Releases de GitHub.
function setupUpdater() {
  if (!app.isPackaged) {
    setUpdate({ state: 'dev' });
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => setUpdate({ state: 'checking' }));
  autoUpdater.on('update-available', (i) => setUpdate({ state: 'downloading', version: i.version, percent: 0 }));
  autoUpdater.on('download-progress', (p) =>
    setUpdate({ state: 'downloading', version: updateState.version, percent: Math.round(p.percent) })
  );
  autoUpdater.on('update-downloaded', (i) => setUpdate({ state: 'ready', version: i.version }));
  autoUpdater.on('update-not-available', () => setUpdate({ state: 'none' }));
  autoUpdater.on('error', (e) =>
    setUpdate({ state: 'error', reason: classifyNetworkError(e), message: String((e && e.message) || e).slice(0, 200) })
  );
  checkForUpdates();
  setInterval(checkForUpdates, 30 * 60 * 1000);
}

/* ---------- Discord Rich Presence ---------- */
const rpc = new DiscordRpc({ clientId: config.discordAppId });
function discordIdle() {
  rpc.setActivity(buildActivity({ mode: 'idle', invite: config.discordInvite, largeImage: config.discordLargeImage }));
}
function discordPlaying(eventName, startedAt) {
  rpc.setActivity(
    buildActivity({ mode: 'playing', eventName, startedAt, invite: config.discordInvite, largeImage: config.discordLargeImage })
  );
}
function applyDiscordSetting() {
  if (readSettings().discordRpc) {
    discordIdle();
    rpc.start();
  } else {
    rpc.stop();
  }
}
app.on('before-quit', () => rpc.stop());

app.whenReady().then(() => {
  if (!gotLock) return;
  applyDiscordSetting();
  restoring = restoreSession();
  createWindow();
  setupUpdater();
  setTimeout(checkEventNotifications, 15000);
  setInterval(checkEventNotifications, 60000);
});

app.on('window-all-closed', () => {
  if (!launching && !tray) app.quit();
});

/* ---------- IPC: general ---------- */

ipcMain.handle('config:get', () => ({
  launcherName: config.launcherName,
  defaultRamGb: config.defaultRamGb,
  remoteBase: (config.remoteBase || '').replace(/\/$/, ''),
  version: app.getVersion()
}));

ipcMain.handle('update:state', () => updateState);
ipcMain.handle('update:check', async () => {
  await checkForUpdates();
  return updateState;
});
ipcMain.handle('update:install', () => {
  if (updateState.state !== 'ready') throw new Error('Todavía no hay una actualización descargada.');
  if (launching) throw new Error('Cierra Minecraft antes de actualizar el launcher.');
  autoUpdater.quitAndInstall();
});

// Reinstala los mods del evento actual la próxima vez que se juegue. No toca ajustes, cuenta ni mundos.
ipcMain.handle('game:repair', async () => {
  if (launching) throw new Error('Cierra Minecraft antes de reparar la instalación.');
  const manifest = await loadData('manifest');
  const removed = repairInstance(instanceDir(GAME_DIR, manifest));
  return { removed };
});

// Lista de mods instalados del evento, reconocidos con Modrinth (nombre, icono y versión).
// Con modpack protegido solo se muestra si el manifest lo permite ("showMods": true).
const MODS_CACHE = path.join(app.getPath('userData'), 'mods-cache.json');
async function apiRequest(url, opts = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers: {
        'User-Agent': `javierroman94/Nova-PX-Event-Launcher/${app.getVersion()} (discord.gg/VAfuFEQtjv)`,
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.headers || {})
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: ctl.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${new URL(url).hostname}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
const modrinthRequest = apiRequest;
ipcMain.handle('mods:list', async () => {
  const manifest = await loadData('manifest');
  const eventName = (manifest.event && manifest.event.name) || 'Evento';
  const dir = path.join(instanceDir(GAME_DIR, manifest), 'mods');
  const jars = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.jar$/i.test(f)).sort() : [];
  if (manifest.protected && manifest.showMods !== true) return { hidden: true, count: jars.length, eventName };
  const files = jars.map((f) => ({ file: f, hash: modrinth.sha1File(path.join(dir, f)) }));
  const key = crypto.createHash('sha1').update(files.map((f) => f.hash).join(',')).digest('hex');
  let mods;
  let offline = false;
  try {
    const { byHash, projects } = files.length ? await modrinth.lookup(files, modrinthRequest) : { byHash: {}, projects: {} };
    mods = modrinth.buildModList(files, byHash, projects);
    try { fs.writeFileSync(MODS_CACHE, JSON.stringify({ key, mods })); } catch {}
  } catch {
    offline = true;
    try {
      const c = JSON.parse(fs.readFileSync(MODS_CACHE, 'utf8'));
      mods = c.key === key ? c.mods : null;
    } catch {}
    if (!mods) mods = modrinth.buildModList(files, {}, {});
  }
  return { hidden: false, count: jars.length, mods, offline, eventName };
});

/* ---------- modpacks de Modrinth y CurseForge ---------- */

const MODPACKS_FILE = path.join(app.getPath('userData'), 'modpacks.json');
const CURSE_KEY = String(process.env.NOVAPX_CURSEFORGE_KEY || config.curseforgeApiKey || '').trim();
let installingPack = false;

function readModpacks() {
  try {
    const list = JSON.parse(fs.readFileSync(MODPACKS_FILE, 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
function writeModpacks(list) {
  fs.writeFileSync(MODPACKS_FILE, JSON.stringify(list, null, 2));
}
function providerFor(name) {
  if (name === 'modrinth') return providers.modrinth(apiRequest);
  if (name === 'curseforge') {
    if (!CURSE_KEY) throw new Error('CurseForge no está activado: falta la clave de API (curseforgeApiKey en config/launcher.config.json).');
    return providers.curseforge(apiRequest, CURSE_KEY);
  }
  throw new Error('Proveedor desconocido.');
}
const cleanStr = (v, max = 200) => String(v == null ? '' : v).slice(0, max);

// Descarga un archivo grande informando el avance (máximo 1,5 GB).
async function downloadWithProgress(url, onProgress) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15 * 60 * 1000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': `Nova-PX-Event-Launcher/${app.getVersion()}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status} al descargar el modpack`);
    const total = Number(res.headers.get('content-length')) || 0;
    if (total > 1.5 * 1024 ** 3) throw new Error('El modpack es demasiado grande para instalarlo desde el launcher.');
    const chunks = [];
    let got = 0;
    for await (const chunk of res.body) {
      chunks.push(chunk);
      got += chunk.length;
      if (got > 1.5 * 1024 ** 3) throw new Error('El modpack es demasiado grande para instalarlo desde el launcher.');
      onProgress(got, total);
    }
    return Buffer.concat(chunks);
  } finally {
    clearTimeout(timer);
  }
}

ipcMain.handle('modpacks:providers', () => ({ modrinth: true, curseforge: !!CURSE_KEY }));
ipcMain.handle('modpacks:search', async (_e, p = {}) =>
  providerFor(cleanStr(p.provider, 20)).search({ query: cleanStr(p.query, 80), offset: Math.max(0, Math.floor(Number(p.offset) || 0)) })
);
ipcMain.handle('modpacks:versions', async (_e, p = {}) => providerFor(cleanStr(p.provider, 20)).versions(cleanStr(p.id, 40)));
ipcMain.handle('modpacks:installed', () => readModpacks());

ipcMain.handle('modpacks:install', async (_e, p = {}) => {
  if (installingPack) throw new Error('Ya se está instalando un modpack.');
  if (launching) throw new Error('Cierra Minecraft antes de instalar un modpack.');
  installingPack = true;
  const progress = (text, done, total) => send('modpack:progress', { text, done, total });
  try {
    const name = cleanStr(p.provider, 20);
    const prov = providerFor(name);
    progress('Buscando la versión…');
    const versions = await prov.versions(cleanStr(p.id, 40));
    const v = versions.find((x) => x.id === cleanStr(p.versionId, 40));
    if (!v) throw new Error('Esa versión del modpack ya no está disponible.');
    if (!v.supported) throw new Error('Este modpack usa un loader que el launcher todavía no soporta (solo Fabric, Forge o Vanilla).');
    if (!v.downloadUrl) throw new Error('El autor de este modpack no permite descargarlo desde otros programas. Descárgalo desde la web de CurseForge.');
    if (!modpacks.allowedUrl(v.downloadUrl, name === 'modrinth' ? modpacks.MODRINTH_HOSTS : modpacks.CURSE_HOSTS)) {
      throw new Error('La dirección de descarga del modpack no es de un sitio permitido.');
    }

    const list = readModpacks();
    const previous = list.find((x) => x.provider === name && x.projectId === cleanStr(p.id, 40));
    const id = previous ? previous.id : modpacks.instanceIdFor(cleanStr(p.title, 80) || 'modpack', list.map((x) => x.id));
    const root = instanceDir(GAME_DIR, { event: { id } });
    const buffer = await downloadWithProgress(v.downloadUrl, (got, total) =>
      progress(`Descargando el modpack… ${total ? Math.round((got / total) * 100) + '%' : Math.round(got / 1048576) + ' MB'}`, got, total)
    );
    // Al actualizar una versión se cambian los mods; los mundos y ajustes se conservan.
    if (previous) fs.rmSync(path.join(root, 'mods'), { recursive: true, force: true });
    const onFile = (done, total) => progress(`Descargando mods (${done} de ${total})…`, done, total);
    const download = (u) => downloadBuffer(u);
    const r =
      name === 'modrinth'
        ? await modpacks.installMrpack({ buffer, root, download, onProgress: onFile })
        : await modpacks.installCurse({ buffer, root, resolveFiles: (f) => prov.resolveFiles(f), download, onProgress: onFile });

    const entry = {
      id, provider: name, projectId: cleanStr(p.id, 40), versionId: v.id, version: cleanStr(v.number || v.name, 80),
      title: cleanStr(p.title, 80) || r.name || 'Modpack', icon: /^https:\/\//i.test(p.icon || '') ? cleanStr(p.icon, 300) : '',
      mcVersion: r.mcVersion, loader: r.loader, installedAt: new Date().toISOString(), skipped: r.skipped || []
    };
    writeModpacks([...list.filter((x) => x.id !== id), entry]);
    progress('Listo');
    return entry;
  } finally {
    installingPack = false;
  }
});

ipcMain.handle('modpacks:remove', (_e, id) => {
  if (launching) throw new Error('Cierra Minecraft antes de eliminar un modpack.');
  const list = readModpacks();
  const entry = list.find((x) => x.id === cleanStr(id, 60));
  if (!entry) return;
  const dir = path.resolve(instanceDir(GAME_DIR, { event: { id: entry.id } }));
  if (path.basename(path.dirname(dir)) !== 'instancias') throw new Error('Carpeta no válida.');
  fs.rmSync(dir, { recursive: true, force: true });
  writeModpacks(list.filter((x) => x.id !== entry.id));
});

ipcMain.handle('modpacks:folder', async (_e, id) => {
  const entry = readModpacks().find((x) => x.id === cleanStr(id, 60));
  if (!entry) throw new Error('Ese modpack ya no está instalado.');
  const dir = instanceDir(GAME_DIR, { event: { id: entry.id } });
  fs.mkdirSync(dir, { recursive: true });
  const err = await shell.openPath(dir);
  if (err) throw new Error(err);
});

/* ---------- instancias propias: crear, ajustes, duplicar, respaldos, actualizar ---------- */

// "Recomendados por Nova PX": lista editable en data/recommended.json (en GitHub). Solo Modrinth, y solo modpacks.
ipcMain.handle('modpacks:recommended', async () => {
  let list;
  try {
    list = await loadData('recommended');
  } catch {
    return [];
  }
  const wanted = (Array.isArray(list) ? list : [])
    .filter((r) => r && r.provider === 'modrinth' && /^[A-Za-z0-9_-]{1,64}$/.test(String(r.id || '')))
    .slice(0, 12);
  if (!wanted.length) return [];
  try {
    const found = await apiRequest(`https://api.modrinth.com/v2/projects?ids=${encodeURIComponent(JSON.stringify(wanted.map((r) => r.id)))}`);
    const out = [];
    for (const r of wanted) {
      const h = (found || []).find((p) => p.project_type === 'modpack' && (p.id === r.id || p.slug === r.id));
      if (!h) continue;
      out.push({
        provider: 'modrinth', id: String(h.id), title: h.title, summary: cleanStr(r.note, 200) || h.description || '',
        icon: /^https:\/\//i.test(h.icon_url || '') ? h.icon_url : '', downloads: h.downloads || 0, author: '',
        url: h.slug ? `https://modrinth.com/modpack/${encodeURIComponent(h.slug)}` : '', recommended: true
      });
    }
    return out;
  } catch {
    return []; // sin internet: simplemente no se muestran
  }
});

let mcVersionsCache = null;
ipcMain.handle('modpacks:mcVersions', async () => {
  try {
    const m = await fetchJson('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json');
    mcVersionsCache = packs.releaseVersions(m);
  } catch {
    if (!mcVersionsCache) throw new Error('No se pudo consultar la lista de versiones de Minecraft. Revisa tu conexión.');
  }
  return mcVersionsCache;
});

ipcMain.handle('modpacks:create', (_e, p = {}) => {
  const list = readModpacks();
  const entry = packs.buildCustomEntry({
    name: p.name, icon: p.icon, mcVersion: cleanStr(p.mcVersion, 20), loader: cleanStr(p.loader, 10), existingIds: list.map((x) => x.id)
  });
  fs.mkdirSync(instanceDir(GAME_DIR, { event: { id: entry.id } }), { recursive: true });
  writeModpacks([...list, entry]);
  return entry;
});

// Cambia nombre, icono, notas, ajustes propios y (solo en las propias) versión de Minecraft y loader.
ipcMain.handle('modpacks:update', (_e, p = {}) => {
  const list = readModpacks();
  const entry = list.find((x) => x.id === cleanStr(p.id, 60));
  if (!entry) throw new Error('Ese modpack ya no está instalado.');
  const c = p.changes || {};
  if (c.title !== undefined) {
    const t = cleanStr(c.title, 60).replace(/\s+/g, ' ').trim();
    if (!t) throw new Error('El nombre no puede quedar vacío.');
    entry.title = t;
  }
  if (c.emoji !== undefined) entry.emoji = packs.buildCustomEntry({ name: 'x', icon: c.emoji, mcVersion: '1.0' }).emoji;
  if (c.notes !== undefined) entry.notes = packs.cleanNotes(c.notes);
  if (c.settings !== undefined) entry.settings = packs.sanitizeSettings(c.settings);
  if ((c.mcVersion !== undefined || c.loader !== undefined) && entry.provider === 'custom') {
    if (launching) throw new Error('Cierra Minecraft antes de cambiar la versión.');
    const t = packs.buildCustomEntry({ name: 'x', mcVersion: cleanStr(c.mcVersion ?? entry.mcVersion, 20), loader: cleanStr(c.loader ?? entry.loader.type, 10) });
    entry.mcVersion = t.mcVersion;
    entry.loader = { type: t.loader.type, version: '' };
  }
  writeModpacks(list);
  return entry;
});

ipcMain.handle('modpacks:duplicate', (_e, p = {}) => {
  if (launching) throw new Error('Cierra Minecraft antes de duplicar.');
  const list = readModpacks();
  const src = list.find((x) => x.id === cleanStr(p.id, 60));
  if (!src) throw new Error('Ese modpack ya no está instalado.');
  const title = `${src.title} (copia)`.slice(0, 60);
  const id = modpacks.instanceIdFor(title, list.map((x) => x.id));
  packs.duplicateDir(instanceDir(GAME_DIR, { event: { id: src.id } }), instanceDir(GAME_DIR, { event: { id } }), { withWorlds: !!p.withWorlds });
  const copy = { ...JSON.parse(JSON.stringify(src)), id, title, provider: src.provider === 'custom' ? 'custom' : 'copy', installedAt: new Date().toISOString(), lastPlayedAt: undefined };
  writeModpacks([...list, copy]);
  return copy;
});

ipcMain.handle('instance:backup', (_e, p = {}) => {
  const { root } = packRoot(p.id);
  return packs.backupWorld(root, cleanStr(p.world, 200));
});
ipcMain.handle('instance:backups', (_e, id) => packs.listBackups(packRoot(id).root));
ipcMain.handle('instance:openBackups', async (_e, id) => {
  const dir = path.join(packRoot(id).root, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const err = await shell.openPath(dir);
  if (err) throw new Error(err);
});

// Busca versiones nuevas de los mods (Modrinth) compatibles con la versión y loader del modpack.
ipcMain.handle('instance:updatesCheck', async (_e, id) => {
  const { entry, root } = packRoot(id);
  const items = [];
  for (const it of content.listContent(root, 'mod')) {
    items.push({ ...it, hash: await cachedSha1(path.join(content.contentDir(root, 'mod'), it.file)) });
  }
  const plan = await packs.planModUpdates({ request: apiRequest, items, mc: entry.mcVersion, loader: entry.loader && entry.loader.type });
  return plan.map((u) => ({ file: u.file, newFile: u.newFile, version: u.version }));
});
ipcMain.handle('instance:updatesApply', async (_e, id) => {
  assertEditable();
  const { entry, root } = packRoot(id);
  const items = [];
  for (const it of content.listContent(root, 'mod')) {
    items.push({ ...it, hash: await cachedSha1(path.join(content.contentDir(root, 'mod'), it.file)) });
  }
  const plan = await packs.planModUpdates({ request: apiRequest, items, mc: entry.mcVersion, loader: entry.loader && entry.loader.type });
  const dir = content.contentDir(root, 'mod');
  let done = 0;
  const errors = [];
  for (const u of plan) {
    try {
      const name = content.safeFileName(u.newFile, 'mod');
      if (!name || !modpacks.allowedUrl(u.url, ['cdn.modrinth.com'])) throw new Error('descarga no permitida');
      send('modpack:progress', { text: `Actualizando ${name} (${done + 1} de ${plan.length})…` });
      const data = await downloadBuffer(u.url);
      if (crypto.createHash('sha1').update(data).digest('hex') !== u.sha1) throw new Error('la huella no coincide');
      const dest = path.join(dir, u.enabled ? name : `${name}.disabled`);
      fs.writeFileSync(dest, data);
      if (path.basename(dest) !== u.file) fs.rmSync(path.join(dir, u.file), { force: true });
      done++;
    } catch (err) {
      errors.push(`${u.file}: ${err.message}`);
    }
  }
  return { updated: done, errors };
});

/* ---------- modo administrador (token de GitHub) ---------- */

const ADMIN_FILE = path.join(app.getPath('userData'), 'admin.token');
let adminToken = null;
let adminChecked = false;

function repoFromConfig() {
  const m = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\//.exec(config.remoteBase || '');
  if (!m) throw new Error('config.remoteBase no apunta a un repositorio de GitHub.');
  return { owner: m[1], repo: m[2], branch: m[3] };
}
function readAdminToken() {
  if (adminToken) return adminToken;
  try {
    if (safeStorage.isEncryptionAvailable()) adminToken = safeStorage.decryptString(fs.readFileSync(ADMIN_FILE));
  } catch {}
  return adminToken;
}
function gh() {
  const token = readAdminToken();
  if (!token) throw new Error('Primero activa el modo administrador en Ajustes.');
  return new GithubRepo({ ...repoFromConfig(), token, userAgent: `Nova-PX-Event-Launcher/${app.getVersion()}` });
}
async function requireAdmin() {
  const r = gh();
  const c = await r.check();
  if (!c.canPush) throw new Error('Ese token no tiene permiso de escritura en el repositorio.');
  return r;
}

ipcMain.handle('admin:status', async () => {
  if (!readAdminToken()) return { admin: false };
  try {
    const c = await gh().check();
    adminChecked = c.canPush;
    return { admin: c.canPush, repo: c.fullName };
  } catch (err) {
    return { admin: false, error: err.message };
  }
});
ipcMain.handle('admin:login', async (_e, token) => {
  const t = cleanStr(token, 300).trim();
  if (!/^[A-Za-z0-9_]{20,300}$/.test(t)) throw new Error('Ese token no tiene el formato de un token de GitHub.');
  const r = new GithubRepo({ ...repoFromConfig(), token: t });
  const c = await r.check();
  if (!c.canPush) throw new Error('Ese token puede ver el repositorio pero no escribir en él. Crea uno con permiso "Contents: Read and write".');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Este equipo no puede guardar el token de forma cifrada, así que no se activa el modo administrador.');
  fs.writeFileSync(ADMIN_FILE, safeStorage.encryptString(t));
  adminToken = t;
  return { admin: true, repo: c.fullName };
});
ipcMain.handle('admin:logout', () => {
  adminToken = null;
  fs.rmSync(ADMIN_FILE, { force: true });
});
ipcMain.handle('admin:load', async () => {
  const r = await requireAdmin();
  const get = async (n) => ((await r.getJson(`data/${n}.json`)) || {}).data;
  return { manifest: (await get('manifest')) || {}, team: (await get('team')) || [], news: (await get('news')) || [] };
});
ipcMain.handle('admin:saveEvent', async (_e, form = {}) => {
  const r = await requireAdmin();
  const cur = ((await r.getJson('data/manifest.json')) || {}).data || {};
  const next = adminLib.mergeManifest(cur, form);
  await r.putJson('data/manifest.json', next, `Evento: ${next.event.name} (desde el launcher)`);
  return next;
});
ipcMain.handle('admin:saveTeam', async (_e, list) => {
  const r = await requireAdmin();
  const clean = adminLib.sanitizeTeam(list);
  await r.putJson('data/team.json', clean, 'Equipo actualizado (desde el launcher)');
  return clean;
});
ipcMain.handle('admin:saveNews', async (_e, list) => {
  const r = await requireAdmin();
  const clean = adminLib.sanitizeNews(list);
  await r.putJson('data/news.json', clean, 'Noticias actualizadas (desde el launcher)');
  return clean;
});

// Publica los mods activos de una instancia como el modpack (cifrado) del evento.
let publishing = false;
ipcMain.handle('admin:publishPack', async (_e, p = {}) => {
  if (publishing) throw new Error('Ya se está publicando.');
  if (launching) throw new Error('Cierra Minecraft antes de publicar.');
  publishing = true;
  const progress = (text, done, total) => send('modpack:progress', { text, done, total });
  try {
    const r = await requireAdmin();
    const { entry, root } = packRoot(p.id);
    const dir = path.join(root, 'mods');
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.jar$/i.test(f)).sort() : [];
    if (!files.length) throw new Error('Esa instancia no tiene mods activos para publicar.');
    const cur = ((await r.getJson('data/manifest.json')) || {}).data || {};
    const form = { minecraftVersion: entry.mcVersion, loader: { type: entry.loader.type, version: entry.loader.version || '' }, newEvent: !!p.newEvent, ...(p.newEvent ? { name: cur.event && cur.event.name } : {}) };
    const merged = adminLib.mergeManifest(cur, form);
    const eventId = (merged.event && merged.event.id) || modpacks.slugify((merged.event && merged.event.name) || 'evento');
    const tag = `evento-${eventId}`.slice(0, 60);
    progress('Cifrando los mods…');
    const built = adminLib.buildProtectedEvent({
      jars: files.map((file) => ({ file, data: fs.readFileSync(path.join(dir, file)) })),
      password: typeof p.password === 'string' ? p.password : '', previous: cur.protected, baseUrl: r.downloadBase(tag)
    });
    const release = await r.ensureRelease(tag, `Modpack ${merged.event.name || eventId}`);
    let n = 0;
    for (const a of built.assets) {
      progress(`Subiendo ${a.name} (${n + 1} de ${built.assets.length})…`, n, built.assets.length);
      await r.uploadAsset(release, a.name, a.data);
      n++;
    }
    merged.protected = built.envelope;
    merged.mods = [];
    await r.putJson('data/manifest.json', merged, `Modpack del evento: ${files.length} mods (desde el launcher)`);
    progress('Listo');
    return { mods: files.length, tag, sameSalt: built.reusedSalt, eventId };
  } finally {
    publishing = false;
  }
});

/* ---------- importar de otros launchers y exportar .novapx ---------- */

function packEntryFrom(id, title, r, extra = {}) {
  return {
    id, provider: 'imported', projectId: '', versionId: '', version: '', title: cleanStr(title, 60) || 'Modpack importado', icon: '',
    emoji: '', mcVersion: r.mcVersion, loader: r.loader, installedAt: new Date().toISOString(), skipped: r.skipped || [], settings: {}, notes: '', ...extra
  };
}

async function importFromPath(src) {
  const st = fs.statSync(src);
  const list = readModpacks();
  const progress = (text, done, total) => send('modpack:progress', { text, done, total });
  const onFile = (done, total) => progress(`Descargando mods (${done} de ${total})…`, done, total);
  const idFor = (name) => modpacks.instanceIdFor(name || path.basename(src, path.extname(src)), list.map((x) => x.id));

  if (st.isDirectory()) {
    const info = importers.inspectFolder(src);
    if (!info) throw new Error('No reconozco esa carpeta. Debe ser una instancia de Prism/MultiMC o del CurseForge App. Para otras, crea una instancia y copia tus mods y mundos a su carpeta.');
    if (info.unsupported) throw new Error(`Esa instancia usa ${info.unsupported}, que el launcher todavía no soporta.`);
    const id = idFor(info.name || path.basename(src));
    progress('Copiando archivos…');
    importers.copyFolder(info.contentDir, instanceDir(GAME_DIR, { event: { id } }));
    return packEntryFrom(id, info.name || path.basename(src), info);
  }
  if (st.size > 1.5 * 1024 ** 3) throw new Error('Ese archivo es demasiado grande para importarlo.');
  const buffer = fs.readFileSync(src);
  const kind = importers.detectZip(readZip(buffer));
  if (!kind) throw new Error('No reconozco ese archivo. Acepto .novapx, .mrpack, modpacks de CurseForge (.zip) e instancias exportadas de Prism/MultiMC (.zip).');
  const download = (u) => downloadBuffer(u);
  const tmpId = idFor(path.basename(src, path.extname(src)));
  const root = instanceDir(GAME_DIR, { event: { id: tmpId } });
  try {
    let r;
    let extra = {};
    if (kind === 'novapx') {
      r = await importers.installNovapx({ buffer, root, download, onProgress: onFile });
      extra = { emoji: r.emoji && packs.buildCustomEntry({ name: 'x', icon: r.emoji, mcVersion: '1.0' }).emoji, notes: r.notes, settings: r.settings };
    } else if (kind === 'mrpack') r = await modpacks.installMrpack({ buffer, root, download, onProgress: onFile });
    else if (kind === 'curse') {
      const prov = providerFor('curseforge');
      r = await modpacks.installCurse({ buffer, root, resolveFiles: (f) => prov.resolveFiles(f), download, onProgress: onFile });
    } else r = importers.installPrism({ buffer, root });
    const entry = packEntryFrom(tmpId, r.name, r, extra);
    return entry;
  } catch (err) {
    fs.rmSync(root, { recursive: true, force: true });
    throw err;
  }
}

ipcMain.handle('modpacks:import', async (_e, p = {}) => {
  if (installingPack) throw new Error('Ya se está instalando un modpack.');
  if (launching) throw new Error('Cierra Minecraft antes de importar.');
  let src = typeof p.path === 'string' ? p.path : '';
  if (!src) {
    const folder = p.kind === 'folder';
    const res = await dialog.showOpenDialog(mainWindow, {
      title: folder ? 'Elige la carpeta de la instancia' : 'Elige un modpack para importar',
      properties: [folder ? 'openDirectory' : 'openFile'],
      filters: folder ? [] : [{ name: 'Modpacks', extensions: ['novapx', 'mrpack', 'zip'] }]
    });
    if (res.canceled) return null;
    src = res.filePaths[0];
  }
  if (!path.isAbsolute(src) || !fs.existsSync(src)) throw new Error('No encuentro ese archivo.');
  installingPack = true;
  try {
    const entry = await importFromPath(src);
    writeModpacks([...readModpacks(), entry]);
    send('modpack:progress', { text: 'Listo' });
    return entry;
  } finally {
    installingPack = false;
  }
});

ipcMain.handle('modpacks:export', async (_e, p = {}) => {
  const { entry, root } = packRoot(p.id);
  if (launching) throw new Error('Cierra Minecraft antes de exportar.');
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Exportar modpack', defaultPath: `${modpacks.slugify(entry.title)}.novapx`, filters: [{ name: 'Modpack Nova PX', extensions: ['novapx'] }]
  });
  if (res.canceled || !res.filePath) return null;
  const dest = res.filePath.toLowerCase().endsWith('.novapx') ? res.filePath : `${res.filePath}.novapx`;
  const lookup = async (hashes) => {
    try {
      const { byHash } = await modrinth.lookup(hashes.map((h) => ({ hash: h })), apiRequest);
      const out = {};
      for (const [h, v] of Object.entries(byHash || {})) {
        const f = (v.files || []).find((x) => x.hashes && String(x.hashes.sha1).toLowerCase() === h);
        if (f) out[h] = { url: f.url };
      }
      return out;
    } catch {
      return {}; // sin internet: todo va dentro del archivo
    }
  };
  send('modpack:progress', { text: 'Empaquetando…' });
  const r = await importers.exportNovapx({
    root, dest, entry, lookup, includeMods: p.bundleAll ? 'bundle' : 'links', includeSettings: p.includeSettings !== false, version: app.getVersion()
  });
  send('modpack:progress', { text: 'Listo' });
  return { ...r, path: dest };
});

/* ---------- contenido de cada modpack (mods, shaders, texturas, mundos, registros) ---------- */

const hashCache = new Map();
async function cachedSha1(file) {
  const st = fs.statSync(file);
  const key = `${file}|${st.size}|${st.mtimeMs}`;
  if (!hashCache.has(key)) hashCache.set(key, await content.sha1Stream(file));
  return hashCache.get(key);
}

function packRoot(id) {
  const entry = readModpacks().find((x) => x.id === cleanStr(id, 60));
  if (!entry) throw new Error('Ese modpack ya no está instalado.');
  return { entry, root: instanceDir(GAME_DIR, { event: { id: entry.id } }) };
}
function typeOf(t) {
  content.typeInfo(t);
  return t;
}
function assertEditable() {
  if (launching) throw new Error('Cierra Minecraft antes de cambiar el contenido del modpack.');
}

ipcMain.handle('instance:content', async (_e, id) => {
  const { root } = packRoot(id);
  const items = [];
  for (const type of Object.keys(content.TYPES)) {
    for (const it of content.listContent(root, type)) {
      items.push({ ...it, hash: await cachedSha1(path.join(content.contentDir(root, type), it.file)) });
    }
  }
  let byHash = {};
  let projects = {};
  let offline = false;
  try {
    if (items.length) ({ byHash, projects } = await modrinth.lookup(items, apiRequest));
  } catch {
    offline = true;
  }
  return { items: content.buildContentList(items, byHash, projects), offline };
});

ipcMain.handle('instance:toggle', (_e, p = {}) => {
  assertEditable();
  const { root } = packRoot(p.id);
  return content.toggleContent(root, typeOf(p.type), cleanStr(p.file, 200));
});
ipcMain.handle('instance:remove', (_e, p = {}) => {
  assertEditable();
  const { root } = packRoot(p.id);
  content.removeContent(root, typeOf(p.type), cleanStr(p.file, 200));
});
ipcMain.handle('instance:addLocal', async (_e, p = {}) => {
  assertEditable();
  const { root } = packRoot(p.id);
  const type = typeOf(p.type);
  const info = content.typeInfo(type);
  const res = await dialog.showOpenDialog(mainWindow, {
    title: `Elige archivos ${info.ext} para ${info.label.toLowerCase()}`,
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: info.label, extensions: [info.ext.slice(1)] }]
  });
  if (res.canceled) return { added: [], errors: [] };
  const added = [];
  const errors = [];
  for (const f of res.filePaths) {
    try {
      added.push(content.addLocalFile(root, type, f));
    } catch (err) {
      errors.push(err.message);
    }
  }
  return { added, errors };
});

function searchTarget(p) {
  const { entry, root } = packRoot(p.id);
  const type = typeOf(p.type);
  if (type === 'mod' && (!entry.loader || entry.loader.type === 'vanilla')) {
    throw new Error('Este modpack es Vanilla (sin Fabric ni Forge), así que no admite mods.');
  }
  return { entry, root, type, loader: entry.loader && entry.loader.type };
}
ipcMain.handle('instance:search', async (_e, p = {}) => {
  const t = searchTarget(p);
  return content.searchContent(apiRequest, { type: t.type, mc: t.entry.mcVersion, loader: t.loader, query: cleanStr(p.query, 80), offset: p.offset });
});
ipcMain.handle('instance:install', async (_e, p = {}) => {
  assertEditable();
  const t = searchTarget(p);
  const progress = (text) => send('modpack:progress', { text });
  const r = await content.installFromModrinth({
    request: apiRequest, download: (u) => downloadBuffer(u), root: t.root, type: t.type,
    projectId: cleanStr(p.projectId, 40), mc: t.entry.mcVersion, loader: t.loader, onStatus: progress
  });
  return r;
});

ipcMain.handle('instance:worlds', (_e, id) => {
  const { root } = packRoot(id);
  const dir = path.join(root, 'saves');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ name: d.name, mtime: fs.statSync(path.join(dir, d.name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
});
// Capturas de pantalla (F2) de la instancia: miniaturas de las 60 más recientes.
ipcMain.handle('instance:screenshots', (_e, id) => {
  const dir = path.join(packRoot(id).root, 'screenshots');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /\.png$/i.test(f) && f === path.basename(f))
    .map((f) => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 60)
    .map((x) => {
      let thumb = '';
      try {
        thumb = nativeImage.createFromPath(path.join(dir, x.name)).resize({ width: 260 }).toDataURL();
      } catch {}
      return { ...x, thumb };
    });
});
ipcMain.handle('instance:openScreenshots', async (_e, id) => {
  const dir = path.join(packRoot(id).root, 'screenshots');
  fs.mkdirSync(dir, { recursive: true });
  const err = await shell.openPath(dir);
  if (err) throw new Error(err);
});
ipcMain.handle('instance:log', (_e, id) => {
  const { root } = packRoot(id);
  const file = path.join(root, 'logs', 'latest.log');
  if (!fs.existsSync(file)) return '';
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  return lines.slice(-500).join('\n');
});

// Aviso de escritorio cuando el evento está por empezar (1 hora antes y al empezar). Cada aviso se da una sola vez.
const notified = new Set();
async function checkEventNotifications() {
  try {
    if (!readSettings().notifyEvents || !Notification.isSupported()) return;
    const manifest = await loadData('manifest');
    const ev = manifest.event || {};
    const at = Date.parse(ev.startsAt || '');
    if (!at) return;
    const left = at - Date.now();
    const name = ev.name || 'El evento';
    const fire = (key, title, body) => {
      const id = `${at}:${key}`;
      if (notified.has(id)) return;
      notified.add(id);
      new Notification({ title, body, silent: false }).show();
    };
    if (left <= 0 && left > -30 * 60000) fire('start', `${name} ya empezó`, 'Abre el launcher y entra a jugar.');
    else if (left > 0 && left <= 60 * 60000) fire('hour', `${name} empieza en menos de 1 hora`, 'Ve preparando el launcher.');
  } catch {}
}

ipcMain.handle('data:get', async (_e, name) => {
  if (!ALLOWED_DATA.includes(name)) throw new Error('Dato no permitido');
  return loadData(name);
});

ipcMain.handle('settings:get', () => readSettings());
ipcMain.handle('settings:save', (_e, s) => {
  const clean = cleanSettings({ ...readSettings(), ...s, playSeconds: readSettings().playSeconds });
  writeSettings(clean);
  applyDiscordSetting();
  return clean;
});

ipcMain.handle('system:info', () => ({
  totalRamGb: Math.max(2, Math.floor(os.totalmem() / 1073741824)),
  gameDir: GAME_DIR,
  platform: process.platform
}));

// Estado que la interfaz recupera al abrirse (también cuando la ventana se vuelve a abrir tras jugar).
ipcMain.handle('app:state', async () => {
  if (restoring) await Promise.race([restoring, new Promise((r) => setTimeout(r, 15000))]);
  return {
  session: session ? { mode: session.mode, name: session.name, uuid: session.uuid } : null,
  playing: launching,
  target: launching ? currentTarget : null,
  log: logBuffer
  };
});

ipcMain.handle('folder:open', async () => {
  fs.mkdirSync(GAME_DIR, { recursive: true });
  const err = await shell.openPath(GAME_DIR);
  if (err) throw new Error(err);
});

ipcMain.handle('java:browse', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Elige el ejecutable de Java (java.exe o java)',
    properties: ['openFile']
  });
  return res.canceled ? null : res.filePaths[0];
});

ipcMain.handle('link:open', (_e, url) => {
  const u = new URL(String(url));
  if (u.protocol !== 'https:') throw new Error('Solo se pueden abrir enlaces https.');
  return shell.openExternal(u.href);
});

// Estado del servidor del evento (consulta pública a mcsrvstat.us).
ipcMain.handle('server:status', async () => {
  try {
    const manifest = await loadData('manifest');
    const { host, port } = manifest.server || {};
    if (!host) return { configured: false };
    const target = port && Number(port) !== 25565 ? `${host}:${port}` : host;
    const data = await fetchJson(`https://api.mcsrvstat.us/3/${encodeURIComponent(target)}`);
    return {
      configured: true,
      host: target,
      online: !!data.online,
      players: data.players ? { online: data.players.online, max: data.players.max } : null,
      version: data.version || null
    };
  } catch {
    return { configured: true, online: false, unknown: true };
  }
});

/* ---------- IPC: tema y fondo ---------- */

function backgroundDataUrl() {
  try {
    return `data:image/jpeg;base64,${fs.readFileSync(BACKGROUND_FILE).toString('base64')}`;
  } catch {
    return null;
  }
}

ipcMain.handle('theme:background', () => backgroundDataUrl());

// La imagen se reduce a 1920 px de ancho y se guarda como JPEG: se ve igual y gasta mucha menos memoria.
ipcMain.handle('theme:pickBackground', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Elige una imagen de fondo',
    properties: ['openFile'],
    filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }]
  });
  if (res.canceled || !res.filePaths[0]) return null;
  const file = res.filePaths[0];
  if (fs.statSync(file).size > 40 * 1024 * 1024) throw new Error('La imagen pesa más de 40 MB. Elige una más pequeña.');
  let img = nativeImage.createFromPath(file);
  if (img.isEmpty()) throw new Error('No se pudo leer la imagen. Prueba con un PNG o JPG.');
  const { width } = img.getSize();
  if (width > 1920) img = img.resize({ width: 1920, quality: 'good' });
  fs.mkdirSync(path.dirname(BACKGROUND_FILE), { recursive: true });
  fs.writeFileSync(BACKGROUND_FILE, img.toJPEG(82));
  return backgroundDataUrl();
});

ipcMain.handle('theme:clearBackground', () => {
  fs.rmSync(BACKGROUND_FILE, { force: true });
});

/* ---------- IPC: cuentas ---------- */

function makeOfflineSession(name) {
  // UUID offline estándar de Minecraft (igual al que calcula el servidor).
  const hash = crypto.createHash('md5').update(`OfflinePlayer:${name}`).digest();
  hash[6] = (hash[6] & 0x0f) | 0x30;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString('hex');
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return {
    mode: 'offline',
    name,
    uuid,
    auth: { access_token: uuid, client_token: uuid, uuid, name, user_properties: '{}', meta: { type: 'mojang', demo: false } }
  };
}

/* ---------- sesión guardada (para no iniciar sesión cada vez) ---------- */

// Cuenta no premium: se guarda solo el nick. Premium: se guarda el token de renovación de Microsoft,
// cifrado con el almacén del sistema (nunca en texto plano). Si el sistema no tiene almacén seguro, no se guarda.
function saveAccount(data) {
  try {
    let out = null;
    if (data.mode === 'offline') out = { mode: 'offline', name: data.name };
    else if (data.mode === 'premium' && data.refresh && safeStorage.isEncryptionAvailable()) {
      out = { mode: 'premium', refresh: safeStorage.encryptString(String(data.refresh)).toString('base64') };
    }
    if (!out) return clearAccount();
    fs.mkdirSync(path.dirname(ACCOUNT_FILE), { recursive: true });
    fs.writeFileSync(ACCOUNT_FILE, JSON.stringify(out));
  } catch {}
}

function clearAccount() {
  try {
    fs.unlinkSync(ACCOUNT_FILE);
  } catch {}
}

async function premiumSessionFrom(xbox) {
  const mc = await xbox.getMinecraft();
  session = { mode: 'premium', name: mc.profile.name, uuid: mc.profile.id, auth: mc.mclc() };
  lastProfile = null;
  let refresh = null;
  try {
    refresh = xbox.save();
  } catch {}
  if (refresh) saveAccount({ mode: 'premium', refresh });
}

async function restoreSession() {
  let saved;
  try {
    saved = JSON.parse(fs.readFileSync(ACCOUNT_FILE, 'utf8'));
  } catch {
    return;
  }
  try {
    if (saved.mode === 'offline' && /^[A-Za-z0-9_]{3,16}$/.test(String(saved.name))) {
      session = makeOfflineSession(saved.name);
    } else if (saved.mode === 'premium' && saved.refresh && safeStorage.isEncryptionAvailable()) {
      const token = safeStorage.decryptString(Buffer.from(saved.refresh, 'base64'));
      const xbox = await new Auth('select_account').refresh(token);
      await premiumSessionFrom(xbox);
    }
  } catch {
    // Sin internet o sesión caducada: se pide iniciar sesión de nuevo (el archivo se conserva si solo falló la red).
    session = null;
  }
}

// La interfaz espera (hasta 15 s) a que termine de restaurar la sesión.
let restoring = null;

// Cuenta NO premium: nick local. El servidor debe tener online-mode=false + plugin de login.
ipcMain.handle('auth:offline', (_e, nick) => {
  const name = String(nick || '').trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) {
    throw new Error('El nick debe tener de 3 a 16 caracteres: letras, números o guion bajo.');
  }
  session = makeOfflineSession(name);
  lastProfile = null;
  saveAccount({ mode: 'offline', name });
  return { mode: 'offline', name, uuid: session.uuid };
});

// Cuenta PREMIUM: login oficial de Microsoft/Xbox.
ipcMain.handle('auth:microsoft', async () => {
  const authManager = new Auth('select_account');
  const xbox = await authManager.launch('electron');
  await premiumSessionFrom(xbox);
  return { mode: 'premium', name: session.name, uuid: session.uuid };
});

ipcMain.handle('auth:logout', () => {
  clearAccount();
  session = null;
  lastProfile = null;
  pendingSkin = null;
});

/* ---------- IPC: skins y capas (solo premium) ---------- */

function premiumToken() {
  if (!session || session.mode !== 'premium') {
    throw new Error('OFFLINE: Cambiar la skin y la capa solo funciona con una cuenta premium.');
  }
  return session.auth.access_token;
}

ipcMain.handle('skins:profile', async () => {
  lastProfile = await skinsApi.getProfile(premiumToken());
  return lastProfile;
});

ipcMain.handle('skins:pick', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Elige tu skin (PNG de 64x64)',
    properties: ['openFile'],
    filters: [{ name: 'Skin de Minecraft', extensions: ['png'] }]
  });
  if (res.canceled || !res.filePaths[0]) return null;
  const file = res.filePaths[0];
  if (fs.statSync(file).size > 200 * 1024) throw new Error('El archivo es demasiado grande para ser una skin.');
  const buf = fs.readFileSync(file);
  const size = skinsApi.validateSkinPng(buf);
  pendingSkin = buf;
  return { name: path.basename(file), width: size.width, height: size.height, dataUrl: `data:image/png;base64,${buf.toString('base64')}` };
});

ipcMain.handle('skins:apply', async (_e, variant) => {
  const token = premiumToken();
  if (!pendingSkin) throw new Error('Primero elige un archivo de skin.');
  await skinsApi.uploadSkin(token, pendingSkin, variant === 'slim' ? 'slim' : 'classic');
  pendingSkin = null;
  lastProfile = await skinsApi.getProfile(token);
  return lastProfile;
});

ipcMain.handle('skins:cape', async (_e, capeId) => {
  const token = premiumToken();
  if (capeId === null) {
    await skinsApi.hideCape(token);
  } else {
    if (!lastProfile) lastProfile = await skinsApi.getProfile(token);
    if (!lastProfile.capes.some((c) => c.id === capeId)) throw new Error('Esa capa no está en tu cuenta.');
    await skinsApi.setCape(token, capeId);
  }
  lastProfile = await skinsApi.getProfile(token);
  return lastProfile;
});

/* ---------- IPC: texturas de skins para el visor 3D ---------- */

// Las skins se descargan aquí (no en la página) porque WebGL no puede usar imágenes de otros dominios.
const skinCache = new Map(); // clave -> { at, value }
const SKIN_TTL = 10 * 60 * 1000;
const TEXTURE_URL = /^https:\/\/textures\.minecraft\.net\/texture\/[0-9a-f]+$/i;

async function downloadSkinPng(url, kind) {
  if (!TEXTURE_URL.test(url)) throw new Error('Dirección de skin no permitida.');
  const buf = await downloadBuffer(url);
  if (kind === 'cape') {
    const size = skinsApi.pngSize(buf);
    if (!size || buf.length > 1024 * 1024 || size.width > 1024 || size.height > 1024) throw new Error('Capa no válida.');
  } else {
    skinsApi.validateSkinPng(buf);
  }
  return `data:image/png;base64,${buf.toString('base64')}`;
}

const https = (u) => String(u || '').replace(/^http:\/\//i, 'https://');

ipcMain.handle('skin:fetch', async (_e, rawUrl, kind) => {
  const url = https(rawUrl);
  const key = `url:${kind || 'skin'}:${url}`;
  const hit = skinCache.get(key);
  if (hit && Date.now() - hit.at < SKIN_TTL) return hit.value;
  const value = { dataUrl: await downloadSkinPng(url, kind) };
  skinCache.set(key, { at: Date.now(), value });
  return value;
});

// Busca la skin y la capa de un nick. Si es tu cuenta premium usa tu perfil (al instante, sin esperas de caché).
// Si no hay skin pública, devuelve null y el visor muestra la skin por defecto.
ipcMain.handle('skin:texture', async (_e, nick, fresh) => {
  const name = String(nick || '');
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) return null;
  const key = `nick:${name.toLowerCase()}`;
  const hit = skinCache.get(key);
  if (!fresh && hit && Date.now() - hit.at < SKIN_TTL) return hit.value;
  let value = null;
  try {
    let skinUrl = null;
    let capeUrl = null;
    let slim = false;
    const own = session && session.mode === 'premium' && session.name === name;
    if (own) {
      try {
        lastProfile = await skinsApi.getProfile(premiumToken());
        const sk = lastProfile.activeSkin;
        skinUrl = sk && https(sk.url);
        slim = !!sk && sk.variant === 'slim';
        capeUrl = lastProfile.activeCape && https(lastProfile.activeCape.url);
      } catch {}
    }
    if (!skinUrl) {
      let uuid = own ? String(session.uuid || '').replace(/-/g, '') : '';
      if (!uuid) {
        const found = await fetchJson(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`);
        uuid = found && found.id;
      }
      if (/^[0-9a-f]{32}$/i.test(uuid || '')) {
        const prof = await fetchJson(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`);
        const prop = (prof.properties || []).find((p) => p.name === 'textures');
        const tex = prop && JSON.parse(Buffer.from(prop.value, 'base64').toString('utf8')).textures;
        if (tex && tex.SKIN) {
          skinUrl = https(tex.SKIN.url);
          slim = !!(tex.SKIN.metadata && tex.SKIN.metadata.model === 'slim');
        }
        if (tex && tex.CAPE) capeUrl = https(tex.CAPE.url);
      }
    }
    if (skinUrl && TEXTURE_URL.test(skinUrl)) {
      value = { dataUrl: await downloadSkinPng(skinUrl), slim, cape: null };
      if (capeUrl && TEXTURE_URL.test(capeUrl)) {
        try {
          value.cape = await downloadSkinPng(capeUrl, 'cape');
        } catch {}
      }
    }
  } catch {
    value = null;
  }
  skinCache.set(key, { at: Date.now(), value });
  return value;
});

/* ---------- IPC: jugar ---------- */

ipcMain.handle('game:launch', async (_e, opts = {}) => {
  if (!session) throw new Error('Primero inicia sesión.');
  if (launching) throw new Error('El juego ya se está iniciando.');
  launching = true;

  try {
    // Un modpack instalado desde Modrinth/CurseForge se lanza con su propia carpeta y sin servidor.
    let pack = null;
    let manifest;
    if (opts.modpackId) {
      pack = readModpacks().find((x) => x.id === String(opts.modpackId));
      if (!pack) throw new Error('Ese modpack ya no está instalado.');
      manifest = {
        minecraftVersion: pack.mcVersion,
        loader: pack.loader,
        event: { id: pack.id, name: pack.title, active: true }
      };
    } else {
      send('game:status', { text: 'Leyendo configuración del evento…' });
      manifest = await loadData('manifest');
      if (manifest.event && manifest.event.active === false) {
        throw new Error('Todavía no hay un evento activo. ¡Pronto habrá novedades!');
      }
    }

    const loaderType = String((manifest.loader && manifest.loader.type) || 'vanilla').toLowerCase();
    if (!loaders.SUPPORTED_LOADERS.includes(loaderType)) {
      throw new Error(
        `El loader "${loaderType}" todavía no está soportado. Usa uno de: ${loaders.SUPPORTED_LOADERS.join(', ')}.`
      );
    }

    // Primero lo que puede fallar rápido: la contraseña (solo si falta instalar mods cifrados).
    const password = typeof opts.password === 'string' ? opts.password : '';
    // Cada evento vive en su propia carpeta: los mods de un evento no chocan con los de otro.
    const eventDir = instanceDir(GAME_DIR, manifest);
    fs.mkdirSync(eventDir, { recursive: true });
    if (!pack) await installMods(manifest, password, eventDir); // la contraseña se comprueba antes de descargar Java
    // Los ajustes propios del modpack (RAM, Java, argumentos, ventana) pesan más que los de Ajustes.
    const st = packs.mergeSettings(readSettings(), pack && pack.settings);
    const javaPath = await resolveJava(manifest, loaderType, st);

    let customId = null;
    let forgeInstaller = null;
    if (loaderType === 'fabric') {
      send('game:status', { text: 'Preparando Fabric…' });
      customId = await ensureFabric(manifest.minecraftVersion, manifest.loader.version);
    } else if (loaderType === 'forge') {
      send('game:status', { text: 'Preparando Forge…' });
      forgeInstaller = await ensureForge(manifest.minecraftVersion, manifest.loader.version);
    }

    const customArgs = st.jvmArgs.split(/\s+/).filter(Boolean);
    const launchOpts = {
      authorization: session.auth,
      root: GAME_DIR,
      version: {
        number: manifest.minecraftVersion,
        type: 'release',
        ...(customId ? { custom: customId } : {})
      },
      overrides: { gameDirectory: eventDir },
      memory: { max: `${st.ramGb}G`, min: '1G' },
      ...(forgeInstaller ? { forge: forgeInstaller } : {}),
      window: st.fullscreen
        ? { fullscreen: true }
        : { width: String(st.width), height: String(st.height) },
      ...(customArgs.length ? { customArgs } : {}),
      ...(javaPath ? { javaPath } : {})
    };
    if (st.joinServer && manifest.server && manifest.server.host) {
      launchOpts.server = { host: manifest.server.host, port: String(manifest.server.port || 25565) };
    }

    const launcher = new Client();
    launcher.on('progress', (e) => send('game:progress', { type: e.type, task: e.task, total: e.total }));
    launcher.on('package-extract', () => send('game:status', { text: 'Extrayendo archivos…' }));
    launcher.on('arguments', () => send('game:status', { text: 'Iniciando Minecraft…' }));
    launcher.on('debug', (m) => pushLog('launcher', String(m)));
    launcher.on('data', (m) => pushLog('minecraft', String(m).trimEnd()));
    launcher.on('close', (code) => {
      launching = false;
      currentTarget = null;
      // Suma el tiempo de juego a las horas jugadas.
      if (gameStartedAt) {
        const seconds = Math.round((Date.now() - gameStartedAt) / 1000);
        gameStartedAt = 0;
        try {
          const current = readSettings();
          writeSettings({ ...current, playSeconds: current.playSeconds + seconds });
        } catch {}
      }
      // Si la ventana estaba cerrada (modo bandeja), se recrea y recibe el aviso cuando termina de cargar.
      const windowWasOpen = !!mainWindow && !mainWindow.isDestroyed();
      if (readSettings().discordRpc) discordIdle();
      pendingClose = { code, crash: code === 0 ? [] : analyzeCrash(logBuffer) };
      leaveGameMode();
      if (windowWasOpen) {
        send('game:close', pendingClose);
        pendingClose = null;
      }
    });

    const child = await launcher.launch(launchOpts);
    if (!child) {
      launching = false;
      throw new Error('No se pudo iniciar Minecraft. Revisa la consola para ver el motivo.');
    }
    gameStartedAt = Date.now();
    currentTarget = pack
      ? { kind: 'pack', title: pack.title, icon: pack.icon || '' }
      : { kind: 'event', title: (manifest.event && manifest.event.name) || 'Evento', icon: '' };
    if (pack) {
      try { writeModpacks(readModpacks().map((x) => (x.id === pack.id ? { ...x, lastPlayedAt: new Date().toISOString() } : x))); } catch {}
    }
    if (readSettings().discordRpc) discordPlaying((manifest.event && manifest.event.name) || 'Evento', gameStartedAt);
    send('game:status', { text: 'Minecraft en ejecución' });
    enterGameMode();
    return true;
  } catch (err) {
    launching = false;
    throw err;
  }
});
