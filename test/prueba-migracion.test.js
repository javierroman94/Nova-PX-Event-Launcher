'use strict';
// Prueba tools/prueba-migracion-presence.sh con un curl falso (sin red):
// solo lee producción, nunca escribe en sus Workers, se detiene ante errores,
// no muestra cuerpos de la API y borra el Worker de prueba.
const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

if (process.platform === 'win32' || spawnSync('bash', ['-c', 'true']).status !== 0) {
  console.log('prueba-migracion: sin bash, se omite');
  process.exit(0);
}

const script = path.join(__dirname, '..', 'tools', 'prueba-migracion-presence.sh');
const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'mock-curl-'));
const calls = path.join(bin, 'calls.log');
const state = `${calls}.worker`;
fs.writeFileSync(path.join(bin, 'curl'), `#!/usr/bin/env bash
out=""; url=""; method=GET
while [ $# -gt 0 ]; do case "$1" in
  --output) out="$2"; shift;;
  -X) method="$2"; shift;;
  -F) f="$2"; if [[ "$f" == metadata=@* ]]; then m="\${f#metadata=@}"; cat "\${m%%;*}" >> "${calls}.meta"; fi; shift;;
  https://*) url="$1";;
esac; shift; done
echo "$method $url" >> "${calls}"
state="${calls}.worker"
tag="v1"; if [[ -s "${calls}.tag" ]]; then tag="$(cat "${calls}.tag")"; fi
case "\${MOCK:-ok}" in
  neterr) exit 7;;
  fail) echo '{"success":false,"errors":[{"message":"DATO-PRIVADO"}]}' > "$out"; exit 22;;
  false) echo '{"success":false,"errors":[]}' > "$out"; exit 0;;
esac
if [[ "$method" == "PUT" && "$url" == */workers/scripts/* ]]; then
  name="\${url##*/}"
  printf '%s' "$name" > "$state"
fi
if [[ "$method" == "DELETE" ]]; then rm -f "$state"; fi
if [[ "$url" == */workers/scripts ]]; then
  if [[ -s "$state" ]]; then
    printf '{"success":true,"errors":[],"result":[{"id":"nova-px-event-launcher","migration_tag":"v1"},{"id":"nova-px-pet"},{"id":"%s","migration_tag":"%s"}]}' "$(cat "$state")" "$tag" > "$out"
  else
    echo '{"success":true,"errors":[],"result":[{"id":"nova-px-event-launcher","migration_tag":"v1"},{"id":"nova-px-pet"}]}' > "$out"
  fi
else echo '{"success":true,"errors":[],"result":{}}' > "$out"; fi
`, { mode: 0o755 });
fs.writeFileSync(path.join(bin, 'npx'), `#!/usr/bin/env bash
echo "$*" >> "${calls}.npx"
cat "$PWD/wrangler.jsonc" > "${calls}.wrangler" 2>/dev/null || true
if [[ -n "\${MOCK_TAG_AFTER:-}" ]]; then printf '%s' "$MOCK_TAG_AFTER" > "${calls}.tag"; fi
[[ "\${MOCK_NPX:-ok}" == "fail" ]] && exit 1
exit 0
`, { mode: 0o755 });

const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
function run(mock, args = [], extra = {}) {
  for (const f of [calls, state, `${calls}.npx`, `${calls}.meta`, `${calls}.wrangler`, `${calls}.tag`]) fs.rmSync(f, { force: true });
  const r = spawnSync('bash', [script, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      MOCK: mock,
      CLOUDFLARE_API_TOKEN: 'TOKEN-DE-PRUEBA-NO-DEBE-SALIR',
      CLOUDFLARE_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
      ...extra,
    },
  });
  const log = fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').trim().split('\n') : [];
  return { status: r.status, out: r.stdout + r.stderr, log, npx: read(`${calls}.npx`), meta: read(`${calls}.meta`), wrangler: read(`${calls}.wrangler`) };
}

// Solo lectura: GET de la lista y ninguna escritura.
let r = run('ok');
assert.strictEqual(r.status, 0, r.out);
assert.match(r.out, /nova-px-event-launcher: v1/);
assert.match(r.out, /nova-px-pet: \(vacía\)/);
assert.ok(r.log.every((l) => l.startsWith('GET ')), r.log.join('\n'));

