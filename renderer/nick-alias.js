/* Cambios de nick: si alguien cambió su nick de Minecraft, el launcher muestra el nuevo (y por eso carga su skin actual).
 * Un administrador puede ocultar nombres desde Advertencias. Datos: data/nicks.json -> { map: { nick_en_minusculas: { name, hidden } } } */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NovaNicks = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const lookup = (map, nick) => {
    const e = map && typeof nick === 'string' ? map[nick.toLowerCase()] : null;
    return e && typeof e === 'object' ? e : null;
  };
  // Devuelve el nombre a mostrar, o null si hay que ocultarlo.
  function show(map, nick) {
    const e = lookup(map, nick);
    if (!e) return nick;
    if (e.hidden) return null;
    return e.name || nick;
  }
  function people(list, map) {
    return (Array.isArray(list) ? list : []).map((p) => {
      if (!p || typeof p !== 'object' || !p.nick) return p;
      const n = show(map, p.nick);
      return n === null ? null : (n === p.nick ? p : { ...p, nick: n });
    }).filter((p) => p !== null);
  }
  function events(list, map) {
    if (!Array.isArray(list) || !map) return list;
    return list.map((ev) => {
      if (!ev || typeof ev !== 'object') return ev;
      const out = { ...ev };
      if (Array.isArray(ev.winners)) out.winners = ev.winners.map((w) => show(map, w)).filter((w) => w !== null);
      else if (ev.winner) { const w = show(map, ev.winner); if (w === null) delete out.winner; else out.winner = w; }
      if (Array.isArray(ev.roster)) out.roster = people(ev.roster, map);
      if (Array.isArray(ev.collabs)) out.collabs = people(ev.collabs, map);
      if (ev.commissioner && ev.commissioner.nick) {
        const c = show(map, ev.commissioner.nick);
        out.commissioner = c === null ? { ...ev.commissioner, nick: '' } : { ...ev.commissioner, nick: c };
      }
      return out;
    });
  }
  const team = (list, map) => (!Array.isArray(list) || !map ? list : people(list, map));
  return { show, events, team };
}));
