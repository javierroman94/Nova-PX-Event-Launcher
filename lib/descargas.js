'use strict';
/*
 * Descargas en paralelo con reintentos.
 *  - pool(): varias tareas a la vez (por defecto 4) y avisa cuántas van.
 *  - retry(): repite una tarea que falló, esperando un poco más cada vez.
 * Sin red ni disco: lo que se descarga lo decide quien llama, así se puede probar con npm test.
 */

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Repite fn hasta `tries` veces. Espera delayMs, 2×delayMs… entre intentos.
// Si shouldRetry(err) dice que no, se rinde enseguida (por ejemplo, una huella que no coincide no se arregla reintentando).
async function retry(fn, { tries = 3, delayMs = 700, shouldRetry } = {}) {
  let last;
  for (let i = 0; i < Math.max(1, tries); i++) {
    if (i) await wait(delayMs * i);
    try {
      return await fn(i);
    } catch (err) {
      last = err;
      if (shouldRetry && !shouldRetry(err)) break;
    }
  }
  throw last;
}

// Ejecuta worker(item, i) para cada elemento, `concurrency` a la vez. Devuelve los resultados en el mismo orden.
// Si una tarea falla, no se empiezan más y se lanza ese error cuando terminan las que ya estaban en marcha.
async function pool(items, worker, { concurrency = 4, onProgress } = {}) {
  const list = Array.from(items || []);
  const results = new Array(list.length);
  let next = 0;
  let done = 0;
  let failed = null;
  const run = async () => {
    while (next < list.length && !failed) {
      const i = next++;
      try {
        results[i] = await worker(list[i], i);
      } catch (err) {
        if (!failed) failed = err;
        return;
      }
      done++;
      if (onProgress) onProgress(done, list.length, list[i]);
    }
  };
  const n = Math.max(1, Math.min(Math.floor(concurrency) || 1, list.length || 1));
  await Promise.all(Array.from({ length: n }, run));
  if (failed) throw failed;
  return results;
}

// Igual que pool, pero nunca falla: devuelve [{ ok, value }] o [{ ok: false, error }] por elemento.
async function settle(items, worker, opts) {
  return pool(items, async (item, i) => {
    try {
      return { ok: true, value: await worker(item, i) };
    } catch (error) {
      return { ok: false, error };
    }
  }, opts);
}

// Errores que no se arreglan reintentando: huella distinta, enlace no permitido, archivo demasiado grande.
const permanent = (err) => /huella|no coincide|no permitid|demasiado grande|no es un|no es v[aá]lid/i.test(String((err && err.message) || err));
const shouldRetry = (err) => !permanent(err);

module.exports = { retry, pool, settle, shouldRetry, wait };
