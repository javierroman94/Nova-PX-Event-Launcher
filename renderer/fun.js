/* Alegría en pantalla: estela del cursor distinta para cada tema y temporada + criaturas pixeladas que pasean por abajo.
 * Las criaturas son diseños propios de Nova PX (no son mobs de Minecraft). Se apaga con «Efectos animados» o desde Ajustes → Apariencia. */
(function () {
  'use strict';
  const root = document.documentElement;
  const TAU = Math.PI * 2;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (l) => l[Math.floor(Math.random() * l.length)];
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v === '1'; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, v ? '1' : '0'); } catch {} }
  };
  const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const opt = { trail: store.get('px.fun.trail', !calm), critters: store.get('px.fun.critters', false) };

  const canvas = document.createElement('canvas');
  canvas.id = 'fx-fun';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:60;pointer-events:none';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0;
  function resize() {
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = w; canvas.height = h;
    ctx.imageSmoothingEnabled = false;
  }
  resize();
  window.addEventListener('resize', resize);

  /* ---------- estela del cursor: qué efecto lleva cada temporada y cada tema ---------- */
  const SEASON_TRAIL = {
    navidad: { shape: 'snow', colors: ['#ffffff', '#cfe8ff', '#e8f4ff'] },
    halloween: { shape: 'ember', colors: ['#ff8a1f', '#ff5a1f', '#ffb347'] },
    anio: { shape: 'spark', colors: ['#ffd23f', '#fff4c2', '#e8c15a'] },
    sanvalentin: { shape: 'heart', colors: ['#ff4d79', '#ff7aa2', '#ffb3c8'] },
    madres: { shape: 'petal', colors: ['#ffb3d1', '#ffc9de', '#fff0f6'] },
    carnaval: { shape: 'confetti', colors: ['#ff3b4e', '#ffd23f', '#34e08a', '#4cc9f0', '#b46bff'] },
    ecuador: { shape: 'confetti', colors: ['#ffd100', '#ffd100', '#0033a0', '#ef3340'] }
  };
  const THEME_TRAIL = {
    nova: { shape: 'glow', colors: null },
    catppuccin: { shape: 'pixel', colors: ['#cba6f7', '#f5c2e7', '#89b4fa'] },
    tokyonight: { shape: 'pixel', colors: ['#7aa2f7', '#bb9af7', '#7dcfff'] },
    dracula: { shape: 'pixel', colors: ['#bd93f9', '#ff79c6', '#8be9fd'] },
    rosepine: { shape: 'petal', colors: ['#ebbcba', '#c4a7e7', '#f6c177'] },
    synthwave: { shape: 'spark', colors: ['#ff2fb9', '#2de2e6', '#ffd1f4'] },
    cyberpunk: { shape: 'pixel', colors: ['#fcee0a', '#00f0ff', '#ff003c'] },
    sakura: { shape: 'petal', colors: ['#ffb3d1', '#e0679a', '#fff0f6'] },
    deepdark: { shape: 'ring', colors: ['#2ee6d6', '#1a9e94'] },
    nether: { shape: 'ember', colors: ['#ff6a2b', '#ffb347', '#ff3b1f'] },
    end: { shape: 'spark', colors: ['#b86bff', '#e0c3ff', '#7a3cd0'] },
    eclipse: { shape: 'spark', colors: ['#e8334a', '#6f93ff', '#ffffff'] },
    oled: { shape: 'dot', colors: null },
    light: { shape: 'dot', colors: null },
    dark: { shape: 'dot', colors: null }
  };
  const accent = () => (getComputedStyle(root).getPropertyValue('--accent') || '#35d6ff').trim() || '#35d6ff';
  function trailConfig() {
    const s = SEASON_TRAIL[root.dataset.season];
    const t = s || THEME_TRAIL[root.dataset.theme] || THEME_TRAIL.dark;
    return { shape: t.shape, colors: t.colors || [accent()] };
  }

  let parts = [];
  function spawnParticle(x, y, cfg, burst) {
    const shape = cfg.shape;
    const color = pick(cfg.colors);
    const p = { x, y, shape, color, life: 1, decay: rnd(1.1, 1.9), size: rnd(3, 6), rot: rnd(0, TAU), vr: rnd(-3, 3), vx: rnd(-14, 14), vy: rnd(-14, 14), g: 0 };
    if (shape === 'snow') { p.size = rnd(2, 4.5); p.vy = rnd(14, 40); p.g = 20; p.decay = rnd(0.7, 1.1); }
    else if (shape === 'ember') { p.size = rnd(1.6, 3.4); p.vy = -rnd(20, 60); p.vx = rnd(-18, 18); p.decay = rnd(0.9, 1.5); }
    else if (shape === 'heart') { p.size = rnd(5, 9); p.vy = -rnd(18, 42); p.decay = rnd(0.7, 1.1); }
    else if (shape === 'petal') { p.size = rnd(4, 7); p.vy = rnd(10, 36); p.vx = rnd(-26, 26); p.g = 24; p.decay = rnd(0.6, 1); }
    else if (shape === 'confetti') { p.size = rnd(4, 7); p.vy = rnd(-30, 30); p.g = 140; p.decay = rnd(0.8, 1.3); }
    else if (shape === 'pixel') { p.size = pick([3, 4, 5]); p.vx = rnd(-30, 30); p.vy = rnd(-30, 30); p.decay = rnd(1.2, 2); p.rot = 0; p.vr = 0; }
    else if (shape === 'ring') { p.size = 3; p.vx = p.vy = 0; p.decay = 1.4; }
    else if (shape === 'glow') { p.size = rnd(7, 12); p.vx *= 0.3; p.vy *= 0.3; p.decay = 2.2; }
    else if (shape === 'spark') { p.size = rnd(4, 8); p.decay = rnd(1.1, 1.8); }
    else { p.size = rnd(2.4, 4.6); p.decay = 2; }
    if (burst) {
      const a = rnd(0, TAU), sp = rnd(50, 150);
      p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; p.decay *= 0.8; p.size *= 1.2;
    }
    parts.push(p);
    if (parts.length > 160) parts.splice(0, parts.length - 160);
  }

  function drawParticle(p) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
    ctx.fillStyle = p.color; ctx.strokeStyle = p.color;
    const s = p.size;
    switch (p.shape) {
      case 'pixel': ctx.fillRect(Math.round(p.x / 3) * 3, Math.round(p.y / 3) * 3, s, s); break;
      case 'glow':
        ctx.globalAlpha *= 0.55; ctx.beginPath(); ctx.arc(p.x, p.y, s * p.life + 1, 0, TAU); ctx.fill(); break;
      case 'ring': ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(p.x, p.y, s + (1 - p.life) * 22, 0, TAU); ctx.stroke(); break;
      case 'spark':
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.beginPath();
        for (let i = 0; i < 4; i++) { const a = (i * TAU) / 4; ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s); ctx.lineTo(Math.cos(a + TAU / 8) * s * 0.28, Math.sin(a + TAU / 8) * s * 0.28); }
        ctx.closePath(); ctx.fill(); ctx.restore(); break;
      case 'heart':
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.sin(p.rot) * 0.4); ctx.beginPath();
        ctx.moveTo(0, s * 0.35); ctx.bezierCurveTo(-s, -s * 0.3, -s * 0.5, -s, 0, -s * 0.45); ctx.bezierCurveTo(s * 0.5, -s, s, -s * 0.3, 0, s * 0.35);
        ctx.fill(); ctx.restore(); break;
      case 'snow':
        ctx.beginPath(); ctx.arc(p.x, p.y, s * 0.7, 0, TAU); ctx.fill(); break;
      case 'petal':
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.5, 0, 0, TAU); ctx.fill(); ctx.restore(); break;
      case 'confetti':
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-s / 2, -s / 4, s, s / 2); ctx.restore(); break;
      case 'ember':
        ctx.beginPath(); ctx.arc(p.x, p.y, s * p.life + 0.4, 0, TAU); ctx.fill(); break;
      default:
        ctx.beginPath(); ctx.arc(p.x, p.y, s * (0.5 + p.life * 0.5), 0, TAU); ctx.fill();
    }
  }

  let mx = -999, my = -999, lastX = null, lastY = null, acc = 0;
  document.addEventListener('mousemove', (e) => {
    mx = e.clientX; my = e.clientY;
    if (!opt.trail || root.classList.contains('no-fx')) { lastX = null; return; }
    if (lastX !== null) {
      acc += Math.hypot(mx - lastX, my - lastY);
      if (acc > 9) { const cfg = trailConfig(); const n = Math.min(3, Math.floor(acc / 9)); for (let i = 0; i < n; i++) spawnParticle(mx, my, cfg, false); acc = 0; }
    }
    lastX = mx; lastY = my;
    wake();
  });
  document.addEventListener('mouseleave', () => { lastX = null; });
  document.addEventListener('mousedown', (e) => {
    if (!opt.trail || root.classList.contains('no-fx')) return;
    const cfg = trailConfig();
    for (let i = 0; i < 12; i++) spawnParticle(e.clientX, e.clientY, cfg, true);
    wake();
  });

  /* ---------- criaturas pixeladas (diseños propios) ---------- */
  const PAL = { W: '#f6f1ea', P: '#ffb6c9', K: '#1b1b24', Y: '#ffd84a', O: '#ff9a2e', R: '#e8742a', D: '#6b3a1e', G: '#3f8f3a', L: '#dff1ff', B: '#8fb8ff', M: '#d95bcf', Q: '#a232a0', H: '#ec82e0' };
  const SPRITES = {
    // Mascota de NovaPX (panda rosa de bloques, diseño de @DekerModMaker). Va siempre en el elenco.
    px: { scale: 4, rows: ['MM.......MM', 'MQM.....MQM', '.MMMMMMMMM.', '.MWWWWWWWM.', '.MQQWWWQQM.', '.MWKWWWKWM.', '.MWWWMWWWM.', '.MWWWWWWWM.', '..MQQQQQM..', 'HM.MWWWWM.MH', 'MM.MWWWWM.MM', 'MQ.MWWWWM.QM', '...MWWWWM...'], legs: ['..MWMQMWM..', '..MWM.MWM..'] },
    bunny: { rows: ['..WW...WW..', '..WP...PW..', '..WP...PW..', '..WWWWWWW..', '.WWWWWWWWW.', '.WWKWWWKWW.', '.WWWWPWWWW.', '.WWWWWWWWW.', '..WWWWWWW..'], feet: 'W' },
    chick: { rows: ['...YYYYY...', '..YYYYYYY..', '..YKYYYKY..', '..YYYOYYY..', '..YYYOYYY..', '.YYYYYYYYY.', '.YYYYYYYYY.', '..YYYYYYY..'], feet: 'O' },
    fox: { rows: ['.R.......R.', '.RR.....RR.', '.RRRRRRRRR.', '.RRRRRRRRR.', '.RKRRRRRKR.', '.RRRRKRRRR.', '..RWWWWWR..', '...WWWWW...', '..RRRRRRR..'], feet: 'D' },
    penguin: { rows: ['...KKKKK...', '..KKKKKKK..', '..KWKKKWK..', '..KKOOOKK..', '.KKWWWWWKK.', '.KKWWWWWKK.', '.KKWWWWWKK.', '..KWWWWWK..'], feet: 'O' },
    pumpkin: { rows: ['.....GG....', '..OOOGOOO..', '.OOOOOOOOO.', '.OKOOOOOKO.', '.OOOOOOOOO.', '.OOKOKOKOO.', '.OOOKKKOOO.', '..OOOOOOO..'], feet: 'R' },
    bot: { rows: ['.....A.....', '.....A.....', '..AAAAAAA..', '.ALLLLLLLA.', '.ALKLLLKLA.', '.ALLLLLLLA.', '..AAAAAAA..', '.AAAAAAAAA.', '..AAAAAAA..'], feet: 'A' },
    ghost: { fly: true, rows: ['..WWWWWWW..', '.WWWWWWWWW.', '.WKKWWWKKW.', '.WKKWWWKKW.', '.WWWWKWWWW.', '.WWWWWWWWW.', '.WWWWWWWWW.', '.WW.WWW.WW.', '..W..W..W..'], feet: null },
    bee: { fly: true, rows: ['...L...L...', '..LLL.LLL..', '..YYYYYYY..', '.YYKKYKKYY.', '.YYKKYKKYY.', '.YKYYYYYKY.', '..YYYYYYY..', '....KKK....'], feet: null }
  };
  const ROSTER = {
    navidad: ['penguin', 'bunny', 'fox'],
    halloween: ['ghost', 'pumpkin', 'fox'],
    anio: ['bot', 'chick', 'bunny'],
    sanvalentin: ['bunny', 'chick', 'bee'],
    madres: ['bunny', 'bee', 'chick'],
    carnaval: ['fox', 'bee', 'chick'],
    ecuador: ['chick', 'fox', 'bunny']
  };
  const THEME_ROSTER = {
    nova: ['bot', 'bee', 'chick'], cyberpunk: ['bot', 'fox', 'ghost'], synthwave: ['bot', 'bunny', 'bee'], eclipse: ['fox', 'bot', 'bee'],
    deepdark: ['bot', 'ghost', 'fox'], nether: ['pumpkin', 'fox', 'ghost'], end: ['ghost', 'bot', 'bee'], sakura: ['bunny', 'bee', 'chick']
  };
  const DEFAULT_ROSTER = ['bunny', 'chick', 'fox'];

  const spriteCache = new Map();
  function sheet(name, frame, acc) {
    const key = name + '|' + frame + '|' + (name === 'bot' ? acc : '');
    if (spriteCache.has(key)) return spriteCache.get(key);
    const def = SPRITES[name];
    const rows = def.rows.slice();
    const wd = 11;
    const SC = def.scale || 3;
    if (def.legs) { rows.push(def.legs[frame ? 1 : 0]); rows.push(def.legs[frame ? 0 : 1].replace(/Q/g, 'M')); }
    else if (def.feet) rows.push(frame ? '..F...F....'.replace(/F/g, def.feet).padEnd(wd, '.') : '....F...F..'.replace(/F/g, def.feet).padEnd(wd, '.'));
    const c = document.createElement('canvas');
    c.width = wd * SC; c.height = rows.length * SC;
    const x = c.getContext('2d');
    rows.forEach((row, ry) => {
      for (let rx = 0; rx < wd; rx++) {
        const ch = row[rx];
        if (!ch || ch === '.') continue;
        x.fillStyle = ch === 'A' ? acc : PAL[ch] || '#fff';
        x.fillRect(rx * SC, ry * SC, SC, SC);
      }
    });
    spriteCache.set(key, c);
    return c;
  }

  let crits = [];
  function leftBound() {
    const sb = document.querySelector('.sidebar');
    const r = sb ? sb.getBoundingClientRect() : null;
    return (r && r.width ? r.right : 0) + 14;
  }
  function rosterNow() { return ['px'].concat((ROSTER[root.dataset.season] || THEME_ROSTER[root.dataset.theme] || DEFAULT_ROSTER).slice(0, 2)); }
  function makeCritters() {
    crits = [];
    if (!opt.critters || root.classList.contains('no-fx')) return;
    const lb = leftBound();
    rosterNow().forEach((name, i) => {
      const fly = !!SPRITES[name].fly;
      crits.push({
        name, fly, x: rnd(lb + 40, Math.max(lb + 60, w - 60)), y: 0, vy: 0, dir: Math.random() < 0.5 ? -1 : 1, state: 'walk', t: rnd(1, 4),
        base: rnd(h * 0.5, h - 70), tx: 0, ty: 0, ph: rnd(0, TAU), seed: i
      });
    });
  }

  // Control externo del panda PX (lo usa mascot.js): dormir, saltar, alegrarse.
  const petCtl = { sleep: false, joy: 0, hop() { const c = crits.find((k) => k.name === 'px'); if (c && !c.vy && c.y === 0) c.vy = -190; }, happy(sec) { this.joy = sec || 2; } };
  function getPet() {
    const c = crits.find((k) => k.name === 'px');
    if (!c || !opt.critters || root.classList.contains('no-fx')) return null;
    const sp = sheet(c.name, 0, '#fff');
    return { x: c.x, top: h - 4 - sp.height + c.y, w: sp.width, h: sp.height, dir: c.dir };
  }

  function updateCritter(c, dt, lb) {
    const sh = sheet(c.name, 0, '#fff').height;
    if (c.name === 'px') return updatePet(c, dt, lb);
    const ground = h - 4;
    c.t -= dt; c.ph += dt * (c.fly ? 6 : 9);
    const near = Math.hypot(mx - c.x, my - (ground - sh / 2));
    if (c.fly) {
      if (c.t <= 0) { c.tx = rnd(lb + 20, w - 30); c.ty = rnd(h * 0.45, h - 60); c.t = rnd(3, 6); }
      if (!c.tx) { c.tx = c.x; c.ty = c.base; }
      let ax = (c.tx - c.x) * 0.6, ay = (c.ty - (c.y || c.ty)) * 0.6;
      if (near < 90) { ax += (c.x - mx) * 2.5; ay += ((c.y || c.ty) - my) * 2.5; }
      c.x += Math.max(-90, Math.min(90, ax)) * dt;
      c.y = (c.y || c.ty) + Math.max(-90, Math.min(90, ay)) * dt;
      c.y = Math.min(h - sh - 4, Math.max(h * 0.3, c.y));
      c.dir = ax >= 0 ? 1 : -1;
      return;
    }
    // a ras de suelo: pasea, se detiene, salta y huye si el cursor se acerca
    const scared = Math.abs(mx - c.x) < 110 && my > h - 150;
    if (scared) { c.dir = c.x < mx ? -1 : 1; c.state = 'walk'; }
    else if (c.t <= 0) { c.state = Math.random() < 0.3 ? 'idle' : 'walk'; c.dir = Math.random() < 0.5 ? -1 : 1; c.t = rnd(1.2, 4); if (Math.random() < 0.35 && !c.vy && c.y === 0) c.vy = -160; }
    const speed = scared ? 120 : c.state === 'walk' ? 26 : 0;
    c.x += c.dir * speed * dt;
    if (c.x < lb) { c.x = lb; c.dir = 1; } else if (c.x > w - 24) { c.x = w - 24; c.dir = -1; }
    if (scared && c.y === 0 && Math.random() < 0.06) c.vy = -190;
    if (c.vy || c.y < 0) { c.vy += 520 * dt; c.y += c.vy * dt; if (c.y >= 0) { c.y = 0; c.vy = 0; } }
    c.moving = speed > 0;
  }

  // PX es amistoso: no huye del cursor. Lo mira, se duerme si se lo pide mascot.js y salta de alegría.
  function updatePet(c, dt, lb) {
    const ground = h - 4;
    c.t -= dt; c.ph += dt * 9;
    if (petCtl.joy > 0) { petCtl.joy -= dt; if (!c.vy && c.y === 0) c.vy = -150; }
    const near = Math.abs(mx - c.x) < 150 && my > h - 190;
    c.moving = false;
    if (petCtl.sleep) { c.state = 'idle'; }
    else if (near) { c.dir = mx < c.x ? -1 : 1; c.state = 'idle'; }
    else if (c.t <= 0) { c.state = Math.random() < 0.3 ? 'idle' : 'walk'; c.dir = Math.random() < 0.5 ? -1 : 1; c.t = rnd(1.2, 4); }
    const speed = c.state === 'walk' ? 26 : 0;
    c.x += c.dir * speed * dt;
    if (c.x < lb) { c.x = lb; c.dir = 1; } else if (c.x > w - 24) { c.x = w - 24; c.dir = -1; }
    if (c.vy || c.y < 0) { c.vy += 520 * dt; c.y += c.vy * dt; if (c.y >= 0) { c.y = 0; c.vy = 0; } }
    c.moving = speed > 0;
    void ground;
  }

  function drawCritter(c) {
    const sprite = sheet(c.name, c.fly || !c.moving ? 0 : Math.floor(c.ph / 2) % 2, accent());
    const sh = sprite.height;
    let x = c.x - sprite.width / 2;
    let y;
    if (c.fly) {
      y = c.y + Math.sin(c.ph) * 3 - sh;
      ctx.globalAlpha = c.name === 'ghost' ? 0.82 : 1;
    } else {
      y = h - 4 - sh + c.y;
      if (c.moving && !c.vy) y -= Math.abs(Math.sin(c.ph)) * 2;
      ctx.globalAlpha = 1;
    }
    ctx.save();
    if (c.dir < 0 && !c.fly) { ctx.translate(Math.round(x) + sprite.width, 0); ctx.scale(-1, 1); ctx.drawImage(sprite, 0, Math.round(y)); }
    else ctx.drawImage(sprite, Math.round(x), Math.round(y));
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /* ---------- bucle (solo corre cuando hay algo que dibujar) ---------- */
  let raf = 0, last = 0;
  function active() { return !root.classList.contains('no-fx') && !document.hidden && (parts.length > 0 || (opt.critters && crits.length > 0)); }
  function frame(t) {
    if (!active()) { raf = 0; ctx.clearRect(0, 0, w, h); return; }
    raf = requestAnimationFrame(frame);
    if (t - last < 33) return;
    const dt = last ? Math.min(0.1, (t - last) / 1000) : 0.033;
    last = t;
    ctx.clearRect(0, 0, w, h);
    const next = [];
    for (const p of parts) {
      p.life -= p.decay * dt;
      if (p.life <= 0) continue;
      p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      drawParticle(p);
      next.push(p);
    }
    parts = next;
    ctx.globalAlpha = 1;
    if (opt.critters) {
      const lb = leftBound();
      for (const c of crits) { updateCritter(c, dt, lb); drawCritter(c); }
    }
  }
  function wake() { if (!raf && active()) { last = 0; raf = requestAnimationFrame(frame); } }
  document.addEventListener('visibilitychange', wake);

  // Cuando cambia el tema, la temporada o los efectos, se reparte otro elenco.
  let sig = '';
  function refresh() {
    const s = [root.dataset.theme, root.dataset.season, root.classList.contains('no-fx'), opt.critters].join('|');
    if (s === sig) return;
    sig = s;
    makeCritters();
    wake();
  }
  new MutationObserver(refresh).observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-season', 'class'] });
  setTimeout(refresh, 400);

  // Interruptores de Ajustes → Apariencia (se guardan en este equipo).
  function bind(id, key) {
    const el = document.getElementById(id);
    if (!el) return;
    el.checked = opt[key];
    el.addEventListener('change', () => {
      opt[key] = el.checked;
      store.set('px.fun.' + key, el.checked);
      if (key === 'critters') { sig = ''; refresh(); }
      if (key === 'trail' && !el.checked) parts = [];
    });
  }
  bind('fun-trail', 'trail');
  bind('fun-critters', 'critters');
  window.NovaFun = { refresh, options: opt, petCtl, getPet };
})();
