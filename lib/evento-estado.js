'use strict';
/*
 * Estado real de un evento: "soon" | "active" | "ended".
 * Un evento programado (status "soon" con autoStart y fecha de inicio) pasa solo a "active" cuando llega la hora.
 * El renderer (renderer/app/02-inicio.js) repite esta misma regla.
 */
function estadoEfectivo(event, now = Date.now()) {
  const ev = event || {};
  const st = ev.status || (ev.active === false ? 'soon' : 'active');
  if (st === 'soon' && ev.autoStart === true) {
    const t = Date.parse(ev.startsAt || '');
    if (Number.isFinite(t) && t <= now) return 'active';
  }
  return st;
}

module.exports = { estadoEfectivo };
