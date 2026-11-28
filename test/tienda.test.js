'use strict';
// Pruebas del envío automático a Microsoft Store (tools/tienda.js).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const t = require('../tools/tienda');
const TIENDA = require('../build/microsoft-store.json');

// Manifiesto real del paquete 1.0.108 que se publicó en la Store (generado por electron-builder).
const xml = fs.readFileSync(path.join(__dirname, 'fixtures', 'AppxManifest-tienda.xml'), 'utf8');

assert.strictEqual(t.versionStore('1.0.193'), '1.0.193.0');
assert.throws(() => t.versionStore('1.0'), /inválida/);
assert.throws(() => t.versionStore('1.0.193.0'), /inválida/);
assert.ok(t.compararVersion('1.0.200.0', '1.0.193.0') > 0);
assert.ok(t.compararVersion('1.0.99.0', '1.0.193.0') < 0);
assert.strictEqual(t.compararVersion('1.0.193.0', '1.0.193.0'), 0);

// El manifiesto real coincide con la identidad guardada (incluido el Publisher entre comillas simples).
{
  const r = t.revisarManifiesto(xml, '1.0.108');
  assert.deepStrictEqual(r.errores, []);
  assert.strictEqual(r.datos.publisher, TIENDA.publisher);
  assert.strictEqual(r.datos.arch, 'x64');
}
// Versión, identidad, publisher y arquitectura distintos se detectan.
assert.ok(t.revisarManifiesto(xml, '1.0.193').errores.some((e) => /Version/.test(e)));
assert.ok(t.revisarManifiesto(xml.replace('NOVAPX.NovaPXEventLauncher', 'Otro.Nombre'), '1.0.108').errores.some((e) => /Identity Name/.test(e)));
assert.ok(t.revisarManifiesto(xml.replace('CN=26F893CA', 'CN=00000000'), '1.0.108').errores.some((e) => /Publisher es/.test(e)));
assert.ok(t.revisarManifiesto(xml.replace('ProcessorArchitecture="x64"', 'ProcessorArchitecture="arm64"'), '1.0.108').errores.some((e) => /ProcessorArchitecture/.test(e)));
assert.ok(t.revisarManifiesto(xml.replace('<PublisherDisplayName>NOVA PX', '<PublisherDisplayName>Otro'), '1.0.108').errores.some((e) => /PublisherDisplayName/.test(e)));
assert.ok(t.revisarManifiesto('<Package/>', '1.0.108').errores.length === 1);

// JSON con texto alrededor (msstore imprime estado antes) y claves en cualquier caja.
const envio = (estado, ...versiones) => ({
  Status: estado,
  ApplicationPackages: versiones.map((v) => ({ Version: v, FileStatus: 'Uploaded' }))
});
assert.deepStrictEqual(t.leerJson('Retrieving Submission ✓\n{"a":{"b":1}}\n'), { a: { b: 1 } });
assert.throws(() => t.leerJson('sin json'), /JSON/);
assert.strictEqual(t.campo({ status: 'x' }, 'Status'), 'x');

// Decisiones.
assert.strictEqual(t.decidir(envio('Published', '1.0.108.0'), '1.0.193').accion, 'enviar');
assert.strictEqual(t.decidir(envio('Published', '1.0.193.0'), '1.0.193').accion, 'ya-enviado');
assert.strictEqual(t.decidir(envio('Certification', '1.0.193.0'), '1.0.193').accion, 'ya-enviado');
assert.strictEqual(t.decidir(envio('PendingCommit', '1.0.108.0'), '1.0.193').accion, 'en-curso');
assert.strictEqual(t.decidir(envio('CommitFailed', '1.0.108.0'), '1.0.193').accion, 'en-curso');
assert.strictEqual(t.decidir(envio('Published', '1.0.200.0'), '1.0.193').accion, 'version-vieja');
// Un paquete marcado para borrar no cuenta como enviado.
assert.strictEqual(
  t.decidir({ status: 'Published', applicationPackages: [{ version: '1.0.193.0', fileStatus: 'PendingDelete' }] }, '1.0.193').accion,
  'enviar'
);
assert.throws(() => t.decidir({}, '1.0.193'), /estado/);

// La configuración de la Store usa la identidad guardada y solo x64.
{
  const cfg = require('../electron-builder.store.js');
  assert.strictEqual(cfg.appx.identityName, TIENDA.identityName);
  assert.strictEqual(cfg.appx.publisher, TIENDA.publisher);
  assert.deepStrictEqual(cfg.win.target, [{ target: 'appx', arch: ['x64'] }]);
  assert.match(TIENDA.productId, /^9[A-Z0-9]{11}$/);
}

// El flujo de publicación solo envía a la Store desde una etiqueta vX.Y.Z, con entorno protegido,
// sin cancelar la publicación de GitHub si la Store falla, y con acciones fijadas a SHA.
{
  const wf = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'release.yml'), 'utf8').replace(/\r\n/g, '\n');
  const job = wf.slice(wf.indexOf('\n  tienda:'));
  assert.ok(job.length > 20, 'falta el trabajo «tienda»');
  assert.match(job, /needs: \[etiquetar, release\]/);
  assert.match(job, /environment:\s*\n\s*name: microsoft-store/);
  assert.match(job, /vars\.STORE_AUTO_PUBLISH == 'true'/);
  assert.match(job, /startsWith\(needs\.etiquetar\.outputs\.tag, 'v'\)/);
  assert.match(job, /concurrency:/);
  assert.match(job, /steps\.decidir\.outputs\.accion == 'enviar'/);
  // Los secretos solo aparecen como variables de entorno, nunca dentro de un comando.
  for (const linea of job.split(/\r?\n/).filter((l) => l.includes('secrets.')))
    assert.match(linea, /^\s+STORE_[A-Z_]+: \$\{\{ secrets\.STORE_[A-Z_]+ \}\}$/, `secreto fuera de env: ${linea.trim()}`);
  for (const m of wf.matchAll(/uses:\s*([^\s#]+)/g)) assert.match(m[1], /@[0-9a-f]{40}$/, `acción sin SHA: ${m[1]}`);
  // El paquete de la Store se compila después de publicar en GitHub y no puede tumbar esa publicación.
  const rel = wf.slice(wf.indexOf('\n  release:'), wf.indexOf('\n  tienda:'));
  assert.ok(rel.indexOf('Compilar y publicar') < rel.indexOf('Paquete de Microsoft Store'));
  assert.match(rel.slice(rel.indexOf('Paquete de Microsoft Store')), /continue-on-error: true/);
}

console.log('tienda: ok');
