/* La vida de PX: hambre, energía, cariño, nivel y racha de días. Todo se guarda en este PC.
 * Núcleo puro (probado en test/pet-life.test.js) + un panel «Cuidar a PX». */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NovaPetLife = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const HOUR = 3600000;
  const ACC_IDS = ['bow', 'hat', 'scarf', 'glasses', 'crown'];
  const clamp = (v, a = 0, b = 100) => Math.min(b, Math.max(a, Number.isFinite(+v) ? +v : a));
  // Puntos por hora que se pierden. Con el launcher cerrado se pierde menos (tope de 12 h) para que nadie vuelva a una mascota "perdida".
  const DECAY = { hunger: 5, energy: 3, love: 2.5 };
  // Sin esperas largas, como Talking Tom: lo que limita es la barra (lleno = no quiere más). Solo una pausa corta para que
  // un autoclic no cuente cien veces, y un tope diario de XP por cuidados y por minijuegos.
  const CD = { feed: 800, play: 800, pet: 600, sleep: 800, game: 0 };
  const XP_CAP = { care: 60, game: 72 };
  const DESIGNS = ['rosa', 'sudadera'];
  // Personalidad: se elige una vez al nacer y cambia sus frases y un poco cómo le sientan los cuidados.
  const PERSONALITIES = [
    { id: 'jugueton', name: 'Juguetón', likes: 'play' },
    { id: 'gloton', name: 'Glotón', likes: 'feed' },
    { id: 'dormilon', name: 'Dormilón', likes: 'sleep' },
    { id: 'carinoso', name: 'Cariñoso', likes: 'pet' }
  ];
  const PERS_IDS = PERSONALITIES.map((p) => p.id);
  const LEVELS = [0, 30, 80, 160, 280, 450, 700, 1000, 1400, 1900];

  const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  function fresh(now) { return { name: 'Pexy', hunger: 80, energy: 90, love: 70, xp: 0, streak: 0, day: '', last: now, cd: {}, played: 0, best: 0, acc: '', skin: '', design: 'rosa', pers: '', xpd: { day: '', care: 0, game: 0 } }; }

  function sanitize(raw, now) {
    const s = fresh(now);
    if (!raw || typeof raw !== 'object') return s;
    s.name = String(raw.name && raw.name !== 'PX' ? raw.name : 'Pexy').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16) || 'Pexy';
    ['hunger', 'energy', 'love'].forEach((k) => { s[k] = clamp(raw[k] == null ? s[k] : raw[k]); });
    s.xp = Math.max(0, Math.min(1e6, Math.floor(+raw.xp || 0)));
    s.streak = Math.max(0, Math.min(9999, Math.floor(+raw.streak || 0)));
    s.day = /^\d{4}-\d{2}-\d{2}$/.test(raw.day) ? raw.day : '';
    s.last = Number.isFinite(+raw.last) && +raw.last > 0 ? Math.min(+raw.last, now) : now;
    s.played = Math.max(0, Math.floor(+raw.played || 0));
    s.skin = raw.skin === 'shadow' ? 'shadow' : '';
    s.acc = ACC_IDS.includes(raw.acc) ? raw.acc : '';
    s.design = DESIGNS.includes(raw.design) ? raw.design : 'rosa';
    s.pers = PERS_IDS.includes(raw.pers) ? raw.pers : '';
    if (raw.xpd && typeof raw.xpd === 'object' && /^\d{4}-\d{2}-\d{2}$/.test(raw.xpd.day)) {
      s.xpd = { day: raw.xpd.day, care: Math.max(0, Math.min(XP_CAP.care, Math.floor(+raw.xpd.care || 0))), game: Math.max(0, Math.min(XP_CAP.game, Math.floor(+raw.xpd.game || 0))) };
    }
    s.best = Math.max(0, Math.min(40, Math.floor(+raw.best || 0)));
    if (raw.cd && typeof raw.cd === 'object') for (const k of Object.keys(CD)) s.cd[k] = Math.min(+raw.cd[k] || 0, now + CD[k]);
    return s;
  }

  function tick(s, now) {
    const hours = Math.min(12, Math.max(0, (now - s.last) / HOUR));
    const out = { ...s, cd: { ...s.cd }, xpd: { ...(s.xpd || { day: '', care: 0, game: 0 }) }, last: now };
    out.hunger = clamp(s.hunger - DECAY.hunger * hours);
    out.energy = clamp(s.energy - DECAY.energy * hours);
    out.love = clamp(s.love - DECAY.love * hours * (s.hunger < 20 ? 1.6 : 1));
    return out;
  }

  const level = (xp) => { let l = 1; for (let i = 1; i < LEVELS.length; i++) if (xp >= LEVELS[i]) l = i + 1; return l; };
  function progress(xp) {
    const l = level(xp); const a = LEVELS[l - 1]; const b = LEVELS[l];
    return b == null ? { level: l, pct: 100, next: null } : { level: l, pct: Math.round(((xp - a) / (b - a)) * 100), next: b - xp };
  }

  // Felicidad: resume cómo está (comida, energía y sobre todo cariño). De 0 a 100.
  const happiness = (s) => Math.round(clamp(0.45 * clamp(s.love) + 0.3 * clamp(s.hunger) + 0.25 * clamp(s.energy)));
  // Suma XP respetando el tope diario de cada tipo (care = cuidados, game = minijuegos).
  function addXp(s, kind, amount, now) {
    const today = dayKey(now);
    const d = s.xpd && s.xpd.day === today ? { ...s.xpd } : { day: today, care: 0, game: 0 };
    const room = Math.max(0, XP_CAP[kind] - (d[kind] || 0));
    const got = Math.max(0, Math.min(room, Math.floor(amount)));
    d[kind] = (d[kind] || 0) + got;
    return { ...s, xp: s.xp + got, xpd: d };
  }
  function mood(s) {
    const worst = Math.min(s.hunger, s.energy, s.love);
    if (s.hunger < 20) return 'hambre';
    if (s.energy < 20) return 'sueño';
    if (s.love < 20) return 'triste';
    return worst > 65 && s.love > 70 ? 'feliz' : 'normal';
  }

  // Acciones. Devuelven { state, ok, wait } (wait en ms si aún no se puede repetir).
  // Cada acción: efecto en las barras y XP base. Si es lo que más le gusta según su personalidad, le sienta un poco mejor.
  const EFFECT = {
    feed: (s, fav) => ({ s: { ...s, hunger: clamp(s.hunger + 35), love: clamp(s.love + 3 + (fav ? 2 : 0)) }, xp: 4 }),
    play: (s, fav) => ({ s: { ...s, love: clamp(s.love + 12 + (fav ? 3 : 0)), energy: clamp(s.energy - 12), hunger: clamp(s.hunger - 6), played: s.played + 1 }, xp: 8 }),
    pet: (s, fav) => ({ s: { ...s, love: clamp(s.love + 6 + (fav ? 2 : 0)) }, xp: s.love >= 95 ? 0 : 2 }),
    sleep: (s, fav) => ({ s: { ...s, energy: clamp(s.energy + 40 + (fav ? 10 : 0)) }, xp: 3 })
  };
  function act(s0, action, now) {
    const s = tick(s0, now);
    if (!EFFECT[action]) return { state: s, ok: false, wait: 0 };
    // Si la barra ya está llena, Pexy no quiere más: no suma nada (así no se puede abusar sin esperas).
    if ((action === 'feed' && s.hunger >= 95) || (action === 'sleep' && s.energy >= 90)) return { state: s, ok: false, wait: 0, full: true };
    const until = s.cd[action] || 0;
    if (now < until) return { state: s, ok: false, wait: until - now };
    if (action === 'play' && s.energy < 10) return { state: s, ok: false, wait: 0, tired: true };
    const fav = (PERSONALITIES.find((p) => p.id === s.pers) || {}).likes === action;
    const e = EFFECT[action](s, fav);
    const n = addXp(e.s, 'care', e.xp, now);
    n.cd = { ...s.cd, [action]: now + CD[action] };
    return { state: n, ok: true, wait: 0, levelUp: level(n.xp) > level(s.xp), capped: e.xp > 0 && n.xp - s.xp < e.xp, fav };
  }

  // Visita diaria: suma racha si vienes en días seguidos y da puntos extra.
  function visit(s0, now) {
    const s = tick(s0, now);
    const today = dayKey(now);
    if (s.day === today) return { state: s, fresh: false };
    const yesterday = dayKey(now - 24 * HOUR);
    const streak = s.day === yesterday ? s.streak + 1 : 1;
    return { state: { ...s, day: today, streak, xp: s.xp + 5 + Math.min(10, streak), love: clamp(s.love + 5) }, fresh: true };
  }

  // Resultado de un minijuego: puntos de 0 a 40. Da cariño y xp con tope, y cansa un poco. Guarda el récord.
  function minigame(s0, score, now) {
    const s = tick(s0, now);
    const pts = Math.max(0, Math.min(40, Math.floor(+score || 0)));
    // Sin energía no se puede jugar: el resultado no cuenta.
    if (s.energy < 10) return { state: s, record: false, levelUp: false, tired: true };
    const base = { ...s, love: clamp(s.love + Math.min(15, pts / 2)), energy: clamp(s.energy - 8), hunger: clamp(s.hunger - 4), played: s.played + 1, best: Math.max(s.best || 0, pts) };
    const want = Math.min(12, Math.ceil(pts / 3));
    const n = addXp(base, 'game', want, now);
    return { state: n, record: pts > (s.best || 0), levelUp: level(n.xp) > level(s.xp), capped: n.xp - s.xp < want };
  }

  // Tiempo jugando a Minecraft: la mascota "acompaña" y gana puntos (tope por sesión).
  function gameTime(s, minutes) {
    const m = Math.max(0, Math.min(180, Math.floor(+minutes || 0)));
    return { ...s, xp: s.xp + Math.floor(m / 10) * 3, energy: clamp(s.energy - m / 20), hunger: clamp(s.hunger - m / 15) };
  }

  // Accesorios: se desbloquean por nivel o por racha de días.
  const ACCESSORIES = [
    { id: 'bow', name: 'Moño', emoji: '🎀', need: 'nivel 2', ok: (s) => level(s.xp) >= 2 },
    { id: 'hat', name: 'Sombrero', emoji: '🎩', need: 'nivel 3', ok: (s) => level(s.xp) >= 3 },
    { id: 'scarf', name: 'Bufanda', emoji: '🧣', need: 'racha de 3 días', ok: (s) => s.streak >= 3 },
    { id: 'glasses', name: 'Gafas', emoji: '🕶️', need: 'nivel 5', ok: (s) => level(s.xp) >= 5 },
    { id: 'crown', name: 'Corona', emoji: '👑', need: 'nivel 8', ok: (s) => level(s.xp) >= 8 }
  ];
  const canWear = (s, id) => { const a = ACCESSORIES.find((x) => x.id === id); return !!a && a.ok(s); };
  function equip(s, id) { return id === '' || canWear(s, id) ? { ...s, acc: id } : s; }
  const setDesign = (s, id) => (DESIGNS.includes(id) ? { ...s, design: id } : s);
  // Personalidad al nacer (rnd: número entre 0 y 1). Si ya tiene, se queda con la suya.
  const withPersonality = (s, rnd) => (s.pers ? s : { ...s, pers: PERS_IDS[Math.min(PERS_IDS.length - 1, Math.floor((+rnd || 0) * PERS_IDS.length))] });
  const xpLeft = (s, now) => { const today = dayKey(now); const d = s.xpd && s.xpd.day === today ? s.xpd : { care: 0, game: 0 }; return { care: XP_CAP.care - d.care, game: XP_CAP.game - d.game }; };

  return { ACCESSORIES, DESIGNS, PERSONALITIES, XP_CAP, canWear, equip, setDesign, withPersonality, xpLeft, happiness, sanitize, fresh, tick, act, visit, minigame, gameTime, level, progress, mood, dayKey, CD, LEVELS };
}));

