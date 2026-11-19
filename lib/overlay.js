'use strict';
// Ventana flotante de PX sobre el juego: tamaño y posición (esquina inferior derecha del monitor, con margen).
const SIZE = { width: 260, height: 190 };
const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
function bounds(workArea, size = SIZE, margin = 12) {
  const wa = workArea || { x: 0, y: 0, width: 1280, height: 720 };
  return { x: Math.round(wa.x + wa.width - size.width - margin), y: Math.round(wa.y + wa.height - size.height - margin), width: size.width, height: size.height };
}
// Solo pasan los campos esperados (la ventana del launcher no puede mandar otra cosa a la flotante).
function sanitize(p) {
  const o = p && typeof p === 'object' ? p : {};
  const skin = o.skin === 'shadow' ? 'shadow' : '';
  return { text: clean(o.text, 200), acc: ['', 'bow', 'hat', 'scarf', 'glasses', 'crown'].includes(o.acc) ? o.acc : '', name: clean(o.name, 16), skin };
}
module.exports = { SIZE, bounds, sanitize };
