'use strict';
const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
const { pathToFileURL } = require('url');
const { makeSecureStorage } = require('../lib/secure-storage');
const { isTrustedUrl, guardIpc } = require('../lib/ipc-guard');
const { seal, unseal } = require('../lib/seal');

// safeStorage: en Linux con "basic_text" no cuenta como almacén seguro.
const fake = (backend, ok = true) => ({ isEncryptionAvailable: () => ok, getSelectedStorageBackend: () => backend, encryptString: (s) => Buffer.from(s), decryptString: (b) => b.toString() });
assert.strictEqual(makeSecureStorage(fake('basic_text'), 'linux').isEncryptionAvailable(), false);
assert.strictEqual(makeSecureStorage(fake('gnome_libsecret'), 'linux').isEncryptionAvailable(), true);
assert.strictEqual(makeSecureStorage(fake('unknown'), 'linux').isEncryptionAvailable(), false);
assert.strictEqual(makeSecureStorage(fake(undefined), 'win32').isEncryptionAvailable(), true);
assert.strictEqual(makeSecureStorage(fake('x', false), 'win32').isEncryptionAvailable(), false);

// IPC: solo páginas dentro de renderer/.
const dir = path.join(__dirname, '..', 'renderer');
assert.ok(isTrustedUrl(pathToFileURL(path.join(dir, 'index.html')).href + '?resume=1', dir));
assert.ok(isTrustedUrl(pathToFileURL(path.join(dir, 'overlay.html')).href, dir));
for (const bad of ['https://evil.com/', 'file:///etc/passwd', pathToFileURL(path.join(dir, '..', 'otro.html')).href, pathToFileURL(dir + '-malo/index.html').href, '', undefined, 'no es url']) assert.ok(!isTrustedUrl(bad, dir), String(bad));
const handlers = {};
guardIpc({ handle(ch, fn) { handlers[ch] = fn; } }, dir);
const ipc = { handle(ch, fn) { handlers[ch] = fn; } };
guardIpc(ipc, dir);
ipc.handle('x', (e, a) => a * 2);
assert.strictEqual(handlers.x({ senderFrame: { url: pathToFileURL(path.join(dir, 'index.html')).href } }, 4), 8);
assert.throws(() => handlers.x({ senderFrame: { url: 'https://evil.com' } }, 4), /Origen/);
assert.throws(() => handlers.x({ senderFrame: null }, 4), /Origen/);

// Sellado con llave pública.
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 3072, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
const msg = Buffer.from('informe con datos '.repeat(500));
const blob = seal(msg, publicKey);
assert.ok(!blob.includes(Buffer.from('informe con datos')));
assert.deepStrictEqual(unseal(blob, privateKey), msg);
blob[blob.length - 20] ^= 1;
assert.throws(() => unseal(blob, privateKey));
const other = crypto.generateKeyPairSync('rsa', { modulusLength: 3072, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
assert.throws(() => unseal(seal(msg, publicKey), other.privateKey));
console.log('seguridad-lib.test.js ok');
