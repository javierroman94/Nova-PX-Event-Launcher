'use strict';
// Los filtros de copia (duplicar sin mundos, importar) deben funcionar aunque
// Node 20 en Windows pase rutas «\\?\C:\...» al filtro (comprobado en un
// Windows real con el Electron 33 del launcher).
const assert = require('assert');
const path = require('path');
const { rutaRelativa } = require('../lib/ruta-relativa');

const w = path.win32;
assert.strictEqual(rutaRelativa('C:\\juego\\inst', '\\\\?\\C:\\juego\\inst\\saves\\w', w), 'saves\\w');
assert.strictEqual(rutaRelativa('C:\\juego\\inst', 'C:\\juego\\inst\\mods\\a.jar', w), 'mods\\a.jar');
assert.strictEqual(rutaRelativa('C:\\juego\\inst', '\\\\?\\C:\\juego\\inst', w), '');
assert.strictEqual(rutaRelativa('\\\\srv\\c\\inst', '\\\\?\\UNC\\srv\\c\\inst\\logs\\x', w), 'logs\\x');
assert.strictEqual(rutaRelativa('C:\\juego\\inst', '\\\\?\\C:\\otro\\x', w).split('\\')[0], '..');
assert.strictEqual(rutaRelativa('/juego/inst', '/juego/inst/saves/w', path.posix), 'saves/w');
console.log('ruta-relativa ok');
