/* IPC: tema y fondo — antes estaba dentro de main.js. Recibe lo que necesita en "ctx" y devuelve lo que usan las demás partes. */
'use strict';

module.exports = function (ctx) {
  const { fs, BACKGROUND_FILE } = ctx;
  /* ---------- IPC: tema y fondo ---------- */

  // Los jugadores ya no pueden subir imágenes de fondo: se borra la que quedara de versiones anteriores.
  try { fs.rmSync(BACKGROUND_FILE, { force: true }); } catch {}
};
