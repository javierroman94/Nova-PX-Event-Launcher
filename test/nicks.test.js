'use strict';
const assert = require('assert');
const N = require('../lib/nicks');

const c = N.collect(
  [{ name: 'Evento A', winners: ['Ana', 'bad nick!'], roster: [{ nick: 'Beto' }], collabs: [{ nick: 'ana' }], commissioner: { nick: 'Cris' } }, { name: 'B', winner: 'Dan' }],
  [{ nick: 'Eva' }, { nick: '' }]
);
assert.deepStrictEqual(c.map((x) => x.nick).sort(), ['Ana', 'Beto', 'Cris', 'Dan', 'Eva']);
assert.deepStrictEqual(c.find((x) => x.nick === 'Ana').where, ['Evento A · ganador', 'Evento A · colaboración']);

const m = N.sanitizeMap({ map: { ana: { uuid: '91578310-ebad-4567-a6f4-750bc0b947c7', name: 'AnaNueva' }, malo: { uuid: 'xx', name: 'x' }, 'no valido!': { uuid: '91578310ebad4567a6f4750bc0b947c7', name: 'Z' }, beto: { uuid: '91578310ebad4567a6f4750bc0b947c7', name: 'Beto', hidden: 1 } } });
assert.deepStrictEqual(Object.keys(m.map).sort(), ['ana', 'beto']);
assert.strictEqual(m.map.ana.uuid, '91578310ebad4567a6f4750bc0b947c7');
assert.strictEqual(m.map.beto.hidden, true);
assert.deepStrictEqual(N.aliasFor(m.map, 'ANA'), { name: 'AnaNueva', hidden: false });
assert.strictEqual(N.aliasFor(m.map, 'zzz'), null);

const w = N.sanitizeWarnings([{ id: 'a', kind: 'rename', nick: 'Ana', from: 'Ana', to: 'AnaNueva', status: 'open', where: ['x'] }, { id: '', nick: 'x' }, { id: 'b', kind: 'otro', nick: 'Beto', status: 'raro' }]);
assert.strictEqual(w.length, 2);
assert.strictEqual(w[1].kind, 'rename');
assert.strictEqual(w[1].status, 'open');
const many = Array.from({ length: 200 }, (_, i) => ({ id: 'i' + i, at: '', kind: 'rename', nick: 'n', from: '', to: '', where: [], status: i % 2 ? 'ok' : 'open' }));
assert.strictEqual(N.trimWarnings(many).length, N.MAX_WARNINGS);
assert.strictEqual(N.trimWarnings(many)[0].status, 'open');
// Revisión por turnos: primero los nunca revisados, luego los más antiguos.
const order = N.scanOrder([{ nick: 'Viejo' }, { nick: 'Nuevo' }, { nick: 'Medio' }], { viejo: { uuid: 'a'.repeat(32), name: 'Viejo', at: 5 }, medio: { uuid: 'b'.repeat(32), name: 'Medio', at: 50 } });
assert.deepStrictEqual(order.map((x) => x.nick), ['Nuevo', 'Viejo', 'Medio']);
assert.strictEqual(N.sanitizeMap({ map: { abc: { uuid: 'a'.repeat(32), name: 'Abc', at: 123 } } }).map.abc.at, 123);
console.log('nicks.test OK');
