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

  console.log('friends.test OK');
})().catch((e) => { console.error(e); process.exit(1); });
