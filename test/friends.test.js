'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const f = require('../lib/friends');

(async () => {
  let l = f.add([], 'Ana_1', 'yoo');
  l = f.add(l, 'Bob', 'yoo');
  assert.throws(() => f.add(l, 'ana_1'), /Ya está/);
  assert.throws(() => f.add(l, 'yoo', 'YOO'), /eres tú/);
  assert.throws(() => f.add(l, 'a b'), /3 a 16/);
  assert.deepStrictEqual(f.remove(l, 'BOB'), ['Ana_1']);
  const m = f.merge(l, { Bob: { online: true, playing: true } });
  assert.deepStrictEqual(m.map((x) => x.nick), ['Bob', 'Ana_1']);
  assert.strictEqual(m[0].playing, true);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fr-')), 'f.json');
  f.save(file, l);
  assert.deepStrictEqual(f.load(file), l);
  assert.deepStrictEqual(f.load(path.join(os.tmpdir(), 'no-existe.json')), []);

  const { Presence } = await import('../worker/index.mjs');
  const p = new Presence();
  const call = async (pth, body) => (await p.fetch(new Request(`https://x${pth}`, { method: 'POST', body: JSON.stringify(body) }))).json();
  assert.deepStrictEqual(await call('/beat', { nick: 'Ana_1', playing: true }), { ok: true });
  assert.strictEqual((await call('/beat', { nick: 'x' })).error, 'bad_nick');
  const q = await call('/query', { nicks: ['ana_1', 'Zed', 'mal nick'] });
  assert.deepStrictEqual(q.status, { ana_1: { online: true, playing: true }, Zed: { online: false, playing: false } });
  await call('/leave', { nick: 'Ana_1' });
  assert.strictEqual((await call('/query', { nicks: ['Ana_1'] })).status.Ana_1.online, false);
  p.m.set('old', { last: Date.now() - 999999, playing: false });
  assert.strictEqual((await call('/query', { nicks: ['old'] })).status.old.online, false, 'sin latido reciente = desconectado');
  console.log('friends.test OK');
})().catch((e) => { console.error(e); process.exit(1); });
