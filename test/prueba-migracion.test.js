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
while [ $# -gt 0 ]; do case "$1" in --output) out="$2"; shift;; -X) method="$2"; shift;; https://*) url="$1";; esac; shift; done
echo "$method $url" >> "${calls}"
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
    printf '{"success":true,"errors":[],"result":[{"id":"nova-px-event-launcher","migration_tag":"v1"},{"id":"nova-px-pet"},{"id":"%s","migration_tag":"v1"}]}' "$(cat "$state")" > "$out"
  else
    echo '{"success":true,"errors":[],"result":[{"id":"nova-px-event-launcher","migration_tag":"v1"},{"id":"nova-px-pet"}]}' > "$out"
  fi
else echo '{"success":true,"errors":[],"result":{}}' > "$out"; fi
`, { mode: 0o755 });
fs.writeFileSync(path.join(bin, 'npx'), `#!/usr/bin/env bash
echo "$*" >> "${calls}.npx"
exit 0
`, { mode: 0o755 });

function run(mock, args = []) {
  fs.rmSync(calls, { force: true });
  fs.rmSync(state, { force: true });
  fs.rmSync(`${calls}.npx`, { force: true });
  const r = spawnSync('bash', [script, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      MOCK: mock,
      CLOUDFLARE_API_TOKEN: 'TOKEN-DE-PRUEBA-NO-DEBE-SALIR',
      CLOUDFLARE_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
    },
  });
  const log = fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').trim().split('\n') : [];
  const npx = fs.existsSync(`${calls}.npx`) ? fs.readFileSync(`${calls}.npx`, 'utf8') : '';
  return { status: r.status, out: r.stdout + r.stderr, log, npx };
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

assert.notStrictEqual(run('ok', ['--otra']).status, 0, 'rechaza opciones desconocidas');

fs.rmSync(bin, { recursive: true, force: true });
console.log('prueba-migracion ok');
