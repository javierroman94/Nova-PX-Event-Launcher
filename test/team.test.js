'use strict';
const assert = require('assert');
const { sanitizeTeam } = require('../lib/admin');
const t = sanitizeTeam([
  { nick: 'Amigo_1', role: 'Fundador', tribute: true, years: ' 1990 – 2024 ', tributeText: 'Siempre con nosotros' },
  { nick: 'Otro', role: 'Dev', tributeText: 'no debe guardarse', years: 'x' },
  { nick: 'Feat', featured: true }
]);
assert.deepStrictEqual(t[0], { nick: 'Amigo_1', role: 'Fundador', tribute: true, years: '1990 – 2024', tributeText: 'Siempre con nosotros' });
assert.deepStrictEqual(t[1], { nick: 'Otro', role: 'Dev' });
assert.strictEqual(t[2].featured, true);
assert.strictEqual(sanitizeTeam([{ nick: 'A', tribute: true, tributeText: 'x'.repeat(900) }])[0].tributeText.length, 300);
console.log('team.test OK');
