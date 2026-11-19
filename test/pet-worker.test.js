'use strict';
const assert = require('assert');
(async () => {
  const W = await import('../worker/pet/index.mjs');
  const id = '11111111-2222-3333-4444-555555555555';
  const kv = () => { const m = new Map(); return { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } }; };
  const req = (b) => new Request('https://x/chat', { method: 'POST', body: JSON.stringify(b), headers: { 'CF-Connecting-IP': '1.1.1.1' } });
  let calls = [];
  const ok = (text) => async (url, o) => { calls.push(JSON.parse(o.body)); return new Response(JSON.stringify({ content: [{ type: 'text', text }] }), { status: 200 }); };

  // parseReply
  const p = W.parseReply('¡Hola!\n#recuerda: le gusta Fabric\n#recuerda: sk-ant-abcdefghijklmnop\n#recuerda: juega de noche\n#recuerda: tercero');
  assert.strictEqual(p.text, '¡Hola!');
  assert.deepStrictEqual(p.remember, ['le gusta Fabric', 'juega de noche']);

  // readBody
  assert.strictEqual(W.readBody({ id: 'x', mode: 'chat', messages: [] }).error, 'bad_data');
  assert.strictEqual(W.readBody({ id, mode: 'chat', messages: [{ role: 'user', content: 'mi clave sk-ant-abcdefghijklmnop' }] }).error, 'secret');
  const r = W.readBody({ id, mode: 'chat', messages: [{ role: 'assistant', content: 'hola' }, { role: 'user', content: 'a' }, { role: 'user', content: 'b' }], log: 'no', memory: 'm' });
  assert.deepStrictEqual(r.messages, [{ role: 'user', content: 'a\nb' }]);
  assert.strictEqual(r.log, '', 'el registro solo se acepta en modo help');
  assert.ok(W.readBody({ id, mode: 'help', messages: [{ role: 'user', content: 'x' }], log: 'Exception' }).log === 'Exception');
  assert.ok(/registro/.test(W.buildSystem({ mode: 'help', log: 'boom', memory: 'm', messages: [] })));

  // sin clave: apagado
  assert.strictEqual((await W.handleChat(req({ id, mode: 'chat', messages: [{ role: 'user', content: 'hola' }] }), { PET: kv() })).status, 503);

  // flujo normal, límites por jugador
  const env = { PET: kv(), ANTHROPIC_KEY: 'k', PET_USER_DAILY: '2' };
  const body = { id, mode: 'chat', messages: [{ role: 'user', content: 'hola' }] };
  let res = await W.handleChat(req(body), env, ok('Hola, soy PX 🐼\n#recuerda: le gusta minar'));
  let j = await res.json();
  assert.strictEqual(res.status, 200); assert.strictEqual(j.text, 'Hola, soy PX 🐼'); assert.deepStrictEqual(j.remember, ['le gusta minar']); assert.strictEqual(j.left, 1);
  assert.strictEqual(calls[0].model, 'claude-haiku-5-5'); assert.ok(calls[0].max_tokens <= 200);
  await W.handleChat(req(body), env, ok('x'));
  res = await W.handleChat(req(body), env, ok('x'));
  assert.strictEqual(res.status, 429); assert.strictEqual((await res.json()).error, 'limit');

  // tope global y errores del proveedor
  assert.strictEqual((await W.handleChat(req(body), { PET: kv(), ANTHROPIC_KEY: 'k', PET_GLOBAL_DAILY: '0' }, ok('x'))).status, 429);
  res = await W.handleChat(req(body), { PET: kv(), ANTHROPIC_KEY: 'k' }, async () => new Response('no', { status: 500 }));
  assert.strictEqual(res.status, 502);
  console.log('pet-worker ok');
})().catch((e) => { console.error(e); process.exit(1); });
