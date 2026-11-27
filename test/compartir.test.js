'use strict';
// Códigos para compartir modpacks: launcher (lib/compartir.js) y Worker (worker/pack.mjs + rutas /pack).
const assert = require('assert');
const share = require('../lib/compartir');

const good = { v: 1, n: 'Mi pack <b>', mc: '1.21.1', l: { t: 'fabric', v: '0.16.9' }, c: [['mod', 'AANobbMI', 'abcd1234'], ['shader', 'YL57xq9U', 'zzzz9999'], ['mod', 'AANobbMI', 'abcd1234']] };
const bads = [
  null, {}, { ...good, v: 2 }, { ...good, n: '   ' }, { ...good, mc: '1.21; rm -rf' }, { ...good, l: { t: 'bukkit', v: '' } },
  { ...good, c: [['mod', '../../x', 'abcd1234']] }, { ...good, c: [['datapack', 'AANobbMI', 'abcd1234']] }, { ...good, c: new Array(401).fill(['mod', 'AANobbMI', 'abcd1234']) },
  { ...good, c: 'nope' }
];

(async () => {
  const worker = await import('../worker/pack.mjs');
  for (const impl of [share.cleanPack, worker.cleanPack]) {
    const c = impl(good);
    assert.strictEqual(c.n, 'Mi pack b', 'sin < > en el nombre');
    assert.strictEqual(c.c.length, 2, 'sin repetidos');
    assert.deepStrictEqual(c.l, { t: 'fabric', v: '0.16.9' });
    for (const b of bads) assert.strictEqual(impl(b), null, JSON.stringify(b).slice(0, 80));
  }
  // Códigos
  assert.strictEqual(share.normalizeCode('npx-7k2 qf9x'), '7K2QF9X');
  assert.strictEqual(share.normalizeCode('NPX7K2QF9X'), '7K2QF9X');
  assert.strictEqual(share.normalizeCode('7K2QF9X'), '7K2QF9X');
  assert.strictEqual(share.normalizeCode('7K2QF0X'), '', '0 no existe en el alfabeto');
  assert.strictEqual(share.normalizeCode('<script>'), '');
  assert.strictEqual(share.formatCode('7K2QF9X'), 'NPX-7K2QF9X');
  for (let i = 0; i < 50; i++) assert.ok(share.CODE_RE.test(worker.newCode()));
  // buildPack solo deja lo que Modrinth reconoció
  const built = share.buildPack({ title: 'Prueba', mcVersion: '1.20.1', loader: { type: 'forge', version: '47.2.0' }, found: [{ type: 'mod', projectId: 'AANobbMI', versionId: 'abcd1234' }, { type: 'mod', projectId: 'bad', versionId: 'x' }] });
  assert.strictEqual(built.c.length, 1);
  assert.strictEqual(built.l.t, 'forge');

  // Rutas del Worker con un KV falso
  const { default: w } = await import('../worker/index.mjs');
  const kv = new Map();
  const env = { USERS: { async get(k, t) { const v = kv.get(k); return v === undefined ? null : t === 'json' ? JSON.parse(v) : v; }, async put(k, v, o) { kv.set(k, v); this.lastTtl = o && o.expirationTtl; }, async list() { return { keys: [], list_complete: true }; } } };
  const call = async (method, p, body) => {
    const r = await w.fetch(new Request(`https://w.test${p}`, { method, body: body ? JSON.stringify(body) : undefined, headers: { 'CF-Connecting-IP': '1.2.3.4' } }), env, { waitUntil() {} });
    return { s: r.status, j: await r.json() };
  };
  let r = await call('POST', '/pack', { pack: good });
  assert.strictEqual(r.s, 200);
  assert.ok(share.CODE_RE.test(r.j.code));
  assert.strictEqual(env.USERS.lastTtl, 60 * 60 * 24 * 90, 'caduca a los 90 días');
  const code = r.j.code;
  r = await call('GET', `/pack/${code}`);
  assert.strictEqual(r.s, 200);
  assert.strictEqual(r.j.pack.c.length, 2);
  assert.strictEqual((await call('GET', '/pack/AAAAAAA')).s, 404);
  assert.strictEqual((await call('GET', '/pack/..%2Fx')).s, 400);
  assert.strictEqual((await call('POST', '/pack', { pack: { ...good, c: [['mod', 'x', 'y']] } })).s, 400);
  // Límite: 6 creaciones por hora desde la misma IP
  let limited = false;
  for (let i = 0; i < 8; i++) if ((await call('POST', '/pack', { pack: good })).s === 429) limited = true;
  assert.ok(limited, 'crear códigos tiene límite');
  console.log('compartir.test OK');
})().catch((e) => { console.error(e); process.exit(1); });
