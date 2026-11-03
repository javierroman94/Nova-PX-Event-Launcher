'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const t = require('../lib/telemetry');

(async () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tl-')), 'id');
  const id = t.installId(f);
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.strictEqual(t.installId(f), id, 'el id se conserva');
  assert.deepStrictEqual(t.buildPing({ id, session: { mode: 'premium', name: 'Ana_1' }, version: '1.0.25', platform: 'win32' }), { id, nick: 'Ana_1', premium: true, version: '1.0.25', os: 'win32' });
  assert.strictEqual(t.buildPing({ id, session: { mode: 'offline', name: 'Bob' }, version: '1.0.25', platform: 'win32' }).premium, false);
  assert.strictEqual(t.buildPing({ id, session: null, version: '1.0.25', platform: 'sunos' }).nick, '');
  assert.strictEqual(t.buildPing({ id, session: { mode: 'offline', name: 'mal nick!' }, version: '1', platform: 'linux' }).nick, '');
  assert.strictEqual(t.validUrl('https://x.workers.dev/'), 'https://x.workers.dev');
  assert.strictEqual(t.validUrl('http://x.dev'), '');
  const now = Date.now();
  const s = t.summarize([{ nick: 'a', premium: true, last: now, version: '1.0.1' }, { nick: '', premium: false, last: now - 3 * 86400000, version: '1.0.1' }, { nick: 'b', premium: false, last: now - 40 * 86400000, version: '1.0.0' }], now);
  assert.deepStrictEqual([s.total, s.named, s.premium, s.day, s.week, s.month, s.versions['1.0.1']], [3, 2, 1, 1, 2, 2, 2]);

  // Worker con KV falso
  const { default: worker } = await import('../worker/index.mjs');
  const store = new Map();
  const env = {
    ADMIN_KEY: 'k'.repeat(24),
    USERS: {
      async get(k) { return store.has(k) ? JSON.parse(store.get(k)) : null; },
      async put(k, v) { store.set(k, v); },
      async delete(k) { store.delete(k); },
      async list({ prefix }) { return { keys: [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }; }
    }
  };
  const call = (method, p, body, auth) => worker.fetch(new Request(`https://w.dev${p}`, { method, body: body ? JSON.stringify(body) : undefined, headers: auth ? { Authorization: `Bearer ${auth}` } : {} }), env);
  const ping = { id: '11111111-2222-3333-4444-555555555555', nick: 'Ana', premium: true, version: '1.0.25', os: 'win32' };
  assert.strictEqual((await call('POST', '/ping', ping)).status, 200);
  assert.strictEqual((await call('POST', '/ping', { ...ping, nick: 'mal nick' })).status, 400);
  assert.strictEqual((await call('POST', '/ping', { ...ping, id: 'x' })).status, 400);
  assert.strictEqual((await call('GET', '/users')).status, 401);
  assert.strictEqual((await call('GET', '/users', null, 'x'.repeat(24))).status, 401);
  assert.strictEqual((await call('POST', '/ping', ping)).status, 200);
  const list = await (await call('GET', '/users', null, env.ADMIN_KEY)).json();
  assert.strictEqual(list.users.length, 1);
  assert.strictEqual(list.users[0].nick, 'Ana');
  assert.strictEqual(list.users[0].count, 1, 'dos pings seguidos no reescriben el registro (límite de KV)');
  assert.strictEqual((await call('DELETE', `/users/${ping.id}`, null, env.ADMIN_KEY)).status, 200);
  assert.strictEqual((await (await call('GET', '/users', null, env.ADMIN_KEY)).json()).users.length, 0);
  assert.strictEqual((await worker.fetch(new Request('https://w.dev/users'), { ...env, ADMIN_KEY: '' })).status, 401, 'sin clave configurada nadie entra');
  console.log('telemetry.test OK');
})().catch((e) => { console.error(e); process.exit(1); });
