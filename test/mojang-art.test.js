'use strict';
const assert = require('assert');
const { buildArtMap } = require('../lib/mojang-art');

const m = buildArtMap({ entries: [
  { type: 'release', version: '1.21', title: 'Minecraft: Java Edition 1.21', image: { url: '/v2/images/121540x540.jpg' } },
  { type: 'snapshot', version: '26.4-snapshot-1', image: { url: '/v2/images/x.jpg' } },
  { type: 'release', version: '1.20.1', image: { url: 'https://evil.example/v2/images/a.jpg' } }, // otro servidor: se ignora
  { type: 'release', version: '1.19', image: { url: '/otra-ruta/a.jpg' } },                         // ruta no permitida
  { type: 'release', version: '../x', image: { url: '/v2/images/a.jpg' } },
  { type: 'release', version: '1.18' }
] });
assert.deepStrictEqual(Object.keys(m), ['1.21']);
assert.strictEqual(m['1.21'].image, 'https://launchercontent.mojang.com/v2/images/121540x540.jpg');
assert.deepStrictEqual(buildArtMap(null), {});
const { wikiUrl, buildWikiMap } = require('../lib/mojang-art');
assert.ok(wikiUrl(['1.12', '1.9', '../x']).endsWith('Java%20Edition%201.12%7CJava%20Edition%201.9'));
const w = buildWikiMap({ query: { pages: {
  1: { title: 'Java Edition 1.12', thumbnail: { source: 'https://minecraft.wiki/images/thumb/a.png/600px-a.png' } },
  2: { title: 'Java Edition 1.9', thumbnail: { source: 'https://evil.example/images/a.png' } },
  3: { title: 'Otra cosa', thumbnail: { source: 'https://minecraft.wiki/images/a.png' } }
} } });
assert.deepStrictEqual(Object.keys(w), ['1.12']);
console.log('mojang-art.test OK');
