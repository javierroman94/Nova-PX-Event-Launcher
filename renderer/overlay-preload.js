const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ov', { onUpdate: (cb) => ipcRenderer.on('overlay:update', (_e, p) => cb(p)) });
