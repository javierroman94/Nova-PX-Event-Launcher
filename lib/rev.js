'use strict';
// Aviso de "hay contenido nuevo": el Worker guarda una revisión que cambia cada vez que un administrador publica.
// Los launchers la consultan seguido (es un texto diminuto) y, si cambió, recargan los datos al instante.
const REV_RE = /^[a-z0-9]{6,32}$/;
const valid = (r) => typeof r === 'string' && REV_RE.test(r);
// prev: lo último que vimos (null la primera vez). La primera lectura no cuenta como cambio.
function changed(prev, next) { return valid(next) && valid(prev) && prev !== next; }
const makeRev = (now = Date.now(), rnd = Math.random) => now.toString(36) + Math.floor(rnd() * 36 ** 4).toString(36).padStart(4, '0');
module.exports = { valid, changed, makeRev };
