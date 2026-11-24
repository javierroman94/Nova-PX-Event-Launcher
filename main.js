const { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, nativeImage, safeStorage: electronSafeStorage, Notification } = require('electron');
const os = require('os');
const path = require('path');
const fs = require('fs');
// Los canales IPC solo se atienden desde las páginas del launcher; y safeStorage no cuenta si en Linux cae a la llave fija.
const { makeSecureStorage } = require('./lib/secure-storage');
const { guardIpc, isTrustedUrl } = require('./lib/ipc-guard');
const safeStorage = makeSecureStorage(electronSafeStorage);
guardIpc(ipcMain, path.join(__dirname, 'renderer'));
const permisosLib = require('./lib/permisos');
// Cada acción del panel de administración pide su permiso (lib/permisos.js). `adminPerms` se define más abajo.
permisosLib.gatePermisos(ipcMain, () => adminPerms());
const crypto = require('crypto');
const { Client } = require('minecraft-launcher-core');
const { Auth } = require('msmc');
const { autoUpdater } = require('electron-updater');
const { execFile } = require('child_process');
const loaders = require('./lib/loaders');
const jvmDefaults = require('./lib/jvm-args');
const mojangArt = require('./lib/mojang-art');
const pcrypto = require('./lib/pack-crypto');
const packInstall = require('./lib/pack-install');
const { analyzeCrash } = require('./lib/crash');
const gameLogs = require('./lib/game-logs');
const { instanceDir, instanceId } = require('./lib/instance');
const serversLib = require('./lib/servers');
const langLib = require('./lib/langpack');
const { DiscordRpc, buildActivity } = require('./lib/discord-rpc');
const skinsApi = require('./lib/skins');
const { classifyNetworkError } = require('./lib/errors');
const { repairInstance } = require('./lib/repair');
const modrinth = require('./lib/modrinth');
const modpacks = require('./lib/modpacks');
const ftbLib = require('./lib/ftb');
const providers = require('./lib/providers');
const content = require('./lib/content');
const packs = require('./lib/packs');
const novaLib = require('./lib/nova');
const optifineLib = require('./lib/optifine');
const { GithubRepo } = require('./lib/github');
const adminLib = require('./lib/admin');
const serverMgr = require('./lib/server-manager');
const pluginLib = require('./lib/plugin-library');
const telemetry = require('./lib/telemetry');
const friendsLib = require('./lib/friends');
const social = require('./lib/social');
const remote = require('./lib/remote');
const sess = require('./lib/session');
const streamer = require('./lib/streamer');
const packLock = require('./lib/lock');
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
const ACCOUNTS_FILE = path.join(app.getPath('userData'), 'accounts.json');
const BACKGROUND_FILE = path.join(app.getPath('userData'), 'background.jpg');
const DATA_CACHE_DIR = path.join(app.getPath('userData'), 'data-cache');
const ALLOWED_DATA = ['plugins', 'news', 'events', 'team', 'manifest', 'recommended', 'admins', 'launcher', 'ads', 'nicks'];
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

// Configuración remota (data/launcher.json). Se refresca al abrir y cada 10 minutos.
let remoteCfg = remote.sanitize(null);
async function refreshRemote() {
  try {
    const next = remote.sanitize(await loadData('launcher'));
    if (JSON.stringify(next) !== JSON.stringify(remoteCfg)) {
      remoteCfg = next;
      send('remote:changed', remoteCfg);
    }
  } catch {}
}
ipcMain.handle('remote:get', () => remoteCfg);

function defaultSettings() {
  return {
    lastNick: '',
    ramGb: (remoteCfg.defaults && remoteCfg.defaults.ramGb) || config.defaultRamGb,
    joinServer: true,
    javaPath: config.javaPath || '',
    autoJava: true,
    jvmArgs: '',
    width: 854,
    height: 480,
    fullscreen: false,
    // minimize: minimiza | tray: cierra la ventana y deja un icono (ahorra más memoria) | keep: no hace nada
    gameBehavior: process.platform === 'linux' ? 'minimize' : 'tray',
    theme: 'nova',
    accent: '#35d6ff',
    design: 2,
    lang: 'auto',
    season: 'auto',
    bgDim: 55,
    bgBlur: 6,
    effects: true,
    discordRpc: true,
    notifyEvents: true,
    shareUsage: true,
    streamer: 'auto',
    intro: true,
    introSound: true,
    welcomed: false,
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
    // Diseño 2 (Nova Neón): quien aún no lo tenía lo recibe una vez; después puede volver al que prefiera.
    design: 2,
    theme: s.design !== 2 ? 'nova' : require('./lib/themes').ALL.includes(s.theme) ? s.theme : 'dark',
    accent: s.design !== 2 && String(s.accent).toLowerCase() === '#f2b84b' ? '#35d6ff' : /^#[0-9a-f]{6}$/i.test(String(s.accent)) ? String(s.accent).toLowerCase() : d.accent,
    lang: s.lang === 'auto' || langLib.CODE_RE.test(String(s.lang || '')) ? String(s.lang || 'auto') : 'auto',
    season: ['auto', 'off', 'navidad', 'halloween', 'anio', 'sanvalentin', 'carnaval', 'madres', 'ecuador'].includes(s.season) ? s.season : 'auto',
    bgDim: num(s.bgDim, 0, 90, d.bgDim),
    bgBlur: num(s.bgBlur, 0, 24, d.bgBlur),
    effects: s.effects !== false,
    discordRpc: s.discordRpc !== false,
    notifyEvents: s.notifyEvents !== false,
    shareUsage: s.shareUsage !== false,
    streamer: streamer.cleanMode(s.streamer),
    intro: s.intro !== false,
    introSound: s.introSound !== false,
    welcomed: s.welcomed === true,
    playSeconds: Math.max(0, Math.floor(Number(s.playSeconds) || 0))
  };
}

function writeSettings(s) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2));
}

/* ---------- utilidades: ahora en lib/main/utilidades.js ---------- */
const { fetchWithTimeout, fetchJson, checkStreamer, justPublished, remember, dataMemo } = require('./lib/main/utilidades')({ streamer, readSettings, execFile, send, ipcMain, bumpRev, fs, DATA_CACHE_DIR, path });

