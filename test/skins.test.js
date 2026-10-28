'use strict';
const assert = require('assert');
const skins = require('../lib/skins');

// Mojang devuelve las texturas con http://; el launcher debe usarlas por https.
const p = skins.normalizeProfile({
  id: 'a', name: 'x',
  skins: [{ state: 'ACTIVE', url: 'http://textures.minecraft.net/texture/ab12', variant: 'SLIM' }],
  capes: [{ id: 'c', state: 'ACTIVE', url: 'http://textures.minecraft.net/texture/cd34', alias: 'Founder' }]
});
assert.strictEqual(p.activeSkin.url, 'https://textures.minecraft.net/texture/ab12');
assert.strictEqual(p.activeSkin.variant, 'slim');
assert.strictEqual(p.activeCape.url, 'https://textures.minecraft.net/texture/cd34');
console.log('  ok  skins: las texturas de Mojang pasan de http a https');
