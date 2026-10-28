'use strict';
// Pruebas del cifrado y la instalación protegida. Ejecutar con: npm test
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const pc = require('../lib/pack-crypto');
const pi = require('../lib/pack-install');

let count = 0;
async function test(name, fn) {
  await fn();
  count++;
  console.log(`  ok  ${name}`);
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'novapx-'));
const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');

// Mini "repositorio" con dos mods cifrados y un almacén de claves en memoria.
function makePack(password, jars) {
  const salt = pc.newSalt();
  const packKey = pc.newPackKey();
  const remote = {};
  const mods = Object.entries(jars).map(([file, content]) => {
    const url = `https://example.com/rel/${file}.enc`;
    remote[url] = pc.encryptFile(Buffer.from(content), packKey, file);
    return { name: file.replace('.jar', ''), file, url, sha1: sha1(Buffer.from(content)) };
  });
  const prot = pc.createEnvelope({ packKey, mods }, pc.deriveKey(password, salt), salt);
  return { prot, remote, salt };
}
function makeKeyStore() {
  let saved = null;
  return {
    load: (salt) => (saved && saved.salt === salt ? saved.key : null),
    save: (salt, key) => (saved = { salt, key }),
    clear: () => (saved = null),
    get saved() { return saved; }
  };
}

(async () => {
  await test('Sobre cifrado: abre con la contraseña correcta y rechaza la incorrecta', () => {
    const salt = pc.newSalt();
    const env = pc.createEnvelope({ hola: 'mundo' }, pc.deriveKey('una frase larga y segura', salt), salt);
    assert.deepStrictEqual(pc.openEnvelope(env, pc.deriveKey('una frase larga y segura', salt)), { hola: 'mundo' });
    assert.throws(() => pc.openEnvelope(env, pc.deriveKey('otra contraseña distinta', salt)), /BAD_KEY/);
    assert.ok(!JSON.stringify(env).includes('mundo'));
  });

  await test('Detecta si el sobre fue modificado', () => {
    const salt = pc.newSalt();
    const key = pc.deriveKey('una frase larga y segura', salt);
    const env = pc.createEnvelope({ x: 1 }, key, salt);
    const data = Buffer.from(env.data, 'base64');
    data[0] ^= 1;
    assert.throws(() => pc.openEnvelope({ ...env, data: data.toString('base64') }, key), /BAD_KEY/);
    assert.throws(() => pc.openEnvelope({ v: 2 }, key), /dañado/);
  });

  await test('Archivos cifrados: ida y vuelta, y se detecta manipulación o cambio de nombre', () => {
    const packKey = pc.newPackKey();
    const plain = crypto.randomBytes(5000);
    const enc = pc.encryptFile(plain, packKey, 'mod.jar');
    assert.ok(!enc.includes(plain.subarray(0, 32)));
    assert.deepStrictEqual(pc.decryptFile(enc, packKey, 'mod.jar'), plain);
    assert.throws(() => pc.decryptFile(enc, packKey, 'otro.jar'));
    const bad = Buffer.from(enc);
    bad[100] ^= 1;
    assert.throws(() => pc.decryptFile(bad, packKey, 'mod.jar'));
    assert.throws(() => pc.decryptFile(enc, pc.newPackKey(), 'mod.jar'));
  });

  await test('Contraseñas cortas se rechazan', () => {
    assert.ok(pc.passwordProblem('corta'));
    assert.ok(pc.passwordProblem(''));
    assert.strictEqual(pc.passwordProblem('una frase bien larga'), null);
  });

  await test('Primera instalación: sin contraseña pide contraseña; con la incorrecta avisa; con la correcta instala', async () => {
    const { prot, remote } = makePack('frase secreta del evento', { 'A.jar': 'contenido A', 'B-1.0.jar': 'contenido B' });
    const gameDir = tmp();
    const ks = makeKeyStore();
    let downloads = 0;
    const download = async (url) => { downloads++; return remote[url]; };

    let r = await pi.installProtected({ prot, gameDir, download, keyStore: ks });
    assert.deepStrictEqual(r, { status: 'need-password', wrong: false });
    assert.strictEqual(downloads, 0);
    assert.ok(!fs.existsSync(path.join(gameDir, 'mods', 'A.jar')));

    r = await pi.installProtected({ prot, password: 'contraseña equivocada!', gameDir, download, keyStore: ks });
    assert.deepStrictEqual(r, { status: 'need-password', wrong: true });
    assert.strictEqual(downloads, 0);

    r = await pi.installProtected({ prot, password: 'frase secreta del evento', gameDir, download, keyStore: ks });
    assert.deepStrictEqual(r, { status: 'ready' });
    assert.strictEqual(fs.readFileSync(path.join(gameDir, 'mods', 'A.jar'), 'utf8'), 'contenido A');
    assert.strictEqual(fs.readFileSync(path.join(gameDir, 'mods', 'B-1.0.jar'), 'utf8'), 'contenido B');
    assert.strictEqual(downloads, 2);
    assert.ok(ks.saved);
  });

  await test('Ya instalado: no vuelve a pedir contraseña ni descargar', async () => {
    const { prot, remote } = makePack('frase secreta del evento', { 'A.jar': 'contenido A' });
    const gameDir = tmp();
    const ks = makeKeyStore();
    const download = async (url) => remote[url];
    await pi.installProtected({ prot, password: 'frase secreta del evento', gameDir, download, keyStore: ks });
    ks.clear(); // aunque no haya clave guardada
    const r = await pi.installProtected({ prot, gameDir, download: async () => { throw new Error('no debería descargar'); }, keyStore: ks });
    assert.deepStrictEqual(r, { status: 'ready' });
  });

  await test('Si el jugador borra un mod, vuelve a pedirlo (o usa la clave guardada)', async () => {
    const { prot, remote } = makePack('frase secreta del evento', { 'A.jar': 'contenido A' });
    const gameDir = tmp();
    const ks = makeKeyStore();
    const download = async (url) => remote[url];
    await pi.installProtected({ prot, password: 'frase secreta del evento', gameDir, download, keyStore: ks });
    fs.unlinkSync(path.join(gameDir, 'mods', 'A.jar'));
    const r = await pi.installProtected({ prot, gameDir, download, keyStore: ks });
    assert.deepStrictEqual(r, { status: 'ready' }); // reinstala con la clave guardada, sin preguntar
    assert.ok(fs.existsSync(path.join(gameDir, 'mods', 'A.jar')));
  });

  await test('Actualización: usa la clave guardada y quita los mods que ya no están', async () => {
    const salt = pc.newSalt();
    const key = pc.deriveKey('frase secreta del evento', salt);
    const build = (jars) => {
      const packKey = pc.newPackKey();
      const remote = {};
      const mods = Object.entries(jars).map(([file, content]) => {
        const url = `https://example.com/${file}.enc`;
        remote[url] = pc.encryptFile(Buffer.from(content), packKey, file);
        return { name: file, file, url, sha1: sha1(Buffer.from(content)) };
      });
      return { prot: pc.createEnvelope({ packKey, mods }, key, salt), remote };
    };
    const v1 = build({ 'A.jar': 'a1', 'B.jar': 'b1' });
    const v2 = build({ 'A.jar': 'a2', 'C.jar': 'c1' });
    const gameDir = tmp();
    const ks = makeKeyStore();
    fs.mkdirSync(path.join(gameDir, 'mods'), { recursive: true });
    fs.writeFileSync(path.join(gameDir, 'mods', 'mio.jar'), 'mod del jugador');

    await pi.installProtected({ prot: v1.prot, password: 'frase secreta del evento', gameDir, download: async (u) => v1.remote[u], keyStore: ks });
    assert.notStrictEqual(v1.prot.rev, v2.prot.rev);
    const r = await pi.installProtected({ prot: v2.prot, gameDir, download: async (u) => v2.remote[u], keyStore: ks });
    assert.deepStrictEqual(r, { status: 'ready' });
    const files = fs.readdirSync(path.join(gameDir, 'mods')).sort();
    assert.deepStrictEqual(files, ['A.jar', 'C.jar', 'mio.jar']);
    assert.strictEqual(fs.readFileSync(path.join(gameDir, 'mods', 'A.jar'), 'utf8'), 'a2');
  });

  await test('Si cambian la contraseña (nueva sal), la clave guardada deja de servir y se pide de nuevo', async () => {
    const a = makePack('contraseña vieja larga', { 'A.jar': 'x' });
    const b = makePack('contraseña nueva larga', { 'A.jar': 'y' });
    const gameDir = tmp();
    const ks = makeKeyStore();
    await pi.installProtected({ prot: a.prot, password: 'contraseña vieja larga', gameDir, download: async (u) => a.remote[u], keyStore: ks });
    const r = await pi.installProtected({ prot: b.prot, gameDir, download: async (u) => b.remote[u], keyStore: ks });
    assert.deepStrictEqual(r, { status: 'need-password', wrong: false });
  });

  await test('Un mod cifrado manipulado o con sha1 distinto se rechaza y no se instala', async () => {
    const { prot, remote } = makePack('frase secreta del evento', { 'A.jar': 'contenido A' });
    const url = Object.keys(remote)[0];
    remote[url][20] ^= 1;
    const gameDir = tmp();
    await assert.rejects(
      pi.installProtected({ prot, password: 'frase secreta del evento', gameDir, download: async (u) => remote[u], keyStore: makeKeyStore() }),
      /No se pudo descifrar/
    );
    assert.ok(!fs.existsSync(path.join(gameDir, 'mods', 'A.jar')));
  });

  await test('Mods públicos: solo https y solo .jar con nombre simple', async () => {
    assert.throws(() => pi.modFileName({ url: 'http://x.com/a.jar' }), /https/);
    assert.throws(() => pi.modFileName({ url: 'https://x.com/a.exe' }), /\.jar/);
    // Un nombre con ../ se reduce al nombre simple: nunca sale de la carpeta mods.
    assert.strictEqual(pi.modFileName({ url: 'https://x.com/a.jar', file: '../../evil.jar' }), 'evil.jar');
    assert.strictEqual(pi.modFileName({ url: 'https://x.com/dir/Mi%20Mod-1.0.jar' }), 'Mi Mod-1.0.jar');
  });

  await test('syncMods público: descarga, actualiza solo lo que cambia y limpia lo viejo', async () => {
    const gameDir = tmp();
    const modsDir = path.join(gameDir, 'mods');
    const stateFile = path.join(gameDir, '.managed-mods.json');
    const files = { 'https://x.com/a.jar': Buffer.from('A'), 'https://x.com/b.jar': Buffer.from('B') };
    let n = 0;
    const download = async (u) => { n++; return files[u]; };
    const list = [
      { url: 'https://x.com/a.jar', sha1: sha1(files['https://x.com/a.jar']) },
      { url: 'https://x.com/b.jar', sha1: sha1(files['https://x.com/b.jar']) }
    ];
    await pi.syncMods({ modsDir, stateFile, mods: list, download });
    assert.strictEqual(n, 2);
    await pi.syncMods({ modsDir, stateFile, mods: list, download });
    assert.strictEqual(n, 2);
    await pi.syncMods({ modsDir, stateFile, mods: [list[0]], download });
    assert.deepStrictEqual(fs.readdirSync(modsDir), ['a.jar']);
    await assert.rejects(
      pi.syncMods({ modsDir, stateFile, mods: [{ url: 'https://x.com/b.jar', sha1: 'f'.repeat(40) }], download }),
      /sha1/
    );
  });

  console.log(`\n${count} pruebas correctas.`);
})().catch((e) => {
  console.error('FALLÓ:', e);
  process.exit(1);
});
