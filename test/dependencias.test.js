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
const reqDir = path.dirname(require.resolve('request/package.json', { paths: [mclcDir] }));
const fromReq = (n) => require(require.resolve(`${n}/package.json`, { paths: [reqDir] })).version.split('.').map(Number);

assert.ok(atLeast(fromMclc('adm-zip'), [0, 6, 1]), 'adm-zip >= 0.6.1 (GHSA-xcpc-8h2w-3j85 y otras)');
assert.ok(atLeast(fromReq('form-data'), [2, 5, 6]), 'form-data >= 2.5.6 dentro de request');
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
  srv.close();
  console.log('dependencias ok');
})().catch((e) => { console.error(e); process.exit(1); });
