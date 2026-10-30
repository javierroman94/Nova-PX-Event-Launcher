'use strict';
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const c = require('../lib/content');

// nombres seguros
assert.strictEqual(c.safeFileName('sodium.jar', 'mod'), 'sodium.jar');
assert.strictEqual(c.safeFileName('sodium.jar.disabled', 'mod'), 'sodium.jar.disabled');
for (const bad of ['../x.jar', 'a/b.jar', 'x.exe', '.oculto.jar', 'a\\b.jar', 'x.zip']) assert.strictEqual(c.safeFileName(bad, 'mod'), null, bad);
assert.strictEqual(c.safeFileName('Complementary.zip', 'shader'), 'Complementary.zip');
assert.throws(() => c.typeInfo('otra'), /desconocido/);
console.log('  ok  contenido: solo nombres de archivo simples y con la extensión correcta');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-'));
fs.mkdirSync(path.join(root, 'mods'));
fs.writeFileSync(path.join(root, 'mods', 'a.jar'), 'A');
fs.writeFileSync(path.join(root, 'mods', 'b.jar.disabled'), 'B');
fs.writeFileSync(path.join(root, 'mods', 'nota.txt'), 'x');
let list = c.listContent(root, 'mod');
assert.deepStrictEqual(list.map((x) => [x.file, x.enabled]).sort(), [['a.jar', true], ['b.jar.disabled', false]]);
assert.strictEqual(c.toggleContent(root, 'mod', 'a.jar'), 'a.jar.disabled');
assert.strictEqual(c.toggleContent(root, 'mod', 'b.jar.disabled'), 'b.jar');
assert.throws(() => c.toggleContent(root, 'mod', '../../etc.jar'), /no válido/);
c.removeContent(root, 'mod', 'b.jar');
assert.ok(!fs.existsSync(path.join(root, 'mods', 'b.jar')));
const src = path.join(root, 'externo.jar');
fs.writeFileSync(src, 'E');
assert.strictEqual(c.addLocalFile(root, 'mod', src), 'externo.jar');
assert.throws(() => c.addLocalFile(root, 'mod', src), /Ya tienes/);
assert.throws(() => c.addLocalFile(root, 'shader', src), /válido/);
console.log('  ok  contenido: listar, activar/desactivar, borrar y añadir archivos propios');

const out = c.buildContentList(
  [{ type: 'mod', file: 'z.jar.disabled', enabled: false, size: 1, hash: 'h1' }, { type: 'mod', file: 'casero.jar', enabled: true, size: 2, hash: 'h2' }],
  { h1: { project_id: 'P', version_number: '2.0' } },
  { P: { id: 'P', title: 'Alfa', icon_url: 'https://cdn.modrinth.com/i.png' } }
);
assert.deepStrictEqual(out.map((x) => [x.name, x.known, x.enabled]), [['Alfa', true, false], ['casero', false, true]]);
console.log('  ok  contenido: nombres e iconos de Modrinth, y respaldo con el nombre del archivo');

(async () => {
  const jar = (s) => Buffer.from(s);
  const sha = (b) => crypto.createHash('sha1').update(b).digest('hex');
  const files = { 'https://cdn.modrinth.com/main.jar': jar('principal'), 'https://cdn.modrinth.com/dep.jar': jar('dependencia') };
  const calls = [];
  const request = async (url) => {
    calls.push(url);
    if (url.includes('/project/MAIN/')) return [{ id: 'v', files: [{ primary: true, filename: 'main.jar', url: 'https://cdn.modrinth.com/main.jar', hashes: { sha1: sha(files['https://cdn.modrinth.com/main.jar']) } }], dependencies: [{ project_id: 'DEP', dependency_type: 'required' }, { project_id: 'OPC', dependency_type: 'optional' }] }];
    if (url.includes('/project/DEP/')) return [{ id: 'd', files: [{ filename: 'dep.jar', url: 'https://cdn.modrinth.com/dep.jar', hashes: { sha1: sha(files['https://cdn.modrinth.com/dep.jar']) } }], dependencies: [{ project_id: 'MAIN', dependency_type: 'required' }] }];
    return [];
  };
  const dl = async (u) => files[u];
  const root2 = path.join(root, 'inst');
  const r = await c.installFromModrinth({ request, download: dl, root: root2, type: 'mod', projectId: 'MAIN', mc: '1.21.1', loader: 'fabric' });
  assert.deepStrictEqual(r.installed.sort(), ['dep.jar', 'main.jar']);
  assert.ok(calls.every((u) => !u.includes('/project/OPC/')), 'las dependencias opcionales no se instalan');
  assert.ok(calls[0].includes('loaders=') && calls[0].includes('fabric'));
  console.log('  ok  Modrinth: instala el mod y sus dependencias obligatorias sin ciclos');

  await assert.rejects(c.installFromModrinth({ request: async () => [], download: dl, root: root2, type: 'shader', projectId: 'X', mc: '1.21.1' }), /No hay una versión/);
  await assert.rejects(c.installFromModrinth({ request: async () => [{ files: [{ filename: 'x.jar', url: 'https://evil.example/x.jar' }] }], download: dl, root: root2, type: 'mod', projectId: 'X', mc: '1.21.1' }), /permitido/);
  await assert.rejects(c.installFromModrinth({ request: async () => [{ files: [{ filename: 'y.jar', url: 'https://cdn.modrinth.com/main.jar', hashes: { sha1: 'mala' } }] }], download: dl, root: root2, type: 'mod', projectId: 'Y', mc: '1.21.1' }), /huella/);
  const s = await c.searchContent(async (u) => { assert.ok(u.includes('project_type%3Ashader') && u.includes('versions%3A1.21.1') && !u.includes('categories')); return { total_hits: 1, hits: [{ project_id: 'S', title: 'Shader' }] }; }, { type: 'shader', mc: '1.21.1', loader: 'fabric' });
  assert.strictEqual(s.items[0].title, 'Shader');
  console.log('  ok  Modrinth: sin versión compatible, descargas ajenas y huellas malas se rechazan');
  fs.rmSync(root, { recursive: true, force: true });
})().catch((e) => { console.error(e); process.exit(1); });
