'use strict';
// Dependencias corregidas con «overrides» (package.json): que estén las versiones arregladas y que
// minecraft-launcher-core pueda seguir usándolas como antes (natives, instalador de Forge, descargas).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const atLeast = (v, w) => { for (let i = 0; i < 3; i++) if ((v[i] || 0) !== w[i]) return (v[i] || 0) > w[i]; return true; };
const mclcDir = path.dirname(require.resolve('minecraft-launcher-core/package.json'));
const fromMclc = (n) => require(require.resolve(`${n}/package.json`, { paths: [mclcDir] })).version.split('.').map(Number);
const reqPkg = require(require.resolve('request/package.json', { paths: [mclcDir] }));
const reqDir = path.dirname(require.resolve('request/package.json', { paths: [mclcDir] }));
const fromReq = (n) => require(require.resolve(`${n}/package.json`, { paths: [reqDir] })).version.split('.').map(Number);

// «request» (abandonado) se cambia por su fork mantenido @cypress/request, misma API.
assert.strictEqual(reqPkg.name, '@cypress/request', 'minecraft-launcher-core debe usar @cypress/request');
assert.ok(atLeast(reqPkg.version.split('.').map(Number), [3, 0, 0]), '@cypress/request >= 3 (corrige el SSRF CVE-2023-28155)');
assert.ok(atLeast(fromMclc('adm-zip'), [0, 6, 1]), 'adm-zip >= 0.6.1 (GHSA-xcpc-8h2w-3j85 y otras)');
assert.ok(atLeast(fromMclc('uuid'), [11, 1, 1]), 'uuid >= 11.1.1 (GHSA-w5hq-g745-h8pq)');
assert.ok(atLeast(fromReq('form-data'), [2, 5, 6]), 'form-data corregido dentro de request');
assert.ok(atLeast(fromReq('qs'), [6, 15, 5]), 'qs >= 6.15.5 dentro de request');
assert.ok(atLeast(fromReq('tough-cookie'), [4, 1, 3]), 'tough-cookie >= 4.1.3 dentro de request (GHSA-72xf-g2v4-qvf3)');

(async () => {
  // adm-zip como lo usa MCLC: extractAllTo (natives) y readAsText/getEntry (instalador de Forge).
  const { writeZip } = require('../lib/zipwrite');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deps-'));
  const jar = path.join(dir, 'n.jar');
  await writeZip(jar, [{ name: 'version.json', data: Buffer.from('{"id":"forge"}') }, { name: 'windows/x64/lwjgl.dll', data: Buffer.from('dll') }]);
  const Zip = require(require.resolve('adm-zip', { paths: [mclcDir] }));
  const z = new Zip(jar);
  assert.strictEqual(z.readAsText('version.json'), '{"id":"forge"}');
  assert.ok(z.getEntry('version.json') && !z.getEntry('install_profile.json'));
  new Zip(jar).extractAllTo(path.join(dir, 'out'), true);
  assert.strictEqual(fs.readFileSync(path.join(dir, 'out', 'windows', 'x64', 'lwjgl.dll'), 'utf8'), 'dll');
  fs.rmSync(dir, { recursive: true, force: true });

  // request con form-data y qs nuevos: GET con qs y POST con formulario.
  const request = require(require.resolve('request', { paths: [mclcDir] }));
  const srv = http.createServer((q, r) => {
    if (q.url === '/set') { r.setHeader('Set-Cookie', 'a=1; Path=/'); return r.end('set'); }
    r.end(`${q.method} ${q.url}${q.headers.cookie ? ` ${q.headers.cookie}` : ''}`);
  }).listen(0);
  await new Promise((r) => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = (o) => new Promise((res, rej) => request(o, (e, _r, b) => (e ? rej(e) : res(b))));
  assert.strictEqual(await call({ url: `${base}/a`, qs: { y: 2 } }), 'GET /a?y=2');
  assert.strictEqual(await call({ url: `${base}/f`, method: 'POST', formData: { a: '1' } }), 'POST /f');
  // Cookie jar de request con tough-cookie 4 (API síncrona y modo «loose»).
  const cookies = request.jar();
  await call({ url: `${base}/set`, jar: cookies });
  assert.strictEqual(await call({ url: `${base}/c`, jar: cookies }), 'GET /c a=1');
  assert.strictEqual(request.cookie('x=2; Path=/').key, 'x');
  // Como lo usa MCLC: request.defaults({ pool, timeout }), evento «response» con content-length y pipe a archivo.
  const big = Buffer.alloc(200000, 7);
  const srv2 = http.createServer((q, r) => {
    if (q.url === '/404') { r.statusCode = 404; return r.end('no'); }
    if (q.url === '/manifest') { r.setHeader('content-type', 'application/json'); return r.end('{"latest":{"release":"1.21.1"}}'); }
    r.setHeader('content-length', big.length); r.end(big);
  }).listen(0);
  await new Promise((r) => srv2.once('listening', r));
  const b2 = `http://127.0.0.1:${srv2.address().port}`;
  const base2 = request.defaults({ pool: { maxSockets: 2 }, timeout: 50000 });
  const out = path.join(os.tmpdir(), `deps-dl-${process.pid}.bin`);
  const len = await new Promise((resolve, reject) => {
    let total = 0;
    const rq = base2(`${b2}/asset`);
    rq.on('response', (res) => { total = parseInt(res.headers['content-length'], 10); });
    rq.on('error', reject);
    const f = fs.createWriteStream(out);
    rq.pipe(f);
    f.once('finish', () => resolve(total));
  });
  assert.strictEqual(len, big.length);
  assert.ok(fs.readFileSync(out).equals(big), 'el archivo descargado es idéntico');
  fs.rmSync(out, { force: true });
  assert.strictEqual(await new Promise((res) => base2(`${b2}/404`).on('response', (r) => res(r.statusCode))), 404);
  assert.strictEqual(JSON.parse(await new Promise((res, rej) => request.get(`${b2}/manifest`, (e, _r, b) => (e ? rej(e) : res(b))))).latest.release, '1.21.1');

  // MCLC de verdad: el Handler descarga con su baseRequest y el autenticador offline usa uuid v3.
  const Handler = require(path.join(mclcDir, 'components', 'handler.js'));
  const h = new Handler({ options: { overrides: {}, timeout: 10000 }, emit: () => {} });
  const dlDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deps-mclc-'));
  await h.downloadAsync(`${b2}/asset`, dlDir, 'asset.bin', false, 'test');
  assert.ok(fs.readFileSync(path.join(dlDir, 'asset.bin')).equals(big), 'MCLC descarga igual con @cypress/request');
  fs.rmSync(dlDir, { recursive: true, force: true });
  const auth = await require('minecraft-launcher-core').Authenticator.getAuth('Steve');
  assert.strictEqual(auth.uuid, 'e9df5bd1-28bb-31c6-8eb0-4ad41f47d874', 'mismo uuid offline que con uuid 8');
  srv.close(); srv2.close();
  console.log('dependencias ok');
})().catch((e) => { console.error(e); process.exit(1); });
