'use strict';
// Pruebas de lib/plugin-library.js (sin internet). Ejecutar con: npm test
const assert = require('assert');
const L = require('../lib/plugin-library');

let count = 0;
async function test(name, fn) { await fn(); count++; console.log(`  ok  ${name}`); }
const jar = (txt = 'x') => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(txt)]);
const BASE = 'https://github.com/o/r/releases/download/plugins-nova';
const PW = 'una frase larga y segura';

(async () => {
  await test('plugin público: se publica tal cual', () => {
    const { entry, asset, lock } = L.buildPlugin({ name: 'Mi Plugin', description: 'hola', file: 'MiPlugin-1.0.jar', data: jar(), locked: false, baseUrl: BASE });
    assert.strictEqual(entry.id, 'mi-plugin');
    assert.strictEqual(entry.locked, false);
    assert.ok(asset.data.equals(jar()));
    assert.strictEqual(lock, null);
    assert.ok(entry.url.startsWith(BASE + '/mi-plugin__'));
  });

  await test('plugin bloqueado: el archivo público va cifrado y solo se abre con la contraseña', async () => {
    const plain = jar('secreto');
    const b = L.buildPlugin({ name: 'Privado', file: 'Priv.jar', data: plain, locked: true, password: PW, baseUrl: BASE });
    assert.ok(!b.asset.data.includes(Buffer.from('secreto')));
    assert.ok(b.asset.name.endsWith('.enc'));
    const download = async () => b.asset.data;
    assert.ok((await L.fetchPlugin({ entry: b.entry, lock: b.lock, password: PW, download })).equals(plain));
    await assert.rejects(L.fetchPlugin({ entry: b.entry, lock: b.lock, password: 'otra contraseña distinta', download }), /BAD_KEY/);
    await assert.rejects(L.fetchPlugin({ entry: b.entry, lock: b.lock, password: '', download }), /LOCKED/);
  });

  await test('un segundo bloqueado exige la misma contraseña y reutiliza el candado', async () => {
    const a = L.buildPlugin({ name: 'Uno', file: 'a.jar', data: jar('1'), locked: true, password: PW, baseUrl: BASE });
    assert.throws(() => L.buildPlugin({ name: 'Dos', file: 'b.jar', data: jar('2'), locked: true, password: 'otra frase muy distinta', previousLock: a.lock, baseUrl: BASE }), /no es la de la biblioteca/);
    const b = L.buildPlugin({ name: 'Dos', file: 'b.jar', data: jar('2'), locked: true, password: PW, previousLock: a.lock, baseUrl: BASE });
    assert.deepStrictEqual(b.lock, a.lock);
    assert.ok((await L.fetchPlugin({ entry: a.entry, lock: b.lock, password: PW, download: async () => a.asset.data })).equals(jar('1')));
  });

  await test('contraseña corta o archivo que no es jar se rechazan', () => {
    assert.throws(() => L.buildPlugin({ name: 'X', file: 'x.jar', data: jar(), locked: true, password: 'corta', baseUrl: BASE }), /al menos/);
    assert.throws(() => L.buildPlugin({ name: 'X', file: 'x.jar', data: Buffer.from('no es zip'), locked: false, baseUrl: BASE }), /no es un \.jar/);
    assert.throws(() => L.buildPlugin({ name: 'X', file: '../x.jar', data: jar(), locked: false, baseUrl: BASE }), /\.jar/);
    assert.throws(() => L.buildPlugin({ name: 'X', file: 'x.jar', data: jar(), locked: false, baseUrl: 'http://x' }), /Dirección/);
  });

  await test('cambiar de público a bloqueado marca el archivo viejo para borrar', () => {
    const pub = L.buildPlugin({ name: 'Cambio', file: 'c.jar', data: jar(), locked: false, baseUrl: BASE });
    const lib1 = L.upsert({}, pub.entry, null).library;
    const lk = L.buildPlugin({ name: 'Cambio', file: 'c.jar', data: jar(), locked: true, password: PW, baseUrl: BASE });
    const r = L.upsert(lib1, lk.entry, lk.lock);
    assert.deepStrictEqual(r.staleAssets, [pub.entry.asset]);
    assert.strictEqual(r.library.plugins.length, 1);
    assert.ok(r.library.lock);
  });

  await test('quitar el último bloqueado borra el candado; el catálogo se limpia', () => {
    const a = L.buildPlugin({ name: 'Uno', file: 'a.jar', data: jar(), locked: true, password: PW, baseUrl: BASE });
    const lib = L.upsert({}, a.entry, a.lock).library;
    const r = L.remove(lib, 'uno');
    assert.strictEqual(r.library.lock, null);
    assert.deepStrictEqual(r.staleAssets, [a.entry.asset]);
    assert.throws(() => L.remove(lib, 'nada'));
    const dirty = L.sanitizeLibrary({ plugins: [{ id: 'ok', file: 'a.jar', url: 'http://mal', sha1: 'x' }, { id: '../x' }, null], lock: { v: 9 } });
    assert.deepStrictEqual(dirty, { plugins: [], lock: null });
  });

  await test('un archivo alterado se detecta', async () => {
    const b = L.buildPlugin({ name: 'Pub', file: 'p.jar', data: jar('a'), locked: false, baseUrl: BASE });
    await assert.rejects(L.fetchPlugin({ entry: b.entry, lock: null, download: async () => jar('cambiado') }), /no coincide/);
  });

  console.log(`  ${count} pruebas de plugin-library`);
})().catch((e) => { console.error(e); process.exit(1); });
