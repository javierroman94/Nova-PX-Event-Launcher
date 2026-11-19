'use strict';
const assert = require('assert');
const G = require('../renderer/game-events.js');
const P = (l, n = 'Steve') => G.parse(l, n);

assert.deepStrictEqual(P('[12:00:01] [Server thread/INFO]: Steve has made the advancement [Stone Age]'), { type: 'advancement', what: 'Stone Age', challenge: false, goal: false });
assert.strictEqual(P('[12:00:01] [Server thread/INFO]: Alex has made the advancement [Stone Age]'), null, 'avance de otro');
assert.strictEqual(P('[12:00:01] [Server thread/INFO]: Steve has completed the challenge [Adventuring Time]').challenge, true);
assert.strictEqual(P('[12:00:02] [Server thread/INFO]: Steve tried to swim in lava').how, 'lava');
assert.strictEqual(P('[12:00:02] [Server thread/INFO]: Steve fell from a high place').how, 'caida');
assert.strictEqual(P('[12:00:02] [Server thread/INFO]: Steve was blown up by Creeper').how, 'explosion');
assert.strictEqual(P('[12:00:02] [Server thread/INFO]: Steve was slain by Zombie').by, 'Zombie');
assert.strictEqual(P('[12:00:02] [Server thread/INFO]: Alex tried to swim in lava'), null, 'muerte de otro');
assert.strictEqual(P('[12:00:02] [Server thread/INFO]: Steve joined the game'), null);
assert.strictEqual(P('[12:00:03] [Render thread/INFO]: Connecting to play.ejemplo.net, 25565').host, 'play.ejemplo.net');
assert.strictEqual(P('[12:00:04] [Render thread/INFO]: [CHAT] <Alex> hola Steve!').type, 'mention');
assert.strictEqual(P('[12:00:04] [Render thread/INFO]: [CHAT] <Steve> hola Steve!'), null, 'tu propio mensaje');
assert.strictEqual(P('', 'Steve'), null);
assert.strictEqual(P('cualquier cosa'), null);
// Reacciones con texto, nombre y sin "{" sin rellenar.
const r = G.reaction(P('[1] [Server thread/INFO]: Steve has made the advancement [Stone Age]'), { name: 'Steve' }, () => 0);
assert.ok(r.includes('Stone Age') && !r.includes('{'));
assert.ok(G.reaction({ type: 'server', host: 'x.net' }, { name: 'A' }).includes('x.net'));
assert.strictEqual(G.reaction(null), null);
console.log('game-events.test OK');
