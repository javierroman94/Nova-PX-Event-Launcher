'use strict';
// Prueba del Durable Object de amigos/chat con un almacenamiento falso en memoria.
const assert = require('assert');
(async () => {
  const { Presence } = await import('../worker/index.mjs');
  const mem = new Map();
  const storage = {
    async get(k) { return Array.isArray(k) ? new Map(k.filter((x) => mem.has(x)).map((x) => [x, structuredClone(mem.get(x))])) : structuredClone(mem.get(k)); },
    async put(k, v) { mem.set(k, structuredClone(v)); },
    async delete(k) { mem.delete(k); }
  };
  const mk = () => new Presence({ storage });
  const call = async (d, op, body) => { const r = await d.fetch(new Request('https://presence/' + op, { method: 'POST', body: JSON.stringify(body) })); return { s: r.status, ...(await r.json()) }; };
  const A = { nick: 'Alice', token: 'a'.repeat(20) }, B = { nick: 'Bobby', token: 'b'.repeat(20) };
  let d = mk();
  assert.strictEqual((await call(d, 'sync', { ...A, playing: false })).s, 200);
  assert.strictEqual((await call(d, 'sync', { nick: 'Alice', token: 'x'.repeat(20) })).s, 401, 'otro token no puede usar el nick');
  assert.strictEqual((await call(d, 'send', { ...A, to: 'Bobby', text: 'hola' })).s, 403, 'chat solo entre amigos');
  assert.strictEqual((await call(d, 'request', { ...A, to: 'Alice' })).s, 400);
  assert.strictEqual((await call(d, 'request', { ...A, to: 'Bobby' })).status, 'pending');
  d = mk(); // el Worker se "reinicia": el estado persiste
  let sb = await call(d, 'sync', { ...B, playing: true });
  assert.deepStrictEqual(sb.incoming, ['Alice']);
  assert.strictEqual((await call(d, 'accept', { ...B, to: 'Alice' })).status, 'accepted');
  let sa = await call(d, 'sync', { ...A });
  assert.strictEqual(sa.friends.length, 1);
  assert.strictEqual(sa.friends[0].online, true, 'Bobby está en línea aunque el DO se reinició');
  assert.strictEqual(sa.friends[0].playing, true);
  await call(d, 'send', { ...A, to: 'Bobby', text: '  hola  ' });
  sb = await call(d, 'sync', { ...B });
  assert.strictEqual(sb.friends[0].unread, 1);
  const p = await call(d, 'poll', { ...B, with: 'Alice', since: 0 });
  assert.strictEqual(p.messages[0].t, 'hola');
  assert.strictEqual((await call(d, 'sync', { ...B })).friends[0].unread, 0);
  assert.strictEqual((await call(d, 'request', { ...A, to: 'Bobby' })).s, 409);
  await call(d, 'remove', { ...A, to: 'Bobby' });
  assert.strictEqual((await call(d, 'sync', { ...B })).friends.length, 0);
  // solicitud cruzada se acepta sola
  await call(d, 'request', { ...A, to: 'Bobby' });
  assert.strictEqual((await call(d, 'request', { ...B, to: 'Alice' })).status, 'accepted');
  // Actividad para la tarjeta de amigo: qué juega y sus horas (solo si el jugador lo comparte)
  await call(d, 'sync', { ...B, playing: true, act: { g: 'Evento: <b>Skyblock</b>\n', h: 42 } });
  let fa = (await call(d, 'sync', { ...A })).friends[0];
  assert.strictEqual(fa.game, 'Evento: b Skyblock /b', 'texto limpio, sin etiquetas ni saltos');
  assert.strictEqual(fa.hours, 42);
  await call(d, 'sync', { ...B, playing: false, act: { g: 'x', h: -3 } });
  fa = (await call(d, 'sync', { ...A })).friends[0];
  assert.strictEqual(fa.game, '', 'si no está jugando no se muestra qué juega');
  assert.strictEqual(fa.hours, null, 'horas no válidas se descartan');
  await call(d, 'sync', { ...B, playing: true, act: null });
  fa = (await call(d, 'sync', { ...A })).friends[0];
  assert.strictEqual(fa.game, '');
  assert.strictEqual(fa.hours, null, 'apagado: no se muestra nada');
  console.log('presence.test OK');
})().catch((e) => { console.error(e); process.exit(1); });
