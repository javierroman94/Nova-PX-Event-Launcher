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
// La interfaz está repartida en renderer/*.js y renderer/app/*.js.
const rendererFiles = ['renderer', 'renderer/app'].flatMap((d) => fs.readdirSync(path.join(root, d)).filter((x) => x.endsWith('.js')).map((x) => path.join(d, x)));
for (const f of rendererFiles) {
  const src = fs.readFileSync(path.join(root, f), 'utf8');
  for (const m of src.matchAll(/window\.api\.(\w+)/g)) used.add(m[1]);
}
const missing = [...used].filter((k) => !exposed.has(k));
assert.deepStrictEqual(missing, [], `Faltan en preload.js: ${missing.join(', ')}`);

// Cada canal que invoca el preload debe tener un manejador en main.js.
// El proceso principal está en main.js y en lib/main/*.js.
const main = ['main.js', ...fs.readdirSync(path.join(root, 'lib', 'main')).map((f) => path.join('lib', 'main', f))].map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
const channels = [...preload.matchAll(/invoke\('([^']+)'/g)].map((m) => m[1]);
const unhandled = channels.filter((c) => !main.includes(`'${c}'`));
assert.deepStrictEqual(unhandled, [], `Sin manejador en main.js: ${unhandled.join(', ')}`);
console.log(`  ok  preload: ${used.size} funciones usadas por la interfaz existen y sus canales tienen manejador`);
