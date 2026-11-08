'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sanitizePack, loadAll } = require('../lib/langpack');

assert.strictEqual(sanitizePack({ code: '../x', strings: {} }), null, 'código inválido');
assert.strictEqual(sanitizePack(null), null);
const p = sanitizePack({ code: 'fr', name: 'Français', strings: { Inicio: 'Accueil', roto: 5 }, patterns: [{ match: '(', to: 'x' }, { match: '^a$', to: 'b' }] });
assert.deepStrictEqual(p.strings, { Inicio: 'Accueil' });
assert.strictEqual(p.patterns.length, 1, 'se descartan las expresiones inválidas');

// El paquete en inglés incluido es válido y sus patrones compilan.
const en = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'renderer', 'lang', 'en.json'), 'utf8'));
const cleaned = sanitizePack(en);
assert.ok(cleaned && Object.keys(cleaned.strings).length > 300);
assert.strictEqual(cleaned.patterns.length, en.patterns.length, 'todos los patrones del inglés son válidos');

// Un paquete del usuario reemplaza al incluido.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lang-'));
fs.writeFileSync(path.join(tmp, 'en.json'), JSON.stringify({ code: 'en', name: 'Mi inglés', strings: { Inicio: 'Start' } }));
const all = loadAll(path.join(__dirname, '..', 'renderer', 'lang'), tmp);
assert.strictEqual(all.get('en').name, 'Mi inglés');
assert.strictEqual(all.get('en').builtin, false);
console.log('langpack.test OK');
