'use strict';
const assert = require('assert');
const c = require('../renderer/nova-sound.js');
assert.strictEqual(c.SCALE.length, 6);
assert.strictEqual(c.note(0), 440);
assert.strictEqual(c.note(6), 440);
assert.strictEqual(c.note(-1), c.SCALE[5]);
for (let i = 0; i < c.SCALE.length; i++) assert.notStrictEqual(c.pickIndex(i, i / c.SCALE.length), i, 'no repite la misma nota');

// Sonidos de eventos: cada uno tiene notas audibles y el arranque clásico tiene su propia melodía.
{
  const core = require('../renderer/nova-sound.js');
  for (const k of ['ok', 'info', 'error']) assert.ok(core.EVENTS[k].length >= 2 && core.EVENTS[k].every((f) => f > 100 && f < 4000), `evento ${k}`);
  for (const k of ['default', 'xp', 'win7']) assert.ok(core.EVENTS.startup[k].length >= 3, `arranque ${k}`);
  assert.notDeepStrictEqual(core.EVENTS.startup.xp, core.EVENTS.startup.win7);
}
console.log('nova-sound.test OK');
