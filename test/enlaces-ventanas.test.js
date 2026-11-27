'use strict';
// Revisión estática de main.js: ningún camino abre un enlace externo sin pasar
// por lib/links.js (solo https y confirmación fuera de los sitios conocidos).
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

// Cada setWindowOpenHandler niega la ventana y, si abre algo, usa openExternalLink.
const starts = [...src.matchAll(/setWindowOpenHandler\(/g)].map((m) => m.index);
assert.ok(starts.length >= 2, 'se esperaban los handlers de las dos ventanas');
for (const i of starts) {
  const end = src.indexOf("action: 'deny'", i);
  assert.ok(end > i && end - i < 300, 'cada setWindowOpenHandler debe negar la ventana');
  const body = src.slice(i, end);
  assert.ok(!/shell\.openExternal\(/.test(body), `el handler abre enlaces sin revisar: ${body}`);
}

// shell.openExternal solo recibe el enlace ya revisado o la URL fija de compartir en X.
const calls = [...src.matchAll(/shell\.openExternal\(([^)]*\)?)/g)].map((m) => m[1]);
assert.ok(calls.length > 0);
for (const arg of calls) {
  assert.ok(/^c\.href\)?$/.test(arg) || /^social\.xShareUrl\(/.test(arg), `shell.openExternal sin revisar: ${arg}`);
}

// link:open usa la misma función que los handlers.
assert.match(src, /ipcMain\.handle\('link:open',[^\n]*openExternalLink\(/);
console.log('enlaces-ventanas ok');
