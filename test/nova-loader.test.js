'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const nl = require('../lib/nova-loader');
const perf = require('../lib/rendimiento');

const sha = (b) => crypto.createHash('sha512').update(b).digest('hex');
const files = { 'sodium-2.jar': Buffer.from('sodium2'), 'lithium-1.jar': Buffer.from('lithium1'), 'sodium-1.jar': Buffer.from('sodium1') };
const url = (f) => `https://cdn.modrinth.com/data/AAAAAAAA/versions/x/${f}`;
const mod = (slug, id, f) => ({ slug, id, project: 'AAAAAAAA', name: slug, version: '1', file: f, url: url(f), sha512: sha(files[f]), size: files[f].length });

(async () => {
  // Lo que llega de internet se sanea: solo cdn.modrinth.com, huella SHA-512 y nombres de archivo seguros.
  const lock = nl.cleanLock({
    version: '1.0.2',
    mc: {
      '1.21.1': { mods: [mod('sodium', 'sodium', 'sodium-2.jar'), mod('lithium', 'lithium', 'lithium-1.jar'), { ...mod('evil', 'evil', 'sodium-1.jar'), url: 'https://evil.example/x.jar' }, { ...mod('bad', 'bad', 'lithium-1.jar'), file: '../x.jar' }] },
      '../1.20': { mods: [mod('sodium', 'sodium', 'sodium-1.jar')] }
    }
  });
  assert.strictEqual(lock.version, '1.0.2');
  assert.deepStrictEqual(Object.keys(lock.mc), ['1.21.1']);
  assert.deepStrictEqual(lock.mc['1.21.1'].mods.map((m) => m.file), ['sodium-2.jar', 'lithium-1.jar']);
  assert.strictEqual(nl.cleanLock({ version: 'x', mc: {} }), null);
  assert.strictEqual(nl.entryFor(lock, '__proto__'), null);

  // Perfil Nova viejo (sin marca) con una copia anterior de Sodium: se ofrece pasarlo al loader Nova.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-loader-'));
  fs.mkdirSync(path.join(dir, 'mods'));
  fs.writeFileSync(path.join(dir, 'mods', 'sodium-old.jar'), 'viejo');
  fs.writeFileSync(path.join(dir, 'mods', 'mimod.jar'), 'del jugador');
  assert.strictEqual(nl.updateFor(dir, lock, '1.21.1').from, null);
  const modIdOf = (p) => ({ 'sodium-old.jar': 'sodium', 'mimod.jar': 'mimod' })[path.basename(p)] || null;
  const download = async (u) => files[u.split('/').pop()];

  // Una huella mala no instala nada.
  const bad = JSON.parse(JSON.stringify(lock));
  bad.mc['1.21.1'].mods[1].sha512 = 'a'.repeat(128);
  await assert.rejects(nl.installLock({ lock: bad, mc: '1.21.1', dir, download, modIdOf }), /huella/);
  assert.ok(!fs.existsSync(path.join(dir, 'mods', 'sodium-2.jar')));

  const r = await nl.installLock({ lock, mc: '1.21.1', dir, download, modIdOf });
  assert.strictEqual(r.version, '1.0.2');
  const now = fs.readdirSync(path.join(dir, 'mods')).sort();
  assert.deepStrictEqual(now, ['lithium-1.jar', 'mimod.jar', 'sodium-2.jar']); // la copia vieja de Sodium se fue, el mod del jugador se queda
  assert.strictEqual(nl.readMark(dir).version, '1.0.2');
  assert.strictEqual(nl.updateFor(dir, lock, '1.21.1'), null);

  // Versión nueva que cambia Sodium y quita Lithium: se actualiza solo lo que puso Nova.
  const lock2 = nl.cleanLock({ version: '1.0.3', mc: { '1.21.1': { mods: [mod('sodium', 'sodium', 'sodium-1.jar')] } } });
  const up = nl.updateFor(dir, lock2, '1.21.1');
  assert.deepStrictEqual([up.from, up.to], ['1.0.2', '1.0.3']);
  fs.renameSync(path.join(dir, 'mods', 'lithium-1.jar'), path.join(dir, 'mods', 'lithium-1.jar.disabled'));
  await nl.installLock({ lock: lock2, mc: '1.21.1', dir, download, modIdOf: (p) => (/sodium/.test(p) ? 'sodium' : null) });
  assert.deepStrictEqual(fs.readdirSync(path.join(dir, 'mods')).sort(), ['mimod.jar', 'sodium-1.jar']);
  fs.rmSync(dir, { recursive: true, force: true });

  // Gráficos según la PC.
  const GB = 1024 ** 3;
  assert.strictEqual(perf.graphicsLevel({ totalBytes: 4 * GB, cpus: 8 }), 'bajo');
  assert.strictEqual(perf.graphicsLevel({ totalBytes: 16 * GB, cpus: 8, gpu: 'integrada' }), 'medio');
  assert.strictEqual(perf.graphicsLevel({ totalBytes: 32 * GB, cpus: 12, gpu: 'dedicada' }), 'alto');
  assert.ok(perf.optionsLines('alto', '1.21.1').includes('simulationDistance:10'));
  assert.ok(perf.optionsLines('bajo', '1.15.2').includes('fancyGraphics:false'));
  assert.ok(!perf.optionsLines('medio', '1.16.5').some((l) => l.startsWith('simulationDistance')));

  // Modos Clásico y PvP.
  const pvp = perf.modeOptions('pvp', '1.21.1');
  assert.ok(pvp.includes('renderClouds:"false"') && pvp.includes('graphicsMode:0') && pvp.includes('particles:2'));
  assert.ok(perf.modeOptions('pvp', '1.16.5').includes('renderClouds:false'));
  assert.deepStrictEqual(perf.modeOptions('clasico', '1.21.1', 'alto').slice(0, -3), perf.optionsLines('alto', '1.21.1'));
  assert.ok(perf.modeOptions('clasico', '1.21.1').includes('bobView:true'));
  assert.strictEqual(perf.modeModules('pvp').cps, true);
  assert.strictEqual(perf.modeModules('clasico').smooth_anim, true);
  const merged = perf.mergeOptions('fov:0.7\nrenderDistance:20\nlang:es_es\n', ['renderDistance:8', 'maxFps:260']);
  assert.strictEqual(merged, 'fov:0.7\nrenderDistance:8\nlang:es_es\nmaxFps:260\n');
  assert.strictEqual(perf.optionValue(merged, 'lang'), 'es_es');
  assert.strictEqual(perf.packList('["vanilla","fabric","file/Nova-Pack.zip"]', false), '["vanilla","fabric"]');
  assert.strictEqual(perf.packList(null, true), '["vanilla","fabric","file/Nova-Pack.zip"]');
  assert.strictEqual(perf.packList(null, false, []), '[]');

  // La lista publicada en el repositorio es válida.
  const real = nl.cleanLock(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'nova-loader.json'), 'utf8')));
  assert.ok(real && Object.keys(real.mc).length >= 10);
  assert.ok(real.mc['1.21.1'].mods.some((m) => m.slug === 'sodium' && m.id === 'sodium'));
  console.log('nova-loader: ok');
})().catch((e) => { console.error(e); process.exit(1); });
