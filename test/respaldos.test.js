'use strict';
// Copias automáticas de mundos (lib/respaldos.js) en una carpeta temporal.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readZip } = require('../lib/zip');
const r = require('../lib/respaldos');

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'npx-resp-'));
  const world = path.join(root, 'saves', 'Mi Mundo');
  fs.mkdirSync(path.join(world, 'region'), { recursive: true });
  fs.writeFileSync(path.join(world, 'level.dat'), Buffer.from('nivel'));
  fs.writeFileSync(path.join(world, 'region', 'r.0.0.mca'), Buffer.alloc(9000, 7));
  fs.writeFileSync(path.join(world, 'notas.txt'), 'hola '.repeat(200));
  fs.writeFileSync(path.join(world, 'session.lock'), 'x');
  fs.mkdirSync(path.join(root, 'saves', 'no-es-mundo'), { recursive: true }); // sin level.dat: se ignora

  let t = Date.parse('2026-11-24T10:00:00Z');
  const now = () => new Date(t);
  let res = await r.autoBackup(root, { keep: 2, now });
  assert.strictEqual(res.made.length, 1, 'copia el mundo la primera vez');
  const first = res.made[0].name;
  assert.ok(r.isAuto(first) && first.startsWith('auto-mi-mundo-'), first);

  // El zip se puede leer y trae los archivos (sin session.lock)
  const zip = readZip(fs.readFileSync(path.join(root, 'backups', first)));
  assert.ok(zip.has('Mi Mundo/level.dat'));
  assert.ok(zip.has('Mi Mundo/region/r.0.0.mca'));
  assert.ok(!zip.has('Mi Mundo/session.lock'));
  assert.strictEqual(zip.read('Mi Mundo/notas.txt').toString(), 'hola '.repeat(200));
  assert.strictEqual(zip.read('Mi Mundo/region/r.0.0.mca').length, 9000);

  // Sin cambios: no se repite
  res = await r.autoBackup(root, { keep: 2, now });
  assert.strictEqual(res.made.length, 0);
  assert.deepStrictEqual(res.skipped.map((s) => s.reason), ['sin-cambios']);

  // Cambia el mundo: nueva copia; con keep=2 solo quedan las 2 últimas
  const bump = () => {
    t += 60000;
    const later = new Date(Date.now() + 3600000 + t % 100000);
    fs.writeFileSync(path.join(world, 'level.dat'), Buffer.from('nivel ' + t));
    fs.utimesSync(path.join(world, 'level.dat'), later, later);
  };
  bump();
  res = await r.autoBackup(root, { keep: 2, now });
  assert.strictEqual(res.made.length, 1);
  // Las copias manuales no se tocan al rotar
  fs.writeFileSync(path.join(root, 'backups', 'mi-mundo-2026-01-01-00-00-00.zip'), 'manual');
  for (const b of [r.listAuto(path.join(root, 'backups'), 'Mi Mundo')]) assert.strictEqual(b.length, 2);
  bump();
  // la copia vieja ya tiene mtime anterior al cambio: hace falta que el archivo del mundo sea más nuevo que la última copia
  const lastCopy = r.listAuto(path.join(root, 'backups'), 'Mi Mundo')[0];
  const future = new Date(Date.now() + 7200000);
  fs.utimesSync(path.join(world, 'level.dat'), future, future);
  res = await r.autoBackup(root, { keep: 2, now });
  assert.strictEqual(res.made.length, 1);
  const autos = r.listAuto(path.join(root, 'backups'), 'Mi Mundo');
  assert.strictEqual(autos.length, 2, 'rota a las últimas 2');
  assert.ok(!autos.some((a) => a.name === first), 'borró la más vieja');
  assert.ok(lastCopy);
  assert.ok(fs.existsSync(path.join(root, 'backups', 'mi-mundo-2026-01-01-00-00-00.zip')), 'la manual sigue');

  // Un mundo más grande que el límite no se copia solo
  const big = await r.autoBackup(root, { keep: 2, now, maxBytes: 10 });
  assert.ok(big.skipped.some((s) => s.reason === 'grande' || s.reason === 'sin-cambios'));
  // No deja archivos .part
  assert.ok(!fs.readdirSync(path.join(root, 'backups')).some((f) => f.endsWith('.part')));
  fs.rmSync(root, { recursive: true, force: true });
  console.log('respaldos.test OK');
})().catch((e) => { console.error(e); process.exit(1); });
