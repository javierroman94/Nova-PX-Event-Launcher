const { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, nativeImage, safeStorage } = require('electron');
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
const ALLOWED_DATA = ['news', 'events', 'team', 'manifest'];
const ICON = path.join(__dirname, 'build', 'icon.png');

let mainWindow = null;
let tray = null;
let session = null; // { mode, name, uuid, auth }
let launching = false;
let gameStartedAt = 0;
let pendingClose = null; // resultado de la última partida, por si la ventana estaba cerrada
let pendingSkin = null; // skin elegida en el selector, aún sin subir a Mojang
let lastProfile = null;
const logBuffer = [];
const memoryKeys = new Map();

// Solo una copia del launcher a la vez (cada copia gasta memoria).
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
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
async function resolveJava(manifest, loaderType) {
  const mc = manifest.minecraftVersion;
  const need = loaders.requiredJavaMajor(mc);
  const st = readSettings();
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
    setUpdate({ state: 'error', message: String((e && e.message) || e).slice(0, 200) })
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
    send('game:status', { text: 'Leyendo configuración del evento…' });
    const manifest = await loadData('manifest');

    if (manifest.event && manifest.event.active === false) {
      throw new Error('Todavía no hay un evento activo. ¡Pronto habrá novedades!');
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
    await installMods(manifest, password, eventDir); // la contraseña se comprueba antes de descargar Java
    const javaPath = await resolveJava(manifest, loaderType);

    let customId = null;
    let forgeInstaller = null;
    if (loaderType === 'fabric') {
      send('game:status', { text: 'Preparando Fabric…' });
      customId = await ensureFabric(manifest.minecraftVersion, manifest.loader.version);
    } else if (loaderType === 'forge') {
      send('game:status', { text: 'Preparando Forge…' });
      forgeInstaller = await ensureForge(manifest.minecraftVersion, manifest.loader.version);
    }

    const st = readSettings();
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
    if (readSettings().discordRpc) discordPlaying((manifest.event && manifest.event.name) || 'Evento', gameStartedAt);
    send('game:status', { text: 'Minecraft en ejecución' });
    enterGameMode();
    return true;
  } catch (err) {
    launching = false;
    throw err;
  }
});