// Errores HTTP, de red o success=false: se detiene y no muestra el cuerpo.
for (const m of ['fail', 'neterr', 'false']) {
  r = run(m);
  assert.notStrictEqual(r.status, 0, `${m} debería fallar`);
  assert.ok(!r.out.includes('DATO-PRIVADO'), 'no muestra el cuerpo de error');
}

// Ningún modo imprime el token.
for (const m of ['ok', 'fail']) assert.ok(!run(m, ['--aislada']).out.includes('TOKEN-DE-PRUEBA'));

// --aislada: solo escribe en el Worker desechable y lo borra aunque falle.
// Con Node < 22.12 (lo pide wrangler) se detiene antes de escribir nada.
const [maj, min] = process.versions.node.split('.').map(Number);
r = run('ok', ['--aislada']);
if (!(maj > 22 || (maj === 22 && min >= 12))) {
  // En el paso de CI con Node 22.12 se exige la prueba completa: si no, sería un verde falso.
  assert.notStrictEqual(process.env.PRUEBA_MIGRACION_COMPLETA, '1', `se pidió la prueba completa, pero Node es ${process.versions.node}`);
  assert.notStrictEqual(r.status, 0);
  assert.match(r.out, /Node 22\.12/);
  assert.ok(r.log.every((l) => l.startsWith('GET ')), 'sin Node 22.12 no escribe nada');
  console.log('prueba-migracion ok (sin Node 22.12: solo se probó que no escribe)');
  process.exit(0);
}
assert.strictEqual(r.status, 0, r.out);
const writes = r.log.filter((l) => !l.startsWith('GET '));
assert.ok(writes.length >= 2, r.log.join('\n'));
for (const l of writes) {
  assert.match(l, /\/workers\/scripts\/nova-px-prueba-migracion-\d+-[a-fA-F0-9]{32}(\?force=true)?$/, l);
  assert.ok(!/\/nova-px-(event-launcher|pet)\b/.test(l), `escribió en producción: ${l}`);
}
assert.ok(writes.some((l) => l.startsWith('DELETE ')), 'borra el Worker de prueba');
assert.match(r.npx, /--yes wrangler@4\.168\.0 deploy --config wrangler\.jsonc/);
assert.ok(!fs.existsSync(state), 'la limpieza elimina el Worker temporal simulado');

// Lo que se sube y lo que se despliega apunta al Worker temporal, con la migración real.
const temporal = writes.find((l) => l.startsWith('PUT ')).split('/').pop();
const meta = JSON.parse(r.meta);
assert.deepStrictEqual(meta.migrations, { new_tag: 'v1', new_sqlite_classes: ['Presence'] }, 'reproduce Presence con v1');
assert.ok(meta.bindings.some((b) => b.type === 'durable_object_namespace' && b.class_name === 'Presence'));
const cfg = JSON.parse(r.wrangler);
assert.strictEqual(cfg.name, temporal, 'wrangler despliega el Worker temporal');
assert.ok(!['nova-px-event-launcher', 'nova-px-pet'].includes(cfg.name), 'wrangler nunca apunta a producción');
assert.strictEqual(cfg.workers_dev, false);
const repo = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'wrangler.jsonc'), 'utf8').replace(/^\s*\/\/.*$/gm, ''));
assert.deepStrictEqual(cfg.migrations, repo.migrations, 'usa la misma migración que wrangler.jsonc');

// Si wrangler falla o la etiqueta cambia, la prueba falla y borra el Worker igual.
for (const [extra, desc] of [[{ MOCK_NPX: 'fail' }, 'wrangler falla'], [{ MOCK_TAG_AFTER: 'v2' }, 'la etiqueta cambia']]) {
  const x = run('ok', ['--aislada'], extra);
  assert.notStrictEqual(x.status, 0, `${desc}: debe fallar`);
  assert.ok(x.log.some((l) => l.startsWith('DELETE ')), `${desc}: debe borrar el Worker`);
}

assert.notStrictEqual(run('ok', ['--otra']).status, 0, 'rechaza opciones desconocidas');

fs.rmSync(bin, { recursive: true, force: true });
console.log('prueba-migracion ok');
