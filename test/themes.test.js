'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const themes = require('../lib/themes');
const remote = require('../lib/remote');
const css = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'index.html'), 'utf8');

assert.strictEqual(themes.EXTRA.length, 10);
assert.deepStrictEqual(remote.THEMES, themes.ALL);
for (const t of themes.EXTRA) {
  assert.ok(/^#[0-9a-f]{6}$/i.test(t.accent), `${t.id}: color`);
  assert.ok(css.includes(`:root[data-theme="${t.id}"] {`), `${t.id}: paleta en styles.css`);
  assert.ok(css.includes(`.tc-${t.id} {`), `${t.id}: vista previa`);
  assert.ok(html.includes(`data-theme-value="${t.id}" data-accent="${t.accent}"`), `${t.id}: tarjeta en Ajustes`);
  assert.ok(html.includes(`<option value="${t.id}">${t.name}</option>`), `${t.id}: opción en Admin`);
}
assert.strictEqual(new Set(themes.ALL).size, themes.ALL.length);
// el panel de Admin ya acepta los temas nuevos
const clean = remote.sanitize({ theme: { preset: 'tokyonight' } });
assert.strictEqual(clean.theme.preset, 'tokyonight');
console.log('themes.test OK');
