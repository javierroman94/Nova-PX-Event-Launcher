'use strict';
// Protege contra un preload.js roto: cada window.api.X que usa la interfaz debe existir en preload.js.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
assert.ok(/contextBridge\.exposeInMainWorld\(\s*'api'/.test(preload), 'preload.js debe exponer window.api');
assert.ok(!/ipcMain\.handle/.test(preload), 'preload.js no puede contener código del proceso principal');

const exposed = new Set([...preload.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]));
const used = new Set();
for (const f of fs.readdirSync(path.join(root, 'renderer')).filter((x) => x.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(root, 'renderer', f), 'utf8');
  for (const m of src.matchAll(/window\.api\.(\w+)/g)) used.add(m[1]);
}
const missing = [...used].filter((k) => !exposed.has(k));
assert.deepStrictEqual(missing, [], `Faltan en preload.js: ${missing.join(', ')}`);

// Cada canal que invoca el preload debe tener un manejador en main.js.
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const channels = [...preload.matchAll(/invoke\('([^']+)'/g)].map((m) => m[1]);
const unhandled = channels.filter((c) => !main.includes(`'${c}'`));
assert.deepStrictEqual(unhandled, [], `Sin manejador en main.js: ${unhandled.join(', ')}`);
console.log(`  ok  preload: ${used.size} funciones usadas por la interfaz existen y sus canales tienen manejador`);
