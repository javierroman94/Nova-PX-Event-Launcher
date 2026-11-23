'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const w = require('../lib/worlds');
const { writeZip } = require('../lib/zipwrite');

const s = (t) => { const b = Buffer.from(t, 'utf8'); const l = Buffer.alloc(2); l.writeUInt16BE(b.length); return Buffer.concat([l, b]); };
const tag = (t, name, payload) => Buffer.concat([Buffer.from([t]), s(name), payload]);
const i32 = (n) => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };
const i64 = (n) => { const b = Buffer.alloc(8); b.writeBigInt64BE(BigInt(n)); return b; };
function levelDat() {
  const version = tag(10, 'Version', Buffer.concat([tag(8, 'Name', s('1.21.4')), Buffer.from([0])]));
  const data = tag(10, 'Data', Buffer.concat([tag(4, 'LastPlayed', i64(1700000000000)), tag(3, 'GameType', i32(1)), version, Buffer.from([0])]));
  return zlib.gzipSync(Buffer.concat([Buffer.from([10]), s(''), data, Buffer.from([0])]));
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'worlds-'));
function mkWorld(saves, name) {
  const d = path.join(saves, name); fs.mkdirSync(path.join(d, 'region'), { recursive: true });
  fs.writeFileSync(path.join(d, 'level.dat'), levelDat()); fs.writeFileSync(path.join(d, 'session.lock'), 'x'); fs.writeFileSync(path.join(d, 'region', 'r.0.0.mca'), 'abc');
  return d;
}

test('lee versión, modo y última vez de level.dat', () => {
  const t = tmp(); const d = mkWorld(path.join(t, 'saves'), 'Survival');
  const lv = w.readLevel(d);
  assert.strictEqual(lv.version, '1.21.4'); assert.strictEqual(lv.gameMode, 'Creativo'); assert.strictEqual(lv.lastPlayed, 1700000000000);
  assert.strictEqual(w.readLevel(t), null);
  assert.deepStrictEqual(w.listWorlds(path.join(t, 'saves')).map((x) => [x.name, x.version, x.size > 0]), [['Survival', '1.21.4', true]]);
});

test('importa una carpeta sin session.lock y sin pisar nombres', () => {
  const t = tmp(); const src = mkWorld(path.join(t, 'otro', 'saves'), 'Mundo'); const root = path.join(t, 'pack');
  const a = w.importFolder(src, root); const b = w.importFolder(src, root);
  assert.strictEqual(a.name, 'Mundo'); assert.strictEqual(b.name, 'Mundo (2)');
  assert.ok(fs.existsSync(path.join(root, 'saves', 'Mundo', 'region', 'r.0.0.mca')));
  assert.ok(!fs.existsSync(path.join(root, 'saves', 'Mundo', 'session.lock')));
  assert.throws(() => w.importFolder(t, root), /level\.dat/);
});

test('importa un zip con carpeta raíz y rechaza rutas peligrosas', () => {
  const t = tmp(); const f = path.join(t, 'a.zip');
  fs.writeFileSync(path.join(t, 'l.dat'), levelDat()); fs.writeFileSync(path.join(t, 'x.txt'), 'x');
  writeZip(f, [{ name: 'Mi Mundo/level.dat', abs: path.join(t, 'l.dat') }, { name: 'Mi Mundo/../../evil.txt', abs: path.join(t, 'x.txt') }]);
  const root = path.join(t, 'pack'); const r = w.importZip(f, root);
  assert.strictEqual(r.name, 'Mi Mundo'); assert.ok(fs.existsSync(path.join(root, 'saves', 'Mi Mundo', 'level.dat')));
  assert.ok(!fs.existsSync(path.join(t, 'pack', 'evil.txt')) && !fs.existsSync(path.join(t, 'evil.txt')));
});

test('encuentra mundos del Minecraft oficial y de Prism', () => {
  const home = tmp(); mkWorld(path.join(home, '.minecraft', 'saves'), 'Oficial');
  const inst = path.join(home, '.local', 'share', 'PrismLauncher', 'instances', 'Mi inst');
  fs.mkdirSync(path.join(inst, '.minecraft'), { recursive: true });
  fs.writeFileSync(path.join(inst, 'instance.cfg'), 'name=Mi inst\n'); fs.writeFileSync(path.join(inst, 'mmc-pack.json'), JSON.stringify({ components: [{ uid: 'net.minecraft', version: '1.21.4' }] }));
  mkWorld(path.join(inst, '.minecraft', 'saves'), 'DePrism');
  const found = w.findSources({ home, platform: 'linux', env: {} });
  assert.ok(found.some((x) => x.launcher === 'Minecraft oficial' && x.name === 'Oficial'));
  assert.ok(found.some((x) => x.launcher === 'Prism Launcher' && x.name === 'DePrism'));
});
