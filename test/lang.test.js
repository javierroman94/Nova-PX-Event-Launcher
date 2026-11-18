'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const lang = require('../lib/langpack');
const dir = path.join(__dirname, '..', 'renderer', 'lang');
const flags = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'flags.js'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8');

const all = lang.loadAll(dir, path.join(__dirname, 'no-existe'));
const codes = [...all.keys()].sort();
assert.deepStrictEqual(codes, ['de', 'en', 'fr', 'it', 'ja', 'pt', 'ru']);
// Las descripciones de las secciones de Ajustes (en app.js) deben estar traducidas en todos los idiomas.
const descs = [...app.matchAll(/^\s+'[^']+': '([^']{12,})',?$/gm)].map((m) => m[1]).filter((t) => /^[A-ZÁÉÍÓÚ]/.test(t));
assert.ok(descs.length >= 10, 'no se encontraron las descripciones de Ajustes');
for (const c of codes) {
  const p = all.get(c);
  assert.ok(p.name && p.name !== c, `${c}: nombre`);
  assert.ok(Object.keys(p.strings).length >= 200, `${c}: pocas cadenas`);
  assert.ok(new RegExp(`\\b${c}:\\s*W\\(`).test(flags), `${c}: falta su bandera en flags.js`);
  for (const d of descs.slice(0, 10)) assert.ok(p.strings[d], `${c}: sin traducir «${d}»`);
  for (const [k, v] of Object.entries(p.strings)) assert.ok(v.trim(), `${c}: vacío «${k}»`);
}
console.log('lang.test OK');
