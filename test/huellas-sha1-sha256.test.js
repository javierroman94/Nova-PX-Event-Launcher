'use strict';
// Huellas de mods: manifiestos antiguos (solo sha1), nuevos (sha1 + sha256) y solo sha256.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const px = require('../lib/mods-px');
const { syncMods } = require('../lib/pack-install');
const { enforce } = require('../lib/lock');

const h = (alg, b) => crypto.createHash(alg).update(b).digest('hex');
const data = Buffer.from('contenido del mod');
const s1 = h('sha1', data);
const s256 = h('sha256', data);

// checkHashes: cada huella presente tiene que cuadrar y tiene que haber al menos una.
assert.strictEqual(px.checkHashes(data, { sha1: s1 }), true);
assert.strictEqual(px.checkHashes(data, { sha256: s256 }), true);
assert.strictEqual(px.checkHashes(data, { sha1: s1, sha256: s256 }), true);
assert.strictEqual(px.checkHashes(data, { sha1: s1, sha256: '0'.repeat(64) }), false);
assert.strictEqual(px.checkHashes(data, { sha1: '0'.repeat(40), sha256: s256 }), false);
assert.strictEqual(px.checkHashes(data, {}), false);
assert.strictEqual(px.checkHashes(data, { sha256: 'corta' }), false);

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'huellas-'));
  const modsDir = path.join(dir, 'mods');
  const stateFile = path.join(dir, '.managed-mods.json');
  const download = async () => data;
  const mod = (extra) => ({ name: 'Mod', url: 'https://ejemplo.test/Mod.jar', ...extra });

  // Solo sha256: se instala y se comprueba.
  await syncMods({ modsDir, stateFile, mods: [mod({ sha256: s256 })], download });
  assert.ok(fs.existsSync(path.join(modsDir, 'Mod.jar')));
  // El bloqueo del modpack no lo borra por «modificado» aunque la huella guardada sea sha256.
  enforce(dir);
  assert.ok(fs.existsSync(path.join(modsDir, 'Mod.jar')));

  // sha1 + sha256 con un sha256 equivocado: no se instala.
  fs.rmSync(modsDir, { recursive: true, force: true });
  await assert.rejects(syncMods({ modsDir, stateFile, mods: [mod({ sha1: s1, sha256: 'a'.repeat(64) })], download }), /no coincide/);
  assert.ok(!fs.existsSync(path.join(modsDir, 'Mod.jar')));

  // Sin ninguna huella: no se baja nada.
  await assert.rejects(syncMods({ modsDir, stateFile, mods: [mod({})], download }), /Falta el sha1 o sha256/);
  // Huellas mal formadas.
  await assert.rejects(syncMods({ modsDir, stateFile, mods: [mod({ sha1: 'xyz' })], download }), /sha1 .* no es válido/);
  await assert.rejects(syncMods({ modsDir, stateFile, mods: [mod({ sha256: 'xyz' })], download }), /sha256 .* no es válido/);

  // Solo sha1 (manifiestos antiguos) sigue funcionando.
  await syncMods({ modsDir, stateFile, mods: [mod({ sha1: s1 })], download });
  assert.ok(fs.existsSync(path.join(modsDir, 'Mod.jar')));
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('huellas-sha1-sha256.test OK');
})().catch((e) => { console.error(e); process.exit(1); });
