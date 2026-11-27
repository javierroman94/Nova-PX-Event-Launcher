'use strict';
// Mods .px de eventos protegidos: cifrado, instalación, partida y limpieza.
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const pc = require('../lib/pack-crypto');
const px = require('../lib/mods-px');
const pi = require('../lib/pack-install');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mods-px-'));
const sha = (alg, b) => crypto.createHash(alg).update(b).digest('hex');
const PASS = 'una frase larga de prueba';
const KDF = { N: 32768, r: 8, p: 1 }; // la mínima que acepta kdfOf: la prueba no tarda

// Evento de prueba: dos mods y una config, cifrados como los publica lib/admin.js.
function makeEvent({ withSha256 = true } = {}) {
  const salt = pc.newSalt();
  const packKey = pc.newPackKey();
  const jars = [{ file: 'sodium-fabric.jar', data: Buffer.from('PK-contenido-del-mod-uno-' + 'x'.repeat(300)) }, { file: 'secreto.jar', data: Buffer.from('PK-mod-dos-' + 'y'.repeat(500)) }];
  const assets = {};
  const mods = jars.map(({ file, data }) => {
    assets[`https://ej.test/${file}.enc`] = pc.encryptFile(data, packKey, file);
    return { name: file, file, url: `https://ej.test/${file}.enc`, sha1: sha('sha1', data), ...(withSha256 ? { sha256: sha('sha256', data) } : {}) };
  });
  const cfg = Buffer.from(JSON.stringify([{ rel: 'config/evento.json', b64: Buffer.from('{"ok":1}').toString('base64') }, { rel: '../fuera.txt', b64: 'eA==' }]));
  assets['https://ej.test/config.bin.enc'] = pc.encryptFile(cfg, packKey, 'config.bin');
  const prot = pc.createEnvelope({ packKey, mods, extra: { url: 'https://ej.test/config.bin.enc', sha1: sha('sha1', cfg) } }, pc.deriveKey(PASS, salt, KDF), salt, KDF);
  const downloads = [];
  const download = async (url) => { downloads.push(url); if (!assets[url]) throw new Error('404'); return Buffer.from(assets[url]); };
  return { prot, jars, mods, packKey, assets, download, downloads };
}
const keyStore = () => { const m = new Map(); return { load: (s) => m.get(s) || null, save: (s, k) => m.set(s, k), clear: () => m.clear() }; };
const jarsIn = (dir) => { try { return fs.readdirSync(dir).filter((f) => /\.jar$/i.test(f)); } catch { return []; } };
const dirs = (name) => { const g = path.join(tmp, name, 'juego'); const c = path.join(tmp, name, 'cache'); const r = path.join(tmp, name, 'temp'); fs.mkdirSync(r, { recursive: true }); return { gameDir: g, cacheDir: c, runRoot: r }; };

