const { contextBridge, ipcRenderer, webUtils } = require('electron');

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
  repairInstall: () => ipcRenderer.invoke('game:repair'),
  modsList: () => ipcRenderer.invoke('mods:list'),

  // modpacks de Modrinth y CurseForge
  modpackProviders: () => ipcRenderer.invoke('modpacks:providers'),
  modpackSearch: (p) => ipcRenderer.invoke('modpacks:search', p),
  modpackVersions: (p) => ipcRenderer.invoke('modpacks:versions', p),
  modpackInstall: (p) => ipcRenderer.invoke('modpacks:install', p),
  modpackInstalled: () => ipcRenderer.invoke('modpacks:installed'),
  modpackRemove: (id) => ipcRenderer.invoke('modpacks:remove', id),
  modpackFolder: (id) => ipcRenderer.invoke('modpacks:folder', id),
  instanceContent: (id) => ipcRenderer.invoke('instance:content', id),
  instanceToggle: (p) => ipcRenderer.invoke('instance:toggle', p),
  instanceRemove: (p) => ipcRenderer.invoke('instance:remove', p),
  instanceAddLocal: (p) => ipcRenderer.invoke('instance:addLocal', p),
  instanceSearch: (p) => ipcRenderer.invoke('instance:search', p),
  instanceInstall: (p) => ipcRenderer.invoke('instance:install', p),
  instanceWorlds: (id) => ipcRenderer.invoke('instance:worlds', id),
  instanceScreenshots: (id) => ipcRenderer.invoke('instance:screenshots', id),
  instanceOpenScreenshots: (id) => ipcRenderer.invoke('instance:openScreenshots', id),
  instanceLog: (id) => ipcRenderer.invoke('instance:log', id),
  modpackRecommended: () => ipcRenderer.invoke('modpacks:recommended'),
  adminStatus: () => ipcRenderer.invoke('admin:status'),
  adminLogin: (t) => ipcRenderer.invoke('admin:login', t),
  adminLogout: () => ipcRenderer.invoke('admin:logout'),
  adminLoad: () => ipcRenderer.invoke('admin:load'),
  adminResolveNick: (n) => ipcRenderer.invoke('admin:resolveNick', n),
  adminSaveAdmins: (l) => ipcRenderer.invoke('admin:saveAdmins', l),
  adminUsersKey: (k) => ipcRenderer.invoke('admin:usersKey', k),
  adminUsers: () => ipcRenderer.invoke('admin:users'),
  adminUserDelete: (id) => ipcRenderer.invoke('admin:userDelete', id),
  adminSaveTeam: (l) => ipcRenderer.invoke('admin:saveTeam', l),
  adminSaveEvents: (l) => ipcRenderer.invoke('admin:saveEvents', l),
  adminPickImage: (l) => ipcRenderer.invoke('admin:pickImage', l),
  adminSaveNews: (l) => ipcRenderer.invoke('admin:saveNews', l),
  adminPackSummary: (id) => ipcRenderer.invoke('admin:packSummary', id),
  adminPublishEvent: (p) => ipcRenderer.invoke('admin:publishEvent', p),
  modpackMcVersions: () => ipcRenderer.invoke('modpacks:mcVersions'),
  modpackCreate: (p) => ipcRenderer.invoke('modpacks:create', p),
  modpackUpdate: (p) => ipcRenderer.invoke('modpacks:update', p),
  modpackPickIcon: (p) => ipcRenderer.invoke('modpacks:pickIcon', p),
  onModpacksChanged: (cb) => ipcRenderer.on('modpacks:changed', () => cb()),
  modpackDuplicate: (p) => ipcRenderer.invoke('modpacks:duplicate', p),
  instanceBackup: (p) => ipcRenderer.invoke('instance:backup', p),
  instanceBackups: (id) => ipcRenderer.invoke('instance:backups', id),
  instanceOpenBackups: (id) => ipcRenderer.invoke('instance:openBackups', id),
  instanceUpdatesCheck: (id) => ipcRenderer.invoke('instance:updatesCheck', id),
  instanceUpdatesApply: (id) => ipcRenderer.invoke('instance:updatesApply', id),
  modpackImport: (p) => ipcRenderer.invoke('modpacks:import', p),
  modpackExport: (p) => ipcRenderer.invoke('modpacks:export', p),
  pathForFile: (f) => webUtils.getPathForFile(f),
  onImportOpen: (cb) => ipcRenderer.on('import:open', (_e, d) => cb(d)),
  onModpackProgress: (cb) => ipcRenderer.on('modpack:progress', (_e, d) => cb(d)),
  installUpdate: () => ipcRenderer.invoke('update:install'),

  // eventos
  onUpdate: (cb) => ipcRenderer.on('update:state', (_e, d) => cb(d)),
  onProgress: (cb) => ipcRenderer.on('game:progress', (_e, d) => cb(d)),
  onStatus: (cb) => ipcRenderer.on('game:status', (_e, d) => cb(d)),
  onLog: (cb) => ipcRenderer.on('game:log', (_e, d) => cb(d)),
  onClose: (cb) => ipcRenderer.on('game:close', (_e, d) => cb(d))
});
