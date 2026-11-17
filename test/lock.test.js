'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { enforce } = require('../lib/lock');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-'));
const w = (p, c = 'x') => { fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), c); };
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');
w('mods/ok.jar', 'bueno'); w('mods/cambiado.jar', 'MALO'); w('mods/extra.jar'); w('mods/sub/otro.jar');
w('resourcepacks/mi-pack.zip'); w('shaderpacks/bsl.zip'); w('saves/mundo/level.dat'); w('options.txt');
w('.managed-mods.json', JSON.stringify(['ok.jar', 'cambiado.jar']));
w('.managed-hashes.json', JSON.stringify({ 'ok.jar': sha1('bueno'), 'cambiado.jar': sha1('original') }));

const removed = enforce(dir);
assert.ok(fs.existsSync(path.join(dir, 'mods/ok.jar')));
assert.ok(!fs.existsSync(path.join(dir, 'mods/extra.jar')));
assert.ok(!fs.existsSync(path.join(dir, 'mods/sub')));
assert.ok(!fs.existsSync(path.join(dir, 'mods/cambiado.jar')));
assert.ok(!fs.existsSync(path.join(dir, 'resourcepacks/mi-pack.zip')));
assert.ok(!fs.existsSync(path.join(dir, 'shaderpacks/bsl.zip')));
assert.ok(fs.existsSync(path.join(dir, 'saves/mundo/level.dat')));
assert.ok(fs.existsSync(path.join(dir, 'options.txt')));
assert.strictEqual(removed.length, 5);

// con el bloqueo apagado no se toca nada
w('mods/libre.jar'); w('resourcepacks/libre.zip');
assert.deepStrictEqual(enforce(dir, { mods: false, resourcepacks: false, shaderpacks: false }), []);
assert.ok(fs.existsSync(path.join(dir, 'mods/libre.jar')));
fs.rmSync(dir, { recursive: true, force: true });
console.log('lock.test OK');

{
  const assert = require('assert');
  const fs = require('fs'); const os = require('os'); const path = require('path');
  const L = require('../lib/lock');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lk-'));
  fs.mkdirSync(path.join(d, 'mods'));
  fs.writeFileSync(path.join(d, 'mods', 'csl.jar'), 'x');
  fs.writeFileSync(path.join(d, 'mods', 'otro.jar'), 'y');
  fs.writeFileSync(path.join(d, '.managed-mods.json'), '[]');
  fs.writeFileSync(path.join(d, '.extra-mods.json'), JSON.stringify(['csl.jar']));
  L.enforce(d);
  assert.deepStrictEqual(fs.readdirSync(path.join(d, 'mods')), ['csl.jar']);
  console.log('ok lock respeta .extra-mods.json');
}
