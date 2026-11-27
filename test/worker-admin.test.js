'use strict';
const assert = require('assert');

(async () => {
  const worker = await import('../worker/index.mjs');
  let attempts = 0;
  const env = {
    ADMIN_KEY: 'una-clave-admin-larga-y-aleatoria',
    ADMIN_LIMITER: {
      limit: async ({ key }) => {
        assert.ok(key.startsWith('admfail:'));
        attempts++;
        return { success: attempts <= 2 };
      }
    },
    USERS: {
      get: async () => null,
      put: async () => {},
      list: async () => ({ keys: [], list_complete: true })
    }
  };
  const call = (key) => worker.default.fetch(new Request('https://worker.test/users', {
    method: 'GET',
    headers: { Authorization: `Bearer ${key}`, 'CF-Connecting-IP': '198.51.100.44' }
  }), env, { waitUntil: () => {} });

  assert.strictEqual((await call('incorrecta-1')).status, 401);
  assert.strictEqual((await call('incorrecta-2')).status, 401);
  assert.strictEqual((await call('incorrecta-3')).status, 429);
  assert.strictEqual(attempts, 3);
  // Una clave válida sigue funcionando: no consume el contador de intentos fallidos.
  const ok = await call(env.ADMIN_KEY);
  assert.strictEqual(ok.status, 200);
  console.log('worker-admin.test OK');
})().catch((e) => { console.error(e); process.exit(1); });
