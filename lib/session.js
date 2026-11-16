'use strict';
// La sesión premium caduca a los 30 días desde el inicio de sesión (no desde cada apertura). La no premium no caduca.
const DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// `at`: milisegundos del inicio de sesión. Sin fecha (instalaciones antiguas) se toma "ahora" y empieza a contar.
function premiumExpired(at, now = Date.now(), days = DAYS) {
  const t = Number(at);
  if (!Number.isFinite(t) || t <= 0) return false;
  return now - t > days * DAY_MS;
}
const startedAt = (at, now = Date.now()) => (Number.isFinite(Number(at)) && Number(at) > 0 ? Number(at) : now);

module.exports = { premiumExpired, startedAt, DAYS };
