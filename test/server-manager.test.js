'use strict';
// Pruebas de lib/server-manager.js (sin internet: la red se simula). Ejecutar con: npm test
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const S = require('../lib/server-manager');

let count = 0;
async function test(name, fn) { await fn(); count++; console.log(`  ok  ${name}`); }

const json = (o) => ({ ok: true, status: 200, json: async () => o, text: async () => (typeof o === 'string' ? o : JSON.stringify(o)) });
const bin = (txt) => ({ ok: true, status: 200, headers: { get: () => String(txt.length) }, body: (async function* () { yield Buffer.from(txt); })() });

(async () => {
  await test('nombres y archivos seguros', () => {
    assert.ok(S.isSafeName('Mi servidor 1'));
    assert.ok(!S.isSafeName('../x'));
    assert.ok(!S.isSafeName('a/b'));
    assert.strictEqual(S.slug('Mi Servidor 1!'), 'mi-servidor-1');
    assert.ok(S.safeFile('EssentialsX-2.20.jar'));
    assert.ok(!S.safeFile('../evil.jar'));
    assert.ok(!S.safeFile('run.bat'));
  });

  await test('server.properties: cambia, añade y conserva comentarios', () => {
    const out = S.applyProperties('#hola\nmotd=viejo\nport=1\n', { motd: 'nuevo\nmalo=1', 'server-port': 25570, 'bad key': 'x' });
    const p = S.parseProperties(out);
    assert.strictEqual(p.motd, 'nuevo malo=1');
    assert.strictEqual(p['server-port'], '25570');
    assert.strictEqual(p.port, '1');
    assert.ok(!('bad key' in p));
    assert.ok(out.startsWith('#hola'));
  });

  await test('resuelve Paper y Purpur y Fabric', async () => {
    const f = async (url) => {
      if (url.includes('papermc.io') && url.endsWith('/builds')) return json({ builds: [{ build: 1, channel: 'experimental', downloads: { application: { name: 'p1.jar' } } }, { build: 5, channel: 'default', downloads: { application: { name: 'p5.jar' } } }] });
      if (url.includes('purpurmc.org')) return json({ builds: { latest: '2300' } });
      if (url.includes('versions/loader/1.21.1')) return json([{ loader: { version: '0.16.9', stable: true } }]);
      if (url.includes('versions/installer')) return json([{ version: '1.0.1', stable: true }]);
      throw new Error('url inesperada ' + url);
    };
    const p = await S.resolveServerJar('paper', '1.21.1', f);
    assert.ok(p.url.endsWith('/builds/5/downloads/p5.jar'));
    assert.ok((await S.resolveServerJar('purpur', '1.21.1', f)).url.endsWith('/1.21.1/2300/download'));
    assert.ok((await S.resolveServerJar('fabric', '1.21.1', f)).url.endsWith('/loader/1.21.1/0.16.9/1.0.1/server/jar'));
    await assert.rejects(S.resolveServerJar('paper', '../x', f));
  });

  await test('Forge y NeoForge usan instalador', async () => {
    const f = async (url) => {
      if (url.includes('promotions_slim')) return json({ promos: { '1.20.1-recommended': '47.3.0' } });
      if (url.includes('maven-metadata')) return json('<versions><version>21.1.5</version><version>21.1.9</version><version>20.4.1</version></versions>');
      throw new Error('url inesperada');
    };
    const fg = await S.resolveServerJar('forge', '1.20.1', f);
    assert.ok(fg.installer && fg.url.endsWith('forge-1.20.1-47.3.0-installer.jar'));
    const nf = await S.resolveServerJar('neoforge', '1.21.1', f);
    assert.strictEqual(nf.build, '21.1.9');
  });

  await test('crea, lista, exporta y borra si falla', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nsrv-'));
    const f = async (url) => {
      if (url.includes('papermc.io') && url.endsWith('/builds')) return json({ builds: [{ build: 7, channel: 'default', downloads: { application: { name: 'x.jar' } } }] });
      if (url.includes('downloads/x.jar')) return bin('JARDATA');
      throw new Error('url inesperada ' + url);
    };
    const made = await S.createServer({ root, name: 'Prueba Uno', type: 'paper', mc: '1.21.1', fetchImpl: f });
    assert.strictEqual(made.id, 'prueba-uno');
    assert.strictEqual(S.listServers(root).length, 1);
    const dir = S.serverDir(root, 'prueba-uno');
    assert.ok(/eula=false/.test(fs.readFileSync(path.join(dir, 'eula.txt'), 'utf8')));
    assert.ok(fs.existsSync(path.join(dir, 'plugins')));
    assert.deepStrictEqual(S.launchArgs(dir, S.readMeta(dir)).slice(2), ['-jar', 'server.jar', 'nogui']);
    fs.mkdirSync(path.join(dir, 'logs')); fs.writeFileSync(path.join(dir, 'logs', 'latest.log'), 'x');
    const zip = path.join(root, 'out.zip');
    S.exportServer(dir, zip);
    const z = fs.readFileSync(zip).toString('latin1');
    assert.ok(z.includes('server.properties') && z.includes('LEEME-NOVAPX.txt'));
    assert.ok(!z.includes('latest.log') && !z.includes('nova-server.json'));
    await assert.rejects(S.createServer({ root, name: 'Prueba Uno', type: 'paper', mc: '1.21.1', fetchImpl: f }), /Ya existe/);
    await assert.rejects(S.createServer({ root, name: 'Malo', type: 'paper', mc: '1.21.1', fetchImpl: async () => ({ ok: false, status: 500 }) }));
    assert.ok(!fs.existsSync(path.join(root, 'malo')));
    assert.throws(() => S.serverDir(root, '../etc'));
  });

  await test('Forge moderno arranca con archivo de argumentos', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nsrv-'));
    const a = path.join(dir, 'libraries', 'net', 'minecraftforge', 'forge', '1.20.1-47.3.0');
    fs.mkdirSync(a, { recursive: true });
    fs.writeFileSync(path.join(a, 'win_args.txt'), '');
    fs.writeFileSync(path.join(a, 'unix_args.txt'), '');
    const meta = { ramGb: 3, jar: null };
    assert.ok(S.launchArgs(dir, meta, 'win32').includes('@libraries/net/minecraftforge/forge/1.20.1-47.3.0/win_args.txt'));
    assert.ok(S.launchArgs(dir, meta, 'linux').some((x) => x.endsWith('unix_args.txt')));
  });

  await test('instala y quita plugins y datapacks (Modrinth simulado)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nsrv-'));
    fs.mkdirSync(path.join(dir, 'plugins'));
    fs.writeFileSync(path.join(dir, 'server.properties'), 'level-name=mundo\n');
    const meta = { type: 'paper', mc: '1.21.1' };
    const f = async (url) => {
      if (url.includes('/version?')) return json([{ version_type: 'release', files: [{ primary: true, filename: 'Plug.jar', url: 'https://cdn/Plug.jar' }] }]);
      if (url.startsWith('https://cdn/')) return bin('X');
      if (url.includes('/search?')) { assert.ok(decodeURIComponent(url).includes('categories:paper')); return json({ hits: [{ project_id: 'abcd1234', title: 'Plug' }] }); }
      throw new Error('url inesperada ' + url);
    };
    assert.strictEqual((await S.searchContent({ type: 'paper', mc: '1.21.1', kind: 'plugin', query: 'plug' }, f))[0].title, 'Plug');
    await S.installContent({ dir, meta, kind: 'plugin', projectId: 'abcd1234', fetchImpl: f });
    await S.installContent({ dir, meta, kind: 'datapack', projectId: 'abcd1234', fetchImpl: f });
    assert.ok(fs.existsSync(path.join(dir, 'mundo', 'datapacks', 'Plug.jar')));
    assert.strictEqual(S.listContent(dir, meta).length, 2);
    S.removeContent(dir, meta, 'plugin', 'Plug.jar');
    assert.strictEqual(S.listContent(dir, meta).length, 1);
    await assert.rejects(S.installContent({ dir, meta, kind: 'mod', projectId: 'abcd1234', fetchImpl: f }), /no usa/);
    await assert.rejects(S.installContent({ dir, meta, kind: 'plugin', projectId: '../x', fetchImpl: f }));
  });

  console.log(`  ${count} pruebas de server-manager`);
})().catch((e) => { console.error(e); process.exit(1); });
