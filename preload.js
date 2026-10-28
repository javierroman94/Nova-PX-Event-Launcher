const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // general
  getConfig: () => ipcRenderer.invoke('config:get'),
  getData: (name) => ipcRenderer.invoke('data:get', name),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
  systemInfo: () => ipcRenderer.invoke('system:info'),
  appState: () => ipcRenderer.invoke('app:state'),
  openGameFolder: () => ipcRenderer.invoke('folder:open'),
  browseJava: () => ipcRenderer.invoke('java:browse'),
  openLink: (url) => ipcRenderer.invoke('link:open', url),
  serverStatus: () => ipcRenderer.invoke('server:status'),

  // cuentas
  loginOffline: (nick) => ipcRenderer.invoke('auth:offline', nick),
  loginMicrosoft: () => ipcRenderer.invoke('auth:microsoft'),
  logout: () => ipcRenderer.invoke('auth:logout'),

  // tema
  getBackground: () => ipcRenderer.invoke('theme:background'),
  pickBackground: () => ipcRenderer.invoke('theme:pickBackground'),
  clearBackground: () => ipcRenderer.invoke('theme:clearBackground'),

  // skins y capas
  skinsProfile: () => ipcRenderer.invoke('skins:profile'),
  skinsPick: () => ipcRenderer.invoke('skins:pick'),
  skinsApply: (variant) => ipcRenderer.invoke('skins:apply', variant),
  skinTexture: (nick, fresh) => ipcRenderer.invoke('skin:texture', nick, fresh),
  skinFetch: (url, kind) => ipcRenderer.invoke('skin:fetch', url, kind),
  skinsCape: (capeId) => ipcRenderer.invoke('skins:cape', capeId),

  // jugar
  launch: (opts) => ipcRenderer.invoke('game:launch', opts),

  // actualizaciones del programa
  getUpdateState: () => ipcRenderer.invoke('update:state'),
  checkUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),

  // eventos
  onUpdate: (cb) => ipcRenderer.on('update:state', (_e, d) => cb(d)),
  onProgress: (cb) => ipcRenderer.on('game:progress', (_e, d) => cb(d)),
  onStatus: (cb) => ipcRenderer.on('game:status', (_e, d) => cb(d)),
  onLog: (cb) => ipcRenderer.on('game:log', (_e, d) => cb(d)),
  onClose: (cb) => ipcRenderer.on('game:close', (_e, d) => cb(d))
});