(async () => {
  // 1. Cifrar y descifrar un mod de prueba.
  const ev = makeEvent();
  const enc = ev.assets['https://ej.test/secreto.jar.enc'];
  const pxBuf = px.wrap(enc);
  assert.ok(px.isPx(pxBuf));
  assert.ok(pxBuf.subarray(0, 5).toString() === 'NPXPX');
  assert.ok(!pxBuf.includes(Buffer.from('PK-mod-dos')), 'el .px no contiene el mod en claro');
  assert.deepStrictEqual(px.open(pxBuf, ev.packKey, 'secreto.jar'), ev.jars[1].data);

  // 2. Una contraseña incorrecta no permite descifrar.
  assert.throws(() => px.open(pxBuf, pc.newPackKey(), 'secreto.jar'));
  assert.throws(() => pc.openEnvelope(ev.prot, pc.deriveKey('otra contraseña larga', ev.prot.salt, KDF)), /BAD_KEY/);
  {
    const d = dirs('mala');
    const r = await pi.installProtected({ prot: ev.prot, password: 'otra contraseña larga', gameDir: d.gameDir, download: ev.download, keyStore: keyStore(), cacheDir: d.cacheDir, pxMode: true, runRoot: d.runRoot });
    assert.deepStrictEqual(r, { status: 'need-password', wrong: true });
    assert.deepStrictEqual(fs.readdirSync(d.runRoot), [], 'sin contraseña buena no se crea carpeta temporal');
  }

  // 3. Un archivo alterado se rechaza, y con el nombre de otro mod también (AAD).
  const bad = Buffer.from(pxBuf); bad[bad.length - 20] ^= 1;
  assert.throws(() => px.open(bad, ev.packKey, 'secreto.jar'));
  assert.throws(() => px.open(pxBuf, ev.packKey, 'sodium-fabric.jar'), 'un .px no sirve como otro mod');
  const badHead = Buffer.from(pxBuf); badHead[0] = 0x50;
  assert.throws(() => px.open(badHead, ev.packKey, 'secreto.jar'), /\.px/);

  // 4. La extensión .px no se acepta como un .jar normal.
  assert.throws(() => pi.modFileName({ url: 'https://ej.test/a.px', file: 'a.px' }), /jar válido/);
  assert.ok(!px.isPx(ev.jars[0].data), 'un .jar no pasa por .px');
  assert.throws(() => px.open(ev.jars[0].data, ev.packKey, 'sodium-fabric.jar'));

  // 5. Instalación y partida de un evento protegido (Fabric, modo .px).
  const d = dirs('fabric');
  const ks = keyStore();
  const st = [];
  let r = await pi.installProtected({ prot: ev.prot, password: PASS, gameDir: d.gameDir, download: ev.download, keyStore: ks, onStatus: (t) => st.push(t), cacheDir: d.cacheDir, pxMode: true, runRoot: d.runRoot });
  assert.strictEqual(r.status, 'ready');
  assert.ok(px.isOurRunDir(r.runDir, d.runRoot));
  assert.deepStrictEqual(jarsIn(path.join(d.gameDir, 'mods')), [], 'ningún .jar descifrado en la carpeta del juego');
  const cache = fs.readdirSync(d.cacheDir).sort();
  assert.strictEqual(cache.filter((f) => /^[0-9a-f]{16}\.px$/.test(f)).length, 2, 'un .px por mod');
  assert.ok(cache.includes('config.px'));
  assert.ok(!cache.some((f) => /\.(jar|bin)$/.test(f)), 'la caché solo tiene .px');
  for (const f of cache) assert.ok(!fs.readFileSync(path.join(d.cacheDir, f)).includes(Buffer.from('PK-')), `${f} está cifrado`);
  const run = jarsIn(r.runDir);
  assert.strictEqual(run.length, 2);
  assert.ok(run.every((f) => /^m-[0-9a-f]{12}\.jar$/.test(f)), 'nombres aleatorios, sin el nombre real del mod');
  const contents = run.map((f) => fs.readFileSync(path.join(r.runDir, f)).toString()).sort();
  assert.deepStrictEqual(contents, ev.jars.map((j) => j.data.toString()).sort());
  assert.ok(!st.join(' ').match(/sodium|secreto/i), 'el progreso no nombra los mods');
  assert.strictEqual(fs.readFileSync(path.join(d.gameDir, 'config', 'evento.json'), 'utf8'), '{"ok":1}');
  assert.ok(!fs.existsSync(path.join(d.gameDir, '..', 'fuera.txt')), 'la config no escribe fuera de config/');
  const state = JSON.parse(fs.readFileSync(path.join(d.gameDir, '.pack-state.json'), 'utf8'));
  assert.strictEqual(state.mode, 'px');
  assert.ok(!pi.needsInstall(ev.prot, d.gameDir, d.cacheDir));
  if (process.platform !== 'win32') assert.strictEqual(fs.statSync(r.runDir).mode & 0o077, 0, 'carpeta temporal solo para el usuario');

  // 6. Limpieza al cerrar Minecraft normalmente.
  const first = r.runDir;
  assert.ok(px.removeRunDir(first, d.runRoot));
  assert.ok(!fs.existsSync(first));
  assert.deepStrictEqual(px.leftoverJars(d.runRoot), []);
  pi.wipeProtected(d.gameDir);

  // Segunda partida: sin contraseña (llavero), sin descargar nada y en otra carpeta.
  const before = ev.downloads.length;
  r = await pi.installProtected({ prot: ev.prot, password: '', gameDir: d.gameDir, download: ev.download, keyStore: ks, cacheDir: d.cacheDir, pxMode: true, runRoot: d.runRoot });
  assert.strictEqual(r.status, 'ready');
  assert.notStrictEqual(r.runDir, first);
  assert.strictEqual(ev.downloads.length, before, 'la segunda partida no descarga');
  assert.strictEqual(jarsIn(r.runDir).length, 2);

  // 7. Limpieza tras un cierre inesperado: la carpeta queda y se borra al abrir el launcher.
  const ajena = path.join(d.runRoot, 'npx-run-0000000000000000'); fs.mkdirSync(ajena); fs.writeFileSync(path.join(ajena, 'mio.jar'), 'no es nuestro');
  const otra = path.join(d.runRoot, 'otra-carpeta'); fs.mkdirSync(otra); fs.writeFileSync(path.join(otra, 'x.jar'), 'x');
  const segunda = px.createRunDir(d.runRoot); px.writeRunJar(segunda, Buffer.from('jar'));
  assert.strictEqual(px.sweepRunDirs(d.runRoot), 2, 'borra las dos carpetas de partidas con nuestra marca');
  assert.ok(!fs.existsSync(r.runDir) && !fs.existsSync(segunda));
  assert.ok(fs.existsSync(path.join(ajena, 'mio.jar')), 'sin la marca no se toca, aunque el nombre se parezca');
  assert.ok(fs.existsSync(path.join(otra, 'x.jar')), 'nada fuera de las carpetas de Nova PX');
  assert.ok(!px.removeRunDir(otra, d.runRoot) && fs.existsSync(otra), 'removeRunDir rechaza carpetas ajenas');
  assert.ok(!px.removeRunDir(path.join(d.runRoot, '..'), d.runRoot), 'ni rutas fuera de la carpeta temporal');
  const keep = px.createRunDir(d.runRoot);
  assert.strictEqual(px.sweepRunDirs(d.runRoot, keep), 0, 'no borra la carpeta de la partida en curso');
  px.removeRunDir(keep, d.runRoot);

  // Un .px alterado en la caché: la partida no arranca y no deja nada descifrado.
  const pxFile = path.join(d.cacheDir, px.pxName(ev.mods[1].sha1));
  const orig = fs.readFileSync(pxFile);
  const tampered = Buffer.from(orig); tampered[40] ^= 0xff; fs.writeFileSync(pxFile, tampered);
  await assert.rejects(pi.installProtected({ prot: ev.prot, password: '', gameDir: d.gameDir, download: ev.download, keyStore: ks, cacheDir: d.cacheDir, pxMode: true, runRoot: d.runRoot }), /n\.º 2/);
  assert.deepStrictEqual(fs.readdirSync(d.runRoot).filter((n) => n.startsWith('npx-run-') && n !== path.basename(ajena)), [], 'el fallo no deja carpeta temporal');
  fs.writeFileSync(pxFile, orig);

  // Evento vuelto a publicar (clave nueva, mismos mods): la caché vieja no sirve y se vuelve a bajar.
  {
    const a = makeEvent();
    const d8 = dirs('republicado');
    const ks8 = keyStore();
    await pi.installProtected({ prot: a.prot, password: PASS, gameDir: d8.gameDir, download: a.download, keyStore: ks8, cacheDir: d8.cacheDir, pxMode: true, runRoot: d8.runRoot });
    const b = makeEvent(); // mismos mods (misma huella), clave del modpack nueva
    const r8 = await pi.installProtected({ prot: b.prot, password: PASS, gameDir: d8.gameDir, download: b.download, keyStore: ks8, cacheDir: d8.cacheDir, pxMode: true, runRoot: d8.runRoot });
    assert.strictEqual(jarsIn(r8.runDir).length, 2, 'la partida arranca con la publicación nueva');
    assert.ok(b.downloads.filter((u) => u.endsWith('.jar.enc')).length === 2, 'vuelve a bajar los mods con la clave nueva');
    // Lo mismo en Forge/NeoForge (modo mods/).
    const d9 = dirs('republicado-forge');
    await pi.installProtected({ prot: a.prot, password: PASS, gameDir: d9.gameDir, download: a.download, keyStore: keyStore(), cacheDir: d9.cacheDir });
    pi.wipeProtected(d9.gameDir);
    assert.deepStrictEqual(await pi.installProtected({ prot: b.prot, password: PASS, gameDir: d9.gameDir, download: b.download, keyStore: keyStore(), cacheDir: d9.cacheDir }), { status: 'ready' });
    assert.strictEqual(jarsIn(path.join(d9.gameDir, 'mods')).length, 2);
  }

  // SHA-256: si el evento la trae y no coincide, se rechaza.
  {
    const e2 = makeEvent();
    const pk = pc.openEnvelope(e2.prot, pc.deriveKey(PASS, e2.prot.salt, KDF));
    pk.mods[0].sha256 = '0'.repeat(64);
    const bad256 = pc.createEnvelope(pk, pc.deriveKey(PASS, e2.prot.salt, KDF), e2.prot.salt, KDF);
    const d2 = dirs('sha256');
    await assert.rejects(pi.installProtected({ prot: bad256, password: PASS, gameDir: d2.gameDir, download: e2.download, keyStore: keyStore(), cacheDir: d2.cacheDir, pxMode: true, runRoot: d2.runRoot }), /sha256/);
    assert.deepStrictEqual(px.leftoverJars(d2.runRoot), []);
  }

  // Eventos ya publicados (solo SHA-1) siguen funcionando.
  {
    const e3 = makeEvent({ withSha256: false });
    const d3 = dirs('solo-sha1');
    const r3 = await pi.installProtected({ prot: e3.prot, password: PASS, gameDir: d3.gameDir, download: e3.download, keyStore: keyStore(), cacheDir: d3.cacheDir, pxMode: true, runRoot: d3.runRoot });
    assert.strictEqual(jarsIn(r3.runDir).length, 2);
  }

  // Migración: la caché antigua (.bin) pasa a .px sin volver a descargar.
  {
    const e4 = makeEvent();
    const d4 = dirs('migracion');
    fs.mkdirSync(d4.cacheDir, { recursive: true });
    for (const m of e4.mods) fs.writeFileSync(path.join(d4.cacheDir, `${m.sha1.slice(0, 16)}.bin`), e4.assets[m.url]);
    const r4 = await pi.installProtected({ prot: e4.prot, password: PASS, gameDir: d4.gameDir, download: e4.download, keyStore: keyStore(), cacheDir: d4.cacheDir, pxMode: true, runRoot: d4.runRoot });
    assert.strictEqual(jarsIn(r4.runDir).length, 2);
    assert.ok(!e4.downloads.some((u) => u.endsWith('.jar.enc')), 'los mods no se vuelven a descargar');
    assert.ok(!fs.readdirSync(d4.cacheDir).some((f) => f.endsWith('.bin')), 'ya no quedan .bin');
  }

  // Forge/NeoForge (modo mods/): igual que antes, nombres neutros y se borran al cerrar.
  {
    const e5 = makeEvent();
    const d5 = dirs('forge');
    const r5 = await pi.installProtected({ prot: e5.prot, password: PASS, gameDir: d5.gameDir, download: e5.download, keyStore: keyStore(), cacheDir: d5.cacheDir });
    assert.deepStrictEqual(r5, { status: 'ready' });
    const inMods = jarsIn(path.join(d5.gameDir, 'mods'));
    assert.strictEqual(inMods.length, 2);
    assert.ok(inMods.every((f) => /^[0-9a-f]{16}\.jar$/.test(f)));
    assert.ok(fs.readdirSync(d5.cacheDir).every((f) => f.endsWith('.px')));
    pi.wipeProtected(d5.gameDir);
    assert.deepStrictEqual(jarsIn(path.join(d5.gameDir, 'mods')), []);
    // Si el evento pasa a Fabric, los .jar que quedaban en mods/ se quitan y no se dejan nuevos.
    const ks5 = keyStore(); ks5.save(e5.prot.salt, pc.deriveKey(PASS, e5.prot.salt, KDF));
    fs.writeFileSync(path.join(d5.gameDir, 'mods', 'del-jugador.jar'), 'mio');
    const again = await pi.installProtected({ prot: e5.prot, password: '', gameDir: d5.gameDir, download: e5.download, keyStore: ks5, cacheDir: d5.cacheDir });
    assert.deepStrictEqual(again, { status: 'ready' }, 'vuelve a ponerlos desde la caché .px sin contraseña');
    assert.strictEqual(jarsIn(path.join(d5.gameDir, 'mods')).length, 3);
    const r6 = await pi.installProtected({ prot: e5.prot, password: '', gameDir: d5.gameDir, download: e5.download, keyStore: ks5, cacheDir: d5.cacheDir, pxMode: true, runRoot: d5.runRoot });
    assert.deepStrictEqual(jarsIn(path.join(d5.gameDir, 'mods')), ['del-jugador.jar'], 'quita los del evento y respeta los del jugador');
    px.removeRunDir(r6.runDir, d5.runRoot);
  }

  // Modpacks normales (sin clave): no cambian.
  {
    const data = Buffer.from('mod publico');
    const d7 = dirs('normal');
    const files = await pi.syncMods({ modsDir: path.join(d7.gameDir, 'mods'), stateFile: path.join(d7.gameDir, '.managed-mods.json'), mods: [{ name: 'Pub', url: 'https://ej.test/pub.jar', sha1: sha('sha1', data) }], download: async () => data });
    assert.deepStrictEqual(files, ['pub.jar']);
    assert.strictEqual(fs.readFileSync(path.join(d7.gameDir, 'mods', 'pub.jar'), 'utf8'), 'mod publico');
  }

  // main.js: Fabric recibe la carpeta y se limpia al cerrar, si falla el arranque y al abrir o cerrar el launcher.
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  assert.match(main, /customArgs\.push\(`-Dfabric\.addMods=\$\{currentRunDir\}`\)/);
  assert.match(main, /launcher\.on\('close'[\s\S]*?cleanupProtected\(protectedRun\)/);
  assert.match(main, /catch \(err\) \{\s*launching = false;[\s\S]{0,200}cleanupProtected\(protectedRun\)/);
  assert.match(main, /sweepRunDirs\(app\.getPath\('temp'\)\)[\s\S]*app\.on\('will-quit'[^\n]*sweepRunDirs/);
  const mods = fs.readFileSync(path.join(__dirname, '..', 'lib', 'main', 'contrasena-de-instalacion-y-mods.js'), 'utf8');
  assert.match(mods, /pxMode: String\(\(manifest\.loader && manifest\.loader\.type\) \|\| ''\)\.toLowerCase\(\) === 'fabric'/);

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('mods-px ok');
})().catch((err) => { console.error(err); process.exit(1); });
