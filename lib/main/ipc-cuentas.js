/* IPC: cuentas — antes estaba dentro de main.js. Recibe lo que necesita en "ctx" y devuelve lo que usan las demás partes. */
'use strict';

module.exports = function (ctx) {
  const { crypto } = ctx;
  /* ---------- IPC: cuentas ---------- */

  function makeOfflineSession(name) {
    // UUID offline estándar de Minecraft (igual al que calcula el servidor).
    const hash = crypto.createHash('md5').update(`OfflinePlayer:${name}`).digest();
    hash[6] = (hash[6] & 0x0f) | 0x30;
    hash[8] = (hash[8] & 0x3f) | 0x80;
    const hex = hash.toString('hex');
    const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    return {
      mode: 'offline',
      name,
      uuid,
      auth: { access_token: uuid, client_token: uuid, uuid, name, user_properties: '{}', meta: { type: 'mojang', demo: false } }
    };
  }
  return { makeOfflineSession };
};
