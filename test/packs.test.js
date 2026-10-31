'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const packs = require('../lib/packs');
const { readZip } = require('../lib/zip');
const { crc32 } = require('../lib/zipwrite');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'novapx-packs-'));
try {
  // ajustes
  assert.deepStrictEqual(packs.sanitizeSettings({ ramGb: '6', javaPath: ' C:\\j\\java.exe ', jvmArgs: 'a\nb', width: 1280, height: 720, fullscreen: true }),
    { ramGb: 6, javaPath: 'C:\\j\\java.exe', jvmArgs: 'a b', fullscreen: true, width: 1280, height: 720 });
  assert.deepStrictEqual(packs.sanitizeSettings({ ramGb: 999, width: 10 }), {});
  assert.strictEqual(packs.mergeSettings({ ramGb: 4, jvmArgs: '' }, { ramGb: 8 }).ramGb, 8);
  assert.strictEqual(packs.mergeSettings({ ramGb: 4 }, {}).ramGb, 4);

  // versiones
  assert.deepStrictEqual(packs.releaseVersions({ versions: [{ id: '1.21.1', type: 'release' }, { id: '24w14a', type: 'snapshot' }, { id: '../x', type: 'release' }] }), ['1.21.1']);

  // crear
  const e = packs.buildCustomEntry({ name: '  Mi  Survival ', icon: '🌲x', mcVersion: '1.21.1', loader: 'Fabric', existingIds: ['mp-mi-survival'] });
  assert.strictEqual(e.id, 'mp-mi-survival-2');
  assert.strictEqual(e.provider, 'custom');
  assert.strictEqual(e.loader.type, 'fabric');
  assert.strictEqual(e.emoji, '🌲');
  assert.throws(() => packs.buildCustomEntry({ name: '', mcVersion: '1.21.1' }), /nombre/);
  assert.throws(() => packs.buildCustomEntry({ name: 'x', mcVersion: '../..' }), /versión/);
  assert.throws(() => packs.buildCustomEntry({ name: 'x', mcVersion: '1.21.1', loader: 'quilt' }), /Loader/);

  // respaldo + zip válido
  const root = path.join(tmp, 'inst');
  fs.mkdirSync(path.join(root, 'saves', 'Mundo 1', 'region'), { recursive: true });
  fs.writeFileSync(path.join(root, 'saves', 'Mundo 1', 'level.dat'), Buffer.alloc(5000, 7));
  fs.writeFileSync(path.join(root, 'saves', 'Mundo 1', 'region', 'r.0.0.mca'), 'hola');
  fs.writeFileSync(path.join(root, 'saves', 'Mundo 1', 'session.lock'), 'x');
  const b = packs.backupWorld(root, 'Mundo 1', new Date('2026-01-02T03:04:05Z'));
  assert.strictEqual(b.files, 2);
  assert.match(b.name, /^mundo-1-2026-01-02-03-04-05\.zip$/);
  const z = readZip(fs.readFileSync(path.join(root, 'backups', b.name)));
  const names = z.names();
  assert.ok(names.includes('Mundo 1/level.dat'), JSON.stringify(names));
  assert.strictEqual(z.read('Mundo 1/level.dat').length, 5000);
  assert.strictEqual(z.read('Mundo 1/region/r.0.0.mca').toString(), 'hola');
  assert.throws(() => packs.backupWorld(root, '../etc'), /no válido/);
  assert.strictEqual(packs.listBackups(root).length, 1);
  assert.strictEqual(crc32(Buffer.from('123456789')), 0xcbf43926);

  // duplicar
  fs.mkdirSync(path.join(root, 'mods'));
  fs.writeFileSync(path.join(root, 'mods', 'a.jar'), 'j');
  fs.mkdirSync(path.join(root, 'logs'));
  fs.writeFileSync(path.join(root, 'logs', 'latest.log'), 'l');
  packs.duplicateDir(root, path.join(tmp, 'copia'), { withWorlds: false });
  assert.ok(fs.existsSync(path.join(tmp, 'copia', 'mods', 'a.jar')));
  assert.ok(!fs.existsSync(path.join(tmp, 'copia', 'saves')));
  assert.ok(!fs.existsSync(path.join(tmp, 'copia', 'logs')));
  assert.ok(!fs.existsSync(path.join(tmp, 'copia', 'backups')));

  // actualizar mods
  (async () => {
    const h1 = 'a'.repeat(40), h2 = 'b'.repeat(40), h3 = 'c'.repeat(40);
    const request = async (url, o) => {
      assert.strictEqual(o.method, 'POST');
      assert.deepStrictEqual(o.body.game_versions, ['1.21.1']);
      return {
        [h1]: { version_number: '2.0', files: [{ primary: true, filename: 'a-2.jar', url: 'https://cdn.modrinth.com/a', hashes: { sha1: 'D'.repeat(40) } }] },
        [h2]: { version_number: '1.0', files: [{ filename: 'b.jar', url: 'u', hashes: { sha1: h2 } }] }
      };
    };
    const r = await packs.planModUpdates({ request, mc: '1.21.1', loader: 'fabric', items: [
      { hash: h1, file: 'a-1.jar', enabled: true }, { hash: h2, file: 'b.jar', enabled: false }, { hash: h3, file: 'c.jar', enabled: true }] });
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].newFile, 'a-2.jar');
    assert.strictEqual(r[0].sha1, 'd'.repeat(40));
    console.log('packs.test OK');
    fs.rmSync(tmp, { recursive: true, force: true });
  })().catch((e2) => { console.error(e2); process.exit(1); });
} catch (err) {
  fs.rmSync(tmp, { recursive: true, force: true });
  throw err;
}
