'use strict';
const assert = require('assert');
const pc = require('../lib/pack-crypto');
const a = require('../lib/admin');
const { GithubRepo, GithubError } = require('../lib/github');

(async () => {
  // cifrado de evento: ida y vuelta
  const jars = [{ file: 'a.jar', data: Buffer.from('AAA') }, { file: 'b.jar', data: Buffer.from('BBB') }];
  const r = a.buildProtectedEvent({ jars, password: 'una contraseña larga', baseUrl: 'https://github.com/o/r/releases/download/t/', previous: null });
  assert.strictEqual(r.assets.length, 2);
  assert.strictEqual(r.assets[0].name, 'a.jar.enc');
  const env = pc.openEnvelope(r.envelope, pc.deriveKey('una contraseña larga', r.envelope.salt));
  assert.strictEqual(env.mods[0].url, 'https://github.com/o/r/releases/download/t/a.jar.enc');
  assert.strictEqual(pc.decryptFile(r.assets[0].data, env.packKey, 'a.jar').toString(), 'AAA');
  const r2 = a.buildProtectedEvent({ jars, password: 'una contraseña larga', baseUrl: 'https://x.y/z', previous: r.envelope });
  assert.ok(r2.reusedSalt && r2.envelope.salt === r.envelope.salt);
  assert.throws(() => a.buildProtectedEvent({ jars, password: 'corta', baseUrl: 'https://x.y' }), /contraseña/);
  assert.throws(() => a.buildProtectedEvent({ jars: [{ file: '../x.jar', data: Buffer.alloc(1) }], password: 'una contraseña larga', baseUrl: 'https://x.y' }), /no válido/);
  assert.throws(() => a.buildProtectedEvent({ jars: [], password: 'una contraseña larga', baseUrl: 'https://x.y' }), /No hay mods/);

  // manifest
  const m = a.mergeManifest({ event: { active: false, name: 'x' }, minecraftVersion: '1.21.1', mods: [] }, {
    name: ' Gran Evento ', active: true, startsAt: '2026-12-01T20:00:00-05:00', newEvent: true, minecraftVersion: '1.21.1', loader: { type: 'Fabric', version: '0.16' },
    server: { host: 'play.nova.com', port: '25570' }, links: [{ name: 'Discord', url: 'https://discord.gg/x' }, { name: 'Mal', url: 'javascript:alert(1)' }]
  });
  assert.strictEqual(m.event.name, 'Gran Evento');
  assert.match(m.event.id, /^gran-evento-\d{4}-\d{2}-\d{2}$/);
  assert.deepStrictEqual(m.server, { host: 'play.nova.com', port: 25570 });
  assert.strictEqual(m.links.length, 1);
  assert.strictEqual(m.loader.type, 'fabric');
  assert.deepStrictEqual(m.mods, []);
  assert.throws(() => a.mergeManifest({}, { startsAt: 'ayer' }), /fecha/);
  assert.throws(() => a.mergeManifest({}, { server: { host: 'a b' } }), /servidor/);
  assert.throws(() => a.mergeManifest({}, { minecraftVersion: '../' }), /versión/);

  // equipo / noticias
  assert.deepStrictEqual(a.sanitizeTeam([{ nick: 'Pepe', role: 'Dev', featured: true }, { nick: 'pepe' }, { nick: 'mal nick' }]), [{ nick: 'Pepe', role: 'Dev', featured: true }]);
  assert.throws(() => a.sanitizeTeam([]), /vacío/);
  assert.strictEqual(a.sanitizeNews([{ title: 'T', date: 'x', text: 'y' }, { title: '' }]).length, 1);

  // GitHub (fetch falso)
  const calls = [];
  const fake = async (url, o) => {
    calls.push([o.method || 'GET', url, o.headers.Authorization]);
    const json = (status, body) => ({ status, ok: status < 400, json: async () => body });
    if (url.endsWith('/repos/o/r')) return json(200, { full_name: 'o/r', permissions: { push: true } });
    if (url.includes('/contents/data/x.json') && (o.method || 'GET') === 'GET') return json(200, { sha: 'S1', content: Buffer.from('{"a":1}').toString('base64') });
    if (url.includes('/contents/data/x.json')) { const b = JSON.parse(o.body); assert.strictEqual(b.sha, 'S1'); assert.strictEqual(b.branch, 'main'); return json(200, {}); }
    if (url.includes('/releases/tags/')) return json(404, { message: 'Not Found' });
    if (url.endsWith('/releases') && o.method === 'POST') return json(201, { id: 7, assets: [] });
    if (url.includes('uploads.github.com')) return json(201, { id: 1 });
    if (url.includes('/contents/data/nuevo.json')) return json(404, { message: 'Not Found' });
    return json(500, { message: 'inesperado ' + url });
  };
  const gh = new GithubRepo({ owner: 'o', repo: 'r', token: 'TOK', fetchImpl: fake });
  assert.deepStrictEqual(await gh.check(), { canPush: true, fullName: 'o/r' });
  assert.deepStrictEqual((await gh.getJson('data/x.json')).data, { a: 1 });
  assert.strictEqual(await gh.getJson('data/nuevo.json'), null);
  await gh.putJson('data/x.json', { a: 2 }, 'msg');
  const rel = await gh.ensureRelease('evento-x');
  assert.strictEqual(rel.id, 7);
  await gh.uploadAsset(rel, 'a.jar.enc', Buffer.from('zz'));
  assert.ok(calls.every((c) => c[2] === 'Bearer TOK'));
  assert.strictEqual(gh.downloadBase('evento x'), 'https://github.com/o/r/releases/download/evento%20x');
  const bad = new GithubRepo({ owner: 'o', repo: 'r', token: 'T', fetchImpl: async () => ({ status: 401, ok: false, json: async () => ({ message: 'Bad credentials' }) }) });
  await assert.rejects(bad.check(), (e) => e instanceof GithubError && /token/.test(e.message));
  assert.throws(() => new GithubRepo({ owner: '../x', repo: 'r', token: 't' }), /Repositorio/);
  console.log('admin.test OK');
})().catch((e) => { console.error(e); process.exit(1); });
