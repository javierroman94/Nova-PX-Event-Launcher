'use strict';
const assert = require('assert');
const { seasonFor, easter, mothersDay } = require('../renderer/seasons');
const at = (y, m, d) => seasonFor(new Date(y, m - 1, d));

// Pascua conocida
assert.strictEqual(easter(2026).toDateString(), new Date(2026, 3, 5).toDateString());
assert.strictEqual(easter(2027).toDateString(), new Date(2027, 2, 28).toDateString());
// Día de la Madre: segundo domingo de mayo (10 mayo 2026, 9 mayo 2027)
assert.strictEqual(mothersDay(2026).toDateString(), new Date(2026, 4, 10).toDateString());
assert.strictEqual(mothersDay(2027).toDateString(), new Date(2027, 4, 9).toDateString());

// Hoy (17 nov) no hay decoración
assert.strictEqual(at(2026, 11, 17), '');
assert.strictEqual(at(2026, 11, 3), '');
assert.strictEqual(at(2026, 11, 30), '');
// Halloween 15 oct – 2 nov
assert.strictEqual(at(2026, 10, 14), '');
assert.strictEqual(at(2026, 10, 15), 'halloween');
assert.strictEqual(at(2026, 11, 2), 'halloween');
// Navidad 1 – 26 dic, Año Nuevo 27 dic – 6 ene
assert.strictEqual(at(2026, 12, 1), 'navidad');
assert.strictEqual(at(2026, 12, 26), 'navidad');
assert.strictEqual(at(2026, 12, 27), 'anio');
assert.strictEqual(at(2027, 1, 6), 'anio');
assert.strictEqual(at(2027, 1, 7), '');
// San Valentín 7 – 14 feb; Carnaval 2026 = 10 al 17 feb (martes 17); en 2027 = 2 al 9 feb
assert.strictEqual(at(2026, 2, 7), 'sanvalentin');
assert.strictEqual(at(2026, 2, 9), 'sanvalentin');
assert.strictEqual(at(2026, 2, 10), 'carnaval');
assert.strictEqual(at(2026, 2, 17), 'carnaval');
assert.strictEqual(at(2026, 2, 18), '');
assert.strictEqual(at(2027, 2, 9), 'carnaval');
assert.strictEqual(at(2027, 2, 10), 'sanvalentin'); // termina Carnaval y sigue San Valentín
// Día de la Madre y 10 de Agosto
assert.strictEqual(at(2026, 5, 3), 'madres');
assert.strictEqual(at(2026, 5, 10), 'madres');
assert.strictEqual(at(2026, 5, 11), '');
assert.strictEqual(at(2026, 8, 10), 'ecuador');
assert.strictEqual(at(2026, 8, 11), '');
console.log('seasons.test OK');
