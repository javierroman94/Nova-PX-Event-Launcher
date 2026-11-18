'use strict';
const assert = require('assert');
const { NOVA_MODS, installNovaMods } = require('../lib/nova');
const packs = require('../lib/packs');

(async () => {
  // Salta lo que falla y junta lo instalado sin repetir.
  const r = await installNovaMods(async (slug) => { if (slug === 'iris') throw new Error('no'); return { installed: [`${slug}.jar`, 'fabric-api.jar'] }; });
  assert.deepStrictEqual(r.skipped, ['iris']);
  assert.strictEqual(r.installed.filter((f) => f === 'fabric-api.jar').length, 1);
  assert.ok(NOVA_MODS.length >= 10 && NOVA_MODS.some(([s]) => s === 'sodium'));

  // Perfil nova = Fabric con preset; optifine = Forge con preset.
  const mk = (loader) => packs.buildCustomEntry({ name: 'X', mcVersion: '1.21.1', loader });
  assert.deepStrictEqual([mk('nova').loader.type, mk('nova').preset], ['fabric', 'nova']);
  assert.deepStrictEqual([mk('optifine').loader.type, mk('optifine').preset], ['forge', 'optifine']);
  assert.strictEqual(mk('fabric').preset, undefined);
  assert.throws(() => mk('lunar'), /no soportado/i);

  // Snapshots solo si se piden.
  const man = { versions: [{ id: '1.21.1', type: 'release' }, { id: '24w14a', type: 'snapshot' }, { id: 'a1.0', type: 'old_alpha' }] };
  assert.deepStrictEqual(packs.releaseVersions(man), ['1.21.1']);
  assert.deepStrictEqual(packs.releaseVersions(man, { snapshots: true }), ['1.21.1', '24w14a']);
  // Nova Client: elige el .jar de la versión pedida, ignora sources y enlaces de otros sitios.
  const base = 'https://github.com/javierroman94/Nova-Client/releases/download/v0.1.0/';
  const rel = { assets: [
    { name: 'nova-client-0.1.0+mc1.21.1-sources.jar', browser_download_url: base + 'a-sources.jar' },
    { name: 'nova-client-0.1.0+mc1.21.1.jar', browser_download_url: base + 'nova-client-0.1.0%2Bmc1.21.1.jar' },
    { name: 'nova-client-0.1.0+mc1.20.1.jar', browser_download_url: 'https://evil.example/x.jar' }
  ] };
  const nova = require('../lib/nova');
  assert.strictEqual(nova.pickClientAsset(rel, '1.21.1').name, 'nova-client-0.1.0+mc1.21.1.jar');
  assert.strictEqual(nova.pickClientAsset(rel, '1.20.1'), null); // enlace fuera de GitHub
  assert.strictEqual(nova.pickClientAsset(rel, '1.8.9'), null);
  const os = require('os'); const fs = require('fs'); const path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-'));
  fs.mkdirSync(path.join(dir, 'mods')); fs.writeFileSync(path.join(dir, 'mods', 'nova-client-0.0.1+mc1.21.1.jar'), 'old');
  const got = await nova.installNovaClient({ request: async () => rel, download: async () => Buffer.from('jar'), dir, mc: '1.21.1' });
  assert.strictEqual(got, 'nova-client-0.1.0+mc1.21.1.jar');
  assert.deepStrictEqual(fs.readdirSync(path.join(dir, 'mods')), ['nova-client-0.1.0+mc1.21.1.jar']);
  console.log('nova.test.js OK');
})().catch((e) => { console.error(e); process.exit(1); });
