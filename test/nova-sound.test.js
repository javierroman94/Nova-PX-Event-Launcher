'use strict';
const assert = require('assert');
const c = require('../renderer/nova-sound.js');
assert.strictEqual(c.SCALE.length, 6);
assert.strictEqual(c.note(0), 440);
assert.strictEqual(c.note(6), 440);
assert.strictEqual(c.note(-1), c.SCALE[5]);
for (let i = 0; i < c.SCALE.length; i++) assert.notStrictEqual(c.pickIndex(i, i / c.SCALE.length), i, 'no repite la misma nota');
console.log('nova-sound.test OK');
