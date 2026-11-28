/* Pexy en la web: el mismo modelo 3D (mob3d.js), las mismas reglas de cuidado (pet-life.js) y los mismos minijuegos
   (pet-games.js) que el launcher. El progreso se guarda en este navegador; todavía no se sincroniza con el launcher. */
(function () {
  'use strict';
  var root = document.getElementById('pexy-play');
  var L = window.NovaPetLife, M3 = window.NovaMob3D, G = window.NovaPetGames;
  if (!root || !L || !M3) return;
  root.hidden = false;

  var KEY = 'novapx.pexy.web.v2';
  var reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  function load() {
    var raw = null;
    try { raw = JSON.parse(window.localStorage.getItem(KEY) || 'null'); } catch (e) { raw = null; }
    return L.sanitize(raw, Date.now());
  }
  function save() { try { window.localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* sin almacenamiento: sigue en memoria */ } }
  var st = L.tick(load(), Date.now());
  st = L.withPersonality(L.visit(st, Date.now()).state, Math.random());
  if (st.acc && !L.canWear(st, st.acc)) st = Object.assign({}, st, { acc: '' });
  save();

  var $ = function (sel) { return root.querySelector(sel); };
  var cv = $('[data-pexy-canvas]'), ctx = cv.getContext('2d');
  var speech = $('[data-pexy-say]'), note = $('[data-pexy-note]');
  var LINES = {
    feed: ['¡Ñam! Qué rico 😋', '¡Gracias, tenía hambre!', 'Mmm, mi comida favorita 🎋'],
    play: ['¡Otra vez, otra vez! 🎉', '¡Qué divertido!', '¡Me encanta jugar contigo!'],
    pet: ['Ronroneo de panda… 💗', 'Qué rico mimo 🥰', 'Quédate así un ratito…'],
    sleep: ['Zzz… cinco minutitos 😴', 'Me recargo y vuelvo…'],
    level: ['¡Subí de nivel! 🎉'],
    capped: ['¡Gracias! Hoy ya gané toda la XP de cuidados, pero me encanta igual 💜']
  };
  var FAV = { jugueton: '¡Jugar es lo mejor del mundo! 🎾', gloton: '¡Comida! ¡Mi cosa favorita! 😋', dormilon: 'Una siesta… mi plan favorito 😴', carinoso: '¡Me encantan los mimos! 💗' };
  var FULL = { feed: 'No tengo hambre, ¡estoy lleno! 😅', sleep: 'No tengo sueño, ¡tengo mucha energía! ⚡' };
  var ANIM = { feed: ['eat', 2.6], play: ['dance', 2.6], pet: ['pet', 2.2], sleep: ['sleep', 4], level: ['celebrate', 3.2], game: ['happy', 2.4] };
  var pick = function (k) { var a = LINES[k]; return a[Math.floor(Math.random() * a.length)]; };
  function say(t) { if (t) speech.textContent = t; }

  // ---------- escena ----------
  var pet = { name: 'px', x: 0, dir: 1, ph: 0, secs: 0, moving: false, run: false, state: 'idle', t: 2, act: '', actName: '', actT: 0, vy: 0, y: 0 };
  var W = 0, H = 0, DPR = 1, last = 0, raf = 0;
  function size() {
    var r = cv.getBoundingClientRect(); DPR = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(240, Math.round(r.width)); H = Math.max(220, Math.round(r.height));
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    if (!pet.x) pet.x = W / 2;
    pet.x = Math.min(W - 50, Math.max(50, pet.x));
  }
  var scale = function () { return Math.max(0.7, Math.min(1.25, H / 330)); };
  function moodAct() { return { hambre: 'hungry', 'sueño': 'tired', triste: 'sad', feliz: pet.dance ? 'dance' : 'happy' }[L.mood(st)] || 'idle'; }
  function currentAct() {
    if (pet.y < -1) return 'jump';
    if (pet.actT > 0 && pet.actName) return pet.actName;
    if (pet.moving) return pet.run ? 'run' : 'walk';
    return moodAct();
  }
  function update(dt) {
    pet.ph += dt * 9; pet.secs += dt; pet.t -= dt;
    if (pet.actT > 0) pet.actT -= dt;
    if (pet.vy || pet.y < 0) { pet.vy += 900 * dt; pet.y += pet.vy * dt; if (pet.y >= 0) { pet.y = 0; pet.vy = 0; } }
    var mood = L.mood(st), lazy = mood === 'hambre' || mood === 'sueño' || mood === 'triste';
    if (pet.actT > 0) { pet.moving = false; return; }
    if (pet.t <= 0) {
      pet.state = Math.random() < (lazy ? 0.7 : 0.35) ? 'idle' : 'walk';
      pet.dir = Math.random() < 0.5 ? -1 : 1; pet.t = 1.5 + Math.random() * 3;
      pet.run = pet.state === 'walk' && !lazy && Math.random() < 0.25;
      pet.dance = pet.state === 'idle' && mood === 'feliz' && Math.random() < 0.35;
    }
    var speed = pet.state === 'walk' ? (pet.run ? 90 : 38) * scale() : 0;
    pet.x += pet.dir * speed * dt;
    var m = 46 * scale();
    if (pet.x < m) { pet.x = m; pet.dir = 1; } else if (pet.x > W - m) { pet.x = W - m; pet.dir = -1; }
    pet.moving = speed > 0;
  }
  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    pet.design = st.design; pet.acc = st.acc; pet.act = currentAct(); pet.scale = scale(); pet.still = reduce.matches;
    M3.draw(ctx, pet, Math.round(pet.x), Math.round(H - 18 + pet.y));
  }
  function frame(now) {
    raf = 0;
    var dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016; last = now;
    if (!reduce.matches) update(dt); else { pet.moving = false; if (pet.actT > 0) pet.actT -= dt; }
    draw();
    if (!reduce.matches || pet.actT > 0) loop();
  }
  function loop() { if (!raf && !document.hidden && visible) raf = window.requestAnimationFrame(frame); }
  var visible = true;
  if (window.IntersectionObserver) {
    new window.IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) { last = 0; loop(); } }).observe(cv);
  }
  document.addEventListener('visibilitychange', function () { last = 0; loop(); });
  if (reduce.addEventListener) reduce.addEventListener('change', function () { last = 0; loop(); draw(); });
  function animate(k) {
    var a = ANIM[k]; if (!a) return;
    pet.actName = a[0]; pet.actT = reduce.matches ? 0.01 : a[1];
    if (!reduce.matches && (k === 'level' || k === 'game')) pet.vy = -260;
    last = 0; loop(); if (reduce.matches) draw();
  }

  // ---------- panel ----------
  var bars = {};
  ['hunger', 'energy', 'love', 'happy'].forEach(function (k) { bars[k] = { fill: $('[data-bar="' + k + '"] i'), val: $('[data-val="' + k + '"]') }; });
  function render() {
    st = L.tick(st, Date.now());
    var p = L.progress(st.xp), per = null;
    L.PERSONALITIES.forEach(function (x) { if (x.id === st.pers) per = x; });
    $('[data-pexy-level]').textContent = 'Nivel ' + p.level + (per ? ' · ' + per.name : '') + (st.streak > 1 ? ' · racha de ' + st.streak + ' días 🔥' : '');
    $('[data-pexy-xp] i').style.width = p.pct + '%';
    $('[data-pexy-xptext]').textContent = p.next == null ? '· nivel máximo' : '· ' + p.pct + '% hacia el siguiente';
    var vals = { hunger: st.hunger, energy: st.energy, love: st.love, happy: L.happiness(st) };
    Object.keys(bars).forEach(function (k) {
      var v = Math.round(vals[k]); bars[k].fill.style.width = v + '%'; bars[k].val.textContent = v + '%';
      bars[k].fill.parentNode.classList.toggle('low', v < 25);
    });
    var left = L.xpLeft(st, Date.now());
    $('[data-pexy-xpday]').textContent = 'XP de hoy: cuidados ' + (L.XP_CAP.care - left.care) + '/' + L.XP_CAP.care + ' · minijuegos ' + (L.XP_CAP.game - left.game) + '/' + L.XP_CAP.game;
    root.querySelectorAll('[data-acc]').forEach(function (b) {
      var id = b.getAttribute('data-acc'), a = null;
      L.ACCESSORIES.forEach(function (x) { if (x.id === id) a = x; });
      var ok = !id || (a && a.ok(st));
      b.disabled = !ok; b.setAttribute('aria-pressed', String(st.acc === id));
      b.title = ok ? (a ? a.name : 'Sin accesorio') : (a.name + ': se desbloquea con ' + a.need);
    });
    root.querySelectorAll('[data-design]').forEach(function (b) { b.setAttribute('aria-pressed', String(st.design === b.getAttribute('data-design'))); });
    if (reduce.matches) draw();
  }
  root.querySelectorAll('[data-act]').forEach(function (b) {
    b.addEventListener('click', function () {
      var a = b.getAttribute('data-act');
      var r = L.act(st, a, Date.now()); st = r.state;
      if (!r.ok) { say(r.tired ? 'Estoy muy cansado para jugar… ¿una siesta primero?' : r.full ? FULL[a] : ''); render(); return; }
      save(); render();
      say(r.levelUp ? pick('level') : r.fav ? FAV[st.pers] : r.capped ? pick('capped') : pick(a));
      animate(r.levelUp ? 'level' : a);
    });
  });
  cv.addEventListener('click', function () {
    var r = L.act(st, 'pet', Date.now()); st = r.state;
    if (!r.ok) return;
    save(); render(); say(r.levelUp ? pick('level') : pick('pet')); animate(r.levelUp ? 'level' : 'pet');
  });
  cv.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cv.click(); } });
  root.querySelectorAll('[data-acc]').forEach(function (b) {
    b.addEventListener('click', function () { st = L.equip(st, b.getAttribute('data-acc')); save(); render(); });
  });
  root.querySelectorAll('[data-design]').forEach(function (b) {
    b.addEventListener('click', function () { st = L.setDesign(st, b.getAttribute('data-design')); save(); render(); });
  });
  var gamesBox = $('[data-pexy-games]');
  ((G && G.list) || []).forEach(function (g) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'pexy-btn'; b.textContent = g.label;
    b.addEventListener('click', function () {
      if (L.tick(st, Date.now()).energy < 10) { say('Estoy muy cansado para jugar. ¿Me dejas dormir un rato? 😴'); return; }
      g.run(function (score) {
        var r = L.minigame(st, score, Date.now()); st = r.state; save(); render();
        if (r.tired) { note.textContent = 'Está muy cansado: esta partida no cuenta.'; return; }
        note.textContent = score + ' ' + g.unit + '. Tu récord: ' + st.best + '.' + (r.capped ? ' Hoy ya ganaste toda la XP de minijuegos.' : '');
        say(r.levelUp ? pick('level') : r.record ? '¡Récord nuevo! 🏆' : '¡Qué divertido! 🎉');
        animate(r.levelUp ? 'level' : 'game');
      }, { design: st.design, acc: st.acc });
    });
    gamesBox.appendChild(b);
  });

  var mood0 = L.mood(st);
  say({ hambre: '¡Tengo hambre! ¿Me das algo? 🎋', 'sueño': 'Tengo mucho sueño… 😪', triste: 'Me siento solito… ¿jugamos?', feliz: '¡Hola! Qué bueno verte 😄' }[mood0] || '¡Hola! Soy Pexy. Tócame para acariciarme 💜');
  window.addEventListener('resize', function () { size(); draw(); });
  size(); render(); draw(); loop();
  setInterval(render, 30000);
}());
