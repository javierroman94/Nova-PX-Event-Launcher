'use strict';
const assert = require('assert');
const B = require('../renderer/mascot-brain.js');
const rng = () => 0;

assert.strictEqual(B.dayPart(8), 'morning');
assert.strictEqual(B.dayPart(15), 'afternoon');
assert.strictEqual(B.dayPart(21), 'evening');
assert.strictEqual(B.dayPart(3), 'night');

// primer uso: se presenta; la segunda vez ya no
assert.ok(/PX/.test(B.greeting({}, Date.now(), { name: 'Javi' }, rng)));
const m1 = B.remember({}, 'visit', null, Date.now());
assert.strictEqual(m1.visits, 1);
assert.ok(!/soy PX/.test(B.greeting(m1, Date.now(), { name: 'Javi' }, rng)));

// vuelve tras días: menciona nombre y días
const old = Object.assign({}, m1, { lastVisit: Date.now() - 10 * 86400000 });
const g = B.greeting(old, Date.now(), { name: 'Javi' }, rng);
assert.ok(g.includes('Javi') && g.includes('10'));

// cierre normal, largo y con fallo; racha de fallos
assert.ok(B.line('game-end', m1, { name: 'Javi', code: 0, minutes: 10 }, rng));
assert.ok(/120/.test(B.line('game-end', m1, { name: 'Javi', code: 0, minutes: 120 }, rng)));
assert.ok(/Consola/.test(B.line('game-end', m1, { code: 1, minutes: 1 }, rng)));
let m = m1;
for (let i = 0; i < 3; i++) m = B.remember(m, 'game-end', { code: 1, minutes: 1 }, 0);
assert.strictEqual(m.crashStreak, 3);
assert.ok(/varios|Tercera/.test(B.line('game-end', m, { code: 1 }, rng)));
assert.strictEqual(B.remember(m, 'game-end', { code: 0, minutes: 5 }, 0).crashStreak, 0);
assert.strictEqual(B.line('no-existe', m1, {}, rng), null);

// memoria no muta la original
assert.strictEqual(m1.pets, 0); B.remember(m1, 'pet'); assert.strictEqual(m1.pets, 0);

// sueño y limpieza de texto
assert.ok(!B.shouldSleep(1000)); assert.ok(B.shouldSleep(90000));
assert.strictEqual(B.clean('  hola\n\u0007  mundo '), 'hola mundo');
assert.strictEqual(B.clean('x'.repeat(500), 10).length, 10);
assert.strictEqual(B.fill('Hola {name}{x}', { name: 'A' }), 'Hola A');
console.log('mascot ok');
