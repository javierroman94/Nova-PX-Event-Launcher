/* PX mira el registro de Minecraft (solo texto, en tu PC) y reacciona: muertes, avances, entrar a un servidor, menciones en el chat.
 * Es opcional (Ajustes → Apariencia), viene apagado y nada de esto sale de tu equipo. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NovaGameEvents = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const DEATH = /\b(was slain by|was shot by|was blown up by|was killed by|was fireballed by|was pummeled by|was impaled|was squashed|was skewered|fell from a high place|fell off|fell out of the world|hit the ground too hard|drowned|burned to death|went up in flames|tried to swim in lava|suffocated|starved to death|was pricked to death|withered away|died|was struck by lightning|blew up|discovered the floor was lava|experienced kinetic energy|froze to death|was stung to death|was poked to death)\b/;
  const clean = (v, n) => String(v == null ? '' : v).replace(/§./g, '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

  // line: una línea del registro. nick: tu nick (para saber si es tu muerte o tu avance). Devuelve null si no importa.
  function parse(line, nick) {
    const l = clean(line, 400);
    if (!l) return null;
    const me = String(nick || '').toLowerCase();
    let m = /\]: (?:\[[^\]]*\] )*(\w{1,16}) has (?:made the advancement|reached the goal|completed the challenge) \[([^\]]{1,60})\]/.exec(l);
    if (m && (!me || m[1].toLowerCase() === me)) return { type: 'advancement', what: m[2], challenge: /completed the challenge/.test(l), goal: /reached the goal/.test(l) };
    m = /\]: (?:\[[^\]]*\] )*(\w{1,16}) (.{2,80})$/.exec(l);
    if (m && me && m[1].toLowerCase() === me && DEATH.test(m[2]) && !/^(joined|left)/.test(m[2])) {
      const by = /(?:by|to) ([A-Za-z0-9_ ]{2,30})$/.exec(m[2]);
      const how = /lava/.test(m[2]) ? 'lava' : /fell|hit the ground|fall/.test(m[2]) ? 'caida' : /drowned/.test(m[2]) ? 'ahogado' : /blown up|blew up|creeper/i.test(m[2] + (by ? by[1] : '')) ? 'explosion' : /starved/.test(m[2]) ? 'hambre' : /burned|flames|fire/.test(m[2]) ? 'fuego' : /slain|shot|killed|pummeled|stung/.test(m[2]) ? 'mob' : 'otro';
      return { type: 'death', how, by: by ? clean(by[1], 30) : '' };
    }
    m = /Connecting to ([A-Za-z0-9._-]{3,60}), (\d{2,5})/.exec(l);
    if (m) return { type: 'server', host: m[1] };
    m = /\[CHAT\] (?:<(\w{1,16})> )?(.{1,200})$/.exec(l);
    if (m && me && m[2].toLowerCase().includes(me) && !(m[1] && m[1].toLowerCase() === me)) return { type: 'mention', from: m[1] || '' };
    return null;
  }

  const LINES = {
    death: {
      lava: ['¡Lava! Siempre la lava… 🌋', 'Ay… mira por dónde caminas.'],
      caida: ['Uf, eso dolió. Cuidado con las alturas.', 'Un balde de agua habría ayudado. 💧'],
      ahogado: ['Respira, {name}, respira. 🫧'],
      explosion: ['¡SSSsss… BOOM! Odio a los creepers. 💥'],
      hambre: ['¡Te olvidaste de comer! Yo también tengo hambre a veces. 🍖'],
      fuego: ['Hace calor por ahí… 🔥'],
      mob: ['Te ganaron… ¡pero vuelves más fuerte!', 'Rápido, ve por tus cosas antes de que desaparezcan. ⏳'],
      otro: ['Ánimo, {name}. Pasa hasta a los mejores.', '¡A levantarse! Se pierde lo que no se intenta.']
    },
    advancement: ['¡Avance logrado: {what}! 🎉', '¡Muy bien, {name}! «{what}» desbloqueado. ✨'],
    challenge: ['¡Desafío completado: {what}! Eres un crack. 🏆'],
    server: ['¡Entrando a {host}! Espero que haya buena gente. 🌐', 'Nuevo servidor… ¡suerte, {name}!'],
    mention: ['Te mencionaron en el chat, {name}. 👀', 'Alguien te nombró… ¿le respondes?']
  };
  const pick = (a, rng) => a[Math.floor((rng || Math.random)() * a.length) % a.length];
  const fill = (s, c) => String(s).replace(/\{(\w+)\}/g, (_m, k) => (c && c[k] != null ? c[k] : ''));
  function reaction(ev, ctx, rng) {
    if (!ev) return null;
    let pool;
    if (ev.type === 'death') pool = LINES.death[ev.how] || LINES.death.otro;
    else if (ev.type === 'advancement') pool = ev.challenge ? LINES.challenge : LINES.advancement;
    else pool = LINES[ev.type];
    return pool ? fill(pick(pool, rng), { name: (ctx && ctx.name) || 'amigo', what: ev.what || '', host: ev.host || '' }) : null;
  }
  return { parse, reaction };
}));

(function () {
  if (typeof document === 'undefined') return;
  const G = window.NovaGameEvents; const M = window.NovaMascot;
  if (!G || !M) return;
  const KEY = 'px.pet.watch';
  const get = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
  let on = get(); let nick = ''; const last = {};
  const COOL = { death: 20000, advancement: 5000, server: 60000, mention: 45000 };
  const box = document.getElementById('fun-pet-watch');
  if (box) { box.checked = on; box.addEventListener('change', () => { on = box.checked; try { localStorage.setItem(KEY, on ? '1' : '0'); } catch {} }); }
  G.feed = (line) => {
    if (!on) return;
    nick = M.name() || nick;
    const ev = G.parse(line, nick);
    if (!ev) return;
    const now = Date.now();
    if (now - (last[ev.type] || 0) < COOL[ev.type]) return;
    last[ev.type] = now;
    const t = G.reaction(ev, { name: nick });
    if (t) M.say(t, 6000);
  };
}());
