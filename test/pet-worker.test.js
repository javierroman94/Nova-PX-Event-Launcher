'use strict';
const assert = require('assert');
(async () => {
  const W = await import('../worker/pet/index.mjs');
  const id = '11111111-2222-3333-4444-555555555555';
  const kv = () => { const m = new Map(); return { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } }; };
  const req = (b) => new Request('https://x/chat', { method: 'POST', body: JSON.stringify(b), headers: { 'CF-Connecting-IP': '1.1.1.1' } });
  // Durable Object de cuotas en memoria: como en Cloudflare, atiende una petición a la vez.
  const quota = () => {
    const store = new Map();
    let chain = Promise.resolve();
    const obj = new W.PetQuota({ storage: {
      get: async (ks) => new Map(ks.map((k) => [k, store.get(k)])),
      put: async (o) => { for (const [k, v] of Object.entries(o)) store.set(k, v); },
      getAlarm: async () => 1, setAlarm: async () => {}, deleteAll: async () => store.clear()
    } });
    return { store, idFromName: (n) => n, get: () => ({ fetch: (u, init) => { const p = chain.then(() => obj.fetch(new Request(u, init))); chain = p.catch(() => {}); return p; } }) };
  };
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
  assert.strictEqual(W.readBody({ id, mode: 'help', messages: [{ role: 'user', content: 'x' }], log: 'refresh_token=abcdefghijklmnop' }).error, 'secret');
  assert.strictEqual(W.readBody({ id, mode: 'help', messages: [{ role: 'user', content: 'x' }], log: '--session abcdefghijklmnop' }).error, 'secret');
  assert.ok(/registro/.test(W.buildSystem({ mode: 'help', log: 'boom', memory: 'm', messages: [] })));

  // sin clave: apagado
  assert.strictEqual((await W.handleChat(req({ id, mode: 'chat', messages: [{ role: 'user', content: 'hola' }] }), { PET: kv() })).status, 503);

  // flujo normal, límites por jugador
  const env = { PET: kv(), QUOTA: quota(), ANTHROPIC_KEY: 'k', PET_USER_DAILY: '2' };
  const body = { id, mode: 'chat', messages: [{ role: 'user', content: 'hola' }] };
  let res = await W.handleChat(req(body), env, ok('Hola, soy PX 🐼\n#recuerda: le gusta minar'));
  let j = await res.json();
  assert.strictEqual(res.status, 200); assert.strictEqual(j.text, 'Hola, soy PX 🐼'); assert.deepStrictEqual(j.remember, ['le gusta minar']); assert.strictEqual(j.left, 1);
  assert.strictEqual(calls[0].model, 'claude-haiku-5-5'); assert.ok(calls[0].max_tokens <= 200);
  await W.handleChat(req(body), env, ok('x'));
  res = await W.handleChat(req(body), env, ok('x'));
  assert.strictEqual(res.status, 429); assert.strictEqual((await res.json()).error, 'limit');

  // tope global y errores del proveedor
  assert.strictEqual((await W.handleChat(req(body), { PET: kv(), QUOTA: quota(), ANTHROPIC_KEY: 'k', PET_GLOBAL_DAILY: '0' }, ok('x'))).status, 429);
  res = await W.handleChat(req(body), { PET: kv(), QUOTA: quota(), ANTHROPIC_KEY: 'k' }, async () => new Response('no', { status: 500 }));
  assert.strictEqual(res.status, 502);
  // Workers AI (sin clave) y filtro de salida
  const ai = { run: async (model, o) => { calls.push({ model, o }); return { response: 'Hola desde Workers AI 🐼' }; } };
  res = await W.handleChat(req(body), { PET: kv(), QUOTA: quota(), AI: ai }, async () => { throw new Error('no debe llamar a Anthropic'); });
  j = await res.json();
  assert.strictEqual(res.status, 200); assert.strictEqual(j.text, 'Hola desde Workers AI 🐼');
  assert.strictEqual(calls[calls.length - 1].o.messages[0].role, 'system');
  const ai2 = { run: async () => ({ choices: [{ message: { content: 'Formato OpenAI 🐼' } }] }) };
  assert.strictEqual((await (await W.handleChat(req(body), { PET: kv(), QUOTA: quota(), AI: ai2 })).json()).text, 'Formato OpenAI 🐼');
  const bad = { run: async () => ({ response: 'eres un idiota' }) };
  assert.ok(!/idiota/.test((await (await W.handleChat(req(body), { PET: kv(), QUOTA: quota(), AI: bad })).json()).text));
  // Cuotas con Durable Object: muchas peticiones a la vez no pasan el límite.
  {
    const QUOTA = quota();
    const envQ = { PET: kv(), QUOTA, ANTHROPIC_KEY: 'k', PET_USER_DAILY: '3', PET_IP_DAILY: '100', PET_GLOBAL_DAILY: '100' };
    const rs = await Promise.all(Array.from({ length: 10 }, () => W.handleChat(req(body), envQ, ok('x'))));
    assert.strictEqual(rs.filter((x) => x.status === 200).length, 3, 'solo pasan 3 de 10 a la vez');
    assert.strictEqual([...QUOTA.store.entries()].find(([k]) => k.startsWith('g:'))[1], 3, 'el global no sube con los rechazados');
    const g0 = { PET: kv(), QUOTA: quota(), ANTHROPIC_KEY: 'k', PET_GLOBAL_DAILY: '3' };
    for (let i = 0; i < 3; i++) await W.handleChat(req({ ...body, id: `9999999${i}-2222-3333-4444-555555555555` }), g0, ok('x'));
    assert.strictEqual((await (await W.handleChat(req({ ...body, id: '99999999-2222-3333-4444-555555555555' }), g0, ok('x'))).json()).error, 'busy');
  }
  // Fail-closed: sin el binding QUOTA no se atiende ni se toca KV (nada de contadores no atómicos).
  {
    let kvUsed = false;
    const spy = { get: async () => { kvUsed = true; return null; }, put: async () => { kvUsed = true; } };
    let model = false;
    const r0 = await W.handleChat(req(body), { PET: spy, ANTHROPIC_KEY: 'k' }, async () => { model = true; return new Response('{}'); });
    assert.strictEqual(r0.status, 503);
    assert.strictEqual((await r0.json()).error, 'quota_unavailable');
    assert.ok(!kvUsed && !model, 'sin QUOTA no se usa KV ni se llama al modelo');
    const h = await (await W.default.fetch(new Request('https://x/health'), { ANTHROPIC_KEY: 'k' })).json();
    assert.strictEqual(h.on, false); assert.strictEqual(h.quota, false);
  }
  console.log('pet-worker ok');
})().catch((e) => { console.error(e); process.exit(1); });
