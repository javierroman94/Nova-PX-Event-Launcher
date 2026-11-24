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

function guardIpc(ipc, dir) {
  const handle = ipc.handle.bind(ipc);
  ipc.handle = (channel, fn) => handle(channel, (e, ...args) => {
    const url = e && e.senderFrame && e.senderFrame.url;
    if (!isTrustedUrl(url, dir)) throw new Error('Origen no permitido.');
    return fn(e, ...args);
  });
}

module.exports = { isTrustedUrl, guardIpc };
