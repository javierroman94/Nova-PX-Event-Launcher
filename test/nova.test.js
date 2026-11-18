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
  console.log('nova.test.js OK');
})().catch((e) => { console.error(e); process.exit(1); });
