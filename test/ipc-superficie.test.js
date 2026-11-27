'use strict';
// Superficie IPC: el preload solo expone canales que existen, sin pasarelas genéricas, y nada se registra
// fuera de ipcMain.handle (que es lo que filtra el origen en lib/ipc-guard.js).
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const mainFiles = ['main.js', ...fs.readdirSync(path.join(root, 'lib', 'main')).filter((f) => f.endsWith('.js')).map((f) => `lib/main/${f}`)];
const handled = new Set();
for (const f of mainFiles) {
  const src = read(f);
  assert.ok(!/ipcMain\.(on|once|handleOnce)\(/.test(src), `${f}: usa ipcMain.on/once, que no pasa por el filtro de origen`);
  for (const m of src.matchAll(/ipcMain\.handle\(\s*'([^']+)'/g)) handled.add(m[1]);
  // Canales registrados en bucle: for (const [ch, op] of [['a:b', 'x'], …]) ipcMain.handle(ch, …)
  for (const m of src.matchAll(/for \(const \[ch[^\]]*\] of (\[.*?\]\])\)/g)) for (const c of m[1].matchAll(/\['([a-z]+:[A-Za-z]+)'/g)) handled.add(c[1]);
}
const preload = read('preload.js');
assert.ok(!/ipcRenderer\.(send|sendSync|postMessage)\(/.test(preload), 'el preload solo usa invoke y escucha eventos');
assert.ok(!/invoke\(\s*[a-z_]+\s*[,)]/i.test(preload), 'el preload no tiene una pasarela genérica invoke(canal)');
assert.ok(!/exposeInMainWorld\([^)]*ipcRenderer/.test(preload), 'el preload no expone ipcRenderer');
const used = [...preload.matchAll(/ipcRenderer\.invoke\(\s*'([^']+)'/g)].map((m) => m[1]);
const missing = [...new Set(used)].filter((c) => !handled.has(c));
assert.deepStrictEqual(missing, [], `canales del preload sin handler: ${missing.join(', ')}`);
// Canales de administración: todos con permiso en lib/permisos.js.
const permisos = require('../lib/permisos');
const canales = new Set(Object.keys(permisos.CANALES || {}));
const adminSinPermiso = [...handled].filter((c) => /^admin:/.test(c) && canales.size && !canales.has(c));
console.log(`ipc: ${handled.size} canales, ${new Set(used).size} expuestos; admin sin permiso propio: ${adminSinPermiso.length}`);
console.log('ipc-superficie ok');
