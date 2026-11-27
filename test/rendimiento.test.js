'use strict';
// Modo rendimiento (lib/rendimiento.js): qué mods se instalan y cuánta RAM se recomienda.
const assert = require('assert');
const r = require('../lib/rendimiento');

const slugs = (plan) => plan.install.map((a) => a[0]);

// Perfil Fabric vacío: todo el paquete
assert.deepStrictEqual(slugs(r.planPerfMods({ loader: 'fabric' })), ['sodium', 'lithium', 'ferrite-core', 'modernfix', 'entityculling']);
// Forge usa Embeddium; NeoForge prueba Sodium y luego Embeddium
assert.deepStrictEqual(slugs(r.planPerfMods({ loader: 'forge' })), ['embeddium', 'ferrite-core', 'modernfix', 'entityculling']);
assert.deepStrictEqual(r.planPerfMods({ loader: 'neoforge' }).install[0], ['sodium', 'embeddium']);
// Vanilla: no hay mods que poner
assert.strictEqual(r.planPerfMods({ loader: 'vanilla' }).unsupported, true);

// Lo que ya está no se repite (por Modrinth o por nombre de archivo)
let p = r.planPerfMods({ loader: 'fabric', installed: ['lithium'], fileNames: ['ferritecore-7.0.0-fabric.jar'] });
assert.deepStrictEqual(slugs(p), ['sodium', 'modernfix', 'entityculling']);
// Con OptiFine no se añade otro motor de render
p = r.planPerfMods({ loader: 'fabric', fileNames: ['OptiFabric-1.13.jar', 'OptiFine_1.20.1_HD_U_I6.jar'] });
assert.ok(!slugs(p).includes('sodium'));
assert.ok(p.skip.some((s) => s.slug === 'sodium' && s.reason === 'optifine'));
// Con Rubidium (Forge viejo) tampoco se pone Embeddium
p = r.planPerfMods({ loader: 'forge', fileNames: ['rubidium-0.6.4.jar'] });
assert.ok(!slugs(p).includes('embeddium'));
// "sodium-extra" no cuenta como Sodium
p = r.planPerfMods({ loader: 'fabric', fileNames: ['sodium-extra-0.5.jar'] });
assert.ok(slugs(p).includes('sodium'));

// RAM: según mods y sin dejar a la PC sin memoria
const GB = 1024 ** 3;
assert.strictEqual(r.recommendRamGb({ totalBytes: 16 * GB, mods: 0 }), 2);
assert.strictEqual(r.recommendRamGb({ totalBytes: 16 * GB, mods: 30 }), 3);
assert.strictEqual(r.recommendRamGb({ totalBytes: 16 * GB, mods: 100 }), 4);
assert.strictEqual(r.recommendRamGb({ totalBytes: 16 * GB, mods: 180 }), 6);
assert.strictEqual(r.recommendRamGb({ totalBytes: 32 * GB, mods: 400 }), 8);
assert.strictEqual(r.recommendRamGb({ totalBytes: 8 * GB, mods: 300 }), 4, 'con 8 GB no pasa de la mitad');
assert.strictEqual(r.recommendRamGb({ totalBytes: 4 * GB, mods: 300 }), 2, 'con 4 GB, lo mínimo');
assert.strictEqual(r.niceName('ferrite-core'), 'FerriteCore');
console.log('rendimiento.test OK');
