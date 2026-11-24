'use strict';
// Amigos 2.0 en el Worker: estados, bloqueo, invitaciones, party, verificación de nick y avisos en tiempo real.
const assert = require('assert');
(async () => {
  const { Presence } = await import('../worker/index.mjs');
  const mem = new Map();
  const storage = {
    async get(k) { return Array.isArray(k) ? new Map(k.filter((x) => mem.has(x)).map((x) => [x, structuredClone(mem.get(x))])) : structuredClone(mem.get(k)); },
    async put(k, v) { mem.set(k, structuredClone(v)); },
    async delete(k) { mem.delete(k); },
    async list() { return new Map(); }
  };
  // Conexiones falsas: cada nick puede tener un "socket" que anota lo que recibe.
  const inbox = {};
  const sockets = {};
  const state = { storage, getWebSockets: (tag) => sockets[tag] || [] };
  const plug = (nick) => { inbox[nick] = []; sockets[nick.toLowerCase()] = [{ deserializeAttachment: () => ({ ok: true, nick }), send: (d) => inbox[nick].push(JSON.parse(d)) }]; };
  const d = new Presence(state, {});
  const call = async (op, body) => { const r = await d.fetch(new Request('https://presence/' + op, { method: 'POST', body: JSON.stringify(body) })); return { s: r.status, ...(await r.json()) }; };
  const A = { nick: 'Alice', token: 'a'.repeat(20) }, B = { nick: 'Bobby', token: 'b'.repeat(20) }, C = { nick: 'Carla', token: 'c'.repeat(20) };
  plug('Alice'); plug('Bobby'); plug('Carla');
  for (const x of [A, B, C]) await call('sync', x);
  await call('request', { ...A, to: 'Bobby' });
  assert.ok(inbox.Bobby.some((e) => e.t === 'req' && e.from === 'Alice'), 'aviso al instante de la solicitud');
  await call('accept', { ...B, to: 'Alice' });
  assert.ok(inbox.Alice.some((e) => e.t === 'accepted'));
  await call('request', { ...A, to: 'Carla' }); await call('accept', { ...C, to: 'Alice' });

  // Estados: invisible se ve desconectado; ausente y mensaje propio
  await call('status', { ...B, status: 'invisible', smsg: 'hola' });
  let fa = (await call('sync', A)).friends.find((f) => f.nick === 'Bobby');
  assert.strictEqual(fa.online, false); assert.strictEqual(fa.status, 'offline'); assert.strictEqual(fa.smsg, '');
  await call('status', { ...B, status: 'away', smsg: 'Buscando <equipo>' });
  fa = (await call('sync', A)).friends.find((f) => f.nick === 'Bobby');
  assert.strictEqual(fa.status, 'away'); assert.strictEqual(fa.smsg, 'Buscando equipo');
  assert.deepStrictEqual((await call('sync', B)).me, { verified: false, status: 'away', smsg: 'Buscando equipo' });

  // Chat: aviso, leído y límite de mensajes
  inbox.Bobby.length = 0;
  await call('send', { ...A, to: 'Bobby', text: 'hola' });
  assert.ok(inbox.Bobby.some((e) => e.t === 'msg' && e.from === 'Alice'));
  await call('poll', { ...B, with: 'Alice', since: 0 });
  assert.ok(inbox.Alice.some((e) => e.t === 'read'));
  assert.strictEqual((await call('poll', { ...A, with: 'Bobby', since: 0 })).read, 1, 'Alice ve que Bobby leyó');
  let slow = false;
  for (let i = 0; i < 25; i++) if ((await call('send', { ...A, to: 'Bobby', text: 'x' + i })).s === 429) slow = true;
  assert.ok(slow, 'límite de mensajes por minuto');

  // Invitar a jugar
  assert.strictEqual((await call('invite', { ...A, to: 'Bobby', inv: { k: 'pack', t: 'Mi pack', c: 'bad' } })).s, 400);
  assert.strictEqual((await call('invite', { ...A, to: 'Bobby', inv: { k: 'pack', t: 'Mi pack', c: '7K2QF9X', s: 'mc.ejemplo.com:25570', mc: '1.21.1' } })).s, 200);
  let sb = await call('sync', B);
  assert.strictEqual(sb.invites.length, 1);
  assert.deepStrictEqual({ k: sb.invites[0].k, c: sb.invites[0].c, s: sb.invites[0].s, from: sb.invites[0].from }, { k: 'pack', c: '7K2QF9X', s: 'mc.ejemplo.com:25570', from: 'Alice' });
  await call('dismiss', { ...B, id: sb.invites[0].id });
  assert.strictEqual((await call('sync', B)).invites.length, 0);

  // Party
  assert.strictEqual((await call('party', { ...A, a: 'create' })).s, 200);
  await call('party', { ...A, a: 'invite', to: 'Bobby' });
  await call('party', { ...A, a: 'invite', to: 'Carla' });
  sb = await call('sync', B);
  assert.strictEqual(sb.partyInvites.length, 1);
  assert.strictEqual((await call('party', { ...B, a: 'join', id: sb.partyInvites[0].id })).s, 200);
  let pa = (await call('sync', A)).party;
  assert.deepStrictEqual(pa.members.map((m) => m.nick), ['Alice', 'Bobby']);
  assert.deepStrictEqual(pa.invited, ['Carla']);
  assert.strictEqual((await call('party', { ...B, a: 'kick', to: 'Alice' })).s, 403, 'solo el líder');
  await call('party', { ...A, a: 'start', inv: { k: 'event', t: 'Murder Mistery' } });
  assert.ok((await call('sync', B)).invites.some((x) => x.k === 'event' && x.party));
  await call('party', { ...A, a: 'leave' });
  pa = (await call('sync', B)).party;
  assert.strictEqual(pa.leader, 'Bobby', 'si el líder se va, lidera el siguiente');

  // Bloquear: deja de ser amigo y sus solicitudes no llegan
  await call('block', { ...C, to: 'Alice' });
  assert.ok(!(await call('sync', A)).friends.some((f) => f.nick === 'Carla'));
  assert.deepStrictEqual((await call('sync', C)).blocked, ['Alice']);
  assert.strictEqual((await call('request', { ...A, to: 'Carla' })).status, 'pending');
  assert.deepStrictEqual((await call('sync', C)).incoming, [], 'la solicitud de alguien bloqueado no llega');
  await call('unblock', { ...C, to: 'Alice' });
  assert.deepStrictEqual((await call('sync', C)).blocked, []);

  // Verificación premium: alguien tomó el nick "Notch"; el dueño real lo recupera con Mojang
  const squat = { nick: 'Notch', token: 's'.repeat(20) };
  const owner = { nick: 'Notch', token: 'o'.repeat(20) };
  await call('sync', squat);
  assert.strictEqual((await call('sync', owner)).s, 401);
  const ch = await call('challenge', owner);
  assert.ok(/^[0-9a-f]{30}$/.test(ch.serverId));
  let asked = '';
  const fakeMojang = async (u) => { asked = u; return { status: 200, json: async () => ({ id: '069a79f444e94726a5befca90e38aaf5', name: 'Notch' }) }; };
  const vr = await d.verify(owner, fakeMojang);
  assert.strictEqual(vr.status, 200);
  assert.ok(asked.includes('username=Notch') && asked.includes(`serverId=${ch.serverId}`));
  assert.strictEqual((await call('sync', owner)).me.verified, true);
  const lost = await call('sync', squat);
  assert.strictEqual(lost.s, 401); assert.strictEqual(lost.error, 'verified_owner', 'el que lo había tomado lo pierde');
  // Sin reto o con Mojang diciendo que no: no se verifica
  assert.strictEqual((await d.verify(owner, fakeMojang)).status, 400, 'el reto se usa una sola vez');
  await call('challenge', squat);
  assert.strictEqual((await d.verify(squat, async () => ({ status: 204 }))).status, 403);
  console.log('amigos-worker.test OK');
})().catch((e) => { console.error(e); process.exit(1); });
