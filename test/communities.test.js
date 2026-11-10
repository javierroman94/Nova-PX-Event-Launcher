'use strict';
const assert = require('assert');
const c = require('../lib/communities');

assert.strictEqual(c.normalizeCode(' nova-7k3q 92xd '), 'NOVA7K3Q92XD');
const code = c.makeCode();
assert.match(code, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);

const com = { id: 'novapx', name: 'Nova PX', remoteBase: 'https://raw.githubusercontent.com/o/r/main/data', owners: ['javierroman94', 'x'], description: 'Eventos' };
let reg = c.addEntry(null, com, code);
const found = c.lookup(reg, code.toLowerCase().replace(/-/g, ' '));
assert.strictEqual(found.name, 'Nova PX');
assert.deepStrictEqual(found.owners, ['javierroman94'], 'se descartan nicks inválidos');
assert.strictEqual(c.lookup(reg, 'AAAA-BBBB-CCCC-DDDD'), null, 'código equivocado');
assert.strictEqual(c.lookup(reg, 'abc'), null, 'código demasiado corto');

// otra comunidad en el mismo registro; el primero sigue funcionando
const code2 = c.makeCode();
reg = c.addEntry(reg, { ...com, id: 'otra', name: 'Otra' }, code2);
assert.strictEqual(c.lookup(reg, code2).name, 'Otra');
assert.strictEqual(c.lookup(reg, code).name, 'Nova PX');
// el registro no contiene el nombre ni el repositorio en claro
const text = JSON.stringify(reg);
assert.ok(!text.includes('Nova PX') && !text.includes('raw.githubusercontent'));
// un código no abre la entrada de otro
const tampered = { entries: { [c.codeId(code)]: reg.entries[c.codeId(code2)] } };
assert.strictEqual(c.lookup(tampered, code), null);

assert.strictEqual(c.sanitizeCommunity({ ...com, remoteBase: 'https://evil.example/x' }), null);
assert.strictEqual(c.sanitizeCommunity({ ...com, id: '../x' }), null);
assert.deepStrictEqual(c.parseRepoInput('https://github.com/a/b.git'), { owner: 'a', repo: 'b', branch: 'main' });
assert.deepStrictEqual(c.parseRepoInput('a/b#dev'), { owner: 'a', repo: 'b', branch: 'dev' });
assert.strictEqual(c.parseRepoInput('nada'), null);
assert.strictEqual(c.baseFromRepo('a', 'b'), 'https://raw.githubusercontent.com/a/b/main/data');
console.log('communities.test OK');
