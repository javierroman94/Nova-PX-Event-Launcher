'use strict';
// Cambios de nick: junta los nicks que aparecen en el launcher y compara con lo que dice Mojang.
// data/nicks.json  -> { map: { "<nick en minúsculas>": { uuid, name, hidden } } }
// data/warnings.json -> [ { id, at, kind: 'rename' | 'missing', nick, from, to, where, status } ]
const NICK_RE = /^[A-Za-z0-9_]{1,16}$/;
const MAX_WARNINGS = 120;

const str = (v, n) => String(v == null ? '' : v).slice(0, n);

// Todos los nicks de eventos y equipo, con dónde salen (para el aviso).
function collect(events, team) {
  const found = new Map();
  const add = (nick, where) => {
    const n = str(nick, 16).trim();
    if (!NICK_RE.test(n)) return;
    const k = n.toLowerCase();
    const cur = found.get(k) || { nick: n, where: [] };
    if (cur.where.length < 4 && !cur.where.includes(where)) cur.where.push(where);
    found.set(k, cur);
  };
  for (const ev of Array.isArray(events) ? events : []) {
    const name = str(ev && ev.name, 60) || 'Evento';
    (Array.isArray(ev && ev.winners) ? ev.winners : ev && ev.winner ? [ev.winner] : []).forEach((w) => add(w, `${name} · ganador`));
    ((ev && ev.roster) || []).forEach((p) => add(p && p.nick, `${name} · participante`));
    ((ev && ev.collabs) || []).forEach((p) => add(p && p.nick, `${name} · colaboración`));
    if (ev && ev.commissioner) add(ev.commissioner.nick, `${name} · comisionado`);
  }
  for (const m of Array.isArray(team) ? team : []) add(m && m.nick, 'Equipo');
  return [...found.values()];
}

function sanitizeMap(raw) {
  const out = {};
  const src = raw && typeof raw === 'object' && raw.map && typeof raw.map === 'object' ? raw.map : {};
  for (const [k, v] of Object.entries(src).slice(0, 2000)) {
    const key = String(k).toLowerCase();
    if (!NICK_RE.test(key) || !v || typeof v !== 'object') continue;
    const uuid = String(v.uuid || '').replace(/-/g, '').toLowerCase();
    const name = str(v.name, 16);
    if (!/^[0-9a-f]{32}$/.test(uuid) || !NICK_RE.test(name)) continue;
    const at = Number.isFinite(+v.at) && +v.at > 0 ? Math.floor(+v.at) : 0;
    out[key] = { uuid, name, ...(v.hidden ? { hidden: true } : {}), ...(at ? { at } : {}) };
  }
  return { map: out };
}

function sanitizeWarnings(raw) {
  return (Array.isArray(raw) ? raw : []).slice(0, MAX_WARNINGS).map((w) => ({
    id: str(w && w.id, 40),
    at: str(w && w.at, 30),
    kind: w && w.kind === 'missing' ? 'missing' : 'rename',
    nick: str(w && w.nick, 16),
    from: str(w && w.from, 16),
    to: str(w && w.to, 16),
    where: (Array.isArray(w && w.where) ? w.where : []).slice(0, 4).map((x) => str(x, 90)),
    status: ['open', 'ok', 'hidden', 'assigned'].includes(w && w.status) ? w.status : 'open'
  })).filter((w) => w.id && w.nick);
}

// Se queda con los avisos más nuevos (los abiertos primero) sin pasar del tope.
function trimWarnings(list) {
  const open = list.filter((w) => w.status === 'open');
  const rest = list.filter((w) => w.status !== 'open');
  return [...open, ...rest].slice(0, MAX_WARNINGS);
}

// Lo que ve el resto de jugadores: nick por nick, el nombre actual y si está oculto.
function aliasFor(map, nick) {
  const e = map && map[String(nick || '').toLowerCase()];
  return e ? { name: e.name, hidden: !!e.hidden } : null;
}

// Orden de revisión: primero los nicks que nunca se revisaron y luego los revisados hace más tiempo (así, con muchos nicks, se turnan).
function scanOrder(list, map) {
  const when = (it) => { const k = map && map[it.nick.toLowerCase()]; return k ? k.at || 1 : 0; };
  return list.slice().sort((a, b) => when(a) - when(b));
}

module.exports = { scanOrder, collect, sanitizeMap, sanitizeWarnings, trimWarnings, aliasFor, NICK_RE, MAX_WARNINGS };
