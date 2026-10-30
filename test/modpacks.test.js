'use strict';
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const mp = require('../lib/modpacks');
const { readZip } = require('../lib/zip');

// --- zip mínimo para las pruebas ---
const T = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function makeZip(files) {
  const locals = []; const cds = []; let off = 0;
  for (const [name, data] of Object.entries(files)) {
    const n = Buffer.from(name); const raw = Buffer.from(data); const def = zlib.deflateRawSync(raw);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc(raw), 14); lh.writeUInt32LE(def.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc(raw), 16); ch.writeUInt32LE(def.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, n, def); cds.push(ch, n); off += 30 + n.length + def.length;
  }
  const cd = Buffer.concat(cds); const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}

// zip
const z = readZip(makeZip({ 'a.txt': 'hola', 'dir/b.txt': 'mundo' }));
assert.strictEqual(z.read('dir/b.txt').toString(), 'mundo');
assert.throws(() => readZip(Buffer.from('no soy un zip')), /zip/);
console.log('  ok  zip: lee archivos comprimidos y rechaza basura');

// rutas y direcciones
assert.strictEqual(mp.safeRelPath('mods\\a.jar'), 'mods/a.jar');
for (const bad of ['../x', 'a/../../x', '/etc/passwd', 'C:\\x', '', 'a\0b']) assert.strictEqual(mp.safeRelPath(bad), null, bad);
assert.ok(mp.allowedUrl('https://cdn.modrinth.com/data/x/y.jar', mp.MODRINTH_HOSTS));
assert.ok(!mp.allowedUrl('http://cdn.modrinth.com/x', mp.MODRINTH_HOSTS));
assert.ok(!mp.allowedUrl('https://evil.example/x', mp.MODRINTH_HOSTS));
assert.strictEqual(mp.instanceIdFor('Mi Modpack Épico!'), 'mp-mi-modpack-epico');
assert.strictEqual(mp.instanceIdFor('A', ['mp-a']), 'mp-a-2');
assert.ok(/^[a-z0-9][a-z0-9_-]{0,39}$/.test(mp.instanceIdFor('x'.repeat(100))));
console.log('  ok  modpacks: rutas seguras, hosts permitidos e ids de instancia');

// loaders
const idx = (deps, files = []) => ({ formatVersion: 1, game: 'minecraft', name: 'P', dependencies: deps, files });
assert.deepStrictEqual(mp.parseMrpackIndex(idx({ minecraft: '1.21.1', 'fabric-loader': '0.16.9' })).loader, { type: 'fabric', version: '0.16.9' });
assert.deepStrictEqual(mp.parseMrpackIndex(idx({ minecraft: '1.20.1', forge: '47.2.0' })).loader, { type: 'forge', version: '47.2.0' });
assert.strictEqual(mp.parseMrpackIndex(idx({ minecraft: '1.21.1', neoforge: '21.1.1' })).unsupported, 'NeoForge');
assert.throws(() => mp.parseMrpackIndex({ formatVersion: 2 }), /formato/);
assert.throws(() => mp.parseMrpackIndex(idx({ minecraft: '1.21' }, [{ path: '../evil.jar', downloads: ['https://cdn.modrinth.com/x'] }])), /ruta/);
assert.deepStrictEqual(mp.parseCurseManifest({ manifestType: 'minecraftModpack', minecraft: { version: '1.20.1', modLoaders: [{ id: 'forge-47.2.0', primary: true }] }, files: [] }).loader, { type: 'forge', version: '47.2.0' });
console.log('  ok  modpacks: loaders de Modrinth y CurseForge, rutas peligrosas rechazadas');

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-'));
  const jar = Buffer.from('contenido-del-mod');
  const sha512 = crypto.createHash('sha512').update(jar).digest('hex');
  const url = 'https://cdn.modrinth.com/data/abc/mod.jar';
  const index = idx({ minecraft: '1.21.1', 'fabric-loader': '0.16.9' }, [
    { path: 'mods/mod.jar', hashes: { sha1: 'x', sha512 }, downloads: [url], fileSize: jar.length, env: { client: 'required' } },
    { path: 'mods/solo-servidor.jar', hashes: {}, downloads: [url], env: { client: 'unsupported' } }
  ]);
  const pack = makeZip({ 'modrinth.index.json': JSON.stringify(index), 'overrides/config/a.toml': 'x=1', 'client-overrides/options.txt': 'fov:90' });
  const seen = [];
  const r = await mp.installMrpack({ buffer: pack, root: tmp, download: async (u) => { seen.push(u); return jar; }, onProgress: () => {} });
  assert.strictEqual(r.files, 1);
  assert.strictEqual(r.overrides, 2);
  assert.strictEqual(fs.readFileSync(path.join(tmp, 'mods/mod.jar')).toString(), 'contenido-del-mod');
  assert.ok(fs.existsSync(path.join(tmp, 'config/a.toml')) && fs.existsSync(path.join(tmp, 'options.txt')));
  assert.ok(!fs.existsSync(path.join(tmp, 'mods/solo-servidor.jar')), 'lo que no es de cliente se omite');
  console.log('  ok  .mrpack: descarga, verifica huella y copia overrides');

  await assert.rejects(mp.installMrpack({ buffer: pack, root: path.join(tmp, 'b'), download: async () => Buffer.from('manipulado') }), /huella|descargar/);
  const evil = makeZip({ 'modrinth.index.json': JSON.stringify(idx({ minecraft: '1.21' })), 'overrides/../../fuera.txt': 'x' });
  await assert.rejects(mp.installMrpack({ buffer: evil, root: path.join(tmp, 'c'), download: async () => jar }), /ruta/);
  assert.ok(!fs.existsSync(path.join(tmp, '..', 'fuera.txt')));
  console.log('  ok  .mrpack: archivos manipulados y rutas fuera de la instancia se rechazan');

  const cm = { manifestType: 'minecraftModpack', name: 'C', overrides: 'overrides', minecraft: { version: '1.20.1', modLoaders: [{ id: 'forge-47.2.0', primary: true }] }, files: [{ projectID: 1, fileID: 10, required: true }, { projectID: 2, fileID: 20, required: true }, { projectID: 3, fileID: 30 }] };
  const cpack = makeZip({ 'manifest.json': JSON.stringify(cm), 'overrides/config/c.cfg': 'y' });
  const root2 = path.join(tmp, 'cf');
  const r2 = await mp.installCurse({
    buffer: cpack, root: root2,
    resolveFiles: async () => [
      { fileID: 10, fileName: 'a.jar', downloadUrl: 'https://edge.forgecdn.net/files/1/2/a.jar', classId: 6 },
      { fileID: 20, fileName: 'bloqueado.jar', downloadUrl: null, classId: 6 },
      { fileID: 30, fileName: 'pack.zip', downloadUrl: 'https://edge.forgecdn.net/files/3/4/pack.zip', classId: 12 }
    ],
    download: async () => jar
  });
  assert.strictEqual(r2.files, 2);
  assert.deepStrictEqual(r2.skipped, ['bloqueado.jar']);
  assert.ok(fs.existsSync(path.join(root2, 'mods/a.jar')) && fs.existsSync(path.join(root2, 'resourcepacks/pack.zip')) && fs.existsSync(path.join(root2, 'config/c.cfg')));
  console.log('  ok  CurseForge: instala, separa carpetas y avisa de los archivos bloqueados por su autor');
  fs.rmSync(tmp, { recursive: true, force: true });
})().catch((e) => { console.error(e); process.exit(1); });
