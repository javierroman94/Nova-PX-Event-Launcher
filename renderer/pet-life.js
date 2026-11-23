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
  const CD = { feed: 20 * 60000, play: 8 * 60000, pet: 60000, sleep: 30 * 60000, game: 0 };
  const LEVELS = [0, 30, 80, 160, 280, 450, 700, 1000, 1400, 1900];

  const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  function fresh(now) { return { name: 'Pexy', hunger: 80, energy: 90, love: 70, xp: 0, streak: 0, day: '', last: now, cd: {}, played: 0, best: 0, acc: '', skin: '' }; }

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
    s.best = Math.max(0, Math.min(40, Math.floor(+raw.best || 0)));
    if (raw.cd && typeof raw.cd === 'object') for (const k of Object.keys(CD)) s.cd[k] = Math.min(+raw.cd[k] || 0, now + CD[k]);
    return s;
  }

  function tick(s, now) {
    const hours = Math.min(12, Math.max(0, (now - s.last) / HOUR));
    const out = { ...s, cd: { ...s.cd }, last: now };
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

  function mood(s) {
    const worst = Math.min(s.hunger, s.energy, s.love);
    if (s.hunger < 20) return 'hambre';
    if (s.energy < 20) return 'sueño';
    if (s.love < 20) return 'triste';
    return worst > 65 && s.love > 70 ? 'feliz' : 'normal';
  }

  // Acciones. Devuelven { state, ok, wait } (wait en ms si aún no se puede repetir).
  const EFFECT = {
    feed: (s) => ({ ...s, hunger: clamp(s.hunger + 35), love: clamp(s.love + 3), xp: s.xp + 4 }),
    play: (s) => ({ ...s, love: clamp(s.love + 12), energy: clamp(s.energy - 12), hunger: clamp(s.hunger - 6), xp: s.xp + 8, played: s.played + 1 }),
    pet: (s) => ({ ...s, love: clamp(s.love + 6), xp: s.xp + 2 }),
    sleep: (s) => ({ ...s, energy: clamp(s.energy + 40), xp: s.xp + 3 })
  };
  function act(s0, action, now) {
    const s = tick(s0, now);
    if (!EFFECT[action]) return { state: s, ok: false, wait: 0 };
    const until = s.cd[action] || 0;
    if (now < until) return { state: s, ok: false, wait: until - now };
    if (action === 'play' && s.energy < 10) return { state: s, ok: false, wait: 0, tired: true };
    const n = EFFECT[action](s);
    n.cd = { ...s.cd, [action]: now + CD[action] };
    return { state: n, ok: true, wait: 0, levelUp: level(n.xp) > level(s.xp) };
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
    const n = { ...s, love: clamp(s.love + Math.min(15, pts / 2)), energy: clamp(s.energy - 8), hunger: clamp(s.hunger - 4), xp: s.xp + Math.min(12, Math.ceil(pts / 3)), played: s.played + 1, best: Math.max(s.best || 0, pts) };
    return { state: n, record: pts > (s.best || 0), levelUp: level(n.xp) > level(s.xp) };
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

  return { ACCESSORIES, canWear, equip, sanitize, fresh, tick, act, visit, minigame, gameTime, level, progress, mood, dayKey, CD, LEVELS };
}));

