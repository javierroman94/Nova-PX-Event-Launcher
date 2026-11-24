'use strict';
const assert = require('assert');
const crypto = require('crypto');
const f = require('../lib/firma');
const { GithubRepo } = require('../lib/github');

const gen = () => {
  const k = crypto.generateKeyPairSync('ed25519');
  return { pub: k.publicKey.export({ type: 'spki', format: 'pem' }), priv: k.privateKey.export({ type: 'pkcs8', format: 'pem' }) };
};
const A = gen();
const B = gen();
const bytes = Buffer.from('{"mods":[]}\n');

// Firma y verificación
const sig = f.firmar('manifest', bytes, A.priv, new Date('2026-11-23T00:00:00Z'));
assert.strictEqual(f.verificar('manifest', bytes, sig, A.pub).firmadoEn, '2026-11-23T00:00:00.000Z');
assert.throws(() => f.verificar('manifest', Buffer.from('{"mods":["x"]}\n'), sig, A.pub), /no coincide/);
assert.throws(() => f.verificar('manifest', bytes, sig, B.pub), /no es válida/);
assert.throws(() => f.verificar('plugins', bytes, sig, A.pub), /otro archivo/);
assert.throws(() => f.verificar('manifest', bytes, { ...sig, firmadoEn: '2030-01-01T00:00:00.000Z' }, A.pub), /no es válida/);
assert.throws(() => f.verificar('manifest', bytes, null, A.pub), /ausente/);
assert.throws(() => f.verificar('manifest', bytes, { ...sig, v: 2 }, A.pub), /formato/);
assert.throws(() => f.firmar('news', bytes, A.priv), /no es un archivo firmado/);
assert.ok(f.llaveCoincide(A.priv, A.pub));
assert.ok(!f.llaveCoincide(A.priv, B.pub));
assert.ok(!f.llaveCoincide('basura', A.pub));
assert.strictEqual(f.rutaFirma('data/manifest.json'), 'data/manifest.firma.json');

// Publicar desde el modo administrador: archivo + firma, y sin llave no se publica
(async () => {
  const puts = [];
  const fetchImpl = async (url, opts = {}) => {
    const body = opts.body ? JSON.parse(opts.body) : null;
    if ((opts.method || 'GET') === 'PUT') { puts.push({ url, body }); return { ok: true, status: 200, json: async () => ({}) }; }
    return { ok: false, status: 404, json: async () => ({ message: 'Not Found' }) };
  };
  const mk = (extra) => Object.assign(new GithubRepo({ owner: 'o', repo: 'r', token: 't', fetchImpl, retryDelayMs: 0 }), extra);

  await mk({ signer: { privatePem: A.priv }, mustSign: true }).putJson('data/manifest.json', { a: 1 }, 'msg');
  assert.strictEqual(puts.length, 2);
  assert.ok(puts[0].url.endsWith('/contents/data/manifest.json'));
  assert.ok(puts[1].url.endsWith('/contents/data/manifest.firma.json'));
  const text = Buffer.from(puts[0].body.content, 'base64').toString('utf8');
  const published = JSON.parse(Buffer.from(puts[1].body.content, 'base64').toString('utf8'));
  f.verificar('manifest', text, published, A.pub); // la firma publicada cubre el archivo publicado

  puts.length = 0;
  await assert.rejects(() => mk({ mustSign: true }).putJson('data/manifest.json', { a: 1 }, 'msg'), /llave de firma/);
  assert.strictEqual(puts.length, 0, 'sin llave no se publica nada');

  await mk({ mustSign: true }).putJson('data/news.json', [], 'msg');
  assert.strictEqual(puts.length, 1, 'un archivo no crítico no necesita firma');

  puts.length = 0;
  await mk({}).putJson('data/manifest.json', { a: 1 }, 'msg');
  assert.strictEqual(puts.length, 1, 'con la firma opcional y sin llave se publica sin firma');

  // Los datos que se publican hoy en el repositorio están firmados con la llave pública del launcher
  const fs = require('fs');
  const path = require('path');
  const pub = fs.readFileSync(path.join(__dirname, '..', 'config', 'firma-datos.pub.pem'), 'utf8');
  for (const n of f.FIRMADOS) {
    const file = path.join(__dirname, '..', 'data', `${n}.json`);
    f.verificar(n, fs.readFileSync(file), JSON.parse(fs.readFileSync(file.replace(/\.json$/, '.firma.json'), 'utf8')), pub);
  }

  // Lectura con firma (lib/data-firmada.js)
  const { leerFirmado } = require('../lib/data-firmada');
  const files = { 'manifest.json': '{"mods":[]}\n', 'manifest.firma.json': JSON.stringify(f.firmar('manifest', '{"mods":[]}\n', A.priv, new Date('2026-11-23T00:00:00Z'))), 'news.json': '[]' };
  const reader = (fs2) => async (n) => { if (!(n in fs2)) throw new Error('HTTP 404'); return fs2[n]; };
  const base = { pub: A.pub, obligatoria: true, wait: async () => {} };
  assert.deepStrictEqual((await leerFirmado({ ...base, name: 'manifest', getText: reader(files) })).data, { mods: [] });
  assert.deepStrictEqual((await leerFirmado({ ...base, name: 'news', getText: reader(files) })).data, [], 'lo no crítico no pide firma');
  const tampered = { ...files, 'manifest.json': '{"mods":[{"url":"https://malo"}]}\n' };
  await assert.rejects(() => leerFirmado({ ...base, name: 'manifest', getText: reader(tampered) }), /no válida/);
  await assert.rejects(() => leerFirmado({ ...base, obligatoria: false, name: 'manifest', getText: reader(tampered) }), /no válida/, 'una firma mala se rechaza aunque no sea obligatoria');
  const unsigned = { 'manifest.json': files['manifest.json'] };
  await assert.rejects(() => leerFirmado({ ...base, name: 'manifest', getText: reader(unsigned) }), /no válida/);
  assert.deepStrictEqual((await leerFirmado({ ...base, obligatoria: false, name: 'manifest', getText: reader(unsigned) })).data, { mods: [] }, 'sin firma pasa solo si no es obligatoria');
  const other = gen();
  await assert.rejects(() => leerFirmado({ ...base, pub: other.pub, name: 'manifest', getText: reader(files) }), /no válida/);
  await assert.rejects(() => leerFirmado({ ...base, name: 'manifest', getText: reader(files), known: { firmadoEn: '2026-12-01T00:00:00.000Z' } }), /más vieja/);
  // Carrera entre archivo y firma: al reintentar ya coincide
  let calls = 0;
  const racing = async (n) => (n === 'manifest.json' ? (++calls === 1 ? '{"mods":["viejo"]}\n' : files[n]) : files[n]);
  assert.deepStrictEqual((await leerFirmado({ ...base, name: 'manifest', getText: racing })).data, { mods: [] });
  console.log('firma.test OK');
})().catch((e) => { console.error(e); process.exit(1); });
