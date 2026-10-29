'use strict';
const assert = require('assert');
const { buildModList, nameFromFile, lookup } = require('../lib/modrinth');

assert.strictEqual(nameFromFile('/x/mods/sodium_fabric-0.6.jar'), 'sodium fabric-0.6');
const list = buildModList(
  [{ file: 'b.jar', hash: 'h2' }, { file: 'a_mod.jar', hash: 'h1' }, { file: 'z.jar', hash: 'h3' }],
  { h1: { project_id: 'P1', version_number: '1.2' }, h3: { project_id: 'P3', version_number: '9' } },
  { P1: { title: 'Alfa', description: 'd', icon_url: 'https://cdn.modrinth.com/a.png', slug: 'alfa' }, P3: { title: 'Zeta', icon_url: 'http://malo/x.png', slug: 'z z' } }
);
assert.deepStrictEqual(list.map((m) => m.name), ['Alfa', 'b', 'Zeta']);
assert.strictEqual(list[1].known, false);
assert.strictEqual(list[2].icon, '', 'los iconos que no son https se descartan');
assert.strictEqual(list[2].url, 'https://modrinth.com/mod/z%20z');
console.log('  ok  modrinth: lista de mods, orden alfabético y datos seguros');

(async () => {
  const calls = [];
  const r = await lookup([{ file: 'a.jar', hash: 'h1' }], async (url, o) => {
    calls.push(url);
    return url.endsWith('/version_files') ? { h1: { project_id: 'P1' } } : [{ id: 'P1', title: 'Alfa' }];
  });
  assert.strictEqual(r.projects.P1.title, 'Alfa');
  assert.strictEqual(calls.length, 2);
  assert.deepStrictEqual(await lookup([], async () => assert.fail('no debe llamar')), {});
  console.log('  ok  modrinth: consulta por huellas y luego por proyectos');
})();
