'use strict';
const assert = require('assert');
const C = require('../renderer/cropper.js');

// Imagen horizontal 2000x1000 en un marco cuadrado 300x300: cubre a escala 0.3; la imagen sobra a los lados.
let g = C.geometry({ iw: 2000, ih: 1000, fw: 300, fh: 300, zoom: 1, ox: 0, oy: 0 });
assert.strictEqual(g.scale, 0.3);
assert.strictEqual(g.sh, 1000);
assert.strictEqual(g.sw, 1000);
assert.strictEqual(g.sx, 500);
assert.strictEqual(g.maxY, 0);
// No se puede arrastrar más allá del borde.
g = C.geometry({ iw: 2000, ih: 1000, fw: 300, fh: 300, zoom: 1, ox: 9999, oy: 50 });
assert.strictEqual(g.ox, g.maxX);
assert.strictEqual(g.oy, 0);
assert.ok(g.sx >= 0 && g.sx + g.sw <= 2000, 'el recorte queda dentro de la imagen');
// Al acercar, el recorte es menor.
const z = C.geometry({ iw: 2000, ih: 1000, fw: 300, fh: 300, zoom: 2, ox: 0, oy: 0 });
assert.strictEqual(z.sw, 500);
assert.ok(z.maxY > 0);
// Zoom fuera de rango se limita.
assert.strictEqual(C.geometry({ iw: 100, ih: 100, fw: 50, fh: 50, zoom: 99, ox: 0, oy: 0 }).scale, 0.5 * 6);
// Tamaño de salida con proporción y tope.
assert.deepStrictEqual(C.outputSize(5000, 16 / 9), { w: 1600, h: 900 });
assert.deepStrictEqual(C.outputSize(400, 1), { w: 400, h: 400 });
// Retícula: misma proporción que el sitio donde se muestra, dentro del escenario.
const r1 = C.reticle(640, 380, 4);
assert.ok(Math.abs(r1.w / r1.h - 4) < 0.05 && r1.w <= 640 * 0.9 + 1);
const r2 = C.reticle(640, 380, 1);
assert.strictEqual(r2.w, r2.h);
assert.ok(r2.h <= 380 * 0.9 + 1);
// Cada espacio de imagen tiene su proporción: portada ancha, logo y perfil cuadrados, patrocinador 2:1.
assert.strictEqual(C.slotSpec('logo').aspect, 1);
assert.strictEqual(C.slotSpec('perfil').aspect, 1);
assert.strictEqual(C.slotSpec('sponsor').aspect, 2);
assert.ok(C.slotSpec('banner', 1000, 600).aspect > 1.5);
assert.ok(C.slotSpec('banner').guides.length >= 2);
assert.strictEqual(C.slotSpec('no-existe'), null);
// La portada sigue el tamaño real del área principal y se mantiene en un rango razonable.
assert.ok(C.slotSpec('banner', 4000, 300).aspect <= 3.2);
assert.ok(C.slotSpec('banner', 300, 4000).aspect >= 1.2);
console.log('cropper.test OK');
