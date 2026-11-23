'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { collectGameLogs } = require('../lib/game-logs');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'glogs-'));
assert.deepStrictEqual(collectGameLogs(dir), [], 'sin archivos no hay nada que mostrar');

fs.mkdirSync(path.join(dir, 'logs'));
fs.writeFileSync(path.join(dir, 'logs', 'latest.log'), Array.from({ length: 100 }, (_, i) => `linea ${i + 1}`).join('\n') + '\n');
let r = collectGameLogs(dir, { logLines: 5 });
assert.strictEqual(r.length, 1);
assert.deepStrictEqual(r[0].lines, ['linea 96', 'linea 97', 'linea 98', 'linea 99', 'linea 100']);

fs.mkdirSync(path.join(dir, 'crash-reports'));
fs.writeFileSync(path.join(dir, 'crash-reports', 'crash-2026-01-01_00.00.00-client.txt'), '---- Minecraft Crash Report ----\nDescription: Boom\n');
fs.writeFileSync(path.join(dir, 'hs_err_pid123.log'), '# A fatal error has been detected\n');
r = collectGameLogs(dir);
assert.deepStrictEqual(r.map((x) => x.title.split(' ')[0]), ['Últimas', 'Informe', 'Fallo']);
assert.ok(r[1].lines[1].includes('Boom'));

// Archivos viejos (de otra partida) no se muestran.
const old = Date.now() - 3600 * 1000;
for (const f of [path.join(dir, 'logs', 'latest.log'), path.join(dir, 'hs_err_pid123.log'), path.join(dir, 'crash-reports', 'crash-2026-01-01_00.00.00-client.txt')]) fs.utimesSync(f, old / 1000, old / 1000);
assert.deepStrictEqual(collectGameLogs(dir, { since: Date.now() - 60 * 1000 }), []);
console.log('ok game-logs');
