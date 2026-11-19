/* Cerebro de PX, la mascota. Todo son reglas locales: sin red, sin costo y sin enviar nada a nadie.
 * Es lógica pura (sin DOM) para poder probarla; mascot.js se encarga de dibujar y de escuchar al usuario. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NovaMascotBrain = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const pick = (list, rng) => list[Math.floor((rng || Math.random)() * list.length) % list.length];
  const fill = (s, ctx) => String(s).replace(/\{(\w+)\}/g, (_m, k) => (ctx && ctx[k] != null ? ctx[k] : ''));

  function dayPart(hour) {
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 19) return 'afternoon';
    if (hour >= 19 || hour < 1) return 'evening';
    return 'night';
  }

  const GREET = {
    morning: ['¡Buenos días, {name}! ☀️ ¿Listo para jugar?', 'Buenos días, {name}. Hoy se ve buen día para minar.'],
    afternoon: ['¡Buenas tardes, {name}! ¿Una partida?', '¡Hola, {name}! Qué bueno verte por aquí.'],
    evening: ['¡Buenas noches, {name}! 🌙 Ideal para una partida.', '¡Hola, {name}! Ya cayó la noche, cuidado con los creepers.'],
    night: ['{name}… ¿no deberías estar durmiendo? 😴 Bueno, una partidita no hace daño.', 'Qué desvelo, {name}. Yo igual estoy despierto.']
  };
  const RETURN = {
    first: ['¡Hola! Soy PX 🐼, voy a acompañarte por aquí. Si me haces clic, te saludo.'],
    soonAgain: ['¡Otra vez por aquí, {name}! Me alegra.'],
    afterDays: ['¡{name}! Te extrañé, han pasado {days} días.'],
    afterWeek: ['¡Por fin apareces, {name}! Llevabas {days} días sin venir.']
  };
  const CLICK = [
    '¡Hola! 🐼', '¿Me llamabas?', '¡Boop!', 'Estoy aquí para lo que necesites.', '¿Jugamos?', 'Mi bambú favorito es el de Minecraft. 🎋',
    'Eso me hizo cosquillas.', '¡Ey! Eso es mío… ah no, es tuyo. Sigue.'
  ];
  const PET = ['Mmm, qué rico… 💚', '¡Me encanta! ✨', 'Ronroneo de panda: rrrr…', 'Sigue, sigue. 🥰', '¡Ahora sí te quiero más!'];
  const PET_MANY = ['Ya, ya, que me pongo rojo. 😳', 'Eres de los buenos, {name}.'];
  const TIPS = [
    'Sabías que puedes arrastrar un .mrpack a la ventana para instalar un modpack.',
    'En Modpacks puedes elegir el catálogo: Modrinth, CurseForge o FTB.',
    'Si Minecraft se cierra raro, la pestaña Consola tiene el registro completo.',
    'Puedes cambiar el tema y la temporada en Ajustes → Apariencia.',
    'Con menos RAM no siempre va peor: demasiada también ralentiza el juego.',
    'Hidrátate y estira las piernas de vez en cuando. 💧',
    'Los modpacks de Forge, NeoForge y Fabric funcionan desde aquí.',
    'Si no quieres que hable tanto, apágame en Ajustes → Apariencia.'
  ];
  const IDLE_WAKE = ['¡Ah! Me quedé dormido… ¿qué me perdí?', '*bostezo* Ya estoy despierto. 🐼', 'Zzz… ¿eh? ¿Volviste?'];
  const SLEEP = ['Zzz… 💤'];
  const EVENTS = {
    'game-start': ['¡A jugar! Suerte ahí dentro. 🎮', 'Que no te explote nada. 💥', 'Buen viaje, {name}.'],
    'game-end-ok': ['Qué buena partida, {name}.', '¡De vuelta! ¿Cómo te fue?', 'Descansa un poco, que lo mereces.'],
    'game-end-long': ['¡{minutes} minutos seguidos! Estira las piernas y toma agua. 💧', 'Jugaste {minutes} minutos. Eres una máquina.'],
    'game-end-crash': ['Uy, eso se cerró mal. 😟 Revisa la Consola, ahí suele estar la causa.', 'No te desanimes: casi siempre es un mod. Mira la Consola.'],
    'crash-repeat': ['Van varios cierres seguidos. Prueba con menos mods o con más RAM.', 'Tercera vez… ¿probamos sin los últimos mods que añadiste?'],
    'pack-done': ['¡Listo! Ya tienes tu modpack instalado. 📦', 'Modpack instalado. ¡Ahora a probarlo!'],
    'theme': ['¡Ese tema te queda bien! 🎨', 'Me gusta cómo se ve así.'],
    'login': ['¡Hola, {name}!'],
    'friend-online': ['Tu amigo {friend} está conectado. 👋']
  };

  function ctxFrom(mem, extra) {
    return Object.assign({ name: (extra && extra.name) || 'amigo' }, extra || {}, { visits: mem.visits || 0 });
  }

  function greeting(mem, now, extra, rng) {
    const ctx = ctxFrom(mem, extra);
    const d = new Date(now);
    let list;
    if (!mem.visits) list = RETURN.first;
    else {
      const days = mem.lastVisit ? Math.floor((now - mem.lastVisit) / 86400000) : 0;
      ctx.days = days;
      list = days >= 7 ? RETURN.afterWeek : days >= 2 ? RETURN.afterDays : null;
      if (!list) list = Math.random() < 0.5 ? GREET[dayPart(d.getHours())] : RETURN.soonAgain;
    }
    return fill(pick(list, rng), ctx);
  }

  function line(event, mem, extra, rng) {
    const ctx = ctxFrom(mem, extra);
    let key = event;
    if (event === 'game-end') {
      if (extra && extra.code && extra.code !== 0) key = (mem.crashStreak || 0) >= 3 ? 'crash-repeat' : 'game-end-crash';
      else if (extra && extra.minutes >= 90) key = 'game-end-long';
      else key = 'game-end-ok';
    }
    const list = EVENTS[key];
    return list ? fill(pick(list, rng), ctx) : null;
  }

  function click(mem, extra, rng) { return fill(pick(CLICK, rng), ctxFrom(mem, extra)); }
  function pet(count, mem, extra, rng) { return fill(pick(count >= 6 ? PET_MANY : PET, rng), ctxFrom(mem, extra)); }
  function tip(rng) { return pick(TIPS, rng); }
  function wake(rng) { return pick(IDLE_WAKE, rng); }
  function sleepLine(rng) { return pick(SLEEP, rng); }

  /* Memoria sencilla (solo en este equipo). Devuelve una copia nueva. */
  function remember(mem, event, extra, now) {
    const m = Object.assign({ visits: 0, lastVisit: 0, pets: 0, plays: 0, crashes: 0, crashStreak: 0, minutes: 0 }, mem || {});
    if (event === 'visit') { m.visits += 1; m.lastVisit = now; }
    else if (event === 'pet') m.pets += 1;
    else if (event === 'game-end') {
      m.plays += 1;
      m.minutes += Math.max(0, (extra && extra.minutes) || 0);
      if (extra && extra.code && extra.code !== 0) { m.crashes += 1; m.crashStreak += 1; } else m.crashStreak = 0;
    }
    return m;
  }

  /* ¿Toca dormir? Sin actividad durante `idleMs`. */
  function shouldSleep(idleMs, limitMs) { return idleMs >= (limitMs || 90000); }

  /* Los textos de usuario nunca se interpretan como HTML: se pintan con textContent. Esto recorta y limpia. */
  function clean(text, max) {
    return String(text == null ? '' : text).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 140);
  }

  /* ---------- Nivel 2 (IA): memoria, privacidad y registros ---------- */
  const SECRET = /(sk-ant-[\w-]{10,}|accessToken|access_token|Bearer\s+[\w.-]{12,}|[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{20,}|\b\d{13,19}\b|[\w.+-]+@[\w-]+\.[\w.]+)/i;
  const looksSecret = (t) => SECRET.test(String(t || ''));

  /* Un dato que PX puede recordar: corto, sin datos personales. Devuelve '' si no vale. */
  function cleanFact(t) {
    const f = clean(t, 80).replace(/^[-•#\s]+/, '');
    if (f.length < 4 || looksSecret(f) || /\b(\+?\d[\d\s-]{7,})\b/.test(f)) return '';
    return f;
  }
  function addFacts(facts, list, max) {
    const out = (facts || []).slice();
    for (const raw of list || []) {
      const f = cleanFact(raw);
      if (!f || out.some((x) => x.toLowerCase() === f.toLowerCase())) continue;
      out.push(f);
    }
    return out.slice(-(max || 30));
  }
  /* Lo que se le cuenta a la IA sobre el usuario (memoria local + datos del launcher). */
  function memoryString(mem, facts, name) {
    const m = mem || {};
    const bits = [];
    if (name) bits.push(`Se llama ${clean(name, 24)} en el juego.`);
    if (m.visits) bits.push(`Ha abierto el launcher ${m.visits} veces.`);
    if (m.plays) bits.push(`Ha jugado ${m.plays} partidas (${Math.round(m.minutes || 0)} min en total).`);
    if (m.crashes) bits.push(`Cierres con error: ${m.crashes}${m.crashStreak >= 2 ? ` (los últimos ${m.crashStreak} seguidos)` : ''}.`);
    if (m.pets) bits.push(`Te ha acariciado ${m.pets} veces.`);
    if ((facts || []).length) bits.push('Cosas que has aprendido de él: ' + facts.slice(-20).join('; ') + '.');
    return bits.join(' ').slice(0, 700);
  }
  /* Quita de un registro lo que no debe salir del PC: rutas con el usuario, claves, UUID, correos e IP. */
  function redactLog(lines, maxChars) {
    const KEY = /exception|error|fatal|caused by|crash|failed|mixin|outofmemory|could not|unable|incompatible|missing|requires|java\.lang/i;
    const all = (Array.isArray(lines) ? lines : String(lines || '').split('\n')).map((l) => String(l)).filter(Boolean);
    const important = all.filter((l) => KEY.test(l));
    const pickLines = (important.length >= 3 ? important : all).slice(-25);
    return pickLines.map((l) => l
      .replace(/([A-Za-z]:\\Users\\)[^\\\s"']+/gi, '$1<usuario>')
      .replace(/(\/(?:home|Users)\/)[^\/\s"']+/g, '$1<usuario>')
      .replace(/(--(?:accessToken|uuid|username|clientId|xuid|userProperties)\s+)\S+/gi, '$1<oculto>')
      .replace(/(access[_-]?token["'=:\s]+)[\w.-]+/gi, '$1<oculto>')
      .replace(/Bearer\s+[\w.-]+/gi, 'Bearer <oculto>')
      .replace(/[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{20,}/g, '<oculto>')
      .replace(/[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/gi, '<uuid>')
      .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '<correo>')
      .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '<ip>')
      .slice(0, 300)).join('\n').slice(-(maxChars || 1700));
  }

  return { looksSecret, cleanFact, addFacts, memoryString, redactLog, dayPart, greeting, line, click, pet, tip, wake, sleepLine, remember, shouldSleep, clean, fill };
});
