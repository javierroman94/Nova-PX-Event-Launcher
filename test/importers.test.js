'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const im = require('../lib/importers');
const { readZip } = require('../lib/zip');
const { writeZip } = require('../lib/zipwrite');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'novapx-imp-'));
const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');
(async () => {
  try {
    // detectar
    const mk = (entries) => readZip((() => { const f = path.join(tmp, 'z' + Math.random() + '.zip'); writeZip(f, entries); return fs.readFileSync(f); })());
    assert.strictEqual(im.detectZip(mk([{ name: 'novapx.json', data: '{}' }])), 'novapx');
    assert.strictEqual(im.detectZip(mk([{ name: 'modrinth.index.json', data: '{}' }])), 'mrpack');
    assert.strictEqual(im.detectZip(mk([{ name: 'manifest.json', data: '{}' }])), 'curse');
    assert.strictEqual(im.detectZip(mk([{ name: 'x.txt', data: '' }])), null);

    // Prism zip
    const mmc = JSON.stringify({ components: [{ uid: 'net.minecraft', version: '1.20.1' }, { uid: 'net.minecraftforge', version: '47.2.0' }] });
    const buf = (() => { const f = path.join(tmp, 'prism.zip'); writeZip(f, [
      { name: 'Mi Pack/mmc-pack.json', data: mmc }, { name: 'Mi Pack/instance.cfg', data: 'name=Mi Pack\nfoo=1' },
      { name: 'Mi Pack/.minecraft/mods/a.jar', data: 'A' }, { name: 'Mi Pack/.minecraft/config/x.toml', data: 'c' }, { name: 'Mi Pack/.minecraft/logs/latest.log', data: 'l' }]); return fs.readFileSync(f); })();
    const r1 = path.join(tmp, 'r1');
    const p = im.installPrism({ buffer: buf, root: r1 });
    assert.deepStrictEqual([p.name, p.mcVersion, p.loader.type, p.loader.version, p.files], ['Mi Pack', '1.20.1', 'forge', '47.2.0', 2]);
    assert.ok(fs.existsSync(path.join(r1, 'mods', 'a.jar')) && !fs.existsSync(path.join(r1, 'logs')));
    assert.throws(() => im.parseMmcPack({ components: [{ uid: 'net.minecraft', version: '1.21.1' }, { uid: 'net.neoforged', version: '1' }] }) && im.installPrism({ buffer: (() => { const f = path.join(tmp, 'nf.zip'); writeZip(f, [{ name: 'mmc-pack.json', data: JSON.stringify({ components: [{ uid: 'net.minecraft', version: '1.21.1' }, { uid: 'net.neoforged', version: '1' }] }) }]); return fs.readFileSync(f); })(), root: path.join(tmp, 'nf') }), /NeoForge/);

    // carpetas
    const fol = path.join(tmp, 'cf');
    fs.mkdirSync(path.join(fol, 'mods'), { recursive: true });
    fs.mkdirSync(path.join(fol, 'saves', 'w'), { recursive: true });
    fs.writeFileSync(path.join(fol, 'mods', 'm.jar'), 'M');
    fs.writeFileSync(path.join(fol, 'minecraftinstance.json'), JSON.stringify({ name: 'CF Pack', gameVersion: '1.20.1', baseModLoader: { name: 'forge-47.1.0', minecraftVersion: '1.20.1' } }));
    const info = im.inspectFolder(fol);
    assert.deepStrictEqual([info.source, info.name, info.mcVersion, info.loader.type, info.loader.version], ['CurseForge App', 'CF Pack', '1.20.1', 'forge', '47.1.0']);
    assert.strictEqual(im.inspectFolder(tmp + '/nada'), null);
    const dst = path.join(tmp, 'cfdst');
    assert.strictEqual(im.copyFolder(fol, dst), 1);
    assert.ok(!fs.existsSync(path.join(dst, 'saves')) && !fs.existsSync(path.join(dst, 'minecraftinstance.json')));

    // exportar -> instalar (ida y vuelta)
    const src = path.join(tmp, 'src');
    fs.mkdirSync(path.join(src, 'mods'), { recursive: true });
    fs.mkdirSync(path.join(src, 'config'));
    fs.mkdirSync(path.join(src, 'saves', 'w'), { recursive: true });
    fs.writeFileSync(path.join(src, 'mods', 'known.jar'), 'KNOWN');
    fs.writeFileSync(path.join(src, 'mods', 'casero.jar'), 'CASERO');
    fs.writeFileSync(path.join(src, 'mods', 'off.jar.disabled'), 'OFF');
    fs.writeFileSync(path.join(src, 'config', 'a.toml'), 'cfg');
    fs.writeFileSync(path.join(src, 'saves', 'w', 'level.dat'), 'secreto');
    const out = path.join(tmp, 'pack.novapx');
    const entry = { title: 'Mi Pack', emoji: '🌲', notes: 'hola', mcVersion: '1.21.1', loader: { type: 'fabric', version: '' }, settings: { ramGb: 6 } };
    const lookup = async (hs) => ({ [sha1('KNOWN')]: { url: 'https://cdn.modrinth.com/data/x/known.jar' }, [sha1('OFF')]: { url: 'https://cdn.modrinth.com/data/x/off.jar' } });
    const ex = await im.exportNovapx({ root: src, dest: out, entry, lookup, version: '1.0.19' });
    assert.deepStrictEqual([ex.linked, ex.bundled], [1, 2]);
    const z = readZip(fs.readFileSync(out));
    assert.ok(!z.names().some((n) => n.includes('saves')));
    assert.ok(z.has('overrides/mods/casero.jar') && z.has('overrides/config/a.toml') && !z.has('overrides/mods/known.jar'));
    const meta = JSON.parse(z.read('novapx.json').toString());
    assert.strictEqual(meta.files[0].urls[0], 'https://cdn.modrinth.com/data/x/known.jar');
    const ex2 = await im.exportNovapx({ root: src, dest: path.join(tmp, 'all.novapx'), entry, lookup, includeMods: 'bundle' });
    assert.deepStrictEqual([ex2.linked, ex2.bundled], [0, 3]);

    const r2 = path.join(tmp, 'r2');
    const got = await im.installNovapx({ buffer: fs.readFileSync(out), root: r2, download: async (u) => { assert.ok(u.startsWith('https://cdn.modrinth.com/')); return Buffer.from('KNOWN'); } });
    assert.deepStrictEqual([got.name, got.mcVersion, got.loader.type, got.settings.ramGb, got.files.length], ['Mi Pack', '1.21.1', 'fabric', 6, 1]);
    assert.strictEqual(fs.readFileSync(path.join(r2, 'mods', 'known.jar'), 'utf8'), 'KNOWN');
    assert.strictEqual(fs.readFileSync(path.join(r2, 'mods', 'casero.jar'), 'utf8'), 'CASERO');
    // huella mala
    await assert.rejects(im.installNovapx({ buffer: fs.readFileSync(out), root: path.join(tmp, 'r3'), download: async () => Buffer.from('MAL') }), /huella/);

    // seguridad
    assert.throws(() => im.parseNovapx({ format: 1, mcVersion: '1.21.1', files: [{ path: '../x.jar', sha1: 'a'.repeat(40), urls: ['https://cdn.modrinth.com/a'] }] }), /ruta/);
    assert.throws(() => im.parseNovapx({ format: 1, mcVersion: '1.21.1', files: [{ path: 'config/x.jar', sha1: 'a'.repeat(40), urls: ['https://cdn.modrinth.com/a'] }] }), /ruta/);
    assert.throws(() => im.parseNovapx({ format: 1, mcVersion: '1.21.1', files: [{ path: 'mods/x.jar', sha1: 'a'.repeat(40), urls: ['https://evil.com/a'] }] }), /verificable/);
    assert.throws(() => im.parseNovapx({ format: 2 }), /versión/);
    const evil = path.join(tmp, 'evil.novapx');
    writeZip(evil, [{ name: 'novapx.json', data: JSON.stringify({ format: 1, mcVersion: '1.21.1', files: [] }) }, { name: 'overrides/../../x.txt', data: 'x' }]);
    await assert.rejects(im.installNovapx({ buffer: fs.readFileSync(evil), root: path.join(tmp, 'r4'), download: async () => Buffer.alloc(0) }), /ruta/);
    console.log('importers.test OK');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exit(1); });
