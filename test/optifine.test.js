'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const of = require('../lib/optifine');

const html = `<a href="http://optifine.net/adloadx?f=preview_OptiFine_26.2_HD_U_K2_pre5.jar&x=c12e">x</a>
<a href="http://optifine.net/adloadx?f=OptiFine_1.12.2_HD_U_G5.jar&x=c12e">a</a>
<a href="http://optifine.net/adloadx?f=OptiFine_1.12.2_HD_U_G4.jar&x=c12e">b</a>
<a href="http://optifine.net/adloadx?f=OptiFine_1.21.1_HD_U_J3.jar&x=c12e">c</a>`;
const list = of.parseList(html);
assert.strictEqual(list['1.12.2'].file, 'OptiFine_1.12.2_HD_U_G5.jar'); // la primera (más nueva) gana
assert.ok(!list['26.2']); // las preview no
assert.strictEqual(of.parseDownloadLink("<a href='downloadx?f=OptiFine_1.12.2_HD_U_G5.jar&x=c12e19644f'>", 'OptiFine_1.12.2_HD_U_G5.jar'), 'https://optifine.net/downloadx?f=OptiFine_1.12.2_HD_U_G5.jar&x=c12e19644f');
assert.strictEqual(of.parseDownloadLink("downloadx?f=Otro.jar&x=aa", 'OptiFine_1.12.2_HD_U_G5.jar'), null);
assert.ok(!of.safeName('../x.jar'));

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'of-'));
  const jar = Buffer.concat([Buffer.from([0x50, 0x4b]), Buffer.alloc(200000)]);
  const fetchText = async (u) => (u.includes('adloadx') ? "downloadx?f=OptiFine_1.12.2_HD_U_G5.jar&x=abc123" : html);
  assert.strictEqual(await of.installOptiFine({ fetchText, download: async () => jar, dir, mc: '1.12.2' }), 'OptiFine_1.12.2_HD_U_G5.jar');
  assert.ok(fs.existsSync(path.join(dir, 'mods', 'OptiFine_1.12.2_HD_U_G5.jar')));
  assert.strictEqual(await of.installOptiFine({ fetchText, download: async () => jar, dir, mc: '1.2' }), null);
  await assert.rejects(of.installOptiFine({ fetchText, download: async () => Buffer.from('nope'), dir, mc: '1.12.2' }));
  console.log('optifine OK');
})().catch((e) => { console.error(e); process.exit(1); });
