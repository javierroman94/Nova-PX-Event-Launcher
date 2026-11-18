'use strict';
const assert = require('assert');
const { verificar } = require('../tools/verificar-etiqueta');

const tags = [
  { name: 'v1.0.9', commit: 'aaa0009' },
  { name: 'v1.0.10', commit: 'aaa0010' },
  { name: 'v1.0.50', commit: 'bbb0050' },
];

// versión nueva, bien hecha
assert.deepStrictEqual(
  verificar({ tag: 'v1.0.51', pkgVersion: '1.0.51', commit: 'ccc0051', tags: [...tags, { name: 'v1.0.51', commit: 'ccc0051' }] }),
  []
);

// lo que pasó con v1.0.51: misma versión en package.json y mismo commit que v1.0.50
let e = verificar({ tag: 'v1.0.51', pkgVersion: '1.0.50', commit: 'bbb0050', tags: [...tags, { name: 'v1.0.51', commit: 'bbb0050' }] });
assert.strictEqual(e.length, 2);
assert.match(e[0], /package\.json dice "1\.0\.50"/);
assert.match(e[1], /versión anterior v1\.0\.50/);

// v1.0.52 también en ese commit: se compara con v1.0.51 (la anterior) y también menciona v1.0.50
e = verificar({
  tag: 'v1.0.52', pkgVersion: '1.0.50', commit: 'bbb0050',
  tags: [...tags, { name: 'v1.0.51', commit: 'bbb0050' }, { name: 'v1.0.52', commit: 'bbb0050' }],
});
assert.strictEqual(e.length, 3);
assert.match(e[1], /versión anterior v1\.0\.51/);
assert.match(e[2], /v1\.0\.50/);

// el orden es numérico, no alfabético: la anterior a v1.0.11 es v1.0.10, no v1.0.9
e = verificar({ tag: 'v1.0.11', pkgVersion: '1.0.11', commit: 'aaa0010', tags });
assert.strictEqual(e.length, 1);
assert.match(e[0], /versión anterior v1\.0\.10/);

// sólo package.json mal
e = verificar({ tag: 'v1.0.51', pkgVersion: '1.0.50', commit: 'ccc0051', tags });
assert.strictEqual(e.length, 1);
assert.match(e[0], /package\.json/);

// etiquetas que no son vX.Y.Z se ignoran, y el formato se valida
assert.deepStrictEqual(verificar({ tag: 'v1.0.51', pkgVersion: '1.0.51', commit: 'ccc0051', tags: [...tags, { name: 'prueba', commit: 'ccc0051' }] }), []);
assert.match(verificar({ tag: 'v1.0', pkgVersion: '1.0', commit: 'x', tags })[0], /formato/);

// la primera versión del repo no tiene anterior
assert.deepStrictEqual(verificar({ tag: 'v1.0.0', pkgVersion: '1.0.0', commit: 'zzz', tags: [] }), []);

console.log('release-tag ok');
