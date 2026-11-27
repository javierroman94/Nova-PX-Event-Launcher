'use strict';
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { makeSecureStorage } = require('../lib/secure-storage');
const { makePresenceTokenStore } = require('../lib/presence-token');
const { isTrustedUrl, guardIpc } = require('../lib/ipc-guard');
const { seal, unseal } = require('../lib/seal');
const { redactSecrets } = require('../lib/redact');

// safeStorage: en Linux con "basic_text" no cuenta como almacén seguro.
const fake = (backend, ok = true) => ({ isEncryptionAvailable: () => ok, getSelectedStorageBackend: () => backend, encryptString: (s) => Buffer.from(s), decryptString: (b) => b.toString() });
assert.strictEqual(makeSecureStorage(fake('basic_text'), 'linux').isEncryptionAvailable(), false);
assert.strictEqual(makeSecureStorage(fake('gnome_libsecret'), 'linux').isEncryptionAvailable(), true);
assert.strictEqual(makeSecureStorage(fake('unknown'), 'linux').isEncryptionAvailable(), false);
assert.strictEqual(makeSecureStorage(fake(undefined), 'win32').isEncryptionAvailable(), true);
assert.strictEqual(makeSecureStorage(fake('x', false), 'win32').isEncryptionAvailable(), false);

// Token de presencia: migra el archivo antiguo a safeStorage y nunca usa texto plano si no hay llavero.
const tokenDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novapx-token-'));
const tokenFile = path.join(tokenDir, 'presence.token');
const legacyToken = 'abcdefghijklmnopqrstuvwx12345678';
const tokenStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(`cifrado:${s}`),
  decryptString: (b) => b.toString().slice('cifrado:'.length)
};
fs.writeFileSync(tokenFile, legacyToken);
const tokenStore = makePresenceTokenStore({ fs, file: tokenFile, safeStorage: tokenStorage });
assert.strictEqual(tokenStore.get(), legacyToken);
const savedToken = fs.readFileSync(tokenFile, 'utf8');
assert.ok(savedToken.startsWith('safeStorage:v1:') && !savedToken.includes(legacyToken));
assert.strictEqual(tokenStore.get(), legacyToken);
const plainFile = path.join(tokenDir, 'plain.token');
fs.writeFileSync(plainFile, legacyToken);
const noKeyStore = makePresenceTokenStore({ fs, file: plainFile, safeStorage: { isEncryptionAvailable: () => false } });
assert.strictEqual(noKeyStore.get(), null);
assert.ok(!fs.existsSync(plainFile), 'el token antiguo en texto plano se elimina si no hay almacén seguro');
const rawCredentials = '--refreshToken refresh-token-secret-123 --idToken id-token-secret-123 --session minecraft-session-secret refresh_token=refresh-json-secret-123 client_secret=client-secret-value';
const safeCredentials = redactSecrets(rawCredentials);
assert.ok(!/refresh-token-secret-123|id-token-secret-123|minecraft-session-secret|refresh-json-secret-123|client-secret-value/.test(safeCredentials), safeCredentials);


// IPC: solo páginas dentro de renderer/.
const dir = path.join(__dirname, '..', 'renderer');
assert.ok(isTrustedUrl(pathToFileURL(path.join(dir, 'index.html')).href + '?resume=1', dir));
assert.ok(isTrustedUrl(pathToFileURL(path.join(dir, 'overlay.html')).href, dir));
for (const bad of ['https://evil.com/', 'file:///etc/passwd', pathToFileURL(path.join(dir, '..', 'otro.html')).href, pathToFileURL(dir + '-malo/index.html').href, '', undefined, 'no es url']) assert.ok(!isTrustedUrl(bad, dir), String(bad));
const handlers = {};
const ipc = { handle(ch, fn) { handlers[ch] = fn; } };
guardIpc(ipc, dir);
ipc.handle('x', (e, a) => a * 2);
const mainFrame = { url: pathToFileURL(path.join(dir, 'index.html')).href, parent: null };
assert.strictEqual(handlers.x({ senderFrame: mainFrame, sender: { mainFrame } }, 4), 8);
// Electron puede dar otro objeto para el mismo marco principal: lo que cuenta es que no tenga padre.
assert.strictEqual(handlers.x({ senderFrame: { url: mainFrame.url, parent: null }, sender: { mainFrame } }, 4), 8);
assert.throws(() => handlers.x({ senderFrame: { url: 'https://evil.com', parent: null }, sender: { mainFrame } }, 4), /Origen/);
// Un iframe, aunque cargue una página de renderer/, no habla por IPC.
assert.throws(() => handlers.x({ senderFrame: { url: mainFrame.url, parent: mainFrame }, sender: { mainFrame } }, 4), /Origen/);
assert.throws(() => handlers.x({ senderFrame: null, sender: { mainFrame } }, 4), /Origen/);

// Electron: redirecciones bloqueadas, webSecurity explícito y CSP sin estilos inline.
const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const overlaySource = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'overlay.html'), 'utf8');
assert.match(mainSource, /will-redirect/);
assert.ok((mainSource.match(/webSecurity:\s*true/g) || []).length >= 2);
assert.match(overlaySource, /style-src 'self'/);
assert.ok(!/unsafe-inline|unsafe-eval/.test(overlaySource));

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

// Enlaces externos (lib/links.js)
{
  const { checkLink } = require('../lib/links');
  assert.strictEqual(checkLink('http://x.com').ok, false);
  assert.strictEqual(checkLink('javascript:alert(1)').ok, false);
  assert.strictEqual(checkLink('https://user:pass@github.com/').ok, false);
  assert.strictEqual(checkLink('https://github.com/javierroman94').trusted, true);
  assert.strictEqual(checkLink('https://evilgithub.com/').trusted, false);
  assert.strictEqual(checkLink('https://github.com.evil.io/').trusted, false);
  const idn = checkLink('https://nоvapx.pages.dev/'); // «о» cirílica
  assert.ok(idn.ok && !idn.trusted && idn.host.startsWith('xn--'), 'el dominio se muestra en punycode');
  console.log('links ok');
}
