'use strict';
// Descargas en paralelo con reintentos (lib/descargas.js).
const assert = require('assert');
const { retry, pool, settle, shouldRetry } = require('../lib/descargas');

(async () => {
  // retry: falla dos veces y a la tercera funciona
  let calls = 0;
  const v = await retry(async () => { calls++; if (calls < 3) throw new Error('red caída'); return 'ok'; }, { tries: 3, delayMs: 1 });
  assert.strictEqual(v, 'ok');
  assert.strictEqual(calls, 3);

  // retry: un error permanente no se reintenta
  calls = 0;
  await assert.rejects(retry(async () => { calls++; throw new Error('La huella no coincide'); }, { tries: 4, delayMs: 1, shouldRetry }), /huella/);
  assert.strictEqual(calls, 1, 'una huella distinta no se descarga otra vez');
  assert.strictEqual(shouldRetry(new Error('ECONNRESET')), true);

  // pool: respeta el límite de tareas a la vez y el orden de los resultados
  let running = 0;
  let peak = 0;
  const seen = [];
  const out = await pool([5, 1, 4, 2, 3, 6, 7], async (n) => {
    running++;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, n * 3));
    running--;
    return n * 10;
  }, { concurrency: 3, onProgress: (done, total) => seen.push(`${done}/${total}`) });
  assert.deepStrictEqual(out, [50, 10, 40, 20, 30, 60, 70]);
  assert.ok(peak <= 3 && peak >= 2, `máximo 3 a la vez (hubo ${peak})`);
  assert.strictEqual(seen[seen.length - 1], '7/7');

  // pool: si una falla, se corta y lanza ese error
  let started = 0;
  await assert.rejects(pool([1, 2, 3, 4, 5, 6], async (n) => { started++; if (n === 2) throw new Error('falló 2'); await new Promise((r) => setTimeout(r, 5)); }, { concurrency: 2 }), /falló 2/);
  assert.ok(started < 6, 'no empieza tareas nuevas después de un error');

  // pool vacío y settle
  assert.deepStrictEqual(await pool([], async () => 1), []);
  const st = await settle([1, 2], async (n) => { if (n === 2) throw new Error('x'); return n; });
  assert.strictEqual(st[0].ok, true);
  assert.strictEqual(st[1].ok, false);
  console.log('descargas.test OK');
})().catch((e) => { console.error(e); process.exit(1); });