(function () {
  if (typeof document === 'undefined') return;
  const L = window.NovaPetLife; const M = window.NovaMascot;
  if (!L || !M) return;
  const KEY = 'px.pet.life';
  const load = () => { try { return L.sanitize(JSON.parse(localStorage.getItem(KEY) || 'null'), Date.now()); } catch { return L.fresh(Date.now()); } };
  const store = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} };
  let st = L.tick(load(), Date.now());
  const v0 = L.visit(st, Date.now()); st = v0.state; if (st.acc && !L.canWear(st, st.acc)) st = { ...st, acc: '' }; store(st);
  let adminOn = false;
  const applyAcc = () => { const c = window.NovaFun && window.NovaFun.petCtl; if (c) { c.acc = st.acc || ''; c.skin = adminOn ? st.skin || '' : ''; } };
  applyAcc(); setTimeout(applyAcc, 1500);

  const LINES = {
    feed: ['¡Ñam! Qué rico 😋', '¡Gracias, tenía hambre!', 'Mmm, mi comida favorita 🎋'],
    play: ['¡Otra vez, otra vez! 🎉', '¡Qué divertido!', 'Jajaja, ¡me encanta jugar contigo!'],
    pet: ['Ronroneo de panda… 💗', 'Qué rico mimo 🥰', 'Quédate así un ratito…'],
    sleep: ['Zzz… cinco minutitos 😴', 'Me recargo y vuelvo…', 'Buenas noches (aunque sea de día) 🌙'],
    tired: ['Estoy muy cansado para jugar… ¿una siesta primero?'],
    hambre: ['¡Tengo hambre! Ábreme el panel y dame de comer 🎋', 'Mi pancita hace ruidos…'],
    sueño: ['Tengo mucho sueño… 😪'],
    triste: ['Me siento solito… ¿jugamos?'],
    level: ['¡Subí de nivel! 🎉']
  };
  const pick = (k) => { const a = LINES[k]; return a[Math.floor(Math.random() * a.length)]; };
  const fmtWait = (ms) => { const m = Math.ceil(ms / 60000); return m <= 1 ? 'un minuto' : `${m} minutos`; };

  /* ---------- panel «Cuidar a PX» ---------- */
  let dlg = null; let timer = 0;
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  function bar(label) {
    const row = el('div', 'pl-row'); const fill = el('i'); const track = el('div', 'pl-bar'); track.append(fill);
    row.append(el('span', 'pl-lbl', label), track); return { row, fill };
  }
  function open() {
    if (dlg) return;
    dlg = document.createElement('dialog'); dlg.className = 'event-modal pl-modal';
    const body = el('div', 'event-modal-body');
    const title = el('h3'); title.textContent = '🐼 Cuidar a tu mascota';
    const nameRow = el('div', 'pl-name'); const nameIn = el('input'); nameIn.maxLength = 16; nameIn.value = st.name; nameIn.setAttribute('aria-label', 'Nombre de tu mascota');
    const lvl = el('small', 'muted'); nameRow.append(nameIn, lvl);
    const xpBar = el('div', 'pl-bar pl-xp'); const xpFill = el('i'); xpBar.append(xpFill);
    const moodEl = el('p', 'pl-mood');
    const b1 = bar('🍖 Hambre'); const b2 = bar('⚡ Energía'); const b3 = bar('💗 Cariño');
    const btns = el('div', 'mp-actions');
    const defs = [['feed', '🍖 Dar de comer'], ['play', '🎾 Jugar'], ['pet', '🤗 Acariciar'], ['sleep', '😴 Dormir']];
    const note = el('small', 'muted pl-note');
    const refresh = () => {
      st = L.tick(st, Date.now());
      const p = L.progress(st.xp);
      paintWard();
      lvl.textContent = `Nivel ${p.level}${st.streak > 1 ? ` · racha de ${st.streak} días 🔥` : ''}`;
      xpFill.style.width = p.pct + '%';
      b1.fill.style.width = st.hunger + '%'; b2.fill.style.width = st.energy + '%'; b3.fill.style.width = st.love + '%';
      moodEl.textContent = { feliz: `${st.name} está feliz 😄`, normal: `${st.name} está tranquilo 🙂`, hambre: `${st.name} tiene hambre 😢`, sueño: `${st.name} tiene sueño 😪`, triste: `${st.name} se siente solito 🥺` }[L.mood(st)];
    };
    defs.forEach(([a, t]) => {
      const b = el('button', '', t); b.type = 'button';
      b.addEventListener('click', () => {
        const r = L.act(st, a, Date.now()); st = r.state;
        if (!r.ok) { note.textContent = r.tired ? 'Está muy cansado para jugar.' : r.wait ? `Espera ${fmtWait(r.wait)} para repetirlo.` : ''; M.say(r.tired ? pick('tired') : '', 3500); refresh(); return; }
        note.textContent = '';
        store(st); M.say(r.levelUp ? pick('level') : pick(a), 4500); refresh();
        const c = window.NovaFun && window.NovaFun.petCtl; if (c) { if (c.happy) c.happy(2); if (c.hop) c.hop(); }
      });
      btns.append(b);
    });
    const gb = el('button', '', '⭐ Atrapar estrellas'); gb.type = 'button';
    gb.addEventListener('click', () => {
      if (st.energy < 10) { note.textContent = 'Está muy cansado para jugar.'; return; }
      playStars((score) => {
        const r = L.minigame(st, score, Date.now()); st = r.state; store(st);
        M.say(r.levelUp ? pick('level') : r.record ? `¡Récord nuevo: ${score} estrellas! 🏆` : `${score} estrellas, ¡qué divertido! ⭐`, 5000);
        note.textContent = `Atrapaste ${score}. Tu récord: ${st.best}.`; refresh();
      });
    });
    btns.append(gb);
    ((window.NovaPetGames && window.NovaPetGames.list) || []).forEach((g) => {
      const gx = el('button', '', g.label); gx.type = 'button';
      gx.addEventListener('click', () => {
        if (st.energy < 10) { note.textContent = 'Está muy cansado para jugar.'; return; }
        g.run((score) => {
          const r = L.minigame(st, score, Date.now()); st = r.state; store(st);
          M.say(r.levelUp ? pick('level') : `${g.label}: ${score} ${g.unit}, ¡qué divertido! 🎉`, 5000);
          note.textContent = `${g.label}: ${score} ${g.unit}. Tu récord general: ${st.best}.`; refresh();
        });
      });
      btns.append(gx);
    });
    let extra = null;
    const wardrobe = el('div', 'pl-ward');
    const paintWard = () => {
      wardrobe.replaceChildren(el('small', 'muted', 'Accesorios'));
      const mk = (id, emoji, label, locked, need) => {
        const b = el('button', 'pl-acc' + (st.acc === id ? ' on' : ''), emoji); b.type = 'button'; b.title = locked ? `${label}: se desbloquea con ${need}` : label; b.disabled = locked;
        if (locked) b.classList.add('locked');
        b.addEventListener('click', () => { st = L.equip(st, id); store(st); applyAcc(); paintWard(); });
        wardrobe.append(b);
      };
      mk('', '🚫', 'Sin accesorio', false);
      L.ACCESSORIES.forEach((a) => mk(a.id, a.emoji, a.name, !a.ok(st), a.need));
    };
    paintWard();
    if (adminOn) {
      const sk = el('label', 'check'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = st.skin === 'shadow';
      cb.addEventListener('change', () => { st = { ...st, skin: cb.checked ? 'shadow' : '' }; store(st); applyAcc(); });
      sk.append(cb, document.createTextNode(' Skin secreta «Sombra» (solo administradores)')); extra = sk;
    }
    const close = el('button', 'ghost', 'Cerrar'); close.type = 'button'; btns.append(close);
    nameIn.addEventListener('change', () => { st = { ...st, name: L.sanitize({ name: nameIn.value }, Date.now()).name }; nameIn.value = st.name; store(st); refresh(); });
    const done = () => { clearInterval(timer); try { dlg.close(); } catch {} dlg.remove(); dlg = null; };
    close.addEventListener('click', done); dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(); });
    body.append(title, nameRow, xpBar, moodEl, b1.row, b2.row, b3.row, btns, wardrobe, ...(extra ? [extra] : []), note); dlg.append(body); document.body.append(dlg);
    refresh(); timer = setInterval(refresh, 15000); dlg.showModal();
  }
  /* Minijuego: mueve el ratón (o el dedo) para llevar a PX bajo las estrellas. 20 segundos. */
  function playStars(onDone) {
    const W = 360, H = 260, DUR = 20000;
    const GOOD = ['⭐', '⭐', '🍎', '🍌', '🍇', '🍓', '🍉', '🍒']; // estrellas y frutas (sugerencia de la comunidad)
    const d = document.createElement('dialog'); d.className = 'event-modal pl-modal';
    const b = el('div', 'event-modal-body'); const hud = el('p', 'pl-mood', '⭐ 0 · 20 s');
    const cv = el('canvas', 'crop-canvas'); cv.width = W; cv.height = H; cv.style.width = W + 'px'; cv.style.height = H + 'px'; cv.style.cursor = 'none';
    const x0 = el('button', 'ghost', 'Salir'); x0.type = 'button';
    b.append(el('h3', '', '⭐ Atrapar estrellas'), el('small', 'muted', 'Mueve el cursor para mover a Pexy y atrapa las estrellas y las frutas. Esquiva las rocas 🪨.'), hud, cv, x0); d.append(b); document.body.append(d);
    const x = cv.getContext('2d'); let px = W / 2, score = 0, over = false, last = 0; const t0 = performance.now(); const things = []; let spawn = 0;
    const move = (e) => { const r = cv.getBoundingClientRect(); px = Math.min(W - 22, Math.max(22, (e.clientX - r.left) * (W / r.width))); };
    cv.addEventListener('pointermove', move); cv.addEventListener('pointerdown', move);
    const end = (report) => { if (over) return; over = true; try { d.close(); } catch {} d.remove(); if (report) onDone(Math.min(40, score)); };
    x0.addEventListener('click', () => end(false)); d.addEventListener('cancel', (e) => { e.preventDefault(); end(false); });
    function frame(now) {
      if (over) return;
      const dt = Math.min(50, now - (last || now)); last = now; const left = DUR - (now - t0);
      if (left <= 0) { end(true); return; }
      spawn -= dt; if (spawn <= 0) { spawn = 380 + Math.random() * 300; things.push({ x: 16 + Math.random() * (W - 32), y: -12, bad: Math.random() < 0.22, icon: GOOD[Math.floor(Math.random() * GOOD.length)], v: 0.09 + Math.random() * 0.07 + (1 - left / DUR) * 0.06 }); }
      x.fillStyle = '#0c1226'; x.fillRect(0, 0, W, H);
      x.font = '22px serif'; x.textAlign = 'center';
      for (let i = things.length - 1; i >= 0; i--) {
        const t = things[i]; t.y += t.v * dt;
        x.fillText(t.bad ? '🪨' : t.icon, t.x, t.y);
        if (t.y > H - 34 && t.y < H - 6 && Math.abs(t.x - px) < 26) { score = Math.max(0, score + (t.bad ? -2 : 1)); things.splice(i, 1); }
        else if (t.y > H + 14) things.splice(i, 1);
      }
      x.font = '34px serif'; x.fillText('🐼', px, H - 8);
      hud.textContent = `⭐ ${score} · ${Math.ceil(left / 1000)} s`;
      requestAnimationFrame(frame);
    }
    d.showModal(); requestAnimationFrame(frame);
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
