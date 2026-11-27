'use strict';
/*
 * Los canales IPC solo se atienden si la petición viene de una página del propio launcher (renderer/ en disco).
 * Así, aunque alguna vez se cargara otra página dentro de una ventana, no podría usar los canales.
 */
const path = require('path');
const { fileURLToPath } = require('url');

function isTrustedUrl(url, dir) {
  try {
    const u = new URL(String(url));
    if (u.protocol !== 'file:') return false;
    const p = path.resolve(fileURLToPath(u));
    const d = path.resolve(dir);
    return p === d || p.startsWith(d + path.sep);
  } catch {
    return false;
  }
}

// Solo el marco principal de la ventana: un iframe (aunque fuera de renderer/) nunca habla por IPC.
// Se mira frame.parent (null en el marco principal) en vez de comparar objetos WebFrameMain,
// que no siempre son la misma instancia entre senderFrame y sender.mainFrame.
function isTopFrame(frame) {
  return !!frame && frame.parent == null && typeof frame.url === 'string';
}

function guardIpc(ipc, dir) {
  const handle = ipc.handle.bind(ipc);
  ipc.handle = (channel, fn) => handle(channel, (e, ...args) => {
    const frame = e && e.senderFrame;
    if (!isTopFrame(frame) || !isTrustedUrl(frame.url, dir)) throw new Error('Origen no permitido.');
    return fn(e, ...args);
  });
}

module.exports = { isTrustedUrl, isTopFrame, guardIpc };
