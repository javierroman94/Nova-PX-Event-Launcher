'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { scan, roots } = require('../lib/launchers');

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'novapx-lch-'));
try {
  const w = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
  const appdata = path.join(home, 'AppData', 'Roaming');
  // Prism
  const p1 = path.join(appdata, 'PrismLauncher', 'instances', 'Mi Pack');
  w(path.join(p1, 'mmc-pack.json'), JSON.stringify({ components: [{ uid: 'net.minecraft', version: '1.21.1' }, { uid: 'net.fabricmc.fabric-loader', version: '0.16.0' }] }));
  w(path.join(p1, 'instance.cfg'), 'name=Mi Pack Bonito\n');
  w(path.join(p1, '.minecraft', 'mods', 'a.jar'), 'x');
  // NeoForge (no soportado)
  const p2 = path.join(appdata, 'PrismLauncher', 'instances', 'Neo');
  w(path.join(p2, 'mmc-pack.json'), JSON.stringify({ components: [{ uid: 'net.minecraft', version: '1.21.1' }, { uid: 'net.neoforged', version: '21' }] }));
  // ATLauncher
  const a1 = path.join(appdata, 'ATLauncher', 'instances', 'AT1');
  w(path.join(a1, 'instance.json'), JSON.stringify({ id: '1.20.1', launcher: { name: 'Mi AT', loaderVersion: { type: 'Forge', version: '47.2.0' } } }));
  // Modrinth App (profile.json)
  const m1 = path.join(appdata, 'ModrinthApp', 'profiles', 'Mr1');
  w(path.join(m1, 'profile.json'), JSON.stringify({ metadata: { name: 'Mr1', game_version: '1.21.4', loader: 'fabric', loader_version: { id: '0.16.9' } } }));
  // Carpeta que no es instancia
  fs.mkdirSync(path.join(appdata, 'PrismLauncher', 'instances', 'Vacia'), { recursive: true });
  // Carpeta oculta o con nombre peligroso
  fs.mkdirSync(path.join(appdata, 'PrismLauncher', 'instances', '.hidden'), { recursive: true });

  const r = scan({ platform: 'win32', env: { APPDATA: appdata, LOCALAPPDATA: path.join(home, 'AppData', 'Local') }, home });
  const by = (n) => r.find((x) => x.name === n);
  assert.strictEqual(r.length, 4, JSON.stringify(r.map((x) => x.name)));
  assert.strictEqual(by('Mi Pack Bonito').launcher, 'Prism Launcher');
  assert.strictEqual(by('Mi Pack Bonito').loader.type, 'fabric');
  assert.strictEqual(by('Mi Pack Bonito').mods, 1);
  assert.strictEqual(by('Neo').unsupported, 'NeoForge');
  assert.strictEqual(by('Mi AT').loader.type, 'forge');
  assert.strictEqual(by('Mr1').mcVersion, '1.21.4');
  assert.ok(roots({ platform: 'linux', env: {}, home }).some((x) => x.dir.includes('.local')));
  console.log('launchers.test OK');
} finally {
  fs.rmSync(home, { recursive: true, force: true });
}