/* ---------- aviso de contenido nuevo (rápido, sin esperar al reloj de cada launcher) ---------- */
const revLib = require('./lib/rev');
let lastRev = null;
// El administrador avisa al publicar: escribe data/rev.json en el repositorio (el Worker lo reparte a todos los launchers).
let bumpTimer = null;
function bumpRev() {
  clearTimeout(bumpTimer); // varias publicaciones seguidas = un solo aviso
  bumpTimer = setTimeout(async () => {
    try { const r = await requireAdmin(); await r.putJson('data/rev.json', { rev: revLib.makeRev() }, 'Aviso de contenido nuevo'); } catch {}
  }, 2500);
}
async function checkRev() {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    // Con «compartir uso» apagado no se contacta al Worker: se lee el mismo aviso directamente del repositorio.
    const url = USAGE_URL && readSettings().shareUsage !== false ? `${USAGE_URL.replace(/\/$/, '')}/rev` : config.remoteBase ? `${config.remoteBase.replace(/\/$/, '')}/rev.json?t=${Date.now()}` : '';
    if (!url) return;
    const r = await fetch(url, { signal: AbortSignal.timeout(4000), cache: 'no-store' });
    if (!r.ok) return;
    const next = (await r.json()).rev;
    if (!revLib.valid(next)) return;
    const was = lastRev; lastRev = next;
    if (!revLib.changed(was, next)) return;
    dataMemo.clear();
    await refreshRemote();
    send('content:changed', { at: Date.now() });
  } catch {}
}
async function loadData(name) {
  const mine = justPublished.get(name);
  if (mine && mine.until > Date.now()) return mine.data;
  // Varias partes del launcher piden lo mismo al abrir: se comparte una sola descarga durante 20 s.
  const memo = dataMemo.get(name);
  if (memo && memo.until > Date.now()) return memo.promise;
  const promise = loadDataFresh(name);
  dataMemo.set(name, { promise, until: Date.now() + 20 * 1000 });
  promise.catch(() => dataMemo.delete(name));
  return promise;
}
// Datos críticos (manifest, plugins, recommended, launcher): se comprueba su firma Ed25519 (lib/firma.js).
const firmaLib = require('./lib/firma');
let FIRMA_PUB = null;
try { FIRMA_PUB = fs.readFileSync(path.join(__dirname, 'config', 'firma-datos.pub.pem'), 'utf8'); } catch {}
async function fetchDataVerified(base, name) {
  const known = (() => { try { return JSON.parse(fs.readFileSync(path.join(DATA_CACHE_DIR, `${name}.firma.json`), 'utf8')); } catch { return null; } })();
  return require('./lib/data-firmada').leerFirmado({
    name,
    getText: async (file) => (await fetchWithTimeout(`${base}/${file}?t=${Date.now()}`, 4000)).text(),
    pub: FIRMA_PUB,
    obligatoria: !!config.firmaObligatoria,
    known
  });
}
async function loadDataFresh(name) {
  if (config.remoteBase) {
    const cacheFile = path.join(DATA_CACHE_DIR, `${name}.json`);
    try {
      const { data: remote, sig } = await fetchDataVerified(config.remoteBase.replace(/\/$/, ''), name);
      try {
        fs.mkdirSync(DATA_CACHE_DIR, { recursive: true });
        fs.writeFileSync(cacheFile, JSON.stringify(remote));
        if (sig) fs.writeFileSync(path.join(DATA_CACHE_DIR, `${name}.firma.json`), JSON.stringify(sig));
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

// IPs que no deben verse en la consola del launcher (la del servidor del evento).
const hiddenHosts = new Set();
function hideHost(host) {
  const h = String(host || '').trim();
  if (h.length >= 3) hiddenHosts.add(h);
}
function redact(text) {
  let out = require('./lib/redact').redactSecrets(text);
  for (const h of hiddenHosts) out = out.split(h).join('•••');
  return out;
}

// Evento protegido: la consola no debe revelar qué mods se cargan. El log real se guarda cifrado (para soporte).
function saveProtectedLog(lines) {
  // Se sella con la llave pública de soporte (config/soporte-informes.pub.pem): solo quien tiene la privada lo abre.
  try {
    const pub = fs.readFileSync(path.join(__dirname, 'config', 'soporte-informes.pub.pem'), 'utf8');
    const sealed = require('./lib/seal').seal(Buffer.from(require('./lib/redact').redactSecrets(lines.join('\n')), 'utf8'), pub);
    fs.writeFileSync(path.join(app.getPath('userData'), 'event-error.enc'), sealed);
  } catch {}
}
let protectedRun = false;
let currentEventDir = null;
const rawLogBuffer = [];
const MODLINE = /\.jar\b|\bmods?\b|mixin|fabric-|\bloading \d+|entrypoint|\[[A-Za-z0-9_.$]+\/(?:INFO|WARN|ERROR|DEBUG)\]: *(?:Loading|Found|Initializ|Registering)|modid|\bFML\b|\bforge\b|quilt/i;
function pushLog(source, raw) {
  let line = redact(raw);
  if (protectedRun) {
    rawLogBuffer.push(`[${source}] ${line}`);
    if (rawLogBuffer.length > 3000) rawLogBuffer.shift();
    if (MODLINE.test(line)) return;
  }
  logBuffer.push(`[${source}] ${line}`);
  if (logBuffer.length > 1500) logBuffer.shift();
  send('game:log', { source, line });
}

/* ---------- contraseña de instalación y mods: ahora en lib/main/contrasena-de-instalacion-y-mods.js ---------- */
const { keyStore, downloadBuffer, installMods } = require('./lib/main/contrasena-de-instalacion-y-mods')({ memoryKeys, safeStorage, fs, KEYS_FILE, path, fetchWithTimeout, send, packInstall, app, instanceId });

/* ---------- loader (Fabric): ahora en lib/main/loader-fabric.js ---------- */
const { ensureFabric } = require('./lib/main/loader-fabric')({ loaders, fetchJson, path, GAME_DIR, fs });

/* ---------- loader (Quilt): ahora en lib/main/loader-quilt.js ---------- */
const { ensureQuilt } = require('./lib/main/loader-quilt')({ loaders, fetchJson, path, GAME_DIR, fs });

/* ---------- loader (Forge): ahora en lib/main/loader-forge.js ---------- */
const { ensureForge, fixNovaMods } = require('./lib/main/loader-forge')({ readZip, fs, loaders, path, GAME_DIR, fetchJson, send, downloadBuffer, fetchWithTimeout, sha1OfFile, pushLog, instanceDir, novaLib, content, apiRequest });

/* ---------- Forge nuevo (61.x: Minecraft 1.21.11+): ahora en lib/main/forge-nuevo.js ---------- */
const { forgeInstallerInfo, installForgeClient, installedJvmArgs, isNewForgeEra, sanitizeOldOptions } = require('./lib/main/forge-nuevo')({ readZip, fs, path, GAME_DIR, ensureVanillaFiles, send, pushLog, os });

/* ---------- OptiFine solo (sin Forge) ---------- */

// Deja el Minecraft vanilla de esa versión en <GAME_DIR>/versions (el instalador de OptiFine lo necesita).
async function ensureVanillaFiles(mc) {
  if (!loaders.isSafeVersion(mc)) throw new Error(`La versión de Minecraft "${mc}" no es válida.`);
  const dir = path.join(GAME_DIR, 'versions', mc);
  const jarFile = path.join(dir, `${mc}.jar`);
  const jsonFile = path.join(dir, `${mc}.json`);
  if (fs.existsSync(jarFile) && fs.existsSync(jsonFile)) return;
  send('game:status', { text: `Descargando Minecraft ${mc}…` });
  const manifest = mcManifestCache || (mcManifestCache = await fetchJson('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json'));
  const v = manifest.versions.find((x) => x.id === mc);
  if (!v) throw new Error(`Mojang no tiene la versión ${mc}.`);
  const info = await fetchJson(v.url);
  fs.mkdirSync(dir, { recursive: true });
  const jar = await downloadBuffer(info.downloads.client.url);
  if (require('crypto').createHash('sha1').update(jar).digest('hex') !== info.downloads.client.sha1) throw new Error('El Minecraft descargado está dañado. Inténtalo de nuevo.');
  fs.writeFileSync(jarFile, jar);
  fs.writeFileSync(jsonFile, JSON.stringify(info));
}

// Devuelve el id de la versión «<mc>-OptiFine_…» lista para lanzar; la primera vez ejecuta el instalador oficial de OptiFine.
async function ensureOptiFine(pack, javaPath) {
  const mc = pack.mcVersion;
  let file = pack.optifine;
  if (!file) {
    file = await optifineLib.fetchJar({ fetchText: async (u) => (await fetchWithTimeout(u, 30000)).text(), download: (u) => downloadBuffer(u), destDir: path.join(GAME_DIR, 'optifine'), mc });
    if (!file) throw new Error(`OptiFine no tiene versión para Minecraft ${mc}.`);
  }
  const jarPath = path.join(GAME_DIR, 'optifine', file);
  if (!fs.existsSync(jarPath)) await optifineLib.fetchJar({ fetchText: async (u) => (await fetchWithTimeout(u, 30000)).text(), download: (u) => downloadBuffer(u), destDir: path.join(GAME_DIR, 'optifine'), mc });
  const javaBin = (javaPath || 'java').replace(/javaw(\.exe)?$/i, (m2) => m2.replace('javaw', 'java'));
  send('game:status', { text: 'Instalando OptiFine…' });
  return optifineLib.installStandalone({
    gameDir: GAME_DIR, mc, jarPath, helperClass: require('./lib/of-helper'),
    ensureVanilla: () => ensureVanillaFiles(mc),
    run: (args) => new Promise((resolve, reject) => execFile(javaBin, args, { timeout: 180000, windowsHide: true, maxBuffer: 1 << 20 }, (err, out, errOut) => (err ? reject(new Error(`No se pudo ejecutar el instalador de OptiFine: ${String(errOut || err.message).split('\n')[0]}`)) : resolve(out))))
  });
}

/* ---------- loader (NeoForge): ahora en lib/main/loader-neoforge.js ---------- */
const { ensureNeoForge } = require('./lib/main/loader-neoforge')({ loaders, path, GAME_DIR, fs, fetchWithTimeout, send, downloadBuffer, sha1OfFile });

/* ---------- Java: ahora en lib/main/java.js ---------- */
const { readJavaVersionOutput, managedJavaPath, preferJavaw, resolveJava } = require('./lib/main/java')({ execFile, findJavaBinary, path, RUNTIME_DIR, fs, readSettings, loaders, config, installJava, send });

/* ---------- ventana y bandeja ---------- */

// Una ventana del launcher solo puede mostrar páginas de renderer/: sin navegación, sin ventanas nuevas y sin <webview>.
function lockWindow(wc) {
  wc.on('will-navigate', (e, url) => { if (!isTrustedUrl(url, path.join(__dirname, 'renderer'))) e.preventDefault(); });
  wc.on('will-attach-webview', (e) => e.preventDefault());
}

let windowShownBefore = false;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 720,
    minWidth: 940,
    minHeight: 620,
    title: config.launcherName,
    icon: ICON,
    backgroundColor: '#0d0f16',
    // Barra de título propia en Windows: el color la sigue el estilo elegido (ver win:overlay).
    ...(process.platform === 'win32' ? { titleBarStyle: 'hidden', titleBarOverlay: { color: '#0d0f16', symbolColor: '#e8eaf2', height: 52 } } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      autoplayPolicy: 'no-user-gesture-required' // la animación de inicio suena sola
    }
  });
  mainWindow.setMenuBarVisibility(false);
  // La ventana solo muestra la interfaz del launcher: los enlaces https se abren en el navegador y nada más.
  // El launcher no necesita cámara, micrófono, ubicación ni notificaciones del navegador: se niegan todos los permisos.
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  mainWindow.webContents.session.setPermissionCheckHandler(() => false);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
  lockWindow(mainWindow.webContents);
  // Si la ventana se vuelve a abrir (después de cerrarla con el juego en marcha), no se repite la intro.
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'), windowShownBefore ? { query: { resume: '1' } } : undefined);
  windowShownBefore = true;
  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingImportFile) {
      send('import:open', { path: pendingImportFile });
      pendingImportFile = null;
    }
    if (pendingClose) {
      overlayHide();
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

// En la versión de Microsoft Store (MSIX) las actualizaciones las gestiona la propia Store.
const FROM_STORE = !!process.windowsStore;

function checkForUpdates() {
  if (!app.isPackaged || FROM_STORE) return Promise.resolve();
  return autoUpdater.checkForUpdates().catch(() => {});
}

// Solo funciona en la versión instalada (npm run dist), que consulta los Releases de GitHub.
function setupUpdater() {
  if (FROM_STORE) {
    setUpdate({ state: 'none' });
    return;
  }
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
  // Busca solo: al abrir, cada 10 minutos y cada vez que vuelves a la ventana (con 2 minutos de margen).
  // Si ya hay una descarga en curso o lista para instalar no vuelve a preguntar (para no borrar el aviso).
  let lastAuto = 0;
  const autoCheck = (force) => {
    if (['checking', 'downloading', 'ready'].includes(updateState.state)) return;
    if (!force && Date.now() - lastAuto < 2 * 60 * 1000) return;
    lastAuto = Date.now();
    checkForUpdates();
  };
  autoCheck(true);
  setInterval(() => autoCheck(true), 10 * 60 * 1000);
  app.on('browser-window-focus', () => autoCheck(false));
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
  checkStreamer();
  setInterval(checkStreamer, 15 * 1000).unref();
  refreshRemote();
  setInterval(refreshRemote, 3 * 60 * 1000).unref();
  setTimeout(checkRev, 4000).unref();
  setInterval(checkRev, 20 * 1000).unref();
  setTimeout(pingUsage, 3000);
  // Si el launcher se cerró a la fuerza con un evento protegido abierto, quedaron mods sueltos: se limpian (solo si hay copia cifrada para restaurarlos).
  setTimeout(async () => {
    try {
      if (launching) return;
      const manifest = await loadData('manifest');
      if (!manifest || !manifest.protected || manifest.showMods === true) return;
      const gameDir = instanceDir(GAME_DIR, manifest);
      const cacheDir = path.join(app.getPath('userData'), 'pack-cache', instanceId(manifest));
      if (packInstall.canRestoreFromCache({ prot: manifest.protected, gameDir, keyStore, cacheDir }) && !launching) packInstall.wipeProtected(gameDir);
    } catch {}
  }, 8000).unref();
  setTimeout(() => backfillIcons().catch(() => {}), 6000);
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
  const files = [];
  for (const f of jars) files.push({ file: f, hash: await cachedSha1(path.join(dir, f)) });
  const key = crypto.createHash('sha1').update(files.map((f) => f.hash).join(',')).digest('hex');
  let mods;
  let offline = false;
  // Mismos mods que la última vez: se muestra al instante, sin esperar a Modrinth.
  try {
    const c = JSON.parse(fs.readFileSync(MODS_CACHE, 'utf8'));
    if (c.key === key && Array.isArray(c.mods)) return { hidden: false, count: jars.length, mods: c.mods, offline: false, eventName };
  } catch {}
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

/* ---------- modpacks de Modrinth ---------- */

const MODPACKS_FILE = path.join(app.getPath('userData'), 'modpacks.json');
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
// Intermediario con la clave de CurseForge guardada como secreto (la clave no va en el launcher).
const CURSE_PROXY = 'https://nova-px-curseforge.javier-1994yoop.workers.dev/v1';
function providerFor(name) {
  if (name === 'modrinth') return providers.modrinth(apiRequest);
  if (name === 'curseforge') return providers.curseforge(apiRequest, '', CURSE_PROXY);
  if (name === 'ftb') return ftbLib.ftb(apiRequest);
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

// PX con IA: el launcher habla con un Worker propio (la clave de Anthropic vive allí) con límites diarios. No se guarda ninguna conversación.
const PET_PROXY = 'https://nova-px-pet.javier-1994yoop.workers.dev';
ipcMain.handle('pet:chat', async (_e, p) => {
  try {
    const body = JSON.stringify({ id: p && p.id, mode: p && p.mode, messages: p && p.messages, memory: p && p.memory, log: p && p.log });
    if (body.length > 8000) return { status: 413, data: { error: 'too_big' } };
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20000);
    try {
      const res = await fetch(`${PET_PROXY}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': `Nova-PX-Event-Launcher/${app.getVersion()}` }, body, signal: ctl.signal });
      let data = null; try { data = await res.json(); } catch {}
      return { status: res.status, data };
    } finally { clearTimeout(timer); }
  } catch { return { status: 0, data: null }; }
});
ipcMain.handle('modpacks:providers', () => ({ modrinth: true, ftb: true }));
ipcMain.handle('modpacks:search', async (_e, p = {}) =>
  providerFor(cleanStr(p.provider, 20)).search({ query: cleanStr(p.query, 80), offset: Math.max(0, Math.floor(Number(p.offset) || 0)), loader: cleanStr(p.loader, 12), mc: cleanStr(p.mc, 24), sort: cleanStr(p.sort, 12) })
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
    if (!v.supported) throw new Error('Este modpack usa un loader que el launcher todavía no soporta (solo Fabric, Forge, NeoForge o Vanilla).');
    const isFtb = name === 'ftb';
    const isCurse = name === 'curseforge';
    if (!isFtb && !v.downloadUrl) throw new Error(`El autor de este modpack no permite descargarlo desde otros programas. Descárgalo desde la web de ${isCurse ? 'CurseForge e impórtalo con «Importar archivo»' : 'Modrinth'}.`);
    if (!isFtb && !modpacks.allowedUrl(v.downloadUrl, isCurse ? modpacks.CURSE_HOSTS : modpacks.MODRINTH_HOSTS)) {
      throw new Error('La dirección de descarga del modpack no es de un sitio permitido.');
    }

    const list = readModpacks();
    const previous = list.find((x) => x.provider === name && x.projectId === cleanStr(p.id, 40));
    const id = previous ? previous.id : modpacks.instanceIdFor(cleanStr(p.title, 80) || 'modpack', list.map((x) => x.id));
    const root = instanceDir(GAME_DIR, { event: { id } });
    const ftbManifest = isFtb ? await prov.manifest(cleanStr(p.id, 40), v.id) : null;
    const buffer = isFtb ? null : await downloadWithProgress(v.downloadUrl, (got, total) =>
      progress(`Descargando el modpack… ${total ? Math.round((got / total) * 100) + '%' : Math.round(got / 1048576) + ' MB'}`, got, total)
    );
    // Al actualizar una versión se cambian los mods; los mundos y ajustes se conservan.
    // Los mods anteriores se apartan y vuelven a su sitio si la instalación nueva falla a medias.
    const modsDir = path.join(root, 'mods');
    const modsBackup = path.join(root, 'mods.anterior');
    const hadSnapshot = !!previous && fs.existsSync(path.join(root, BASE_FILE));
    const baseBefore = hadSnapshot ? readBase(root) : new Set();
    const keysBefore = previous ? contentKeys(root) : new Set();
    // Solo cuenta como "del jugador" lo que no venía ya con el modpack; así lo que el modpack vuelve a traer sigue protegido.
    if (previous) for (const k of [...keysBefore]) if (k.startsWith('mod:') || baseBefore.has(k)) keysBefore.delete(k);
    if (previous && fs.existsSync(modsDir)) {
      fs.rmSync(modsBackup, { recursive: true, force: true });
      fs.renameSync(modsDir, modsBackup);
    }
    const onFile = (done, total) => progress(`Descargando mods (${done} de ${total})…`, done, total);
    const download = (u) => downloadBuffer(u);
    let r;
    try {
      r = isFtb
        ? await ftbLib.installFtb({ manifest: ftbManifest, root, download, onProgress: onFile })
        : isCurse
          ? await modpacks.installCurse({ buffer, root, resolveFiles: (f) => prov.resolveFiles(f), download, onProgress: onFile })
          : await modpacks.installMrpack({ buffer, root, download, onProgress: onFile });
    } catch (err) {
      if (fs.existsSync(modsBackup)) {
        fs.rmSync(modsDir, { recursive: true, force: true });
        fs.renameSync(modsBackup, modsDir);
      }
      throw err;
    }
    writeBaseSnapshot(root, keysBefore);
    // Los mods que añadió el usuario (no son del modpack) se conservan al reinstalar o cambiar de versión.
    try {
      if (hadSnapshot && fs.existsSync(modsBackup)) {
        const stillBlocked = new Set((r.blocked || []).map((b) => String(b && b.name)));
        for (const f of fs.readdirSync(modsBackup)) {
          if (!/\.jar(\.disabled)?$/i.test(f) || (baseBefore.has(`mod:${f.replace(/\.disabled$/i, '')}`) && !stillBlocked.has(f))) continue;
          const dest = path.join(modsDir, f);
          if (!fs.existsSync(dest)) { fs.mkdirSync(modsDir, { recursive: true }); fs.copyFileSync(path.join(modsBackup, f), dest); }
        }
      }
    } catch {}
    // Los mods bloqueados que el jugador ya había bajado (de la versión anterior) vuelven a ser del modpack si la nueva versión también los declara.
    try {
      const declared = new Set((r.blocked || []).map((b) => String(b && b.name)));
      const keep = [...declared].filter((n) => /\.jar$/i.test(n) && fs.existsSync(path.join(modsDir, n))).map((n) => `mod:${n}`);
      if (keep.length) addToBase(root, keep);
    } catch {}
    fs.rmSync(modsBackup, { recursive: true, force: true });

    const entry = {
      id, provider: name, projectId: cleanStr(p.id, 40), versionId: v.id, version: cleanStr(v.number || v.name, 80),
      title: cleanStr(p.title, 80) || r.name || 'Modpack', icon: /^https:\/\//i.test(p.icon || '') ? cleanStr(p.icon, 300) : '',
      mcVersion: r.mcVersion, loader: r.loader, installedAt: new Date().toISOString(), skipped: r.skipped || [], blocked: r.blocked || []
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
let mcManifestCache = null;
ipcMain.handle('modpacks:mcVersions', async (_e, opts = {}) => {
  try {
    mcManifestCache = await fetchJson('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json');
  } catch {
    if (!mcManifestCache) throw new Error('No se pudo consultar la lista de versiones de Minecraft. Revisa tu conexión.');
  }
  mcVersionsCache = packs.releaseVersions(mcManifestCache, { snapshots: !!(opts && opts.snapshots) });
  return mcVersionsCache;
});

ipcMain.handle('modpacks:create', async (_e, p = {}) => {
  const list = readModpacks();
  const entry = packs.buildCustomEntry({
    name: p.name, icon: p.icon, mcVersion: cleanStr(p.mcVersion, 20), loader: cleanStr(p.loader, 10), existingIds: list.map((x) => x.id)
  });
  if (typeof p.iconData === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(p.iconData) && p.iconData.length < 400000) { entry.icon = p.iconData; entry.iconTried = true; }
  const dir = instanceDir(GAME_DIR, { event: { id: entry.id } });
  fs.mkdirSync(dir, { recursive: true });
  writeModpacks([...list, entry]);
  // Perfil Nova: baja los mods de rendimiento de Modrinth (lo que no exista para esa versión se salta).
  if (entry.preset === 'nova') {
    const progress = (text) => send('modpack:progress', { text });
    try {
      const r = await novaLib.installNovaMods(
        (slug) => content.installFromModrinth({ request: apiRequest, download: (u) => downloadBuffer(u), root: dir, type: 'mod', projectId: slug, mc: entry.mcVersion, loader: 'fabric' }),
        { onStatus: progress }
      );
      entry.novaSkipped = r.skipped;
      progress('Instalando Nova Client…');
      try {
        entry.novaClient = await novaLib.installNovaClient({ request: apiRequest, download: (u) => downloadBuffer(u), dir, mc: entry.mcVersion });
      } catch { entry.novaClient = null; }
      await fixNovaMods(dir, entry.mcVersion);
    } finally {
      progress('Listo');
    }
  }
  // Perfil OptiFine (solo): se baja el .jar oficial de optifine.net; el instalador se ejecuta al jugar por primera vez.
  if (entry.preset === 'optifine') {
    const progress = (text) => send('modpack:progress', { text });
    try {
      progress('Descargando OptiFine desde optifine.net…');
      entry.optifine = await optifineLib.fetchJar({
        fetchText: async (u) => (await fetchWithTimeout(u, 30000)).text(), download: (u) => downloadBuffer(u), destDir: path.join(GAME_DIR, 'optifine'), mc: entry.mcVersion
      });
    } catch (e) { entry.optifine = null; entry.optifineError = String((e && e.message) || e).slice(0, 200); } finally { progress('Listo'); }
    writeModpacks(readModpacks().map((x) => (x.id === entry.id ? entry : x)));
  }
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
  if (c.removeIcon === true) { entry.icon = ''; entry.iconTried = true; }
  if (c.channel !== undefined && ['release', 'beta', 'alpha'].includes(c.channel)) entry.channel = c.channel;
  if (c.emoji !== undefined) entry.emoji = packs.buildCustomEntry({ name: 'x', icon: c.emoji, mcVersion: '1.0' }).emoji;
  if (c.notes !== undefined) entry.notes = packs.cleanNotes(c.notes);
  if (c.settings !== undefined) entry.settings = packs.sanitizeSettings(c.settings, true);
  if ((c.mcVersion !== undefined || c.loader !== undefined || c.loaderVersion !== undefined) && entry.provider === 'custom') {
    if (launching) throw new Error('Cierra Minecraft antes de cambiar la versión.');
    const t = packs.buildCustomEntry({ name: 'x', mcVersion: cleanStr(c.mcVersion ?? entry.mcVersion, 20), loader: cleanStr(c.loader ?? entry.loader.type, 10) });
    const same = t.mcVersion === entry.mcVersion && t.loader.type === entry.loader.type;
    // Versión del loader: vacía = la recomendada; si la escribes, se usa esa (por ejemplo Fabric 0.16.9 o Forge 47.2.0).
    let lv = c.loaderVersion !== undefined ? cleanStr(c.loaderVersion, 40) : (same ? (entry.loader.version || '') : '');
    if (lv && !loaders.isSafeVersion(lv)) throw new Error('Esa versión del loader no es válida.');
    if (t.loader.type === 'vanilla') lv = '';
    entry.mcVersion = t.mcVersion;
    entry.loader = { type: t.loader.type, version: lv };
  }
  writeModpacks(list);
  return entry;
});

// Imagen propia para una instancia: se recorta a cuadrado y se reduce a 128 px (queda en modpacks.json como data URL).
ipcMain.handle('modpacks:pickIcon', async (_e, p = {}) => {
  const list = readModpacks();
  const entry = list.find((x) => x.id === cleanStr(p.id, 60));
  if (!entry) throw new Error('Ese modpack ya no está instalado.');
  const res = await dialog.showOpenDialog(mainWindow, { title: 'Elige la imagen del modpack', properties: ['openFile'], filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
  if (res.canceled) return null;
  const buf = fs.readFileSync(res.filePaths[0]);
  if (buf.length > adminLib.MAX_IMAGE) throw new Error('La imagen pesa más de 3 MB. Redúcela y vuelve a intentarlo.');
  if (!adminLib.imageKind(buf)) throw new Error('Ese archivo no es una imagen PNG, JPG o WEBP válida.');
  let img = nativeImage.createFromBuffer(buf);
  if (img.isEmpty()) throw new Error('No pude leer esa imagen.');
  const { width, height } = img.getSize();
  const side = Math.min(width, height);
  img = img.crop({ x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), width: side, height: side }).resize({ width: 128, height: 128, quality: 'best' });
  entry.icon = `data:image/png;base64,${img.toPNG().toString('base64')}`;
  entry.iconTried = true;
  writeModpacks(list);
  return entry;
});

// Elige una imagen para una instancia que todavía no existe: devuelve un PNG cuadrado de 128 px (data URL).
ipcMain.handle('modpacks:pickIconFile', async () => {
  const res = await dialog.showOpenDialog(mainWindow, { title: 'Elige la imagen', properties: ['openFile'], filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
  if (res.canceled) return null;
  const buf = fs.readFileSync(res.filePaths[0]);
  if (buf.length > adminLib.MAX_IMAGE) throw new Error('La imagen pesa más de 3 MB. Redúcela y vuelve a intentarlo.');
  if (!adminLib.imageKind(buf)) throw new Error('Ese archivo no es una imagen PNG, JPG o WEBP válida.');
  let img = nativeImage.createFromBuffer(buf);
  if (img.isEmpty()) throw new Error('No pude leer esa imagen.');
  const { width, height } = img.getSize();
  const side = Math.min(width, height);
  img = img.crop({ x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), width: side, height: side }).resize({ width: 128, height: 128, quality: 'best' });
  return `data:image/png;base64,${img.toPNG().toString('base64')}`;
});

// Imágenes oficiales de cada versión (de lo que publica Mojang); se piden una vez por sesión.
let mojangArtCache = null;
// Datos para la página Versiones: tipo y fecha de cada versión de Mojang, y qué versiones tienen Forge y OptiFine.
let versionMetaCache = null;
ipcMain.handle('mc:versionMeta', async () => {
  if (versionMetaCache) return versionMetaCache;
  const out = { versions: {}, forge: [], optifine: [], quilt: [] };
  try {
    const manifest = mcManifestCache || (mcManifestCache = await fetchJson('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json'));
    for (const v of manifest.versions || []) if (v && v.id) out.versions[v.id] = { type: v.type, time: v.releaseTime };
  } catch {}
  try {
    const promos = (await fetchJson('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json')).promos || {};
    out.forge = [...new Set(Object.keys(promos).map((k) => k.replace(/-(latest|recommended)$/, '')))];
  } catch {}
  try { out.quilt = (await fetchJson('https://meta.quiltmc.org/v3/versions/game')).filter((g) => g.stable).map((g) => g.version); } catch {}
  try { out.optifine = Object.keys(await optifineLib.listVersions(async (u) => (await fetchWithTimeout(u, 30000)).text())); } catch {}
  if (Object.keys(out.versions).length) versionMetaCache = out;
  return out;
});

ipcMain.handle('mojang:versionArt', async () => {
  if (mojangArtCache) return mojangArtCache;
  let art = {};
  try { art = mojangArt.buildArtMap(await apiRequest(mojangArt.FEED)); } catch { return {}; }
  try {
    const missing = [];
    for (let n = 0; n <= 21; n++) if (!art[`1.${n}`]) missing.push(`1.${n}`);
    const wiki = mojangArt.buildWikiMap(await apiRequest(mojangArt.wikiUrl(missing)));
    for (const [k, v] of Object.entries(wiki)) if (!art[k]) art[k] = v;
  } catch {}
  mojangArtCache = art;
  return mojangArtCache;
});


ipcMain.handle('instance:openSub', async (_e, p = {}) => {
  const { root } = packRoot(p.id);
  const sub = cleanStr(p.sub, 20);
  const ok = ['', 'mods', 'resourcepacks', 'shaderpacks', 'saves', 'config', 'screenshots', 'logs'];
  if (!ok.includes(sub)) throw new Error('Carpeta no permitida.');
  const dir = sub ? path.join(root, sub) : root;
  fs.mkdirSync(dir, { recursive: true });
  const err = await shell.openPath(dir);
  if (err) throw new Error(err);
});

// Archivos bloqueados por su autor: mueve de Descargas a la carpeta mods los que el jugador ya bajó (mismo nombre exacto, .jar).
ipcMain.handle('instance:collectDownloads', (_e, p = {}) => {
  const { root } = packRoot(p.id);
  const modsDir = path.join(root, 'mods');
  const dl = app.getPath('downloads');
  const moved = [];
  fs.mkdirSync(modsDir, { recursive: true });
  for (const raw of Array.isArray(p.names) ? p.names.slice(0, 200) : []) {
    const name = path.basename(String(raw));
    if (!/\.jar$/i.test(name) || name !== String(raw)) continue;
    const from = path.join(dl, name);
    const to = path.join(modsDir, name);
    try {
      if (fs.existsSync(to)) { moved.push(name); continue; }
      if (!fs.existsSync(from) || !fs.statSync(from).isFile() || fs.statSync(from).size < 1024) continue;
      try { fs.renameSync(from, to); } catch { fs.copyFileSync(from, to); fs.rmSync(from, { force: true }); }
      moved.push(name);
    } catch {}
  }
  // Solo lo que el modpack declara como bloqueado cuenta como suyo; cualquier otro .jar sigue siendo contenido del jugador.
  const declared = new Set(((packRoot(p.id).entry || {}).blocked || []).map((b) => String(b && b.name)));
  addToBase(root, moved.filter((n) => declared.has(n)).map((n) => `mod:${n}`));
  return moved;
});

// Desvincular: la instancia deja de ser de Modrinth/CurseForge y pasa a ser propia (se puede cambiar el loader y la versión).
ipcMain.handle('modpacks:unlink', (_e, p = {}) => {
  if (launching) throw new Error('Cierra Minecraft antes de desvincular.');
  const list = readModpacks();
  const entry = list.find((x) => x.id === cleanStr(p.id, 60));
  if (!entry) throw new Error('Ese modpack ya no está instalado.');
  entry.provider = 'custom';
  entry.projectId = '';
  entry.versionId = '';
  entry.version = '';
  writeModpacks(list);
  return entry;
});

// Java: comprobar una ruta y buscar una instalación.
async function javaCheck(bin) {
  const out = await readJavaVersionOutput(bin);
  const major = loaders.parseJavaMajor(out);
  return { valid: !!major, major: major || 0 };
}
ipcMain.handle('java:check', async (_e, p = {}) => {
  const bin = cleanStr(p.path, 500);
  if (!bin) return { valid: false, major: 0 };
  try { return await javaCheck(bin); } catch { return { valid: false, major: 0 }; }
});
ipcMain.handle('java:detect', async (_e, p = {}) => {
  const need = loaders.javaInstallMajor(cleanStr(p.mc, 20)) || 0;
  const cands = [];
  const exe = process.platform === 'win32' ? 'javaw.exe' : 'java';
  const managed = need ? managedJavaPath(need) : null;
  if (managed) cands.push(managed);
  if (process.env.JAVA_HOME) cands.push(path.join(process.env.JAVA_HOME, 'bin', exe));
  if (fs.existsSync(RUNTIME_DIR)) {
    for (const d of fs.readdirSync(RUNTIME_DIR)) { const b = findJavaBinary(path.join(RUNTIME_DIR, d)); if (b) cands.push(b); }
  }
  cands.push('java');
  const found = [];
  for (const bin of cands) {
    try {
      const r = await javaCheck(bin);
      if (r.valid) found.push({ path: bin, major: r.major, ok: !need || r.major >= need });
    } catch {}
  }
  const best = found.find((f) => f.ok && f.major === need) || found.find((f) => f.ok) || found[0] || null;
  return { best, found };
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

// Busca versiones nuevas de mods, shaders y texturas (Modrinth) compatibles con la versión y el loader del modpack.

// Lo que trae un modpack (sus mods, texturas y shaders) se anota aparte: queda protegido y lo que añade el usuario va por separado.
const BASE_FILE = '.nova-base.json';
function contentKeys(root) {
  const out = new Set();
  for (const type of Object.keys(content.TYPES)) {
    for (const it of content.listContent(root, type)) out.add(`${type}:${it.file.replace(/\.disabled$/i, '')}`);
  }
  return out;
}
function writeBaseSnapshot(root, before = new Set()) {
  try {
    const files = [...contentKeys(root)].filter((k) => !before.has(k));
    fs.writeFileSync(path.join(root, BASE_FILE), JSON.stringify({ files }));
  } catch {}
}
function readBase(root) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(root, BASE_FILE), 'utf8'));
    return new Set(Array.isArray(j.files) ? j.files : []);
  } catch { return new Set(); }
}
// Anota archivos como parte del modpack (por ejemplo los bloqueados por su autor, que el jugador baja a mano).
function addToBase(root, keys) {
  try {
    const set = readBase(root);
    keys.forEach((k) => set.add(k));
    fs.writeFileSync(path.join(root, BASE_FILE), JSON.stringify({ files: [...set] }));
  } catch {}
}
const isBase = (root, type, file) => readBase(root).has(`${type}:${String(file).replace(/\.disabled$/i, '')}`);


// Sincronización entre instancias (solo lo que el usuario active): se copia de la carpeta común a la instancia al abrir y de vuelta al cerrar.
const SYNC_ITEMS = { options: 'options.txt', servers: 'servers.dat', resourcepacks: 'resourcepacks', history: 'command_history.txt', hotbars: 'hotbar.nbt' };
function syncDir() { return path.join(GAME_DIR, 'synced'); }
function syncCopy(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true, force: true });
}
function syncIn(instDir, flags = {}) {
  for (const k of Object.keys(SYNC_ITEMS)) if (flags[k]) { try { syncCopy(path.join(syncDir(), SYNC_ITEMS[k]), path.join(instDir, SYNC_ITEMS[k])); } catch {} }
}
function syncOut(instDir, flags = {}) {
  for (const k of Object.keys(SYNC_ITEMS)) if (flags[k]) { try { syncCopy(path.join(instDir, SYNC_ITEMS[k]), path.join(syncDir(), SYNC_ITEMS[k])); } catch {} }
}
// Comandos del usuario (antes de abrir y al cerrar). Solo los pone el dueño de la PC en los ajustes de su instancia.
function runHook(cmd, cwd, env) {
  return new Promise((resolve) => {
    require('child_process').exec(cmd, { cwd, env: { ...process.env, ...env }, timeout: 120000, windowsHide: true }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: `${stdout || ''}${stderr || ''}`.trim(), err });
    });
  });
}
function parseEnvLines(text) {
  const out = {};
  for (const l of String(text || '').split(/\r?\n/)) { const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(l.trim()); if (m) out[m[1]] = m[2]; }
  return out;
}

async function planAllUpdates(entry, root) {
  const plan = [];
  for (const type of Object.keys(content.TYPES)) {
    const items = [];
    const base = readBase(root);
    for (const it of content.listContent(root, type)) {
      if (base.has(`${type}:${it.file.replace(/\.disabled$/i, '')}`)) continue; // lo del modpack no se toca
      items.push({ ...it, hash: await cachedSha1(path.join(content.contentDir(root, type), it.file)) });
    }
    if (!items.length) continue;
    try {
      plan.push(...(await packs.planModUpdates({ request: apiRequest, items, mc: entry.mcVersion, loader: entry.loader && entry.loader.type, type, channel: entry.channel || 'release' })));
    } catch (e) {
      if (type === 'mod') throw e; // sin conexión: que lo vea el usuario; un shader que falle no debe tapar a los mods
    }
  }
  return plan;
}
ipcMain.handle('instance:updatesCheck', async (_e, id) => {
  const { entry, root } = packRoot(id);
  const plan = await planAllUpdates(entry, root);
  return plan.map((u) => ({ type: u.type, file: u.file, enabled: u.enabled, newFile: u.newFile, version: u.version }));
});
ipcMain.handle('instance:updatesApply', async (_e, arg) => {
  assertEditable();
  const id = arg && typeof arg === 'object' ? arg.id : arg;
  const only = arg && Array.isArray(arg.only) ? new Set(arg.only.map((f) => String(f))) : null; // "tipo:archivo" de lo elegido
  const { entry, root } = packRoot(id);
  let plan = await planAllUpdates(entry, root);
  if (only) plan = plan.filter((u) => only.has(`${u.type}:${u.file}`));
  let done = 0;
  const errors = [];
  try {
    for (const u of plan) {
      try {
        const dir = content.contentDir(root, u.type);
        const name = content.safeFileName(u.newFile, u.type);
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
  } finally { send('modpack:progress', { text: 'Listo' }); }
  return { updated: done, errors };
});

/* ---------- contador de uso (opcional, Cloudflare Worker) ---------- */

const USAGE_URL = telemetry.validUrl(config.telemetryUrl);
const INSTALL_ID_FILE = path.join(app.getPath('userData'), 'install-id');
let lastPing = { nick: null, at: 0 };

// Avisa al contador que el launcher se abrió. Si el jugador lo apagó en Ajustes, o no hay contador configurado, no hace nada.
async function pingUsage() {
  if (!USAGE_URL || !readSettings().shareUsage || !remoteCfg.features.usageCounter) return;
  const nick = session ? session.name : '';
  if (lastPing.nick === nick && Date.now() - lastPing.at < 30 * 60 * 1000) return;
  lastPing = { nick, at: Date.now() };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    const body = telemetry.buildPing({ id: telemetry.installId(INSTALL_ID_FILE), session, version: app.getVersion(), platform: process.platform });
    await fetch(`${USAGE_URL}/ping`, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' }, signal: ctl.signal });
  } catch {} finally {
    clearTimeout(timer);
  }
}

// Cifras públicas del contador (jugadores activos). Se guardan 10 minutos; sin contador devuelve null.
let communityCache = { at: 0, value: null };
ipcMain.handle('community:stats', async () => {
  if (!USAGE_URL) return null;
  if (Date.now() - communityCache.at < 10 * 60 * 1000) return communityCache.value;
  let value = null;
  try {
    const r = await fetchJson(`${USAGE_URL}/stats`, 5000);
    if ([r.total, r.day, r.week].every((n) => Number.isInteger(n) && n >= 0)) value = { total: r.total, day: r.day, week: r.week };
  } catch {}
  communityCache = { at: Date.now(), value };
  return value;
});

/* ---------- amigos y estado en línea ---------- */

const FRIENDS_FILE = path.join(app.getPath('userData'), 'friends.json');
// Token secreto de esta instalación: el Worker lo usa para que nadie más pueda hablar como tu nick.
const PRESENCE_TOKEN_FILE = path.join(app.getPath('userData'), 'presence.token');
let presenceToken = null;
function getPresenceToken() {
  if (presenceToken) return presenceToken;
  try { presenceToken = fs.readFileSync(PRESENCE_TOKEN_FILE, 'utf8').trim(); } catch {}
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(presenceToken || '')) {
    presenceToken = require('crypto').randomBytes(24).toString('base64url');
    try { fs.writeFileSync(PRESENCE_TOKEN_FILE, presenceToken, { mode: 0o600 }); } catch {}
  }
  return presenceToken;
}
const NICK_OK = /^[A-Za-z0-9_]{3,16}$/;
// Llama al Worker como el jugador con sesión. Devuelve { ok, data } o { ok:false, error }.
async function presenceCall(op, body = {}, ms = 6000) {
  if (!USAGE_URL) return { ok: false, error: 'disabled' };
  if (!session || !NICK_OK.test(session.name || '')) return { ok: false, error: 'no_session' };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(`${USAGE_URL}/presence/${op}`, { method: 'POST', body: JSON.stringify({ ...body, nick: session.name, token: getPresenceToken() }), headers: { 'Content-Type': 'application/json' }, signal: ctl.signal });
    let data = {};
    try { data = await r.json(); } catch {}
    return r.ok ? { ok: true, data } : { ok: false, error: data.error || 'http_' + r.status };
  } catch { return { ok: false, error: 'network' }; } finally { clearTimeout(timer); }
}
const FRIEND_ERRORS = {
  disabled: 'La función de amigos no está activa en este launcher.',
  no_session: 'Inicia sesión para usar amigos.',
  network: 'No se pudo conectar. Revisa tu internet e inténtalo de nuevo.',
  auth: 'Ese nick ya lo usa otra instalación del launcher.',
  bad_nick: 'El nick debe tener de 3 a 16 caracteres (letras, números o guion bajo) y no ser el tuyo.',
  already: 'Ya son amigos.',
  full: 'Llegaste al máximo de amigos.',
  busy: 'Esa persona tiene demasiadas solicitudes pendientes.',
  no_request: 'Esa solicitud ya no existe.',
  not_friends: 'Solo puedes chatear con tus amigos.',
  empty: 'Escribe un mensaje.'
};
const friendFail = (r) => { throw new Error(FRIEND_ERRORS[r.error] || 'No se pudo completar la acción.'); };

// Latido: dice que sigues conectado (solo con sesión y con "compartir uso" activado).
function presenceBeat() {
  if (!readSettings().shareUsage) return;
  presenceCall('sync', { playing: launching });
}
setInterval(presenceBeat, 60 * 1000).unref();
setTimeout(presenceBeat, 8000).unref();
app.on('before-quit', () => { if (session) presenceCall('leave', {}, 1500); });

ipcMain.handle('friends:list', async () => {
  const base = { enabled: !!USAGE_URL, loggedIn: !!session, sharing: readSettings().shareUsage !== false, reachable: true, friends: [], incoming: [], outgoing: [] };
  if (!base.enabled || !session) return base;
  // Amigos guardados solo en tu equipo por versiones anteriores: se les envía la solicitud una vez.
  const legacy = friendsLib.load(FRIENDS_FILE);
  if (legacy.length) {
    for (const n of legacy) await presenceCall('request', { to: n });
    friendsLib.save(FRIENDS_FILE, []);
  }
  const r = await presenceCall('sync', { playing: launching });
  if (!r.ok) return { ...base, reachable: false, error: FRIEND_ERRORS[r.error] || '' };
  const d = r.data;
  return { ...base, friends: d.friends || [], incoming: d.incoming || [], outgoing: d.outgoing || [], now: d.now };
});
ipcMain.handle('friends:add', async (_e, nick) => {
  const n = String(nick || '').trim();
  if (!NICK_OK.test(n)) throw new Error(FRIEND_ERRORS.bad_nick);
  const r = await presenceCall('request', { to: n });
  return r.ok ? r.data.status : friendFail(r);
});
for (const [ch, op] of [['friends:accept', 'accept'], ['friends:remove', 'remove']]) {
  ipcMain.handle(ch, async (_e, nick) => { const r = await presenceCall(op, { to: String(nick || '') }); return r.ok ? true : friendFail(r); });
}
ipcMain.handle('chat:send', async (_e, to, text) => {
  const r = await presenceCall('send', { to: String(to || ''), text: String(text || '') });
  return r.ok ? true : friendFail(r);
});
ipcMain.handle('chat:poll', async (_e, who, since) => {
  const r = await presenceCall('poll', { with: String(who || ''), since: Number(since) || 0 }, 5000);
  return r.ok ? { ...r.data, me: session.name } : friendFail(r);
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
// Quién puede ver el modo administrador: los dueños (config) y las cuentas premium que ellos autoricen (data/admins.json).
async function adminEligible() {
  if (!session) return false;
  let admins = [];
  try {
    admins = await loadData('admins');
  } catch {}
  return adminLib.isAllowedAdmin(session, config.adminOwners || [], admins);
}
// Rol y permisos de la sesión actual (null si no es administrador).
async function adminPerms() {
  let admins = [];
  try { admins = await loadData('admins'); } catch {}
  return permisosLib.permisosDeSesion(session, config.adminOwners || [], admins);
}
async function needFilePerm(name) {
  const info = await adminPerms();
  if (!info || !permisosLib.permite(info.permisos, permisosLib.ARCHIVOS[name] || 'permisos')) throw new Error('Tu rol no tiene permiso para esto.');
}
function gh() {
  const token = readAdminToken();
  if (!token) throw new Error('Primero activa el modo administrador en Ajustes.');
  const r = new GithubRepo({ ...repoFromConfig(), token, userAgent: `Nova-PX-Event-Launcher/${app.getVersion()}` });
  r.signer = { privatePem: readSignKey() };
  r.mustSign = !!(config.firmaObligatoria && FIRMA_PUB);
  return r;
}
// Llave privada de firma de datos: se importa a mano en el modo administrador y se guarda cifrada. No viaja a ningún lado.
const SIGN_KEY_FILE = path.join(app.getPath('userData'), 'firma-datos.key');
function readSignKey() {
  try {
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(fs.readFileSync(SIGN_KEY_FILE)) : null;
  } catch {
    return null;
  }
}
ipcMain.handle('admin:signKeyStatus', async () => {
  if (!(await adminEligible())) throw new Error('Tu cuenta no tiene permiso de administrador.');
  return { enabled: !!FIRMA_PUB, mandatory: !!config.firmaObligatoria, imported: !!readSignKey() };
});
ipcMain.handle('admin:signKeyImport', async () => {
  if (!(await adminEligible())) throw new Error('Tu cuenta no tiene permiso de administrador.');
  if (!FIRMA_PUB) throw new Error('Este launcher no trae llave pública de firma.');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Este equipo no puede guardar la llave de forma cifrada.');
  const res = await dialog.showOpenDialog(mainWindow, { title: 'Elige la llave privada de firma (.pem)', properties: ['openFile'], filters: [{ name: 'Llave PEM', extensions: ['pem'] }] });
  if (res.canceled || !res.filePaths[0]) return { imported: !!readSignKey(), canceled: true };
  const stat = fs.statSync(res.filePaths[0]);
  if (stat.size > 4096) throw new Error('Ese archivo no parece una llave de firma.');
  const pem = fs.readFileSync(res.filePaths[0], 'utf8');
  if (!firmaLib.llaveCoincide(pem, FIRMA_PUB)) throw new Error('Esa llave no corresponde a la llave pública de este launcher.');
  fs.writeFileSync(SIGN_KEY_FILE, safeStorage.encryptString(pem));
  return { imported: true };
});
async function requireAdmin() {
  if (!(await adminEligible())) throw new Error('Tu cuenta no tiene permiso de administrador. Inicia sesión con tu cuenta premium autorizada.');
  const r = gh();
  r.byline = session && session.name ? session.name : ''; // el mensaje del cambio dice quién lo hizo
  const c = await r.check();
  if (!c.canPush) throw new Error('Ese token no tiene permiso de escritura en el repositorio.');
  return r;
}

// Invitar a otra persona como colaboradora de GitHub, para que publique con su propio token (sin compartir el tuyo).
ipcMain.handle('admin:invite', async (_e, user) => {
  const r = await requireAdmin();
  const name = String(user || '').trim();
  try {
    const out = await r.inviteCollaborator(name);
    return { ok: true, ...out, user: name };
  } catch (err) {
    // El token normal no puede invitar (hace falta el permiso "Administration"): se abre la página de GitHub.
    return { ok: false, user: name, message: String(err.message || err), url: `https://github.com/${r.owner}/${r.repo}/settings/access` };
  }
});

/* ---------- plugins propios de Nova PX (el administrador los sube; los bloqueados van cifrados) ---------- */
const PLUGIN_TAG = 'plugins-nova';
let pendingPlugin = null;
const pluginPw = new Map(); // contraseña de la biblioteca, solo en memoria durante la sesión
const pluginsNow = async (r) => pluginLib.sanitizeLibrary((((await r.getJson('data/plugins.json').catch(() => null)) || {}).data) || {});
async function publishPluginLib(r, library, stale, message) {
  if (stale.length) {
    const release = await r.ensureRelease(PLUGIN_TAG, 'Plugins de Nova PX');
    for (const name of stale) await r.deleteAsset(release, name);
  }
  await r.putJson('data/plugins.json', library, message);
  remember('plugins', library);
}
ipcMain.handle('admin:pluginPick', async () => {
  await requireAdmin();
  const res = await dialog.showOpenDialog(mainWindow, { title: 'Elige el plugin (.jar)', properties: ['openFile'], filters: [{ name: 'Plugin de Minecraft', extensions: ['jar'] }] });
  if (res.canceled || !res.filePaths[0]) return null;
  const file = res.filePaths[0];
  if (fs.statSync(file).size > pluginLib.MAX_BYTES) throw new Error(`El plugin pesa más de ${Math.round(pluginLib.MAX_BYTES / 1048576)} MB.`);
  pendingPlugin = { file: path.basename(file), data: fs.readFileSync(file) };
  return { file: pendingPlugin.file, size: pendingPlugin.data.length };
});
ipcMain.handle('admin:pluginList', async () => {
  const r = await requireAdmin();
  return pluginsNow(r);
});
ipcMain.handle('admin:pluginPublish', async (_e, p = {}) => {
  const r = await requireAdmin();
  if (!pendingPlugin) throw new Error('Primero elige el archivo .jar.');
  const cur = await pluginsNow(r);
  const built = pluginLib.buildPlugin({
    name: p.name, description: p.description, info: p.info, image: p.image, creator: p.creator, links: p.links, file: pendingPlugin.file, data: pendingPlugin.data,
    locked: !!p.locked, password: typeof p.password === 'string' ? p.password : '', previousLock: cur.lock, baseUrl: r.downloadBase(PLUGIN_TAG)
  });
  const release = await r.ensureRelease(PLUGIN_TAG, 'Plugins de Nova PX');
  await r.uploadAsset(release, built.asset.name, built.asset.data);
  const next = pluginLib.upsert(cur, built.entry, built.lock);
  await publishPluginLib(r, next.library, next.staleAssets, `Plugin: ${built.entry.name}${built.entry.locked ? ' (bloqueado)' : ''} (desde el launcher)`);
  pendingPlugin = null;
  return next.library;
});
ipcMain.handle('admin:pluginSetLock', async (_e, id, locked, password) => {
  const r = await requireAdmin();
  const cur = await pluginsNow(r);
  const entry = cur.plugins.find((x) => x.id === id);
  if (!entry) throw new Error('Ese plugin no está en la biblioteca.');
  if (!!locked === entry.locked) return cur;
  const pw = typeof password === 'string' ? password : '';
  const data = await pluginLib.fetchPlugin({ entry, lock: cur.lock, password: pw, download: downloadBuffer });
  const built = pluginLib.buildPlugin({ name: entry.name, description: entry.description, info: entry.info, image: entry.image, creator: entry.creator, links: entry.links, file: entry.file, data, locked: !!locked, password: pw, previousLock: cur.lock, baseUrl: r.downloadBase(PLUGIN_TAG) });
  const release = await r.ensureRelease(PLUGIN_TAG, 'Plugins de Nova PX');
  await r.uploadAsset(release, built.asset.name, built.asset.data);
  const next = pluginLib.upsert(cur, built.entry, built.lock);
  await publishPluginLib(r, next.library, next.staleAssets, `Plugin ${built.entry.name}: ${locked ? 'bloqueado' : 'público'} (desde el launcher)`);
  return next.library;
});
ipcMain.handle('admin:pluginSaveInfo', async (_e, id, fields) => {
  const r = await requireAdmin();
  const next = pluginLib.updateInfo(await pluginsNow(r), String(id), fields || {});
  await publishPluginLib(r, next.library, [], `Plugin ${id}: información (desde el launcher)`);
  return next.library;
});
ipcMain.handle('admin:pluginRemove', async (_e, id) => {
  const r = await requireAdmin();
  const next = pluginLib.remove(await pluginsNow(r), String(id));
  await publishPluginLib(r, next.library, next.staleAssets, `Plugin quitado: ${id} (desde el launcher)`);
  return next.library;
});

/* ---------- servidores de prueba (solo administradores, o todos si features.publicServers) ---------- */
const SERVERS_DIR = path.join(GAME_DIR, 'servidores');
const srvProcs = new Map();
async function srvAllowed() {
  if (remoteCfg.features && remoteCfg.features.publicServers) return true;
  return adminEligible();
}
async function srvGuard() {
  if (!(await srvAllowed())) throw new Error('Los servidores de prueba son solo para administradores.');
}
function srvProc(id) {
  if (!srvProcs.has(id)) {
    const p = new serverMgr.ServerProcess();
    p.on('line', (line) => send('srv:line', { id, line }));
    p.on('exit', (code) => send('srv:exit', { id, code }));
    srvProcs.set(id, p);
  }
  return srvProcs.get(id);
}
const srvJava = (mc, type) => resolveJava({ minecraftVersion: mc }, type === 'forge' || type === 'neoforge' ? type : 'vanilla').then((j) => j || 'java');
ipcMain.handle('app:changelog', () => {
  try { return fs.readFileSync(path.join(app.getAppPath(), 'CHANGELOG.md'), 'utf8').slice(0, 200000); } catch { return ''; }
});
ipcMain.handle('srv:allowed', () => srvAllowed());
ipcMain.handle('srv:types', async () => {
  await srvGuard();
  return Object.entries(serverMgr.TYPES).map(([id, t]) => ({ id, label: t.label, content: serverMgr.contentKinds(id) }));
});
ipcMain.handle('srv:versions', async (_e, type) => { await srvGuard(); return serverMgr.listVersions(String(type)); });
ipcMain.handle('srv:list', async () => {
  await srvGuard();
  return serverMgr.listServers(SERVERS_DIR).map((s) => {
    let eula = false;
    try { eula = /eula\s*=\s*true/i.test(fs.readFileSync(path.join(SERVERS_DIR, s.id, 'eula.txt'), 'utf8')); } catch {}
    return { ...s, eula, running: srvProcs.has(s.id) && srvProcs.get(s.id).running };
  });
});
ipcMain.handle('srv:create', async (_e, o) => {
  await srvGuard();
  const type = String(o && o.type);
  return serverMgr.createServer({
    root: SERVERS_DIR, name: o && o.name, type, mc: String(o && o.mc), ramGb: o && o.ramGb,
    javaFor: (mc) => srvJava(mc, type),
    onStatus: (text) => send('srv:progress', { text }),
    onProgress: (percent) => send('srv:progress', { percent })
  });
});
ipcMain.handle('srv:eula', async (_e, id) => {
  await srvGuard();
  fs.writeFileSync(path.join(serverMgr.serverDir(SERVERS_DIR, id), 'eula.txt'), '# Aceptado por el administrador en Nova PX (https://aka.ms/MinecraftEULA)\neula=true\n');
  return true;
});
ipcMain.handle('srv:start', async (_e, id) => {
  await srvGuard();
  const dir = serverMgr.serverDir(SERVERS_DIR, id);
  const meta = serverMgr.readMeta(dir);
  const java = await srvJava(meta.mc, meta.type);
  srvProc(id).start(java, dir, meta);
  return true;
});
ipcMain.handle('srv:stop', async (_e, id) => { await srvGuard(); serverMgr.serverDir(SERVERS_DIR, id); await srvProc(id).stop(); return true; });
ipcMain.handle('srv:command', async (_e, id, text) => { await srvGuard(); serverMgr.serverDir(SERVERS_DIR, id); srvProc(id).command(text); return true; });
ipcMain.handle('srv:log', async (_e, id) => { await srvGuard(); serverMgr.serverDir(SERVERS_DIR, id); const p = srvProc(id); return { running: p.running, lines: p.lines.slice(-300) }; });
ipcMain.handle('srv:props:get', async (_e, id) => {
  await srvGuard();
  return serverMgr.parseProperties(fs.readFileSync(path.join(serverMgr.serverDir(SERVERS_DIR, id), 'server.properties'), 'utf8'));
});
ipcMain.handle('srv:props:save', async (_e, id, changes) => {
  await srvGuard();
  const f = path.join(serverMgr.serverDir(SERVERS_DIR, id), 'server.properties');
  fs.writeFileSync(f, serverMgr.applyProperties(fs.readFileSync(f, 'utf8'), changes));
  return true;
});
ipcMain.handle('srv:content:search', async (_e, id, kind, query) => {
  await srvGuard();
  const meta = serverMgr.readMeta(serverMgr.serverDir(SERVERS_DIR, id));
  return serverMgr.searchContent({ type: meta.type, mc: meta.mc, kind: String(kind), query });
});
ipcMain.handle('srv:content:install', async (_e, id, kind, projectId, source) => {
  await srvGuard();
  const dir = serverMgr.serverDir(SERVERS_DIR, id);
  return serverMgr.installContent({ dir, meta: serverMgr.readMeta(dir), kind: String(kind), projectId, source: String(source || 'modrinth') });
});
ipcMain.handle('srv:content:list', async (_e, id) => {
  await srvGuard();
  const dir = serverMgr.serverDir(SERVERS_DIR, id);
  return serverMgr.listContent(dir, serverMgr.readMeta(dir));
});
ipcMain.handle('srv:content:remove', async (_e, id, kind, file) => {
  await srvGuard();
  const dir = serverMgr.serverDir(SERVERS_DIR, id);
  serverMgr.removeContent(dir, serverMgr.readMeta(dir), String(kind), String(file));
  return true;
});
ipcMain.handle('srv:plugins:list', async () => {
  await srvGuard();
  const lib = pluginLib.sanitizeLibrary(await loadData('plugins').catch(() => ({})));
  return { plugins: lib.plugins, unlocked: pluginPw.size > 0 };
});
ipcMain.handle('srv:plugins:install', async (_e, id, pluginId, password) => {
  await srvGuard();
  const dir = serverMgr.serverDir(SERVERS_DIR, id);
  const meta = serverMgr.readMeta(dir);
  if (!pluginLib.SERVER_TYPES.includes(meta.type)) throw new Error('Los plugins son para Paper, Purpur y Spigot.');
  const lib = pluginLib.sanitizeLibrary(await loadData('plugins'));
  const entry = lib.plugins.find((x) => x.id === String(pluginId));
  if (!entry) throw new Error('Ese plugin ya no está en la biblioteca.');
  const pw = (typeof password === 'string' && password) || pluginPw.get('lib') || '';
  const buf = await pluginLib.fetchPlugin({ entry, lock: lib.lock, password: pw, download: downloadBuffer });
  if (entry.locked && pw) pluginPw.set('lib', pw);
  fs.mkdirSync(path.join(dir, 'plugins'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'plugins', entry.file), buf);
  return { file: entry.file };
});
ipcMain.handle('srv:export', async (_e, id) => {
  await srvGuard();
  const dir = serverMgr.serverDir(SERVERS_DIR, id);
  const meta = serverMgr.readMeta(dir);
  if (srvProcs.has(id) && srvProcs.get(id).running) throw new Error('Apaga el servidor antes de exportarlo.');
  const res = await dialog.showSaveDialog(mainWindow, { title: 'Guardar el servidor', defaultPath: `${id}.zip`, filters: [{ name: 'Zip', extensions: ['zip'] }] });
  if (res.canceled || !res.filePath) return null;
  const r = serverMgr.exportServer(dir, res.filePath);
  return { file: res.filePath, files: r.files, bytes: r.bytes, name: meta.name };
});
ipcMain.handle('srv:folder', async (_e, id) => { await srvGuard(); const err = await shell.openPath(serverMgr.serverDir(SERVERS_DIR, id)); if (err) throw new Error(err); return true; });
ipcMain.handle('srv:delete', async (_e, id) => {
  await srvGuard();
  const dir = serverMgr.serverDir(SERVERS_DIR, id);
  if (srvProcs.has(id) && srvProcs.get(id).running) throw new Error('Apaga el servidor antes de borrarlo.');
  fs.rmSync(dir, { recursive: true, force: true });
  srvProcs.delete(id);
  return true;
});
app.on('before-quit', () => { for (const p of srvProcs.values()) if (p.running) p.stop(3000); });

ipcMain.handle('admin:status', async () => {
  const eligible = await adminEligible();
  if (!eligible) return { admin: false, eligible: false };
  if (!readAdminToken()) return { admin: false, eligible: true };
  try {
    const c = await gh().check();
    adminChecked = c.canPush;
    const info = await adminPerms();
    return { admin: c.canPush, eligible: true, repo: c.fullName, rol: info ? info.rol : null, permisos: info ? [...info.permisos] : [] };
  } catch (err) {
    return { admin: false, eligible: true, error: err.message };
  }
});
ipcMain.handle('admin:login', async (_e, token) => {
  if (!(await adminEligible())) throw new Error('Tu cuenta no tiene permiso de administrador.');
  const t = cleanStr(token, 300).trim();
  if (!/^[A-Za-z0-9_]{20,300}$/.test(t)) throw new Error('Ese token no tiene el formato de un token de GitHub.');
  const r = new GithubRepo({ ...repoFromConfig(), token: t });
  const c = await r.check();
  if (!c.canPush) throw new Error('Ese token puede ver el repositorio pero no escribir en él. Si es un token fine-grained, dale "Contents: Read and write"; si eres colaborador del repositorio de otra persona, usa un token classic con el permiso public_repo.');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Este equipo no puede guardar el token de forma cifrada, así que no se activa el modo administrador.');
  fs.writeFileSync(ADMIN_FILE, safeStorage.encryptString(t));
  adminToken = t;
  return { admin: true, repo: c.fullName };
});
// Clave del contador de usuarios (la que pusiste como ADMIN_KEY en Cloudflare). Se guarda cifrada, como el token.
const USERS_KEY_FILE = path.join(app.getPath('userData'), 'users.key');
function readUsersKey() {
  try {
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(fs.readFileSync(USERS_KEY_FILE)) : null;
  } catch {
    return null;
  }
}
async function usersCall(method, pathname) {
  if (!(await adminEligible())) throw new Error('Tu cuenta no tiene permiso de administrador.');
  if (!USAGE_URL) throw new Error('Falta la dirección del contador (telemetryUrl en config/launcher.config.json).');
  const key = readUsersKey();
  if (!key) throw new Error('NO_KEY');
  const res = await fetch(`${USAGE_URL}${pathname}`, { method, headers: { Authorization: `Bearer ${key}` } });
  if (res.status === 401) throw new Error('La clave del contador no es correcta.');
  if (!res.ok) throw new Error(`El contador respondió ${res.status}.`);
  return res.json();
}
ipcMain.handle('admin:usersKey', async (_e, key) => {
  if (!(await adminEligible())) throw new Error('Tu cuenta no tiene permiso de administrador.');
  const k = cleanStr(key, 200).trim();
  if (k.length < 16) throw new Error('La clave debe tener al menos 16 caracteres.');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Este equipo no puede guardar la clave de forma cifrada.');
  fs.writeFileSync(USERS_KEY_FILE, safeStorage.encryptString(k));
});
ipcMain.handle('admin:users', async () => {
  const r = await usersCall('GET', '/users');
  const users = (r.users || []).map((u) => ({ id: String(u.id), nick: String(u.nick || ''), premium: !!u.premium, version: String(u.version || ''), os: String(u.os || ''), first: Number(u.first) || 0, last: Number(u.last) || 0, count: Number(u.count) || 0 }));
  return { users, summary: telemetry.summarize(users) };
});
ipcMain.handle('admin:userDelete', async (_e, id) => {
  if (!/^[0-9a-f-]{36}$/.test(String(id))) throw new Error('Id no válido.');
  await usersCall('DELETE', `/users/${id}`);
});
ipcMain.handle('admin:logout', () => {
  fs.rmSync(USERS_KEY_FILE, { force: true });
  adminToken = null;
  fs.rmSync(ADMIN_FILE, { force: true });
  fs.rmSync(SIGN_KEY_FILE, { force: true });
});
ipcMain.handle('admin:load', async () => {
  const r = await requireAdmin();
  const get = async (n) => ((await r.getJson(`data/${n}.json`)) || {}).data;
  return { launcher: remote.sanitize(await get('launcher')), recommended: remote.sanitizeRecommended(await get('recommended')), manifest: (await get('manifest')) || {}, team: (await get('team')) || [], news: (await get('news')) || [], ads: adminLib.sanitizeAds(await get('ads')), events: (await get('events')) || [], admins: (await get('admins')) || [], owners: config.adminOwners || [] };
});
// Apariencia, ajustes, avisos y control remoto: todo en data/launcher.json.
ipcMain.handle('admin:saveLauncher', async (_e, raw) => {
  const r = await requireAdmin();
  const clean = remote.sanitize(raw);
  await r.putJson('data/launcher.json', clean, 'Configuración del launcher actualizada (desde el launcher)');
  remember('launcher', clean);
  remoteCfg = clean;
  send('remote:changed', remoteCfg);
  return clean;
});
ipcMain.handle('admin:saveRecommended', async (_e, list) => {
  const r = await requireAdmin();
  const clean = remote.sanitizeRecommended(list);
  await r.putJson('data/recommended.json', clean, 'Modpacks recomendados actualizados (desde el launcher)');
  remember('recommended', clean);
  return clean;
});
// Historial y "deshacer": versiones anteriores de lo que se publicó (solo archivos seguros de restaurar).
const RESTORABLE = ['launcher', 'news', 'events', 'team', 'recommended', 'ads'];
const restorable = (name) => {
  if (!RESTORABLE.includes(name)) throw new Error('Ese archivo no se puede restaurar desde aquí.');
  return `data/${name}.json`;
};
ipcMain.handle('admin:history', async (_e, name) => {
  const r = await requireAdmin();
  await needFilePerm(name);
  return r.history(restorable(name), 15);
});
ipcMain.handle('admin:restore', async (_e, name, sha) => {
  const r = await requireAdmin();
  await needFilePerm(name);
  const file = restorable(name);
  const old = await r.jsonAt(file, sha);
  const clean = { launcher: remote.sanitize, recommended: remote.sanitizeRecommended, news: adminLib.sanitizeNews, events: adminLib.sanitizeEvents, team: adminLib.sanitizeTeam, ads: adminLib.sanitizeAds }[name](old);
  await r.putJson(file, clean, `Restaurado ${name} a la versión ${String(sha).slice(0, 7)} (desde el launcher)`);
  remember(name === 'recommended' ? 'recommended' : name, clean);
  if (name === 'launcher') { remoteCfg = clean; send('remote:changed', remoteCfg); }
  return clean;
});
// Biblioteca de eventos del panel (borradores y eventos pasados). No la leen los jugadores.
ipcMain.handle('admin:evlibList', async () => {
  const r = await requireAdmin();
  return adminLib.sanitizeEventLibrary((await r.getJson('data/biblioteca-eventos.json') || {}).data);
});
ipcMain.handle('admin:evlibSave', async (_e, list) => {
  const r = await requireAdmin();
  const clean = adminLib.sanitizeEventLibrary(list);
  await r.putJson('data/biblioteca-eventos.json', clean, 'Biblioteca de eventos actualizada (desde el launcher)');
  return clean;
});
ipcMain.handle('admin:saveTeam', async (_e, list) => {
  const r = await requireAdmin();
  const clean = adminLib.sanitizeTeam(list);
  await r.putJson('data/team.json', clean, 'Equipo actualizado (desde el launcher)');
  remember('team', clean);
  return clean;
});
// Dar o quitar permiso: se resuelve el uuid del nick en Mojang (así no sirve un nick prestado).
ipcMain.handle('admin:resolveNick', async (_e, nick) => {
  const n = cleanStr(nick, 16).trim();
  if (!/^[A-Za-z0-9_]{1,16}$/.test(n)) throw new Error('Ese nick no es válido.');
  let found;
  try {
    found = await fetchJson(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(n)}`);
  } catch {
    throw new Error('No se pudo comprobar ese nick. Debe ser una cuenta premium y necesitas internet.');
  }
  if (!found || !found.id) throw new Error('Ese nick no es una cuenta premium.');
  return { nick: found.name, uuid: found.id };
});
/* ---------- cambios de nick y advertencias (solo administrador) ---------- */
const nickLib = require('./lib/nicks');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function mojangByNick(n) {
  try { const f = await fetchJson(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(n)}`); return f && f.id ? { uuid: String(f.id).toLowerCase(), name: f.name } : { missing: true }; } catch (e) { return /HTTP (404|204)|Unexpected end of JSON/i.test(String(e && e.message)) ? { missing: true } : null; }
}
async function mojangByUuid(uuid) {
  try { const f = await fetchJson(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`); return f && f.name ? { uuid, name: f.name } : null; } catch { return null; }
}
const readAdminJson = async (r, n, fb) => { try { const g = await r.getJson(`data/${n}.json`); return g && g.data != null ? g.data : fb; } catch { return fb; } };
ipcMain.handle('admin:warnings', async () => {
  const r = await requireAdmin();
  return nickLib.sanitizeWarnings(await readAdminJson(r, 'warnings', []));
});
// Revisa los nicks que salen en eventos y equipo. Si alguien cambió de nick, se actualiza al nuevo (nick y skin) y queda un aviso para que un admin lo revise.
ipcMain.handle('admin:nickScan', async () => {
  const r = await requireAdmin();
  const events = await readAdminJson(r, 'events', []);
  const team = await readAdminJson(r, 'team', []);
  const nicks = nickLib.sanitizeMap(await readAdminJson(r, 'nicks', { map: {} }));
  let warnings = nickLib.sanitizeWarnings(await readAdminJson(r, 'warnings', []));
  const list = nickLib.scanOrder(nickLib.collect(events, team), nicks.map).slice(0, 150);
  let changed = false; let added = 0; let failed = 0;
  const now = new Date().toISOString();
  const warn = (w) => { warnings.unshift({ id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: now, status: 'open', ...w }); added++; };
  for (const it of list) {
    const key = it.nick.toLowerCase();
    const known = nicks.map[key];
    if (known) {
      const cur = await mojangByUuid(known.uuid);
      if (!cur) { failed++; await sleep(150); continue; }
      nicks.map[key] = { ...known, at: Date.now() }; changed = true;
      if (cur.name.toLowerCase() !== known.name.toLowerCase()) {
        warn({ kind: 'rename', nick: it.nick, from: known.name, to: cur.name, where: it.where });
        nicks.map[key] = { ...nicks.map[key], name: cur.name };
      }
    } else {
      const f = await mojangByNick(it.nick);
      if (!f) failed++;
      else if (f.missing) {
        if (!warnings.some((w) => w.kind === 'missing' && w.nick.toLowerCase() === key && w.status === 'open')) { warn({ kind: 'missing', nick: it.nick, where: it.where }); changed = true; }
      } else { nicks.map[key] = { uuid: f.uuid, name: f.name, at: Date.now() }; changed = true; }
    }
    await sleep(180);
  }
  if (changed) {
    warnings = nickLib.trimWarnings(warnings);
    await r.putJson('data/nicks.json', nicks, 'Nicks actualizados (revisión automática desde el launcher)');
    if (added) { await r.putJson('data/warnings.json', warnings, 'Advertencias de nicks (desde el launcher)'); remember('nicks', nicks); }
  }
  return { warnings, scanned: list.length, failed, added };
});
// Acción sobre un aviso: ok (revisado), hide (quitar a esa persona del launcher) o assign (para "no encontrado": indicar su nick actual).
ipcMain.handle('admin:warningAct', async (_e, id, action, value) => {
  const r = await requireAdmin();
  let warnings = nickLib.sanitizeWarnings(await readAdminJson(r, 'warnings', []));
  const nicks = nickLib.sanitizeMap(await readAdminJson(r, 'nicks', { map: {} }));
  const w = warnings.find((x) => x.id === cleanStr(id, 40));
  if (!w) throw new Error('Ese aviso ya no existe.');
  const key = w.nick.toLowerCase();
  if (action === 'ok') w.status = 'ok';
  else if (action === 'hide') {
    const e = nicks.map[key];
    if (e) nicks.map[key] = { ...e, hidden: true };
    else {
      const f = await mojangByNick(w.nick);
      if (f && f.uuid) nicks.map[key] = { uuid: f.uuid, name: f.name, hidden: true };
      else throw new Error('No se pudo ocultar: ese nick no se encontró en Mojang. Asígnale primero su nick actual.');
    }
    w.status = 'hidden';
  } else if (action === 'assign') {
    const n = cleanStr(value, 16).trim();
    if (!nickLib.NICK_RE.test(n)) throw new Error('Ese nick no es válido.');
    const f = await mojangByNick(n);
    if (!f || !f.uuid) throw new Error('Ese nick no es una cuenta premium.');
    nicks.map[key] = { uuid: f.uuid, name: f.name };
    w.status = 'assigned'; w.to = f.name;
  } else throw new Error('Acción no válida.');
  warnings = nickLib.trimWarnings(warnings);
  await r.putJson('data/nicks.json', nicks, 'Nicks actualizados (desde el launcher)');
  await r.putJson('data/warnings.json', warnings, 'Advertencias de nicks (desde el launcher)');
  remember('nicks', nicks);
  return { warnings };
});
ipcMain.handle('admin:saveAdmins', async (_e, list) => {
  const r = await requireAdmin();
  const clean = adminLib.sanitizeAdmins(list);
  await r.putJson('data/admins.json', clean, 'Permisos de administrador actualizados (desde el launcher)');
  return clean;
});
ipcMain.handle('admin:saveEvents', async (_e, list) => {
  const r = await requireAdmin();
  const clean = adminLib.sanitizeEvents(list);
  await r.putJson('data/events.json', clean, 'Historial de eventos actualizado (desde el launcher)');
  remember('events', clean);
  return clean;
});
// Elige una imagen, la valida por sus bytes (máx. 3 MB) y la sube a data/images del repositorio.
async function uploadAdminImage(r, label, buf) {
  if (buf.length > adminLib.MAX_IMAGE) throw new Error('La imagen pesa más de 3 MB. Redúcela y vuelve a intentarlo.');
  const kind = adminLib.imageKind(buf);
  if (!kind) throw new Error('Ese archivo no es una imagen PNG, JPG o WEBP válida.');
  const name = `${modpacks.slugify(cleanStr(label, 60) || 'evento')}-${Date.now().toString(36)}.${kind}`;
  send('modpack:progress', { text: 'Subiendo la imagen…' });
  await r.putFile(`data/images/${name}`, buf, `Imagen del evento: ${name} (desde el launcher)`);
  const mime = kind === 'jpg' ? 'image/jpeg' : `image/${kind}`;
  return { path: `images/${name}`, preview: `data:${mime};base64,${buf.toString('base64')}` };
}
// Con opts.crop la imagen no se sube todavía: se devuelve para que el administrador la recorte (Instagram, X…) y luego se sube con admin:uploadImage.
ipcMain.handle('admin:pickImage', async (_e, label, opts) => {
  const r = await requireAdmin();
  const res = await dialog.showOpenDialog(mainWindow, { title: 'Elige la imagen', properties: ['openFile'], filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
  if (res.canceled) return null;
  const buf = fs.readFileSync(res.filePaths[0]);
  if (buf.length > 12 * 1024 * 1024) throw new Error('La imagen pesa demasiado (máx. 12 MB para recortarla).');
  const kind = adminLib.imageKind(buf);
  if (!kind) throw new Error('Ese archivo no es una imagen PNG, JPG o WEBP válida.');
  if (opts && opts.crop) return { raw: `data:${kind === 'jpg' ? 'image/jpeg' : `image/${kind}`};base64,${buf.toString('base64')}`, kind };
  return uploadAdminImage(r, label, buf);
});
ipcMain.handle('admin:uploadImage', async (_e, label, dataUrl) => {
  const r = await requireAdmin();
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('La imagen recortada no es válida.');
  return uploadAdminImage(r, label, Buffer.from(m[2], 'base64'));
});

/* ---------- PX flotante sobre Minecraft (opcional, la activa el usuario) ---------- */
const overlayLib = require('./lib/overlay');
let overlayWin = null;
let overlayKeep = null;
// En pantalla completa el juego pasa por encima de la ventana flotante: se vuelve a subir cada segundo mientras esté visible.
function overlayKeepOnTop() {
  if (overlayKeep) return;
  overlayKeep = setInterval(() => {
    if (!overlayWin || overlayWin.isDestroyed() || !overlayWin.isVisible()) return;
    try {
      const d = require('electron').screen.getDisplayMatching(overlayWin.getBounds());
      overlayWin.setBounds(overlayLib.bounds(d.bounds));
      overlayWin.setAlwaysOnTop(true, 'screen-saver');
      overlayWin.moveTop();
    } catch {}
  }, 1000);
}
function overlayShow(p) {
  const { screen } = require('electron');
  const d = overlayLib.sanitize(p);
  if (!overlayWin || overlayWin.isDestroyed()) {
    const b = overlayLib.bounds(screen.getPrimaryDisplay().workArea);
    overlayWin = new BrowserWindow({
      ...b, transparent: true, frame: false, resizable: false, movable: false, focusable: false, skipTaskbar: true, hasShadow: false, show: false, alwaysOnTop: true,
      webPreferences: { preload: path.join(__dirname, 'renderer', 'overlay-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
    });
    overlayWin.setAlwaysOnTop(true, 'screen-saver');
    overlayWin.setIgnoreMouseEvents(true, { forward: true }); // los clics pasan al juego
    lockWindow(overlayWin.webContents);
    overlayWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    overlayWin.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));
    overlayWin.once('ready-to-show', () => { if (overlayWin && !overlayWin.isDestroyed()) overlayWin.showInactive(); });
    overlayWin.on('closed', () => { overlayWin = null; if (overlayKeep) { clearInterval(overlayKeep); overlayKeep = null; } });
    overlayKeepOnTop();
    overlayWin.webContents.once('did-finish-load', () => overlayWin && overlayWin.webContents.send('overlay:update', d));
    return;
  }
  if (!overlayWin.isVisible()) overlayWin.showInactive();
  overlayWin.webContents.send('overlay:update', d);
}
function overlayHide() { if (overlayWin && !overlayWin.isDestroyed()) overlayWin.close(); overlayWin = null; }
ipcMain.handle('overlay:show', (_e, p) => { overlayShow(p); return true; });
ipcMain.handle('overlay:hide', () => { overlayHide(); return true; });
app.on('before-quit', overlayHide);
/* ---------- avisos a Discord y atajo a X (solo administrador) ---------- */
const HOOK_FILE = path.join(app.getPath('userData'), 'discord.hook');
function readHook() {
  try { return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(fs.readFileSync(HOOK_FILE)) : null; } catch { return null; }
}
ipcMain.handle('social:status', async () => { await requireAdmin(); return { hasWebhook: !!readHook() }; });
ipcMain.handle('social:setWebhook', async (_e, url) => {
  await requireAdmin();
  const u = String(url || '').trim();
  if (!social.validWebhook(u)) throw new Error('Esa no parece una dirección de webhook de Discord (empieza con https://discord.com/api/webhooks/).');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Este equipo no puede guardar el webhook de forma cifrada.');
  fs.writeFileSync(HOOK_FILE, safeStorage.encryptString(u));
  return true;
});
ipcMain.handle('social:clearWebhook', async () => { await requireAdmin(); try { fs.unlinkSync(HOOK_FILE); } catch {} return true; });
ipcMain.handle('social:post', async (_e, p = {}) => {
  await requireAdmin();
  const hook = readHook();
  if (!hook) throw new Error('Primero guarda el webhook de Discord en Control.');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    return await social.post((u, o) => fetch(u, { ...o, signal: ctl.signal }), hook, social.buildPayload({
      title: cleanStr(p.title, 250), text: cleanStr(p.text, 3500), image: cleanStr(p.image, 500), link: cleanStr(p.link, 500), footer: 'Enviado desde el launcher de Nova PX'
    }));
  } finally { clearTimeout(timer); }
});
ipcMain.handle('social:xShare', async (_e, p = {}) => {
  await requireAdmin();
  await shell.openExternal(social.xShareUrl(cleanStr(p.text, 260), cleanStr(p.link, 500)));
  return true;
});

ipcMain.handle('admin:saveAds', async (_e, list) => {
  const r = await requireAdmin();
  const clean = adminLib.sanitizeAds(list);
  await r.putJson('data/ads.json', clean, 'Publicidad actualizada (desde el launcher)');
  remember('ads', clean);
  return clean;
});
// Vistas y clics de cada anuncio: solo un contador anónimo (id del anuncio), sin nick ni id de instalación.
const adSeen = new Set();
ipcMain.handle('ads:track', async (_e, id, kind) => {
  const adId = cleanStr(id, 40);
  if (!USAGE_URL || !/^[a-z0-9-]{1,40}$/.test(adId) || !['v', 'c'].includes(kind)) return false;
  if (!readSettings().shareUsage || !remoteCfg.features.usageCounter) return false;
  if (kind === 'v') { if (adSeen.has(adId)) return true; adSeen.add(adId); }
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 5000);
    await fetch(`${USAGE_URL}/ads/track`, { method: 'POST', body: JSON.stringify({ id: adId, k: kind }), headers: { 'Content-Type': 'application/json' }, signal: ctl.signal });
    clearTimeout(t);
    return true;
  } catch { return false; }
});
ipcMain.handle('admin:adsStats', async () => {
  const r = await usersCall('GET', '/ads/stats');
  const out = {};
  for (const [id, v] of Object.entries(r.ads || {})) out[String(id).slice(0, 40)] = { v: Number(v.v) || 0, c: Number(v.c) || 0 };
  return out;
});
ipcMain.handle('admin:saveNews', async (_e, list) => {
  const r = await requireAdmin();
  const clean = adminLib.sanitizeNews(list);
  await r.putJson('data/news.json', clean, 'Noticias actualizadas (desde el launcher)');
  remember('news', clean);
  return clean;
});

function enabledMods(root) {
  const dir = path.join(root, 'mods');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.jar$/i.test(f)).sort() : [];
  return { dir, files, bytes: files.reduce((n, f) => n + fs.statSync(path.join(dir, f)).size, 0) };
}
ipcMain.handle('admin:packSummary', (_e, id) => {
  const { entry, root } = packRoot(id);
  const m = enabledMods(root);
  return { title: entry.title, emoji: entry.emoji || '', icon: entry.icon || '', mcVersion: entry.mcVersion, loader: (entry.loader && entry.loader.type) || 'vanilla', mods: m.files.length, bytes: m.bytes };
});

// Publica el evento completo en un solo paso: datos del evento + (opcional) los mods activos de una instancia, cifrados.
let publishing = false;
ipcMain.handle('admin:publishEvent', async (_e, p = {}) => {
  if (publishing) throw new Error('Ya se está publicando.');
  if (launching) throw new Error('Cierra Minecraft antes de publicar.');
  publishing = true;
  const progress = (text, done, total) => send('modpack:progress', { text, done, total });
  try {
    const r = await requireAdmin();
    const cur = ((await r.getJson('data/manifest.json')) || {}).data || {};
    const form = { ...(p.form || {}) };
    let pack = null;
    if (p.id) {
      pack = packRoot(p.id);
      form.minecraftVersion = pack.entry.mcVersion;
      form.loader = { type: pack.entry.loader.type, version: pack.entry.loader.version || '' };
    }
    const merged = adminLib.mergeManifest(cur, form);
    let result = { mods: 0 };
    if (pack) {
      const { dir, files } = enabledMods(pack.root);
      if (!files.length) throw new Error('Esa instancia no tiene mods activos para publicar.');
      const eventId = (merged.event && merged.event.id) || modpacks.slugify(merged.event.name || 'evento');
      const tag = `evento-${eventId}`.slice(0, 60);
      progress('Cifrando los mods…');
      // config/ de la instancia (FancyMenu, layouts…), hasta 40 MB, sin logs.
      const extras = [];
      let extraBytes = 0;
      const walk = (abs, rel) => {
        for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
          const a = path.join(abs, e.name), r = `${rel}/${e.name}`;
          if (e.isDirectory()) walk(a, r);
          else if (e.isFile() && !/\.(log|lock|tmp)$/i.test(e.name)) {
            const data = fs.readFileSync(a);
            extraBytes += data.length;
            if (extraBytes > 40 * 1024 * 1024) throw new Error('La carpeta config de la instancia pesa más de 40 MB.');
            extras.push({ rel: r, data });
          }
        }
      };
      try { walk(path.join(pack.root, 'config'), 'config'); } catch (err) { if (err && err.code !== 'ENOENT') throw err; }
      const built = adminLib.buildProtectedEvent({
        extras,
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
      result = { mods: files.length, config: built.extraCount, tag, sameSalt: built.reusedSalt };
    }
    progress('Publicando datos del evento…');
    await r.putJson('data/manifest.json', merged, `Evento: ${merged.event.name}${pack ? `, ${result.mods} mods` : ''} (desde el launcher)`);
    remember('manifest', merged);
    progress('Listo');
    return { ...result, name: merged.event.name, active: !!merged.event.active };
  } finally {
    publishing = false;
  }
});

/* Contraseña de instalación (administrador): comprobarla, generarla y, si el administrador quiere, recordarla cifrada en este equipo. */
const ADMIN_PASS_FILE = () => path.join(app.getPath('userData'), 'admin-pass.bin');
ipcMain.handle('admin:passwordCheck', async (_e, password) => {
  const r = await requireAdmin();
  const cur = ((await r.getJson('data/manifest.json')) || {}).data || {};
  if (!pcrypto.isEnvelope(cur.protected)) return { state: 'none' };
  return { state: adminLib.sameAsBefore(cur.protected, typeof password === 'string' ? password : '') ? 'ok' : 'wrong' };
});
ipcMain.handle('admin:passwordSaved', async () => {
  await requireAdmin();
  if (!safeStorage.isEncryptionAvailable()) return { available: false, password: '' };
  try { return { available: true, password: safeStorage.decryptString(fs.readFileSync(ADMIN_PASS_FILE())) }; } catch { return { available: true, password: '' }; }
});
ipcMain.handle('admin:passwordRemember', async (_e, p = {}) => {
  await requireAdmin();
  if (!p.remember) { try { fs.unlinkSync(ADMIN_PASS_FILE()); } catch {} return false; }
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Este equipo no permite guardar la contraseña de forma segura.');
  const pw = typeof p.password === 'string' ? p.password : '';
  if (pcrypto.passwordProblem(pw)) throw new Error(pcrypto.passwordProblem(pw));
  fs.writeFileSync(ADMIN_PASS_FILE(), safeStorage.encryptString(pw));
  return true;
});

// Cambia solo el estado del evento (Próximamente / Activo / Finalizado) sin volver a subir mods.
ipcMain.handle('admin:setEventState', async (_e, state) => {
  const st = ['soon', 'active', 'ended'].includes(state) ? state : null;
  if (!st) throw new Error('Estado no válido.');
  const r = await requireAdmin();
  const cur = ((await r.getJson('data/manifest.json')) || {}).data || {};
  const merged = adminLib.mergeManifest(cur, { status: st });
  await r.putJson('data/manifest.json', merged, `Estado del evento: ${st} (desde el launcher)`);
  remember('manifest', merged);
  return { status: st, name: (merged.event && merged.event.name) || '' };
});

/* ---------- importar de otros launchers y exportar .novapx ---------- */

function packEntryFrom(id, title, r, extra = {}) {
  return {
    id, provider: 'imported', projectId: '', versionId: '', version: '', title: cleanStr(title, 60) || 'Modpack importado', icon: '',
    emoji: '', mcVersion: r.mcVersion, loader: r.loader, installedAt: new Date().toISOString(), skipped: r.skipped || [], blocked: r.blocked || [], settings: {}, notes: '', ...extra
  };
}

// Los archivos .mrpack/.novapx no traen imagen: si Modrinth tiene un modpack con el mismo nombre, se usa su icono.
const normName = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
async function lookupModrinthIcon(title) {
  const q = normName(title);
  if (q.length < 3) return '';
  try {
    const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(String(title).slice(0, 80))}&facets=${encodeURIComponent('[["project_type:modpack"]]')}&limit=5`;
    const r = await apiRequest(url);
    const hit = (r.hits || []).find((h) => normName(h.title) === q) || (r.hits || []).find((h) => { const n = normName(h.title); return n.length >= 5 && q.length >= 5 && (n.startsWith(q) || q.startsWith(n)); });
    return hit && /^https:\/\//i.test(hit.icon_url || '') ? String(hit.icon_url).slice(0, 300) : '';
  } catch { return ''; }
}
async function backfillIcons() {
  const list = readModpacks();
  let changed = false;
  for (const e of list) {
    if (e.icon || e.emoji || e.iconTried || (e.provider !== 'imported' && e.provider !== 'copy')) continue;
    e.iconTried = true;
    changed = true;
    e.icon = await lookupModrinthIcon(e.title);
  }
  if (changed) { writeModpacks(list); send('modpacks:changed', {}); }
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
    const label = cleanStr(info.name || path.basename(src), 40);
    progress(`Copiando ${label}…`);
    await importers.copyFolderAsync(info.contentDir, instanceDir(GAME_DIR, { event: { id } }),
      (done, total) => progress(`Copiando ${label} (${done} de ${total} archivos)…`, done, total));
    const entry = packEntryFrom(id, info.name || path.basename(src), info);
    // Imagen: la de la instancia (CurseForge) o, si no hay, un modpack de Modrinth con el mismo nombre.
    entry.icon = info.icon || await lookupModrinthIcon(entry.title);
    entry.iconTried = true;
    return entry;
  }
  if (st.size > 1.5 * 1024 ** 3) throw new Error('Ese archivo es demasiado grande para importarlo.');
  const buffer = fs.readFileSync(src);
  const kind = importers.detectZip(readZip(buffer));
  if (!kind) throw new Error('No reconozco ese archivo. Acepto .novapx, .mrpack (Modrinth), .zip de CurseForge e instancias exportadas de Prism/MultiMC (.zip).');
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
      const cf = providerFor('curseforge');
      r = await modpacks.installCurse({ buffer, root, resolveFiles: (f) => cf.resolveFiles(f), download, onProgress: onFile });
    }
    else r = importers.installPrism({ buffer, root });
    writeBaseSnapshot(root);
    const entry = packEntryFrom(tmpId, r.name, r, extra);
    if (!entry.icon && !entry.emoji) { entry.icon = await lookupModrinthIcon(entry.title); entry.iconTried = true; }
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

// Instancias de otros launchers detectadas en sus carpetas habituales (solo lectura).
let lastLauncherScan = [];
ipcMain.handle('launchers:scan', async () => {
  lastLauncherScan = require('./lib/launchers').scan();
  return lastLauncherScan.map((x) => ({ launcher: x.launcher, name: x.name, dir: x.dir, mcVersion: x.mcVersion, loader: x.loader, unsupported: x.unsupported, mods: x.mods }));
});
// Importa varias de una vez. Solo acepta carpetas que salieron del escaneo anterior.
ipcMain.handle('launchers:import', async (_e, dirs) => {
  if (installingPack) throw new Error('Ya se está instalando un modpack.');
  if (launching) throw new Error('Cierra Minecraft antes de importar.');
  const allowed = new Set(lastLauncherScan.map((x) => x.dir));
  const want = (Array.isArray(dirs) ? dirs : []).filter((d) => typeof d === 'string' && allowed.has(d)).slice(0, 40);
  if (!want.length) throw new Error('No hay nada seleccionado.');
  installingPack = true;
  const ok = [], failed = [];
  try {
    for (const d of want) {
      try {
        const entry = await importFromPath(d);
        writeModpacks([...readModpacks(), entry]);
        ok.push(entry.title);
      } catch (err) { failed.push({ name: path.basename(d), error: String(err && err.message || err) }); }
    }
    send('modpack:progress', { text: 'Listo' });
    send('modpacks:changed', {});
    return { ok, failed };
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
  const base = readBase(root);
  const list = content.buildContentList(items, byHash, projects).map((it) => ({ ...it, base: base.has(`${it.type}:${String(it.file).replace(/\.disabled$/i, '')}`) }));
  return { items: list, offline };
});

ipcMain.handle('instance:toggle', (_e, p = {}) => {
  assertEditable();
  const { root } = packRoot(p.id);
  return content.toggleContent(root, typeOf(p.type), cleanStr(p.file, 200));
});
ipcMain.handle('instance:remove', (_e, p = {}) => {
  assertEditable();
  const { root } = packRoot(p.id);
  if (isBase(root, typeOf(p.type), cleanStr(p.file, 200))) throw new Error('Eso viene con el modpack y está protegido. Instala contenido extra aparte si quieres cambiar algo.');
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
    throw new Error('Este modpack es Vanilla (sin Fabric, Forge ni NeoForge), así que no admite mods.');
  }
  return { entry, root, type, loader: entry.loader && entry.loader.type };
}
ipcMain.handle('instance:search', async (_e, p = {}) => {
  const t = searchTarget(p);
  return content.searchContent(apiRequest, { type: t.type, mc: t.entry.mcVersion, loader: t.loader, query: cleanStr(p.query, 80), offset: p.offset });
});
// Explorar contenido suelto (mods, texturas, shaders) sin elegir aún la instancia.
ipcMain.handle('content:search', async (_e, p = {}) => {
  const type = typeOf(p.type);
  const loader = ['fabric', 'forge', 'neoforge', 'quilt'].includes(p.loader) ? p.loader : '';
  const mc = /^[0-9][0-9a-zA-Z.\-]{0,20}$/.test(String(p.mc || '')) ? String(p.mc) : '';
  return content.searchContent(apiRequest, { type, mc, loader, query: cleanStr(p.query, 80), offset: Math.max(0, Math.floor(Number(p.offset) || 0)), sort: cleanStr(p.sort, 12) });
});
ipcMain.handle('instance:install', async (_e, p = {}) => {
  assertEditable();
  const t = searchTarget(p);
  const progress = (text) => send('modpack:progress', { text });
  try {
    return await content.installFromModrinth({
      request: apiRequest, download: (u) => downloadBuffer(u), root: t.root, type: t.type,
      projectId: cleanStr(p.projectId, 40), mc: t.entry.mcVersion, loader: t.loader, onStatus: progress
    });
  } finally {
    progress('Listo'); // sin esto el aviso de abajo a la derecha se quedaba colgado
  }
});

function ownPackRoot(id) {
  const t = packRoot(id);
  if (!packs.isOwnPack(t.entry)) throw new Error('Solo puedes hacer esto en los modpacks que creaste tú.');
  if (launching) throw new Error('Cierra Minecraft antes de cambiar los mundos.');
  return t;
}
ipcMain.handle('instance:worldDuplicate', (_e, p = {}) => packs.duplicateWorld(ownPackRoot(p.id).root, cleanStr(p.world, 200)));
ipcMain.handle('instance:worldDelete', (_e, p = {}) => packs.deleteWorld(ownPackRoot(p.id).root, cleanStr(p.world, 200)));
const worldLib = require('./lib/worlds');
ipcMain.handle('instance:worlds', (_e, id) => worldLib.listWorlds(path.join(packRoot(id).root, 'saves')).sort((a, b) => b.lastPlayed - a.lastPlayed));
ipcMain.handle('instance:openSaves', async (_e, id) => {
  const dir = path.join(packRoot(id).root, 'saves');
  fs.mkdirSync(dir, { recursive: true });
  await shell.openPath(dir);
});
// Mundos que hay en otros launchers (Minecraft oficial, Prism, MultiMC, Modrinth App, CurseForge App…).
ipcMain.handle('instance:worldSources', () => worldLib.findSources().slice(0, 300).map((s) => ({ launcher: s.launcher, instance: s.instance, name: s.name, dir: s.dir, lastPlayed: s.lastPlayed, version: s.version, gameMode: s.gameMode })));
// Importa un mundo detectado (solo si su carpeta está en la lista actual de mundos de otros launchers).
ipcMain.handle('instance:worldImport', (_e, p = {}) => {
  const { root } = ownPackRoot(p.id);
  const dir = path.resolve(cleanStr(p.dir, 1000));
  if (!worldLib.findSources().some((s) => path.resolve(s.dir) === dir)) throw new Error('Ese mundo ya no está disponible.');
  return worldLib.importFolder(dir, root);
});
// Importa desde un archivo .zip o una carpeta que elige el usuario.
ipcMain.handle('instance:worldImportPick', async (_e, p = {}) => {
  const { root } = ownPackRoot(p.id);
  const res = await dialog.showOpenDialog(mainWindow, p.kind === 'folder'
    ? { title: 'Elige la carpeta del mundo', properties: ['openDirectory'] }
    : { title: 'Elige el mundo (.zip)', properties: ['openFile'], filters: [{ name: 'Mundo comprimido', extensions: ['zip'] }] });
  if (res.canceled || !res.filePaths[0]) return null;
  return p.kind === 'folder' ? worldLib.importFolder(res.filePaths[0], root) : worldLib.importZip(res.filePaths[0], root);
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
    // Un evento finalizado no avisa aunque su fecha siga puesta.
    if (ev.status === 'ended') return;
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
// Paquetes de idioma: incluidos (renderer/lang) + los que el usuario deje en la carpeta "idiomas".
const LANG_DIR = path.join(app.getPath('userData'), 'idiomas');
const loadLangs = () => langLib.loadAll(path.join(__dirname, 'renderer', 'lang'), LANG_DIR);
ipcMain.handle('lang:list', () => [...loadLangs().values()].map((l) => ({ code: l.code, name: l.name, author: l.author, builtin: l.builtin })));
ipcMain.handle('lang:get', (_e, code) => loadLangs().get(String(code || '')) || null);
ipcMain.handle('lang:openFolder', async () => {
  fs.mkdirSync(LANG_DIR, { recursive: true });
  const example = path.join(LANG_DIR, 'ejemplo-plantilla.json.txt');
  if (!fs.existsSync(example)) {
    fs.writeFileSync(example, JSON.stringify({
      code: 'fr', name: 'Français', author: 'Tu nombre',
      strings: { Inicio: 'Accueil', Ajustes: 'Paramètres', Jugar: 'Jouer' },
      patterns: [{ match: '^(\\d+) de (\\d+) modpacks?$', to: '$1 sur $2 modpacks' }]
    }, null, 2));
  }
  await shell.openPath(LANG_DIR);
});

ipcMain.handle('settings:save', (_e, s) => {
  const clean = cleanSettings({ ...readSettings(), ...s, playSeconds: readSettings().playSeconds });
  writeSettings(clean);
  applyDiscordSetting();
  return clean;
});

// Cuánto ocupa cada parte de la carpeta del juego (instancias, versiones, librerías…). Recorre con tope para no tardar.
async function folderSize(dir, budget = { n: 60000 }) {
  let total = 0;
  let entries;
  try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return 0; }
  for (const e of entries) {
    if (budget.n-- <= 0) return total;
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) total += await folderSize(p, budget);
    else { try { total += (await fs.promises.stat(p)).size; } catch {} }
  }
  return total;
}
ipcMain.handle('system:storage', async () => {
  let names = [];
  try { names = (await fs.promises.readdir(GAME_DIR, { withFileTypes: true })).filter((e) => e.isDirectory() && !e.isSymbolicLink()).map((e) => e.name); } catch {}
  const out = [];
  for (const n of names) out.push({ name: n, bytes: await folderSize(path.join(GAME_DIR, n)) });
  return out.sort((a, b) => b.bytes - a.bytes).slice(0, 8);
});

// «Sincronizar perfiles»: quita los ajustes propios (RAM, ventana, Java) de todos los perfiles para que usen los globales.
ipcMain.handle('modpacks:syncSettings', () => {
  const list = readModpacks();
  let n = 0;
  for (const e of list) if (e.settings && Object.keys(e.settings).length) { const { account, ...rest } = e.settings; n++; e.settings = account ? { account } : {}; void rest; }
  writeModpacks(list);
  return { changed: n };
});

ipcMain.handle('system:info', () => ({
  totalRamGb: Math.max(2, Math.floor(os.totalmem() / 1073741824)),
  freeRamGb: Math.max(0, Math.floor(os.freemem() / 1073741824)),
  gameDir: GAME_DIR,
  platform: process.platform
}));

// Estado que la interfaz recupera al abrirse (también cuando la ventana se vuelve a abrir tras jugar).
ipcMain.handle('win:overlay', (_e, c = {}) => {
  if (process.platform !== 'win32' || !mainWindow || mainWindow.isDestroyed()) return false;
  const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? v : d);
  try { mainWindow.setTitleBarOverlay({ color: hex(c.color, '#0d0f16'), symbolColor: hex(c.symbol, '#e8eaf2'), height: 52 }); return true; } catch { return false; }
});

ipcMain.handle('app:state', async () => {
  if (restoring) await Promise.race([restoring, new Promise((r) => setTimeout(r, 15000))]);
  return {
  session: sessionPublic(),
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

// Estado del servidor de un modpack: se lee de su servers.dat. Nunca se devuelve la dirección, solo si está activo.
const packServerCache = new Map();
ipcMain.handle('modpacks:serverStatus', async (_e, id) => {
  const entry = readModpacks().find((x) => x.id === cleanStr(id, 60));
  if (!entry) return { found: false };
  const srv = serversLib.findPackServer(instanceDir(GAME_DIR, { event: { id: entry.id } }));
  if (!srv) return { found: false };
  const key = `${srv.host}:${srv.port}`;
  const hit = packServerCache.get(key);
  if (hit && Date.now() - hit.at < 60000) return hit.value;
  let value;
  try {
    const data = await fetchJson(`https://api.mcsrvstat.us/3/${encodeURIComponent(srv.port === 25565 ? srv.host : key)}`);
    value = { found: true, online: !!data.online, players: data.players ? { online: data.players.online, max: data.players.max } : null };
  } catch {
    value = { found: true, online: false, unknown: true };
  }
  packServerCache.set(key, { at: Date.now(), value });
  return value;
});

// Estado del servidor del evento (consulta pública a mcsrvstat.us).
ipcMain.handle('server:status', async () => {
  try {
    const manifest = await loadData('manifest');
    // La IP sale del servers.dat del modpack del evento y nunca se devuelve a la interfaz.
    const found = serversLib.findPackServer(instanceDir(GAME_DIR, manifest));
    if (!found) return { configured: false };
    hideHost(found.host);
    const target = found.port && Number(found.port) !== 25565 ? `${found.host}:${found.port}` : found.host;
    const data = await fetchJson(`https://api.mcsrvstat.us/3/${encodeURIComponent(target)}`);
    return {
      configured: true,
      online: !!data.online,
      players: data.players ? { online: data.players.online, max: data.players.max } : null,
      version: data.version || null
    };
  } catch {
    return { configured: true, online: false, unknown: true };
  }
});

/* ---------- IPC: tema y fondo: ahora en lib/main/ipc-tema-y-fondo.js ---------- */
require('./lib/main/ipc-tema-y-fondo')({ fs, BACKGROUND_FILE });

/* ---------- IPC: cuentas: ahora en lib/main/ipc-cuentas.js ---------- */
const { makeOfflineSession } = require('./lib/main/ipc-cuentas')({ crypto });

/* ---------- sesión guardada (para no iniciar sesión cada vez) ---------- */

// Varias cuentas: accounts.json guarda la lista y cuál está activa. Cuenta no premium: solo el nick.
// Premium: el token de renovación de Microsoft, cifrado con el almacén del sistema (nunca en texto plano).
// Si el sistema no tiene almacén seguro, las premium no se guardan.
const MAX_ACCOUNTS = 12;
const accountId = (a) => (a.mode === 'offline' ? `off:${String(a.name).toLowerCase()}` : String(a.uuid || '').replace(/-/g, ''));
function readAccounts() {
  try {
    const d = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
    if (d && Array.isArray(d.list)) {
      const list = d.list.filter((a) => a && a.id && ['offline', 'premium'].includes(a.mode) && /^[A-Za-z0-9_]{3,16}$/.test(String(a.name))).slice(0, MAX_ACCOUNTS);
      return { active: String(d.active || ''), list };
    }
  } catch {}
  return { active: '', list: [] };
}
function writeAccounts(data) {
  try {
    fs.mkdirSync(path.dirname(ACCOUNTS_FILE), { recursive: true });
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(data));
  } catch {}
}
// Guarda (o actualiza) la cuenta de la sesión actual y la marca como activa. `data`: { refresh, at } si es premium.
function saveAccount(data) {
  try {
    if (!session) return;
    const db = readAccounts();
    const id = accountId(session);
    if (!id) return;
    let entry;
    if (session.mode === 'offline') entry = { id, mode: 'offline', name: session.name };
    else if (data && data.refresh && safeStorage.isEncryptionAvailable()) {
      entry = { id, mode: 'premium', name: session.name, uuid: String(session.uuid || ''), at: sess.startedAt(data.at), refresh: safeStorage.encryptString(String(data.refresh)).toString('base64') };
    } else return;
    const i = db.list.findIndex((x) => x.id === id);
    if (i >= 0) db.list[i] = entry;
    else if (db.list.length < MAX_ACCOUNTS) db.list.push(entry);
    else throw new Error('Ya tienes 12 cuentas guardadas. Quita alguna para añadir otra.');
    db.list = db.list.filter((x) => x.id !== 'legacy');
    db.active = id;
    writeAccounts(db);
    try { fs.unlinkSync(ACCOUNT_FILE); } catch {} // el archivo de una sola cuenta (versiones anteriores)
  } catch (e) {
    if (/12 cuentas/.test(String(e && e.message))) throw e;
  }
}

// Quita una cuenta guardada (o, sin id, la activa).
function clearAccount(id) {
  try {
    const db = readAccounts();
    const target = id || db.active;
    db.list = db.list.filter((x) => x.id !== target);
    if (db.active === target) db.active = '';
    writeAccounts(db);
  } catch {}
  try { fs.unlinkSync(ACCOUNT_FILE); } catch {}
}

async function premiumSessionFrom(xbox, startedAtMs) {
  const mc = await xbox.getMinecraft();
  session = { mode: 'premium', name: mc.profile.name, uuid: mc.profile.id, auth: mc.mclc(), mc };
  setTimeout(presenceBeat, 1500);
  sessionStartedAt = sess.startedAt(startedAtMs);
  pingUsage();
  lastProfile = null;
  let refresh = null;
  try {
    refresh = xbox.save();
  } catch {}
  if (refresh) saveAccount({ mode: 'premium', refresh, at: startedAtMs });
}

// Activa una cuenta guardada (nick sin conexión, o premium renovando su token). Devuelve false si no se pudo.
async function activateAccount(saved) {
  if (saved.mode === 'offline' && /^[A-Za-z0-9_]{3,16}$/.test(String(saved.name))) {
    session = makeOfflineSession(saved.name);
    sessionStartedAt = 0;
    setTimeout(presenceBeat, 1500);
    pingUsage();
    lastProfile = null;
    saveAccount();
    return true;
  }
  if (saved.mode === 'premium' && saved.refresh && safeStorage.isEncryptionAvailable()) {
    if (sess.premiumExpired(saved.at)) {
      // Han pasado 30 días: se pide iniciar sesión otra vez con Microsoft (la cuenta no premium nunca caduca).
      clearAccount(saved.id);
      sessionExpiredNotice = true;
      return false;
    }
    const token = safeStorage.decryptString(Buffer.from(saved.refresh, 'base64'));
    const xbox = await new Auth('select_account').refresh(token);
    await premiumSessionFrom(xbox, sess.startedAt(saved.at));
    return true;
  }
  return false;
}

async function restoreSession() {
  let db = readAccounts();
  if (!db.list.length) {
    // Versiones anteriores guardaban una sola cuenta en account.json.
    try {
      const old = JSON.parse(fs.readFileSync(ACCOUNT_FILE, 'utf8'));
      if (old.mode === 'offline') db = { active: `off:${String(old.name).toLowerCase()}`, list: [{ id: `off:${String(old.name).toLowerCase()}`, mode: 'offline', name: String(old.name) }] };
      else if (old.mode === 'premium' && old.refresh) db = { active: 'legacy', list: [{ id: 'legacy', mode: 'premium', name: 'Cuenta', uuid: '', at: old.at, refresh: old.refresh }] };
    } catch { return; }
  }
  const saved = db.list.find((x) => x.id === db.active);
  if (!saved) return;
  try {
    await activateAccount(saved);
  } catch {
    // Sin internet o sesión caducada: se pide iniciar sesión de nuevo (el archivo se conserva si solo falló la red).
    session = null;
  }
}

let sessionStartedAt = 0;
const sessionPublic = () => session ? {
  mode: session.mode, name: session.name, uuid: session.uuid,
  ...(session.mode === 'premium' && sessionStartedAt ? { expiresAt: sessionStartedAt + sess.DAYS * 24 * 60 * 60 * 1000 } : {})
} : null;
let sessionExpiredNotice = false;
ipcMain.handle('auth:expiredNotice', () => { const v = sessionExpiredNotice; sessionExpiredNotice = false; return v; });

// La interfaz espera (hasta 15 s) a que termine de restaurar la sesión.
let restoring = null;

// Cuenta NO premium: nick local. El servidor debe tener online-mode=false + plugin de login.
ipcMain.handle('auth:offline', (_e, nick) => {
  if (!remoteCfg.features.nonPremium) throw new Error('El inicio de sesión no premium está desactivado por el administrador. Entra con tu cuenta de Microsoft.');
  const name = String(nick || '').trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) {
    throw new Error('El nick debe tener de 3 a 16 caracteres: letras, números o guion bajo.');
  }
  session = makeOfflineSession(name);
  sessionStartedAt = 0;
  setTimeout(presenceBeat, 1500);
  pingUsage();
  lastProfile = null;
  saveAccount();
  return { mode: 'offline', name, uuid: session.uuid };
});

// Cuenta PREMIUM: login oficial de Microsoft/Xbox.
ipcMain.handle('auth:microsoft', async () => {
  const authManager = new Auth('select_account');
  const xbox = await authManager.launch('electron');
  await premiumSessionFrom(xbox);
  return sessionPublic();
});

// Lista de cuentas guardadas (sin tokens) para el selector.
const accountsPublic = () => {
  const db = readAccounts();
  return db.list.map((a) => ({ id: a.id, mode: a.mode, name: a.name, active: a.id === db.active && !!session }));
};
ipcMain.handle('auth:accounts', () => accountsPublic());
ipcMain.handle('auth:switch', async (_e, id) => {
  if (launching) throw new Error('Cierra Minecraft antes de cambiar de cuenta.');
  const saved = readAccounts().list.find((x) => x.id === String(id));
  if (!saved) throw new Error('Esa cuenta ya no está guardada.');
  if (saved.mode === 'offline' && !remoteCfg.features.nonPremium) throw new Error('El inicio de sesión no premium está desactivado por el administrador.');
  if (session && accountId(session) === saved.id) return sessionPublic();
  const prev = session;
  const prevStarted = sessionStartedAt;
  try {
    if (!(await activateAccount(saved))) throw new Error('Esa cuenta venció. Inicia sesión con Microsoft otra vez.');
  } catch (e) {
    session = prev; sessionStartedAt = prevStarted;
    throw new Error(String((e && e.message) || e).startsWith('Esa cuenta') ? e.message : 'No se pudo cambiar de cuenta. Revisa tu conexión o inicia sesión otra vez.');
  }
  pendingSkin = null;
  return sessionPublic();
});
ipcMain.handle('auth:forget', (_e, id) => {
  const target = String(id || '');
  clearAccount(target);
  if (session && accountId(session) === target) { session = null; lastProfile = null; pendingSkin = null; }
  return accountsPublic();
});

ipcMain.handle('auth:logout', () => {
  clearAccount();
  session = null;
  lastProfile = null;
  pendingSkin = null;
});

/* ---------- IPC: skins y capas (solo premium) ---------- */

// El token de Minecraft dura unas 24 horas. Si el launcher lleva abierto más tiempo, se renueva antes
// de usarlo (si no, Minecraft entraría con un token vencido y los servidores premium lo rechazarían).
async function freshPremium() {
  if (!session || session.mode !== 'premium' || !session.mc) return;
  let valid = true;
  try { valid = session.mc.validate(); } catch { valid = false; }
  if (valid) return;
  try {
    await session.mc.refresh(true);
    session.auth = session.mc.mclc();
    try {
      const refresh = session.mc.parent && session.mc.parent.save && session.mc.parent.save();
      if (refresh) saveAccount({ mode: 'premium', refresh, at: sessionStartedAt });
    } catch {}
  } catch {
    throw new Error('Tu sesión de Microsoft venció. Cierra sesión y vuelve a entrar con tu cuenta.');
  }
}

function premiumToken() {
  if (!session || session.mode !== 'premium') {
    throw new Error('OFFLINE: Cambiar la skin y la capa solo funciona con una cuenta premium.');
  }
  return session.auth.access_token;
}

ipcMain.handle('skins:profile', async () => {
  await freshPremium();
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

/* ---------- skins guardadas (cambio con un clic) ---------- */
const SAVED_SKINS_DIR = path.join(app.getPath('userData'), 'saved-skins');
const SAVED_SKINS_INDEX = path.join(SAVED_SKINS_DIR, 'index.json');
// Capa guardada junto a la skin: '' = sin capa; id = capa de Mojang; sin campo = no se toca.
function capeFields(p) {
  if (p && p.capeId === '') return { cape: '' };
  if (p && typeof p.capeId === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(p.capeId)) return { cape: p.capeId, ...(p.capeName ? { capeName: cleanStr(p.capeName, 40) } : {}) };
  return {};
}
function readSavedSkins() {
  try { const l = JSON.parse(fs.readFileSync(SAVED_SKINS_INDEX, 'utf8')); return Array.isArray(l) ? l.filter((s) => /^[a-f0-9]{16}$/.test(String(s.id))) : []; } catch { return []; }
}
function writeSavedSkins(list) {
  fs.mkdirSync(SAVED_SKINS_DIR, { recursive: true });
  fs.writeFileSync(SAVED_SKINS_INDEX, JSON.stringify(list));
}
ipcMain.handle('skins:saved:list', () => readSavedSkins().map((s) => {
  try { return { id: s.id, name: s.name, variant: s.variant, cape: s.cape, capeName: s.capeName, capeUrl: s.capeUrl, dataUrl: `data:image/png;base64,${fs.readFileSync(path.join(SAVED_SKINS_DIR, `${s.id}.png`)).toString('base64')}` }; } catch { return null; }
}).filter(Boolean));
ipcMain.handle('skins:saved:add', (_e, p = {}) => {
  if (!pendingSkin) throw new Error('Primero elige un archivo de skin.');
  const list = readSavedSkins();
  if (list.length >= 50) throw new Error('Ya tienes 50 skins guardadas. Quita alguna para guardar otra.');
  const id = crypto.randomBytes(8).toString('hex');
  fs.mkdirSync(SAVED_SKINS_DIR, { recursive: true });
  fs.writeFileSync(path.join(SAVED_SKINS_DIR, `${id}.png`), pendingSkin);
  const entry = { id, name: cleanStr(p.name, 40) || 'Mi skin', variant: p.variant === 'slim' ? 'slim' : 'classic', ...capeFields(p) };
  const capeObj = entry.cape && lastProfile && (lastProfile.capes || []).find((c) => c.id === entry.cape);
  if (capeObj && TEXTURE_URL.test(String(capeObj.url || ''))) entry.capeUrl = capeObj.url;
  list.push(entry);
  writeSavedSkins(list);
  return true;
});
ipcMain.handle('skins:saved:rename', (_e, id, name) => {
  const list = readSavedSkins();
  const s = list.find((x) => x.id === id);
  if (!s) return false;
  s.name = cleanStr(name, 40) || s.name;
  writeSavedSkins(list);
  return true;
});
ipcMain.handle('skins:saved:remove', (_e, id) => {
  const list = readSavedSkins();
  if (!list.some((s) => s.id === id)) return false;
  fs.rmSync(path.join(SAVED_SKINS_DIR, `${id}.png`), { force: true });
  writeSavedSkins(list.filter((s) => s.id !== id));
  return true;
});
ipcMain.handle('skins:saved:use', async (_e, id) => {
  const s = readSavedSkins().find((x) => x.id === id);
  if (!s) throw new Error('Esa skin ya no está guardada.');
  const buf = fs.readFileSync(path.join(SAVED_SKINS_DIR, `${s.id}.png`));
  skinsApi.validateSkinPng(buf);
  if (!session || session.mode !== 'premium') { setLocalSkin(buf, s.variant); return { local: true }; }
  const token = premiumToken();
  await skinsApi.uploadSkin(token, buf, s.variant);
  pendingSkin = null;
  lastProfile = await skinsApi.getProfile(token);
  if (s.cape === '') {
    if (lastProfile.activeCape) { await skinsApi.hideCape(token); lastProfile = await skinsApi.getProfile(token); }
  } else if (s.cape && lastProfile.capes.some((c) => c.id === s.cape)) {
    if (!lastProfile.activeCape || lastProfile.activeCape.id !== s.cape) { await skinsApi.setCape(token, s.cape); lastProfile = await skinsApi.getProfile(token); }
  }
  return lastProfile;
});

/* ---------- skin local (cuentas no premium) y historial automático ---------- */
const LOCAL_SKIN_FILE = path.join(app.getPath('userData'), 'local-skin.png');
const LOCAL_SKIN_META = path.join(app.getPath('userData'), 'local-skin.json');
function readLocalSkin() {
  try {
    const buf = fs.readFileSync(LOCAL_SKIN_FILE);
    const meta = JSON.parse(fs.readFileSync(LOCAL_SKIN_META, 'utf8'));
    return { buf, slim: meta.variant === 'slim' };
  } catch { return null; }
}
function setLocalSkin(buf, variant) {
  skinsApi.validateSkinPng(buf);
  fs.mkdirSync(path.dirname(LOCAL_SKIN_FILE), { recursive: true });
  fs.writeFileSync(LOCAL_SKIN_FILE, buf);
  fs.writeFileSync(LOCAL_SKIN_META, JSON.stringify({ variant: variant === 'slim' ? 'slim' : 'classic' }));
  skinCache.clear();
}
ipcMain.handle('skins:local:get', () => {
  const s = readLocalSkin();
  return s ? { dataUrl: `data:image/png;base64,${s.buf.toString('base64')}`, slim: s.slim } : null;
});
ipcMain.handle('skins:local:set', (_e, variant) => {
  if (!pendingSkin) throw new Error('Primero elige un archivo de skin.');
  setLocalSkin(pendingSkin, variant);
  pendingSkin = null;
  return true;
});
ipcMain.handle('skins:local:clear', () => {
  fs.rmSync(LOCAL_SKIN_FILE, { force: true });
  fs.rmSync(LOCAL_SKIN_META, { force: true });
  skinCache.clear();
  return true;
});
// Descarga la skin PNG de una persona del equipo/evento que el administrador subió (jugadores sin premium).
ipcMain.handle('skin:custom', async (_e, rawUrl) => {
  const url = String(rawUrl || '');
  if (!/^https:\/\/[^\s"'<>]+$/i.test(url)) return null;
  const key = `custom:${url}`;
  const hit = skinCache.get(key);
  if (hit && Date.now() - hit.at < SKIN_TTL) return hit.value;
  try {
    const buf = await downloadBuffer(url);
    skinsApi.validateSkinPng(buf);
    const value = { dataUrl: `data:image/png;base64,${buf.toString('base64')}` };
    skinCache.set(key, { at: Date.now(), value });
    return value;
  } catch { return null; }
});
// Guarda sola la skin que tienes puesta en tu cuenta (así se va armando tu historial; Mojang no da el pasado).
ipcMain.handle('skins:saved:auto', async () => {
  try {
    const sk = lastProfile && lastProfile.activeSkin;
    const url = sk && https(sk.url);
    if (!url || !TEXTURE_URL.test(url)) return false;
    const buf = await downloadBuffer(url);
    skinsApi.validateSkinPng(buf);
    const hash = crypto.createHash('sha1').update(buf).digest('hex');
    let list = readSavedSkins();
    if (list.some((s) => s.hash === hash)) return false;
    if (list.length >= 50) {
      const old = list.find((s) => s.auto);
      if (!old) return false;
      fs.rmSync(path.join(SAVED_SKINS_DIR, `${old.id}.png`), { force: true });
      list = list.filter((s) => s !== old);
    }
    const id = crypto.randomBytes(8).toString('hex');
    fs.mkdirSync(SAVED_SKINS_DIR, { recursive: true });
    fs.writeFileSync(path.join(SAVED_SKINS_DIR, `${id}.png`), buf);
    const ac = lastProfile.activeCape;
    list.push({ id, name: `Skin del ${new Date().toLocaleDateString('es')}`, variant: sk.variant === 'slim' ? 'slim' : 'classic', hash, auto: true, ...capeFields({ capeId: ac ? ac.id : '', capeName: ac && ac.alias }), ...(ac && TEXTURE_URL.test(String(ac.url || '')) ? { capeUrl: ac.url } : {}) });
    writeSavedSkins(list);
    return true;
  } catch { return false; }
});

// En el juego: sin premium, el mod CustomSkinLoader enseña tu skin local (solo Fabric y Forge).
async function ensureLocalSkinInGame(dir, manifest, loaderType) {
  const local = readLocalSkin();
  if (!local || !session || session.mode === 'premium' || !session.name || loaderType === 'vanilla') return;
  try {
    const r = await content.installFromModrinth({
      request: apiRequest, download: (u) => downloadBuffer(u), root: dir, type: 'mod',
      projectId: 'customskinloader', mc: manifest.minecraftVersion, loader: loaderType,
      onStatus: (text) => send('game:status', { text })
    });
    const extraFile = path.join(dir, '.extra-mods.json');
    let extra = [];
    try { extra = JSON.parse(fs.readFileSync(extraFile, 'utf8')); } catch {}
    fs.writeFileSync(extraFile, JSON.stringify([...new Set([...(Array.isArray(extra) ? extra : []), ...r.installed])]));
    const skinDir = path.join(dir, 'CustomSkinLoader', 'LocalSkin', 'skins');
    fs.mkdirSync(skinDir, { recursive: true });
    fs.writeFileSync(path.join(skinDir, `${session.name}.png`), local.buf);
  } catch (e) {
    send('game:status', { text: 'No se pudo preparar tu skin para el juego (se verá la de siempre).' });
  }
}

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
  const localOwn = session && session.mode !== 'premium' && session.name === name ? readLocalSkin() : null;
  if (localOwn) return { dataUrl: `data:image/png;base64,${localOwn.buf.toString('base64')}`, slim: localOwn.slim, cape: null };
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
      // Mojang limita las consultas (429) y a veces falla: se reintenta y, si sigue, se usan servicios alternos.
      const attempt = async (fn) => { try { return await fn(); } catch { await new Promise((r) => setTimeout(r, 700)); try { return await fn(); } catch { return null; } } };
      let uuid = own ? String(session.uuid || '').replace(/-/g, '') : '';
      if (!uuid) {
        const found = await attempt(() => fetchJson(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`));
        uuid = found && found.id;
      }
      let alt = null;
      if (!/^[0-9a-f]{32}$/i.test(uuid || '')) {
        alt = await attempt(() => fetchJson(`https://playerdb.co/api/player/minecraft/${encodeURIComponent(name)}`));
        const pl = alt && alt.data && alt.data.player;
        uuid = pl && String(pl.raw_id || '').replace(/-/g, '');
        if (pl && pl.skin_texture && TEXTURE_URL.test(https(pl.skin_texture))) skinUrl = https(pl.skin_texture);
      }
      if (!skinUrl && /^[0-9a-f]{32}$/i.test(uuid || '')) {
        const prof = await attempt(() => fetchJson(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`));
        const prop = prof && (prof.properties || []).find((p) => p.name === 'textures');
        const tex = prop && JSON.parse(Buffer.from(prop.value, 'base64').toString('utf8')).textures;
        if (tex && tex.SKIN) {
          skinUrl = https(tex.SKIN.url);
          slim = !!(tex.SKIN.metadata && tex.SKIN.metadata.model === 'slim');
        }
        if (tex && tex.CAPE) capeUrl = https(tex.CAPE.url);
      }
      if (!skinUrl && /^[0-9a-f]{32}$/i.test(uuid || '')) {
        // Último recurso: Crafatar sirve la skin por UUID.
        try {
          const buf = await downloadBuffer(`https://crafatar.com/skins/${uuid}`);
          skinsApi.validateSkinPng(buf);
          value = { dataUrl: `data:image/png;base64,${buf.toString('base64')}`, slim: false, cape: null };
        } catch {}
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
  // Un fallo no se recuerda 10 minutos: se vuelve a intentar pronto.
  skinCache.set(key, { at: value ? Date.now() : Date.now() - SKIN_TTL + 30 * 1000, value });
  return value;
});

/* ---------- IPC: jugar ---------- */

// Antes de mostrar la pantalla de carga: ¿hay que pedir la contraseña del evento? (instalación o actualización)
ipcMain.handle('event:needsPassword', async () => {
  try {
    const manifest = await loadData('manifest');
    if (!manifest || !manifest.protected || !packInstall.needsInstall(manifest.protected, instanceDir(GAME_DIR, manifest))) return false;
    if (packInstall.canRestoreFromCache({ prot: manifest.protected, gameDir: instanceDir(GAME_DIR, manifest), keyStore, cacheDir: path.join(app.getPath('userData'), 'pack-cache', instanceId(manifest)) })) return false;
    return true;
  } catch { return false; }
});
ipcMain.handle('event:checkPassword', async (_e, password) => {
  try {
    const manifest = await loadData('manifest');
    const prot = manifest && manifest.protected;
    if (!prot || typeof password !== 'string' || !password) return false;
    pcrypto.openEnvelope(prot, pcrypto.deriveKey(password, prot.salt, pcrypto.kdfOf(prot)));
    return true;
  } catch { return false; }
});

ipcMain.handle('game:launch', async (_e, opts = {}) => {
  // Si este modpack recuerda una cuenta, se cambia a ella antes de jugar.
  if (opts.modpackId && !launching) {
    const pk = readModpacks().find((x) => x.id === String(opts.modpackId));
    const want = pk && pk.settings && pk.settings.account;
    const saved = want && readAccounts().list.find((x) => x.id === want);
    if (saved && !(session && accountId(session) === saved.id)) {
      try {
        if (!(await activateAccount(saved))) throw new Error('vencida');
        pendingSkin = null;
        send('auth:changed', sessionPublic());
      } catch {
        throw new Error(`No se pudo entrar con la cuenta ${saved.name} de este modpack. Inicia sesión con ella otra vez o cambia la cuenta en los ajustes del modpack.`);
      }
    }
  }
  if (!session) throw new Error('Primero inicia sesión.');
  if (launching) throw new Error('El juego ya se está iniciando.');
  await freshPremium();
  await refreshRemote();
  const blocked = remote.blockReason(remoteCfg, app.getVersion(), { admin: await adminEligible() });
  if (blocked) throw new Error(blocked);
  launching = true;

  try {
    // Un modpack instalado desde Modrinth se lanza con su propia carpeta y sin servidor.
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
      if (manifest.event && require('./lib/evento-estado').estadoEfectivo(manifest.event) !== 'active') {
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
    // Evento bloqueado (por defecto): los jugadores no pueden añadir ni cambiar mods, texturas ni shaders.
    const lockEvent = !pack && manifest.lockPack !== false;
    const enforceLock = () => {
      if (!lockEvent) return;
      const removed = packLock.enforce(eventDir);
      if (removed.length) send('game:status', { text: `Se quitaron ${removed.length} archivo(s) que no son del evento (modpack bloqueado).` });
    };
    enforceLock();
    protectedRun = !pack && !!manifest.protected && manifest.showMods !== true;
    currentEventDir = protectedRun ? eventDir : null;
    rawLogBuffer.length = 0;
    if (!pack) await installMods(manifest, password, eventDir); // la contraseña se comprueba antes de descargar Java
    enforceLock();
    await ensureLocalSkinInGame(eventDir, manifest, loaderType);
    // Los ajustes propios del modpack (RAM, Java, argumentos, ventana) pesan más que los de Ajustes.
    const st = packs.mergeSettings(readSettings(), pack && pack.settings);
    const javaPath = await preferJavaw(await resolveJava(manifest, loaderType, st));

    let customId = null;
    let forgeInstaller = null;
    if (pack && pack.preset === 'optifine' && loaderType === 'vanilla') {
      customId = await ensureOptiFine(pack, javaPath);
    } else if (loaderType === 'fabric') {
      if (pack && pack.preset === 'nova') await fixNovaMods(eventDir, manifest.minecraftVersion);
      send('game:status', { text: 'Preparando Fabric…' });
      customId = await ensureFabric(manifest.minecraftVersion, manifest.loader.version);
    } else if (loaderType === 'quilt') {
      send('game:status', { text: 'Preparando Quilt…' });
      customId = await ensureQuilt(manifest.minecraftVersion, manifest.loader.version);
    } else if (loaderType === 'forge') {
      send('game:status', { text: 'Preparando Forge…' });
      forgeInstaller = await ensureForge(manifest.minecraftVersion, manifest.loader.version);
      const finfo = forgeInstallerInfo(forgeInstaller);
      if (finfo && finfo.bootstrap) {
        customId = await installForgeClient(forgeInstaller, finfo, manifest.minecraftVersion, javaPath);
        forgeInstaller = null;
      }
    } else if (loaderType === 'neoforge') {
      send('game:status', { text: 'Preparando NeoForge…' });
      forgeInstaller = await ensureNeoForge(manifest.minecraftVersion, manifest.loader.version);
      const ninfo = forgeInstallerInfo(forgeInstaller);
      if (ninfo && isNewForgeEra(manifest.minecraftVersion)) {
        try {
          customId = await installForgeClient(forgeInstaller, ninfo, manifest.minecraftVersion, javaPath, '--installClient');
        } catch (err) {
          if (!/unknown|unrecognized|no es una opci/i.test(String(err.message))) throw err;
          customId = await installForgeClient(forgeInstaller, ninfo, manifest.minecraftVersion, javaPath, '--install-client');
        }
        forgeInstaller = null;
      }
    }
    if (customId && (loaderType === 'forge' || loaderType === 'neoforge')) pushLog('launcher', `[Nova] ${loaderType === 'forge' ? 'Forge' : 'NeoForge'}: se lanza la versión instalada ${customId}.`);
    else if (forgeInstaller) pushLog('launcher', `[Nova] ${loaderType === 'forge' ? 'Forge' : 'NeoForge'}: se usa el motor clásico (ForgeWrapper) con ${path.basename(forgeInstaller)}.`);

    sanitizeOldOptions(eventDir, manifest.minecraftVersion);
    const userArgs = st.jvmArgs.split(/\s+/).filter(Boolean);
    const customArgs = userArgs.length ? userArgs : jvmDefaults.defaultJvmArgs({ javaMajor: loaders.requiredJavaMajor(manifest.minecraftVersion) });
    if (customId && (loaderType === 'forge' || loaderType === 'neoforge')) customArgs.push(...installedJvmArgs(customId));
    const launchOpts = {
      authorization: session.auth,
      root: GAME_DIR,
      version: {
        number: manifest.minecraftVersion,
        type: 'release',
        ...(customId ? { custom: customId } : {})
      },
      overrides: { gameDirectory: eventDir },
      memory: { max: `${st.ramGb}G`, min: userArgs.length ? '1G' : `${jvmDefaults.initialMemoryGb(st.ramGb)}G` },
      ...(forgeInstaller ? { forge: forgeInstaller } : {}),
      window: st.fullscreen
        ? { fullscreen: true }
        : { width: String(st.width), height: String(st.height) },
      ...(customArgs.length ? { customArgs } : {}),
      ...(javaPath ? { javaPath } : {})
    };
    // Entrar directo al servidor del evento: la IP sale del servers.dat del modpack (nunca del manifest público).
    const eventServer = !pack ? serversLib.findPackServer(eventDir) : null;
    if (eventServer) hideHost(eventServer.host);
    if (st.joinServer && eventServer) {
      launchOpts.server = { host: eventServer.host, port: String(eventServer.port || 25565) };
    }

    // Ajustes locales de la instancia: sincronización, variables y comandos.
    const own = pack ? packs.sanitizeSettings(pack.settings || {}, true) : {};
    const hookEnv = {
      INST_NAME: pack ? pack.title : 'Evento', INST_ID: pack ? pack.id : 'evento', INST_DIR: eventDir, INST_MC_DIR: eventDir,
      INST_JAVA: javaPath || 'java', INST_JAVA_ARGS: (customArgs || []).join(' ')
    };
    syncIn(eventDir, own.sync);
    if (own.preLaunch) {
      send('game:status', { text: 'Ejecutando el comando previo…' });
      pushLog('launcher', `[Nova] Comando previo: ${own.preLaunch}`);
      const r = await runHook(own.preLaunch, eventDir, hookEnv);
      if (r.out) pushLog('launcher', r.out);
      if (!r.ok) throw new Error(`El comando previo falló (${r.err && r.err.message ? r.err.message.split('\n')[0] : 'error'}). Revísalo en Ajustes de la instancia > Launch hooks.`);
    }
    const userEnv = parseEnvLines(own.env);
    const launcher = new Client();
    launcher.on('progress', (e) => send('game:progress', { type: e.type, task: e.task, total: e.total }));
    launcher.on('package-extract', () => send('game:status', { text: 'Extrayendo archivos…' }));
    launcher.on('arguments', () => send('game:status', { text: 'Iniciando Minecraft…' }));
    launcher.on('debug', (m) => pushLog('launcher', String(m)));
    launcher.on('data', (m) => pushLog('minecraft', String(m).trimEnd()));
    launcher.on('close', (code) => {
      launching = false;
      currentTarget = null;
      // Cuánto duró la partida: si se cerró casi al instante, el motivo suele estar en los archivos del propio juego.
      const startedMs = gameStartedAt;
      const ranSeconds = startedMs ? Math.round((Date.now() - startedMs) / 1000) : 0;
      const quickExit = ranSeconds < 15;
      if (!protectedRun && (code !== 0 || quickExit)) {
        try {
          const found = gameLogs.collectGameLogs(eventDir, { since: startedMs || Date.now() - 60000 });
          for (const s of found) { pushLog('launcher', `[Nova] ${s.title}:`); s.lines.forEach((l) => pushLog('minecraft', l)); }
          if (!found.length && quickExit) pushLog('launcher', '[Nova] El juego se cerró casi al instante y no escribió ningún registro propio (ni logs/latest.log ni informe de fallo).');
        } catch {}
      }
      try { syncOut(eventDir, own.sync); } catch {}
      if (own.postExit) { runHook(own.postExit, eventDir, hookEnv).then((r) => pushLog('launcher', `[Nova] Comando al salir ${r.ok ? 'terminado' : 'falló'}${r.out ? ': ' + r.out : ''}`)); }
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
      let crashList = code === 0 ? [] : analyzeCrash(protectedRun ? rawLogBuffer : logBuffer);
      if (!crashList.length && quickExit && !protectedRun) {
        crashList = [{ id: 'quick-exit', title: 'El juego se cerró casi al instante', advice: 'Abre la pestaña Consola: ahora muestra lo último que escribió Minecraft. Si no hay nada, prueba con otra versión de Java en Ajustes o quita los mods que agregaste a esta instancia.' }];
      }
      if (protectedRun && crashList.length) {
        // El diagnóstico puede nombrar mods: se guarda cifrado y al jugador se le muestra algo genérico.
        saveProtectedLog(rawLogBuffer);
        crashList = [{ id: 'protected', title: 'El juego se cerró con un error', advice: 'Se guardó un informe cifrado del error. Avisa a un administrador para que lo revise.' }];
      }
      pendingClose = { code, crash: crashList };
      if (protectedRun && currentEventDir) packInstall.wipeProtected(currentEventDir);
      protectedRun = false;
      leaveGameMode();
      if (windowWasOpen) {
        overlayHide();
        send('game:close', pendingClose);
        pendingClose = null;
      }
    });

    // Variables de entorno de la instancia: el juego las hereda; se restauran justo después de iniciarlo.
    const envBackup = {};
    for (const [k, v] of Object.entries(userEnv)) { envBackup[k] = process.env[k]; process.env[k] = v; }
    let child;
    try { child = await launcher.launch(launchOpts); } finally {
      for (const [k, v] of Object.entries(envBackup)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
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
