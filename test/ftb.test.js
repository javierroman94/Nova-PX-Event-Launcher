'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { ftb, parseFtbManifest, installFtb } = require('../lib/ftb');

const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');
const file = (name, dir, data, extra = {}) => ({ name, path: dir, url: `https://edge.forgecdn.net/files/${name}`, mirrors: [`https://files.feed-the-beast.com/blob/${name}`], hashes: { sha1: sha1(Buffer.from(data)) }, size: data.length, type: 'mod', ...extra });
const manifest = (over = {}) => ({
  targets: [{ type: 'game', name: 'minecraft', version: '1.20.1' }, { type: 'modloader', name: 'forge', version: '47.2.0' }, { type: 'runtime', name: 'java', version: '17' }],
  files: [file('a.jar', './mods/', 'AAA'), file('c.json', './config/x/', 'CCC', { type: 'config' }), file('srv.jar', './mods/', 'SSS', { serveronly: true })],
  ...over
});

(async () => {
  // manifest
  const info = parseFtbManifest(manifest());
  assert.deepStrictEqual([info.mcVersion, info.loader, info.files.map((f) => f.path)], ['1.20.1', { type: 'forge', version: '47.2.0' }, ['mods/a.jar', 'config/x/c.json']]);
  assert.strictEqual(parseFtbManifest(manifest({ targets: [{ type: 'game', name: 'minecraft', version: '1.21.1' }, { type: 'modloader', name: 'neoforge', version: '21.1.77' }] })).loader.type, 'neoforge');
  assert.strictEqual(parseFtbManifest(manifest({ targets: [{ type: 'game', name: 'minecraft', version: '1.21.1' }, { type: 'modloader', name: 'quilt', version: '0.26.0' }] })).unsupported, 'Quilt');
  assert.throws(() => parseFtbManifest(manifest({ files: [file('x.jar', './../../', 'x')] })), /ruta no permitida/);
  assert.throws(() => parseFtbManifest(manifest({ files: [{ ...file('x.jar', './mods/', 'x'), url: 'https://evil.example/x.jar', mirrors: [] }] })), /descarga permitida/);
  assert.throws(() => parseFtbManifest({}), /formato/);

  // instalación: usa el espejo si el primer enlace falla, y rechaza huellas malas
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftb-'));
  const bodies = { 'a.jar': 'AAA', 'c.json': 'CCC' };
  const hits = [];
  const download = async (u) => {
    hits.push(u);
    if (u.includes('forgecdn')) throw new Error('caído');
    return Buffer.from(bodies[u.split('/').pop()]);
  };
  const r = await installFtb({ manifest: manifest(), root, download });
  assert.deepStrictEqual([r.files, r.loader.type], [2, 'forge']);
  assert.strictEqual(fs.readFileSync(path.join(root, 'mods', 'a.jar'), 'utf8'), 'AAA');
  assert.ok(fs.existsSync(path.join(root, 'config', 'x', 'c.json')) && !fs.existsSync(path.join(root, 'mods', 'srv.jar')), 'no baja archivos solo de servidor');
  await assert.rejects(installFtb({ manifest: manifest(), root: path.join(root, 'bad'), download: async () => Buffer.from('MAL') }), /No se pudo descargar/);

  // búsqueda y versiones
  const urls = [];
  const p = ftb(async (u) => {
    urls.push(u);
    if (u.includes('/search/')) return { packs: [5, 6], total: 2 };
    if (/\/modpack\/5$/.test(u)) return { id: 5, name: 'Pack', synopsis: 's', installs: 9, slug: 'pack', art: [{ type: 'square', url: 'https://cdn.feed-the-beast.com/i.png' }], authors: [{ name: 'FTB Team' }], versions: [{ id: 10, name: '1.0', type: 'release' }, { id: 11, name: '1.1', type: 'release' }] };
    return { id: 6, private: true, name: 'Secreto' };
  });
  const s = await p.search({ query: 'sky' });
  assert.ok(urls[0].includes('term=sky'));
  assert.deepStrictEqual(s.items.map((x) => [x.provider, x.id, x.title, x.icon]), [['ftb', '5', 'Pack', 'https://cdn.feed-the-beast.com/i.png']], 'oculta los privados');
  assert.deepStrictEqual((await p.versions(5)).map((v) => v.id), ['11', '10'], 'la más nueva primero');
  console.log('  ok  FTB: manifest, instalación con espejos y huellas, búsqueda y versiones');
})().catch((e) => { console.error(e); process.exit(1); });
