'use strict';
const assert = require('assert');
const crypto = require('crypto');
const { NOVA_MODS, installNovaMods } = require('../lib/nova');
const packs = require('../lib/packs');

(async () => {
  // Salta lo que falla y junta lo instalado sin repetir.
  const r = await installNovaMods(async (slug) => { if (slug === 'iris') throw new Error('no'); return { installed: [`${slug}.jar`, 'fabric-api.jar'] }; });
  assert.deepStrictEqual(r.skipped, ['iris']);
  assert.strictEqual(r.installed.filter((f) => f === 'fabric-api.jar').length, 1);
  assert.ok(NOVA_MODS.length >= 10 && NOVA_MODS.some(([s]) => s === 'sodium'));

  // Perfil nova = Fabric con preset; optifine = vanilla con preset.
  const mk = (loader) => packs.buildCustomEntry({ name: 'X', mcVersion: '1.21.1', loader });
  assert.deepStrictEqual([mk('nova').loader.type, mk('nova').preset], ['fabric', 'nova']);
  assert.deepStrictEqual([mk('optifine').loader.type, mk('optifine').preset], ['vanilla', 'optifine']);
  assert.strictEqual(mk('fabric').preset, undefined);
  assert.throws(() => mk('lunar'), /no soportado/i);

  // Snapshots solo si se piden.
  const man = { versions: [{ id: '1.21.1', type: 'release' }, { id: '24w14a', type: 'snapshot' }, { id: 'a1.0', type: 'old_alpha' }] };
  assert.deepStrictEqual(packs.releaseVersions(man), ['1.21.1']);
  assert.deepStrictEqual(packs.releaseVersions(man, { snapshots: true }), ['1.21.1', '24w14a']);
  // Nova Client: elige el .jar de la versión pedida, ignora sources y enlaces de otros sitios.
  const base = 'https://github.com/javierroman94/Nova-Client/releases/download/v0.1.0/';
  const jarBytes = Buffer.from('jar');
  const digest = 'sha256:' + crypto.createHash('sha256').update(jarBytes).digest('hex');
  const rel = { assets: [
    { name: 'nova-client-0.1.0+mc1.21.1-sources.jar', browser_download_url: base + 'a-sources.jar', digest },
    { name: 'nova-client-0.1.0+mc1.21.1.jar', browser_download_url: base + 'nova-client-0.1.0%2Bmc1.21.1.jar', digest },
    { name: 'nova-client-0.1.0+mc1.20.1.jar', browser_download_url: 'https://evil.example/x.jar', digest }
  ] };
  const nova = require('../lib/nova');
  assert.strictEqual(nova.pickClientAsset(rel, '1.21.1').name, 'nova-client-0.1.0+mc1.21.1.jar');
  assert.strictEqual(nova.pickClientAsset(rel, '1.21.1').sha256, digest.slice(7));
  // Sin digest de GitHub: se elige, pero sin huella; installNovaClient se niega a instalarlo (abajo).
  assert.strictEqual(nova.pickClientAsset({ assets: [{ name: 'nova-client-0.1.0+mc1.21.1.jar', browser_download_url: base + 'a.jar' }] }, '1.21.1').sha256, null);
  assert.strictEqual(nova.pickClientAsset(rel, '1.20.1'), null); // enlace fuera de GitHub
  assert.strictEqual(nova.pickClientAsset(rel, '1.8.9'), null);
  const os = require('os'); const fs = require('fs'); const path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-'));
  fs.mkdirSync(path.join(dir, 'mods')); fs.writeFileSync(path.join(dir, 'mods', 'nova-client-0.0.1+mc1.21.1.jar'), 'old');
  const got = await nova.installNovaClient({ request: async () => rel, download: async () => jarBytes, dir, mc: '1.21.1' });
  assert.strictEqual(got, 'nova-client-0.1.0+mc1.21.1.jar');
  assert.deepStrictEqual(fs.readdirSync(path.join(dir, 'mods')), ['nova-client-0.1.0+mc1.21.1.jar']);
  const badDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-bad-'));
  await assert.rejects(
    nova.installNovaClient({ request: async () => rel, download: async () => Buffer.from('modificado'), dir: badDir, mc: '1.21.1' }),
    /SHA-256/
  );
  const noDigest = { assets: [{ name: 'nova-client-0.1.0+mc1.21.1.jar', browser_download_url: base + 'a.jar' }] };
  await assert.rejects(nova.installNovaClient({ request: async () => noDigest, download: async () => jarBytes, dir: badDir, mc: '1.21.1' }), /huella/);

  // Con llave Nova: solo vale el manifiesto firmado de la release, no el digest de GitHub.
  {
    const firma = require('../lib/firma');
    const kp = crypto.generateKeyPairSync('ed25519');
    const priv = kp.privateKey.export({ type: 'pkcs8', format: 'pem' });
    const pub = kp.publicKey.export({ type: 'spki', format: 'pem' });
    const manBytes = Buffer.from(JSON.stringify({ v: 1, version: '0.1.0', files: { 'nova-client-0.1.0+mc1.21.1.jar': digest.slice(7) } }));
    const sigBytes = Buffer.from(JSON.stringify(firma.firmar('nova-client', manBytes, priv)));
    const signedRel = { assets: [...rel.assets,
      { name: 'nova-client.json', browser_download_url: base + 'nova-client.json' },
      { name: 'nova-client.firma.json', browser_download_url: base + 'nova-client.firma.json' }] };
    const files = { 'nova-client.json': manBytes, 'nova-client.firma.json': sigBytes };
    const dlf = (over = {}) => async (u) => ({ ...files, ...over })[decodeURIComponent(u.split('/').pop())] || jarBytes;
    const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-signed-'));
    assert.strictEqual(await nova.installNovaClient({ request: async () => signedRel, download: dlf(), dir: d2, mc: '1.21.1', pub }), 'nova-client-0.1.0+mc1.21.1.jar');
    // Sin manifiesto firmado: no se instala aunque GitHub dé su digest.
    await assert.rejects(nova.installNovaClient({ request: async () => rel, download: dlf(), dir: d2, mc: '1.21.1', pub }), /manifiesto firmado/);
    // Manifiesto cambiado después de firmar.
    const evil = Buffer.from(JSON.stringify({ v: 1, version: '0.1.0', files: { 'nova-client-0.1.0+mc1.21.1.jar': 'b'.repeat(64) } }));
    await assert.rejects(nova.installNovaClient({ request: async () => signedRel, download: dlf({ 'nova-client.json': evil }), dir: d2, mc: '1.21.1', pub }), /no coincide con su firma/);
    // Firmado con otra llave.
    const other = crypto.generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' });
    await assert.rejects(nova.installNovaClient({ request: async () => signedRel, download: dlf({ 'nova-client.firma.json': Buffer.from(JSON.stringify(firma.firmar('nova-client', manBytes, other))) }), dir: d2, mc: '1.21.1', pub }), /no es válida/);
    // Firma buena pero el .jar descargado está alterado.
    await assert.rejects(nova.installNovaClient({ request: async () => signedRel, download: async (u) => (/nova-client\.(firma\.)?json$/.test(u) ? files[u.split('/').pop()] : Buffer.from('alterado')), dir: fs.mkdtempSync(path.join(os.tmpdir(), 'nova-alt-')), mc: '1.21.1', pub }), /SHA-256/);
  }

  // Sodium + Iris: elige una pareja que no se rompa.
  {
    const zlib = require('zlib');
    const fs2 = require('fs'), os2 = require('os'), path2 = require('path');
    const crc = (b) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let x = 0xffffffff; for (const v of b) x = t[(x ^ v) & 255] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
    const jar = (json) => { const name = Buffer.from('fabric.mod.json'); const data = Buffer.from(JSON.stringify(json)); const c = crc(data);
      const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt32LE(c, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
      const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt32LE(c, 16); cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(name.length, 28);
      const off = lh.length + name.length + data.length; const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(1, 8); e.writeUInt16LE(1, 10); e.writeUInt32LE(cd.length + name.length, 12); e.writeUInt32LE(off, 16);
      return Buffer.concat([lh, name, data, cd, name, e]); };
    assert.ok(nova.matchesRange('1.11.7+mc26.3', ['<=1.12.0']));
    assert.ok(!nova.matchesRange('1.13.0', '<=1.12.0'));
    assert.ok(nova.matchesRange('0.9.3', '0.9.x') && !nova.matchesRange('0.10.0', '0.9.x'));
    const iris = { id: 'iris', version: '1.11.7+mc26.3', depends: { sodium: '0.9.x' }, breaks: {} };
    const sod = (v, br) => ({ id: 'sodium', version: v, depends: {}, breaks: br ? { iris: br } : {} });
    assert.ok(nova.sodiumIrisConflict(sod('0.9.3', '<=1.12.0'), iris));
    assert.strictEqual(nova.sodiumIrisConflict(sod('0.9.2'), iris), null);
    const dir2 = fs2.mkdtempSync(path2.join(os2.tmpdir(), 'nova-si-'));
    fs2.writeFileSync(path2.join(dir2, 'sodium-0.9.3.jar'), jar(sod('0.9.3', '<=1.12.0')));
    fs2.writeFileSync(path2.join(dir2, 'iris.jar'), jar(iris));
    const okVersions = [
      { version_number: '0.9.3', files: [{ url: 'https://cdn.modrinth.com/a.jar', filename: 'sodium-0.9.3-new.jar', primary: true }] },
      { version_number: '0.9.2', files: [{ url: 'https://cdn.modrinth.com/b.jar', filename: 'sodium-0.9.2.jar', primary: true }] }
    ];
    const bodies = { 'https://cdn.modrinth.com/a.jar': jar(sod('0.9.3', '<=1.12.0')), 'https://cdn.modrinth.com/b.jar': jar(sod('0.9.2')) };
    const logs = [];
    let r1 = await nova.fixSodiumIris(dir2, { listSodium: async () => okVersions, download: async (u) => bodies[u], log: (t) => logs.push(t) });
    assert.strictEqual(r1.action, 'sodium');
    assert.deepStrictEqual(fs2.readdirSync(dir2).sort(), ['iris.jar', 'sodium-0.9.2.jar']);
    // Sin pareja posible: se quita Iris.
    fs2.rmSync(path2.join(dir2, 'sodium-0.9.2.jar')); fs2.writeFileSync(path2.join(dir2, 'sodium-0.9.3.jar'), jar(sod('0.9.3', '<=1.12.0')));
    r1 = await nova.fixSodiumIris(dir2, { listSodium: async () => [okVersions[0]], download: async (u) => bodies[u], log: () => {} });
    assert.strictEqual(r1.action, 'iris-removed');
    assert.deepStrictEqual(fs2.readdirSync(dir2), ['sodium-0.9.3.jar']);

    // Reporte real: Sodium beta ya puesto + Reese's exige Sodium 0.9.3 exacto -> se quita Reese's y Sodium/Iris se quedan.
    {
      const d3 = fs2.mkdtempSync(path2.join(os2.tmpdir(), 'nova-si3-'));
      const irisReal = { id: 'iris', version: '1.11.7+mc26.3', depends: { sodium: '>=0.9.0-beta.3' }, breaks: {} };
      const reeses = { id: 'reeses-sodium-options', version: '2.2.6+mc26.3', depends: { sodium: '0.9.3+mc26.3' }, breaks: {} };
      fs2.writeFileSync(path2.join(d3, 'sodium-beta.jar'), jar(sod('0.9.3-beta.3+mc26.3')));
      fs2.writeFileSync(path2.join(d3, 'iris.jar'), jar(irisReal));
      fs2.writeFileSync(path2.join(d3, 'reeses.jar'), jar(reeses));
      const vs = [
        { version_number: '0.9.3', files: [{ url: 'https://cdn.modrinth.com/s1.jar', filename: 'sodium-stable.jar', primary: true }] },
        { version_number: '0.9.3-beta.3', files: [{ url: 'https://cdn.modrinth.com/s2.jar', filename: 'sodium-beta.jar', primary: true }] }
      ];
      const bd = { 'https://cdn.modrinth.com/s1.jar': jar(sod('0.9.3+mc26.3', '<=1.12.0')), 'https://cdn.modrinth.com/s2.jar': jar(sod('0.9.3-beta.3+mc26.3')) };
      const r3 = await nova.fixSodiumIris(d3, { listSodium: async () => vs, download: async (u) => bd[u], log: () => {} });
      assert.strictEqual(r3.action, 'sodium');
      assert.deepStrictEqual(fs2.readdirSync(d3).sort(), ['iris.jar', 'sodium-beta.jar']);
      // Fabric API antigua ("fabric") + Nova Client que pide "fabric-api": se detecta; con la nueva ("fabric-api") no.
      const d5 = fs2.mkdtempSync(path2.join(os2.tmpdir(), 'nova-api-'));
      fs2.writeFileSync(path2.join(d5, 'nova-client.jar'), jar({ id: 'nova_client', version: '0.5.1', depends: { 'fabric-api': '*' } }));
      fs2.writeFileSync(path2.join(d5, 'fabric-api-0.42.0+1.16.jar'), jar({ id: 'fabric', version: '0.42.0' }));
      let sa = nova.novaClientApiState(d5);
      assert.deepStrictEqual([sa.client, sa.needs, sa.hasApi, sa.hasLegacy], ['nova-client.jar', 'fabric-api', false, true]);
      fs2.writeFileSync(path2.join(d5, 'fabric-api-0.42.0+1.16.jar'), jar({ id: 'fabric-api', version: '0.100.0', provides: ['fabric'] }));
      sa = nova.novaClientApiState(d5);
      assert.strictEqual(sa.hasApi, true);
      // Si no hay choque, no se toca nada.
      const r4 = await nova.fixSodiumIris(d3, { listSodium: async () => vs, download: async (u) => bd[u], log: () => {} });
      assert.strictEqual(r4.changed, false);
    }
  }
  console.log('nova.test.js OK');
})().catch((e) => { console.error(e); process.exit(1); });
