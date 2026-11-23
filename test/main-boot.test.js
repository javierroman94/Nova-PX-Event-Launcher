'use strict';
// El proceso principal (main.js y lib/main/*) debe cargar entero con Electron simulado: detecta variables usadas antes de definirse, nombres que faltan y ventanas rotas al partir el archivo.
const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'arranque-main.js')], { encoding: 'utf8' });
assert.strictEqual(r.status, 0, 'main.js no arranca:\n' + (r.stderr || '') + (r.stdout || ''));
const m = /registrados: (\d+)/.exec(r.stdout);
assert.ok(m, 'no se pudo leer cuántos manejadores IPC se registraron');
assert.ok(Number(m[1]) >= 150, 'se registraron muy pocos manejadores IPC: ' + m[1]);
console.log('ok main-boot (' + m[1] + ' manejadores IPC)');
