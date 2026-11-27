'use strict';
// El barrido de carpetas npx-run-* al abrir Nova PX no debe borrar los mods de una
// partida que sigue abierta (se cerró el launcher con el juego en marcha y se volvió
// a abrir). Sí debe borrar las abandonadas cuando ya no hay nadie usándolas.
const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const px = require('../lib/mods-px');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px-activa-'));
const vivo = () => spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });
const muerto = () => new Promise((res) => { const c = spawn(process.execPath, ['-e', '0'], { stdio: 'ignore' }); c.on('exit', () => res(c.pid)); });
const marker = (dir) => JSON.parse(fs.readFileSync(path.join(dir, px.MARKER), 'utf8'));
// Simula una carpeta creada por OTRO proceso del launcher (el que se cerró).
const deOtroLauncher = (launcherPid, gamePid) => {
  const d = px.createRunDir(root);
  px.writeRunJar(d, Buffer.from('jar'));
  fs.writeFileSync(path.join(d, px.MARKER), JSON.stringify({ pid: launcherPid, created: Date.now(), ...(gamePid ? { gamePid } : {}) }));
  return d;
};

(async () => {
  // Al arrancar el juego se anota su proceso en la marca.
  const d0 = px.createRunDir(root);
  const juego0 = vivo();
  assert.ok(px.markRunGame(d0, juego0.pid));
  assert.strictEqual(marker(d0).gamePid, juego0.pid);
  assert.ok(!px.markRunGame(path.join(root, 'otra'), 1), 'no escribe marcas en carpetas ajenas');
  juego0.kill(); px.removeRunDir(d0, root);

  // 1. Launcher cerrado (muerto) con el juego todavía abierto: NO se borra.
  const juego = vivo();
  const launcherViejo = await muerto();
  const activa = deOtroLauncher(launcherViejo, juego.pid);
  assert.strictEqual(px.sweepRunDirs(root), 0);
  assert.ok(fs.existsSync(activa) && px.leftoverJars(root).length === 1, 'los .jar de la partida activa siguen ahí');

  // 2. Cuando ese Minecraft se cierra, la siguiente limpieza sí la borra.
  juego.kill();
  await new Promise((r) => juego.on('exit', r));
  assert.strictEqual(px.sweepRunDirs(root), 1);
  assert.ok(!fs.existsSync(activa));

  // 3. Juego nunca arrancó y el launcher que la creó ya no existe: abandonada, se borra.
  const abandonada = deOtroLauncher(await muerto());
  assert.strictEqual(px.sweepRunDirs(root), 1);
  assert.ok(!fs.existsSync(abandonada));

  // 4. Juego aún sin arrancar, pero el launcher que la prepara sigue vivo (otra ventana): no se toca.
  const otroLauncher = vivo();
  const preparando = deOtroLauncher(otroLauncher.pid);
  assert.strictEqual(px.sweepRunDirs(root), 0);
  assert.ok(fs.existsSync(preparando));
  otroLauncher.kill();
  await new Promise((r) => otroLauncher.on('exit', r));
  assert.strictEqual(px.sweepRunDirs(root), 1);

  // 5. Marca dañada: la carpeta es de Nova PX pero no se puede saber de quién es; se borra.
  const rota = px.createRunDir(root);
  fs.writeFileSync(path.join(rota, px.MARKER), 'no es json');
  assert.strictEqual(px.sweepRunDirs(root), 1);

  // 6. Sin marca, nunca se toca aunque el nombre coincida.
  const ajena = path.join(root, 'npx-run-1111111111111111');
  fs.mkdirSync(ajena); fs.writeFileSync(path.join(ajena, 'x.jar'), 'x');
  assert.strictEqual(px.sweepRunDirs(root), 0);
  assert.ok(fs.existsSync(path.join(ajena, 'x.jar')));

  // main.js anota el proceso del juego, y repite la limpieza mientras el launcher sigue abierto.
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  assert.match(main, /if \(currentRunDir && child\.pid\) modsPx\.markRunGame\(currentRunDir, child\.pid\)/);
  assert.match(main, /setInterval\(\(\) => \{ try \{ if \(!launching\) modsPx\.sweepRunDirs\(app\.getPath\('temp'\)\);/);

  fs.rmSync(root, { recursive: true, force: true });
  console.log('mods-px-partida-activa ok');
})().catch((err) => { console.error(err); process.exit(1); });
