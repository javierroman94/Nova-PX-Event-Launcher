'use strict';
const assert = require('assert');
const { modrinth, curseforge } = require('../lib/providers');

(async () => {
  const urls = [];
  const m = modrinth(async (url) => {
    urls.push(url);
    if (url.includes('/search')) return { total_hits: 1, hits: [{ project_id: 'P', title: 'Pack', description: 'd', icon_url: 'http://x/i.png', downloads: 5, author: 'a', slug: 's' }] };
    return [
      { id: 'v1', name: 'Pack 1.0', version_number: '1.0', game_versions: ['1.21.1'], loaders: ['fabric'], files: [{ url: 'https://cdn.modrinth.com/a.mrpack', primary: true, size: 3 }] },
      { id: 'v2', loaders: ['neoforge'], files: [{ url: 'https://cdn.modrinth.com/b.mrpack' }] },
      { id: 'v3', loaders: [], files: [] }
    ];
  });
  const s = await m.search({ query: 'tech pack' });
  assert.ok(urls[0].includes('index=relevance') && urls[0].includes('project_type%3Amodpack'));
  assert.strictEqual(s.items[0].icon, '', 'iconos http se descartan');
  assert.strictEqual(s.items[0].url, 'https://modrinth.com/modpack/s');
  const v = await m.versions('P');
  assert.deepStrictEqual(v.map((x) => [x.id, x.supported]), [['v1', true], ['v2', false]]);
  console.log('  ok  Modrinth: búsqueda y versiones (NeoForge se marca como no soportado)');

  const calls = [];
  const c = curseforge(async (url, o = {}) => {
    calls.push([url, o]);
    if (url.includes('/search')) return { pagination: { totalCount: 1 }, data: [{ id: 7, name: 'CF', summary: 's', logo: { thumbnailUrl: 'https://media.forgecdn.net/a.png' }, downloadCount: 9, authors: [{ name: 'z' }], links: { websiteUrl: 'https://www.curseforge.com/minecraft/modpacks/cf' } }] };
    if (url.endsWith('/mods/files')) return { data: [{ id: 10, modId: 1, fileName: 'a.jar', downloadUrl: 'https://edge.forgecdn.net/a.jar', hashes: [{ algo: 1, value: 'abc' }] }] };
    if (url.endsWith('/mods')) return { data: [{ id: 1, classId: 12 }] };
    return { data: [{ id: 3, displayName: 'F', fileName: 'f.zip', downloadUrl: null, gameVersions: ['1.20.1', 'Forge'] }] };
  }, 'KEY');
  assert.strictEqual((await c.search({ query: '' })).items[0].title, 'CF');
  assert.strictEqual(calls[0][1].headers['x-api-key'], 'KEY');
  assert.ok(calls[0][0].includes('sortField=2'));
  const cv = await c.versions('7');
  assert.deepStrictEqual([cv[0].blocked, cv[0].loaders, cv[0].mcVersions], [true, ['forge'], ['1.20.1']]);
  const rf = await c.resolveFiles([{ fileID: 10, projectID: 1 }]);
  assert.deepStrictEqual([rf[0].sha1, rf[0].classId], ['abc', 12]);
  console.log('  ok  CurseForge: búsqueda, versiones bloqueadas y resolución de archivos');
})().catch((e) => { console.error(e); process.exit(1); });
