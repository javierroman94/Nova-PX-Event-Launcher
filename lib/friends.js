'use strict';
/* Lista de amigos (solo nicks, guardada en tu equipo) y su estado en línea que consulta el Worker. */
const fs = require('fs');

const NICK = /^[A-Za-z0-9_]{3,16}$/;
const MAX = 100;

function load(file) {
  try {
    const arr = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(arr) ? arr.filter((n) => NICK.test(n)).slice(0, MAX) : [];
  } catch { return []; }
}
function save(file, list) { try { fs.writeFileSync(file, JSON.stringify(list)); } catch {} }

function add(list, nick, self = '') {
  const n = String(nick || '').trim();
  if (!NICK.test(n)) throw new Error('El nick debe tener de 3 a 16 caracteres (letras, números o guion bajo).');
  if (n.toLowerCase() === String(self).toLowerCase()) throw new Error('Ese eres tú.');
  if (list.some((x) => x.toLowerCase() === n.toLowerCase())) throw new Error('Ya está en tu lista.');
  if (list.length >= MAX) throw new Error('Llegaste al máximo de amigos.');
  return [...list, n];
}
const remove = (list, nick) => list.filter((x) => x.toLowerCase() !== String(nick).toLowerCase());

// Une la lista con el estado del Worker; en línea primero, luego por nombre.
function merge(list, status) {
  const st = status || {};
  return list.map((nick) => ({ nick, online: !!(st[nick] && st[nick].online), playing: !!(st[nick] && st[nick].playing) }))
    .sort((a, b) => (b.online - a.online) || a.nick.localeCompare(b.nick));
}

module.exports = { load, save, add, remove, merge, NICK };