(function () {
  if (typeof document === 'undefined') return;
  const L = window.NovaPetLife; const M = window.NovaMascot;
  if (!L || !M) return;
  const KEY = 'px.pet.life';
  const load = () => { try { return L.sanitize(JSON.parse(localStorage.getItem(KEY) || 'null'), Date.now()); } catch { return L.fresh(Date.now()); } };
  const store = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} };
  let st = L.tick(load(), Date.now());
  const v0 = L.visit(st, Date.now()); st = L.withPersonality(v0.state, Math.random()); if (st.acc && !L.canWear(st, st.acc)) st = { ...st, acc: '' }; store(st);
  let adminOn = false;
  const ctlNow = () => window.NovaFun && window.NovaFun.petCtl;
  const applyAcc = () => { const c = ctlNow(); if (c) { c.acc = st.acc || ''; c.skin = adminOn ? st.skin || '' : ''; c.design = st.design || 'rosa'; c.mood = L.mood(L.tick(st, Date.now())); } };
  applyAcc(); setTimeout(applyAcc, 1500); setInterval(applyAcc, 60000);
  // Animación de Pexy para cada cuidado (comer, caricia, baile, siesta) y fiesta al subir de nivel.
  const ANIM = { feed: ['eat', 2.6], play: ['dance', 2.6], pet: ['pet', 2.2], sleep: ['sleep', 4], level: ['celebrate', 3.2], game: ['happy', 2.4] };
  const animate = (k) => { const c = ctlNow(); const a = ANIM[k]; if (c && c.play && a) c.play(a[0], a[1]); applyAcc(); };

  const LINES = {
    feed: ['¡Ñam! Qué rico 😋', '¡Gracias, tenía hambre!', 'Mmm, mi comida favorita 🎋'],
    play: ['¡Otra vez, otra vez! 🎉', '¡Qué divertido!', 'Jajaja, ¡me encanta jugar contigo!'],
    pet: ['Ronroneo de panda… 💗', 'Qué rico mimo 🥰', 'Quédate así un ratito…'],
    sleep: ['Zzz… cinco minutitos 😴', 'Me recargo y vuelvo…', 'Buenas noches (aunque sea de día) 🌙'],
    tired: ['Estoy muy cansado para jugar… ¿una siesta primero?'],
    hambre: ['¡Tengo hambre! Ábreme el panel y dame de comer 🎋', 'Mi pancita hace ruidos…'],
    sueño: ['Tengo mucho sueño… 😪'],
    triste: ['Me siento solito… ¿jugamos?'],
    level: ['¡Subí de nivel! 🎉'],
    capped: ['¡Gracias! Hoy ya gané toda la XP de cuidados, pero me encanta igual 💜']
  };
  // Frases según su personalidad cuando le das lo que más le gusta.
  const FAV_LINES = { jugueton: '¡Jugar es lo mejor del mundo! 🎾', gloton: '¡Comida! ¡Mi cosa favorita! 😋', dormilon: 'Una siesta… mi plan favorito 😴', carinoso: '¡Me encantan los mimos! 💗' };
  const FULL = { feed: 'No tengo hambre, ¡estoy lleno! 😅', sleep: 'No tengo sueño, ¡estoy lleno de energía! ⚡' };
  const pick = (k) => { const a = LINES[k]; return a[Math.floor(Math.random() * a.length)]; };
  const fmtWait = (ms) => { if (ms < 60000) return 'un momento'; const m = Math.ceil(ms / 60000); return m <= 1 ? 'un minuto' : `${m} minutos`; };

  /* ---------- panel «Cuidar a PX» ---------- */
  let dlg = null; let timer = 0;
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  function bar(label) {
    const row = el('div', 'pl-row'); const fill = el('i'); const track = el('div', 'pl-bar'); track.append(fill);
    row.append(el('span', 'pl-lbl', label), track); return { row, fill };
  }
  function open() {
    if (dlg) return;
    dlg = document.createElement('dialog'); dlg.className = 'event-modal pl-modal pl-care';
    const body = el('div', 'event-modal-body');
    const title = el('h3'); title.textContent = '🐼 Cuidar a tu mascota';
    const nameRow = el('div', 'pl-name'); const nameIn = el('input'); nameIn.maxLength = 16; nameIn.value = st.name; nameIn.setAttribute('aria-label', 'Nombre de tu mascota');
    const lvl = el('small', 'pl-lvl'); nameRow.append(nameIn, lvl);
    const portrait = el('div', 'pl-portrait'); const pEmo = el('span', 'pl-panda', '🐼'); const pAcc = el('span', 'pl-pacc'); const pMood = el('span', 'pl-pmood'); portrait.append(pAcc, pEmo, pMood);
    // Retrato con el modelo 3D de Pexy (mismo motor que en la pantalla y en la web). Sin motor, queda el emoji.
    let pCv = null, pRaf = 0;
    if (window.NovaMob3D && window.NovaMob3D.names.includes('px')) {
      pCv = el('canvas', 'pl-3d'); pCv.width = 168; pCv.height = 176; pCv.setAttribute('aria-hidden', 'true');
      pEmo.hidden = true; pAcc.hidden = true; portrait.prepend(pCv);
      const still = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      const pc = pCv.getContext('2d'); let ph = 0, lastT = 0;
      const MOOD_ACT = { hambre: 'hungry', 'sueño': 'tired', triste: 'sad', feliz: 'happy' };
      const drawP = (now) => {
        if (!pCv.isConnected) { pRaf = 0; return; }
        const dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0; lastT = now; ph += dt * 6;
        const c = ctlNow(); const act = c && c.actT > 0 && c.act ? c.act : MOOD_ACT[L.mood(st)] || 'idle';
        pc.clearRect(0, 0, pCv.width, pCv.height);
        window.NovaMob3D.draw(pc, { name: 'px', design: st.design, acc: st.acc, act, dir: 1, ph: still ? 0 : ph, secs: now / 1000, scale: 0.9, still }, 84, 168);
        pRaf = still ? 0 : requestAnimationFrame(drawP);
      };
      pRaf = requestAnimationFrame(drawP);
      pCv.addEventListener('redraw', () => { if (!pRaf) pRaf = requestAnimationFrame(drawP); });
    }
    const hero = el('div', 'pl-hero'); const heroInfo = el('div', 'pl-hero-info');
    const xpBar = el('div', 'pl-bar pl-xp'); const xpFill = el('i'); xpBar.append(xpFill);
    const moodEl = el('p', 'pl-mood');
    const coach = el('p', 'pl-coach'); coach.setAttribute('role', 'status');
    const b1 = bar('🍖 Hambre'); const b2 = bar('⚡ Energía'); const b3 = bar('💗 Cariño'); const b4 = bar('😊 Felicidad');
    const care = el('div', 'pl-tiles'); const games = el('div', 'pl-tiles pl-games'); const foot = el('div', 'pl-foot');
    const tile = (b, text, sub) => { const i = text.indexOf(' '); b.textContent = ''; const t = el('span', 'pl-txt'); t.append(el('span', 'pl-lbl', text.slice(i + 1))); if (sub) { const s = el('span', 'pl-sub', sub); t.append(s); b._sub = s; b._subText = sub; } b.append(el('span', 'pl-ico', text.slice(0, i)), t); return b; };
    const defs = [['feed', '🍖 Dar de comer', 'Sube el hambre'], ['play', '🎾 Jugar', 'Sube cariño, gasta energía'], ['pet', '🤗 Acariciar', 'Sube el cariño'], ['sleep', '😴 Dormir', 'Recarga la energía']];
    const tiles = {};
    // Lo que Pexy necesita ahora y qué botón tocar (para que se entienda sin leer nada más).
    const need = () => {
      const n = st.name;
      if (st.hunger < 35) return { hint: 'feed', text: `${n} tiene hambre 🍖. Arrastra una fruta de la mesa hasta él, o toca «Dar de comer».` };
      if (st.energy < 30) return { hint: 'sleep', text: `${n} tiene sueño 😪. Toca «Dormir» para que recargue la energía.` };
      if (st.love < 35) return { hint: 'pet', text: `${n} se siente solito 🥺. Tócalo a él o pulsa «Acariciar»; también puedes jugar.` };
      const lock = L.ACCESSORIES.find((a) => !a.ok(st));
      return { hint: '', text: `${n} está bien 😊. Juega un minijuego para ganar XP${lock ? ` y desbloquear ${lock.emoji} ${lock.name} (${lock.need})` : ''}.` };
    };
    const note = el('small', 'muted pl-note');
    const xpNote = el('small', 'muted pl-xpnote');
    const refresh = () => {
      st = L.tick(st, Date.now());
      const p = L.progress(st.xp);
      paintWard();
      const per = L.PERSONALITIES.find((x) => x.id === st.pers);
      lvl.textContent = `Nivel ${p.level}${per ? ` · ${per.name}` : ''}${st.streak > 1 ? ` · racha de ${st.streak} días 🔥` : ''}`;
      const hp = L.happiness(st); b4.fill.style.width = hp + '%'; b4.row.dataset.v = hp + '%'; b4.row.classList.toggle('low', hp < 25);
      b4.row.title = 'Felicidad: resume cómo está. Sube con cariño, comida y descanso.';
      const left = L.xpLeft(st, Date.now()); xpNote.textContent = `XP de hoy: cuidados ${L.XP_CAP.care - left.care}/${L.XP_CAP.care} · minijuegos ${L.XP_CAP.game - left.game}/${L.XP_CAP.game}`;
      if (pCv && !pRaf) pCv.dispatchEvent(new Event('redraw'));
      xpFill.style.width = p.pct + '%';
      b1.fill.style.width = st.hunger + '%'; b2.fill.style.width = st.energy + '%'; b3.fill.style.width = st.love + '%';
      [[b1, st.hunger], [b2, st.energy], [b3, st.love]].forEach(([b, v]) => { b.row.dataset.v = Math.round(v) + '%'; b.row.classList.toggle('low', v < 25); });
      const nd = need(); coach.textContent = nd.text;
      Object.keys(tiles).forEach((a) => { const b = tiles[a]; const wait0 = Math.max(0, ((st.cd || {})[a] || 0) - Date.now()); const wait = wait0 > 5000 ? wait0 : 0; b.classList.toggle('pl-hint', nd.hint === a && !wait); b.classList.toggle('pl-wait', wait > 0); if (b._sub) b._sub.textContent = wait > 0 ? `Listo en ${fmtWait(wait)}` : b._subText; });
      [[b1, 'Hambre: baja con el tiempo. Dale de comer para subirla.'], [b2, 'Energía: se gasta al jugar. Déjalo dormir para recargarla.'], [b3, 'Cariño: sube al acariciarlo y jugar.']].forEach(([b, t]) => { b.row.title = t; });
      const mo = L.mood(st); portrait.dataset.mood = mo; pMood.textContent = { feliz: '😄', normal: '🙂', hambre: '😢', sueño: '😪', triste: '🥺' }[mo] || '';
      const ac = L.ACCESSORIES.find((a) => a.id === st.acc); pAcc.textContent = ac ? ac.emoji : '';
      moodEl.textContent = { feliz: `${st.name} está feliz 😄`, normal: `${st.name} está tranquilo 🙂`, hambre: `${st.name} tiene hambre 😢`, sueño: `${st.name} tiene sueño 😪`, triste: `${st.name} se siente solito 🥺` }[L.mood(st)];
    };
    const SUBS = Object.fromEntries(defs.map(([a, , s]) => [a, s]));
    defs.forEach(([a, t]) => {
      const b = tile(el('button', 'pl-tile'), t, SUBS[a]); b.type = 'button'; tiles[a] = b;
      b.addEventListener('click', () => {
        const r = L.act(st, a, Date.now()); st = r.state;
        if (!r.ok) { note.textContent = r.tired ? 'Está muy cansado para jugar.' : r.full ? FULL[a] : r.wait ? `Espera ${fmtWait(r.wait)} para repetirlo.` : ''; M.say(r.tired ? pick('tired') : r.full ? FULL[a] : '', 3500); refresh(); return; }
        note.textContent = '';
        store(st); M.say(r.levelUp ? pick('level') : r.fav ? FAV_LINES[st.pers] : r.capped ? pick('capped') : pick(a), 4500); refresh();
        animate(r.levelUp ? 'level' : a);
      });
      care.append(b);
    });
    const trayBtn = tile(el('button', 'pl-tile'), '🧺 Bandeja', 'Sácala para usarla fuera de aquí'); trayBtn.type = 'button'; trayBtn.title = 'Arrastra la comida o el jabón hasta Pexy';
    trayBtn.addEventListener('click', () => { done(); showTray(); });
    care.append(trayBtn);
    ((window.NovaPetGames && window.NovaPetGames.list) || []).forEach((g) => {
      const gx = tile(el('button', 'pl-tile'), g.label); gx.type = 'button';
      gx.addEventListener('click', () => {
        if (L.tick(st, Date.now()).energy < 10) { note.textContent = 'Está muy cansado para jugar. Déjalo dormir un rato.'; M.say(pick('tired'), 3500); return; }
        g.run((score) => {
          const r = L.minigame(st, score, Date.now()); st = r.state; store(st);
          if (r.tired) { note.textContent = 'Está muy cansado: esta partida no cuenta.'; refresh(); return; }
          M.say(r.levelUp ? pick('level') : r.record ? `¡Récord nuevo: ${score} ${g.unit}! 🏆` : `${g.label.replace(/^\S+\s/, '')}: ${score} ${g.unit}, ¡qué divertido! 🎉`, 5000);
          note.textContent = `${score} ${g.unit}. Tu récord: ${st.best}.${r.capped ? ' Hoy ya ganaste toda la XP de minijuegos.' : ''}`; refresh();
          animate(r.levelUp ? 'level' : 'game');
        }, { design: st.design, acc: st.acc });
      });
      games.append(gx);
    });
    let extra = null;
    const wardrobe = el('div', 'pl-ward');
    const paintWard = () => {
      wardrobe.replaceChildren();
      const mk = (id, emoji, label, locked, need) => {
        const b = el('button', 'pl-acc' + (st.acc === id ? ' on' : ''), emoji); b.type = 'button'; b.title = locked ? `${label}: se desbloquea con ${need}` : label; b.disabled = locked;
        if (locked) b.classList.add('locked');
        b.addEventListener('click', () => { st = L.equip(st, id); store(st); applyAcc(); paintWard(); });
        wardrobe.append(b);
      };
      mk('', '🚫', 'Sin accesorio', false);
      L.ACCESSORIES.forEach((a) => mk(a.id, a.emoji, a.name, !a.ok(st), a.need));
      // Diseño de Pexy: el rosa original o el de sudadera. Lo elige cada jugador.
      const look = el('div', 'pl-look'); look.setAttribute('role', 'group'); look.setAttribute('aria-label', 'Diseño de Pexy');
      [['rosa', 'Rosa (original)'], ['sudadera', 'Sudadera']].forEach(([id, label]) => {
        const b = el('button', 'pl-look-btn' + (st.design === id ? ' on' : ''), label); b.type = 'button'; b.setAttribute('aria-pressed', String(st.design === id));
        b.addEventListener('click', () => { st = L.setDesign(st, id); store(st); applyAcc(); paintWard(); });
        look.append(b);
      });
      wardrobe.append(look);
    };
    paintWard();
    if (adminOn) {
      const sk = el('label', 'check'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = st.skin === 'shadow';
      cb.addEventListener('change', () => { st = { ...st, skin: cb.checked ? 'shadow' : '' }; store(st); applyAcc(); });
      sk.append(cb, document.createTextNode(' Skin secreta «Sombra» (solo administradores)')); extra = sk;
    }
    const close = el('button', 'ghost', 'Cerrar'); close.type = 'button'; foot.append(close);
    nameIn.addEventListener('change', () => { st = { ...st, name: L.sanitize({ name: nameIn.value }, Date.now()).name }; nameIn.value = st.name; store(st); refresh(); });
    const done = () => { clearInterval(timer); try { dlg.close(); } catch {} dlg.remove(); dlg = null; };
    close.addEventListener('click', done); dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(); });
    heroInfo.append(nameRow, xpBar, moodEl); hero.append(portrait, heroInfo);
    // Mesa: arrastra la comida o el jabón hasta Pexy, igual que en Talking Tom.
    const table = el('div', 'pl-table'); table.append(el('span', 'pl-table-lbl', 'Arrastra hasta Pexy:'));
    [['🍎', 'food'], ['🍌', 'food'], ['🍇', 'food'], ['🍓', 'food'], ['🧼', 'bath']].forEach(([emoji, kind]) => {
      const it = el('button', 'pl-item', emoji); it.type = 'button'; it.title = kind === 'bath' ? 'Bañar a Pexy' : 'Dar de comer'; it.setAttribute('aria-label', it.title);
      it.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const ghost = el('span', 'pet-tray-ghost', emoji); dlg.append(ghost);
        const mv = (ev) => { ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px'; portrait.classList.toggle('pl-over', over(ev)); };
        const over = (ev) => { const r = portrait.getBoundingClientRect(); return ev.clientX > r.left - 20 && ev.clientX < r.right + 20 && ev.clientY > r.top - 20 && ev.clientY < r.bottom + 20; };
        const up = (ev) => {
          window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); ghost.remove(); portrait.classList.remove('pl-over');
          if (over(ev) && careDrop(kind)) { burst(ev.clientX, ev.clientY, kind === 'bath' ? '🫧' : emoji, dlg); portrait.classList.add('pl-bounce'); setTimeout(() => portrait.classList.remove('pl-bounce'), 600); refresh(); }
          else if (over(ev)) refresh();
        };
        mv(e); window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
      });
      table.append(it);
    });
    // Tocar a Pexy también lo acaricia.
    portrait.title = 'Tócalo para acariciarlo'; portrait.addEventListener('click', () => { if (careDrop('pet-touch')) { portrait.classList.add('pl-bounce'); setTimeout(() => portrait.classList.remove('pl-bounce'), 600); } refresh(); });
    // Mini guía (la primera vez, y con el botón ?)
    const tour = el('div', 'pl-tour');
    const tourOl = el('ol'); ['Mira sus barras: si una está baja, Pexy te lo dice abajo y el botón que toca se ilumina.', 'Arrastra una fruta de la mesa hasta Pexy para darle de comer. El jabón lo baña.', 'Tócalo para acariciarlo y juega minijuegos para ganar XP y desbloquear accesorios.'].forEach((t) => tourOl.append(el('li', '', t)));
    const tourOk = el('button', '', 'Entendido'); tourOk.type = 'button';
    tour.append(el('strong', '', '¿Cómo se cuida a Pexy?'), tourOl, tourOk);
    const seen = () => { try { return localStorage.getItem('px.pet.tour') === '1'; } catch { return true; } };
    tour.hidden = seen();
    tourOk.addEventListener('click', () => { tour.hidden = true; try { localStorage.setItem('px.pet.tour', '1'); } catch {} });
    const help = el('button', 'pl-help', '?'); help.type = 'button'; help.title = '¿Cómo se juega?'; help.setAttribute('aria-label', '¿Cómo se juega?');
    help.addEventListener('click', () => { tour.hidden = !tour.hidden; });
    title.append(help);
    const stats = el('div', 'pl-stats'); stats.append(b1.row, b2.row, b3.row, b4.row, xpNote);
    const sec = (t) => el('h4', 'pl-sec', t);
    const left = el('div', 'pl-col'); left.append(hero, coach, table, stats, sec('Armario'), wardrobe, ...(extra ? [extra] : []));
    const right = el('div', 'pl-col'); right.append(sec('Cuidados'), care, sec('Minijuegos'), games, note);
    const cols = el('div', 'pl-cols'); cols.append(left, right);
    body.append(title, tour, cols, foot); dlg.append(body); document.body.append(dlg);
    refresh(); timer = setInterval(refresh, 15000); dlg.showModal();
  }
  /* Bandeja: arrastra la comida o el jabón hasta Pexy (como en Talking Tom). Sale flotando sobre la pantalla. */
  let tray = null;
  const T_EAT = ['¡Ñam ñam! 😋', '¡Qué rico!', 'Mmm… ¡justo lo que quería!', '¡Gracias! ¡Estaba buenísimo!'];
  const T_BATH = ['¡Burbujitas! 🫧', '¡Qué limpio quedé!', 'Jiji, ¡me hace cosquillas el jabón!', '¡Splash! Ahora huelo a fresa.'];
  const rnd = (a) => a[Math.floor(Math.random() * a.length)];
  function careDrop(kind) {
    const r = L.act(st, kind === 'bath' || kind === 'pet-touch' ? 'pet' : 'feed', Date.now());
    if (!r.ok) { M.say(r.tired ? pick('tired') : r.full ? FULL.feed : r.wait ? `Todavía no… espera ${fmtWait(r.wait)} 😅` : 'Ahora no, gracias.', 3500); return false; }
    st = r.state; store(st);
    M.say(r.levelUp ? pick('level') : kind === 'pet-touch' ? pick('pet') : rnd(kind === 'bath' ? T_BATH : T_EAT), 4500);
    animate(r.levelUp ? 'level' : kind === 'food' ? 'feed' : 'pet');
    return true;
  }
  function burst(x, y, emoji, host) {
    for (let i = 0; i < 7; i++) {
      const s = document.createElement('span'); s.textContent = emoji; s.style.cssText = `position:fixed;left:${x}px;top:${y}px;font-size:${16 + Math.random() * 10}px;z-index:100001;pointer-events:none;transition:transform .9s ease-out,opacity .9s ease-out;opacity:1`;
      (host || document.body).append(s);
      requestAnimationFrame(() => { s.style.transform = `translate(${(Math.random() - 0.5) * 90}px,${-30 - Math.random() * 70}px) scale(1.2)`; s.style.opacity = '0'; });
      setTimeout(() => s.remove(), 1000);
    }
  }
  function showTray() {
    if (tray) return;
    tray = document.createElement('div'); tray.id = 'pet-tray';
    const label = el('span', 'pet-tray-label', 'Arrastra hasta Pexy'); tray.append(label);
    const items = [['🍎', 'food'], ['🍌', 'food'], ['🍇', 'food'], ['🍓', 'food'], ['🧼', 'bath']];
    const close = () => { if (tray) { tray.remove(); tray = null; } };
    items.forEach(([emoji, kind]) => {
      const b = el('button', 'pet-tray-item', emoji); b.type = 'button'; b.title = kind === 'bath' ? 'Bañar a Pexy' : 'Dar de comer'; b.setAttribute('aria-label', b.title);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const ghost = el('span', 'pet-tray-ghost', emoji); document.body.append(ghost);
        const mv = (ev) => { ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px'; };
        mv(e);
        const up = (ev) => {
          window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); ghost.remove();
          const hit = document.getElementById('pet-hit'); const r = hit && hit.getBoundingClientRect();
          if (r && ev.clientX > r.left - 24 && ev.clientX < r.right + 24 && ev.clientY > r.top - 24 && ev.clientY < r.bottom + 24) {
            if (careDrop(kind)) burst(ev.clientX, ev.clientY, kind === 'bath' ? '🫧' : emoji);
          }
        };
        window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
      });
      tray.append(b);
    });
    const x = el('button', 'pet-tray-x', '✕'); x.type = 'button'; x.title = 'Guardar la bandeja'; x.addEventListener('click', close); tray.append(x);
    document.body.append(tray);
  }
  // La skin «Sombra» es secreta: solo aparece con el modo administrador activo.
  const prevAllowed = M.setAiAllowed;
  M.setAiAllowed = (v) => { adminOn = !!v; applyAcc(); if (prevAllowed) prevAllowed(v); };
  window.NovaPetLife.open = open;

  /* ---------- se integra con la mascota ---------- */
  let gameStart = 0;
  const origNotify = M.notify;
  M.notify = (type, data) => {
    if (type === 'game-start') gameStart = Date.now();
    if (type === 'game-end' && gameStart) { st = L.gameTime(L.tick(st, Date.now()), Math.round((Date.now() - gameStart) / 60000)); store(st); gameStart = 0; }
    return origNotify(type, data);
  };
  // Si pasa mucho tiempo con una necesidad baja, se queja (poco y sin molestar mientras juegas).
  let lastWhine = Date.now();
  setInterval(() => {
    if (document.hidden || Date.now() - lastWhine < 15 * 60000) return;
    st = L.tick(st, Date.now()); store(st);
    const m = L.mood(st);
    if (m === 'hambre' || m === 'sueño' || m === 'triste') { lastWhine = Date.now(); M.say(pick(m), 6000); }
  }, 60000);
  /* ---------- el nacimiento de PX: una sola vez, al abrir el launcher por primera vez ---------- */
  const BORN = 'px.pet.born';
  const isBorn = () => { try { return localStorage.getItem(BORN) === '1'; } catch { return true; } };
  function birth() {
    if (document.querySelector('.pl-birth')) return;
    const d = document.createElement('dialog'); d.className = 'event-modal pl-modal pl-birth';
    const b = el('div', 'event-modal-body');
    const egg = el('button', 'pl-egg', '🥚'); egg.type = 'button'; egg.setAttribute('aria-label', 'Toca el huevo');
    const msg = el('p', 'pl-mood', 'Algo se mueve dentro del huevo… ¡tócalo!');
    const form = el('div', 'pl-name'); form.hidden = true;
    const inp = el('input'); inp.maxLength = 16; inp.placeholder = '¿Cómo lo llamas?'; inp.value = st.name === 'Pexy' ? '' : st.name; inp.setAttribute('aria-label', 'Nombre de tu mascota');
    const ok = el('button', 'primary', 'Listo'); ok.type = 'button'; form.append(inp, ok);
    b.append(el('h3', '', '✨ Nace tu mascota'), egg, msg, form); d.append(b); document.body.append(d);
    let taps = 0; 
    egg.addEventListener('click', () => {
      taps += 1; egg.classList.remove('pl-shake'); void egg.offsetWidth; egg.classList.add('pl-shake');
      if (taps === 1) msg.textContent = 'Se escucha un crujido… ¡otra vez!';
      if (taps === 2) { egg.textContent = '🐣'; msg.textContent = '¡Casi, casi…!'; }
      if (taps >= 3) { egg.textContent = '🐼'; egg.classList.add('pl-pop'); egg.disabled = true; msg.textContent = '¡Nació! Ponle un nombre.'; form.hidden = false; inp.focus(); }
    });
    const finish = () => {
      st = { ...st, name: L.sanitize({ name: inp.value }, Date.now()).name, love: 100, xp: st.xp + 5 }; store(st);
      try { localStorage.setItem(BORN, '1'); } catch {}
      try { d.close(); } catch {} d.remove();
      // Al nacer, la mascota aparece sola: sin tener que activarla en Ajustes.
      try { if (M.setEnabled) M.setEnabled(true); const pb = document.getElementById('fun-pet'); if (pb) pb.checked = true; } catch {}
      try { const cb = document.getElementById('fun-critters'); if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change')); } else if (!cb && window.NovaFun) { window.NovaFun.options.critters = true; try { localStorage.setItem('px.fun.critters', '1'); } catch {} window.NovaFun.refresh(); } } catch {}
      const c = window.NovaFun && window.NovaFun.petCtl; if (c) { if (c.happy) c.happy(3); if (c.hop) c.hop(); }
      setTimeout(() => M.say(`¡Hola${M.name() ? ' ' + M.name() : ''}! Soy ${st.name} y estoy muy feliz de conocerte 🐼`, 7000), 500);
    };
    ok.addEventListener('click', finish); inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(); });
    d.addEventListener('cancel', (e) => e.preventDefault());
    d.showModal();
  }
  window.NovaPetLife.birth = birth;
  // El huevo sale solo cuando el jugador ya terminó el asistente de bienvenida (inicio de sesión y recorrido) y no hay otro cuadro abierto.
  async function welcomed() { try { const s = await window.api.getSettings(); return !!(s && s.welcomed); } catch { return true; } }
  async function tryBirth() {
    if (isBorn() || document.querySelector('.pl-birth')) return;
    if (document.querySelector('dialog[open]') || !(await welcomed())) { setTimeout(tryBirth, 5000); return; }
    birth();
  }
  window.addEventListener('nova-welcome-done', () => setTimeout(tryBirth, 3000));
  if (!isBorn()) setTimeout(tryBirth, 6000);
  /* ---------- PX flotante sobre Minecraft (opcional) ---------- */
  const OV = 'px.pet.overlay';
  const ovOn = () => { try { return localStorage.getItem(OV) === '1'; } catch { return false; } };
  let inGame = false;
  const ovPayload = (text) => ({ text: text || '', acc: st.acc || '', name: st.name, skin: adminOn ? st.skin || '' : '' });
  const ovShow = (text) => { if (ovOn() && inGame && window.api && window.api.overlayShow) window.api.overlayShow(ovPayload(text)).catch(() => {}); };
  const ovHide = () => { if (window.api && window.api.overlayHide) window.api.overlayHide().catch(() => {}); };
  // Todo lo que PX dice en el launcher se copia a la ventana flotante mientras juegas.
  const bub = document.getElementById('pet-bubble');
  if (bub) new MutationObserver(() => { if (!bub.hidden && bub.textContent) ovShow(bub.textContent); }).observe(bub, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  const ovBox = document.getElementById('fun-pet-overlay');
  if (ovBox) { ovBox.checked = ovOn(); ovBox.addEventListener('change', () => { try { localStorage.setItem(OV, ovBox.checked ? '1' : '0'); } catch {} if (!ovBox.checked) ovHide(); else ovShow('¡Te acompaño mientras juegas! 🐼'); }); }
  const prevNotify = M.notify;
  M.notify = (type, data) => {
    if (type === 'game-start') { inGame = true; setTimeout(() => ovShow('¡Vamos a jugar! 🎮'), 4000); }
    if (type === 'game-end') { inGame = false; ovHide(); }
    return prevNotify(type, data);
  };
  document.addEventListener('dblclick', (e) => { if (e.target && e.target.id === 'pet-hit') open(); });
  const chip = document.getElementById('pet-chip');
  const paintChip = () => {
    const n = document.getElementById('pet-chip-name'), s = document.getElementById('pet-chip-sub');
    if (n) n.textContent = st.name || 'Pexy';
    if (s) { const mood = L.mood ? L.mood(st) : ''; s.textContent = `Nivel ${L.level(st.xp || 0)}${mood ? ' · ' + mood : ''}`; }
  };
  if (chip) { chip.addEventListener('click', open); paintChip(); setInterval(paintChip, 4000); }
  const openBtn = document.getElementById('pet-care-open');
  if (openBtn) openBtn.addEventListener('click', open);
  if (v0.fresh && st.streak > 1) setTimeout(() => M.say(`¡${st.streak} días seguidos juntos! 🔥`, 5500), 12000);
}());
