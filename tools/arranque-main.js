// Prueba de arranque del proceso principal. Carga main.js con Electron simulado para detectar errores al arrancar (variables usadas antes de definirse, nombres faltantes...).
const Module = require('module'); const path = require('path'); const os = require('os');
const noop = () => {}; const calls = { handle: 0, on: 0 };
const deep = (name) => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => name : k === 'then' ? undefined : deep(name + '.' + String(k))), apply: () => deep(name + '()'), construct: () => deep('new ' + name) });
const electron = {
  app: { whenReady: () => new Promise(noop), on: noop, once: noop, getPath: () => os.tmpdir() + '/nova-boot', getVersion: () => '1.0.0', isPackaged: false, requestSingleInstanceLock: () => true, quit: noop, setAppUserModelId: noop, commandLine: { appendSwitch: noop }, getName: () => 'x', disableHardwareAcceleration: noop, setPath: noop, getAppPath: () => process.cwd(), isReady: () => false },
  ipcMain: { handle: () => { calls.handle++; }, on: () => { calls.on++; }, once: noop, removeHandler: noop },
  BrowserWindow: class { constructor() {} static getAllWindows() { return []; } }, shell: deep('shell'), dialog: deep('dialog'), Tray: class {}, Menu: deep('Menu'), nativeImage: deep('nativeImage'), session: deep('session'), safeStorage: { isEncryptionAvailable: () => false }, screen: deep('screen'), clipboard: deep('clipboard'), Notification: class {}, powerMonitor: deep('pm'), protocol: deep('protocol'), globalShortcut: deep('gs'), net: deep('net'), contextBridge: deep('cb'), ipcRenderer: deep('ir')
};
const orig = Module._load;
Module._load = function (req, parent, isMain) {
  if (req === 'electron') return electron;
  if (req === 'electron-updater') return { autoUpdater: deep('updater') };
  return orig.apply(this, arguments);
};
process.on('uncaughtException', (e) => { console.error('ERROR AL ARRANCAR:', e.stack.split('\n').slice(0, 4).join('\n')); process.exit(1); });
require(path.resolve(process.argv[2] || path.join(__dirname, '..', 'main.js')));
setTimeout(() => { console.log('main.js cargó sin errores. ipcMain.handle registrados:', calls.handle, '| listeners:', calls.on); process.exit(0); }, 600);
