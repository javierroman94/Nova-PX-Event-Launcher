/* Tema, fondo personalizado y efectos. Todo se puede apagar y se pausa cuando la ventana no se ve. */
(function () {
  const root = document.documentElement;
  const g = (id) => document.getElementById(id);
  const PRESETS = ['#f2b84b', '#9d6bff', '#4cc9f0', '#5fd38d', '#ff6b8b', '#ff8a3d'];
  // Las animaciones se controlan con la casilla "Efectos animados" de Ajustes (no con la opción del sistema).

  let state = { theme: 'nova', accent: '#35d6ff', bgDim: 55, bgBlur: 6, effects: true, season: 'auto' };

  // Temporada según la fecha (ver seasons.js): Año Nuevo, San Valentín, Carnaval, Día de la Madre, 10 de Agosto, Halloween y Navidad.
  function seasonNow(choice) {
    if (choice === 'off') return '';
    if (choice && choice !== 'auto') return choice;
    return window.NovaSeasons ? window.NovaSeasons.seasonFor(new Date()) : '';
  }
  const BANNERS = {
    navidad: ['🎄', 'Navidad en Nova PX', 'Felices fiestas, jugadores. ¡Gracias por acompañarnos este año!'],
    halloween: ['🎃', 'Noche de Halloween', 'Semana de sustos: prepárate para lo que viene en Nova PX.'],
    anio: ['🎆', 'Feliz Año Nuevo', 'Nuevo año, nuevos eventos. ¡Vamos con todo!'],
    sanvalentin: ['💘', 'San Valentín', 'Juega en equipo, que en Nova PX nadie juega solo.'],
    carnaval: ['🎉', 'Carnaval', 'Días de fiesta y de eventos. ¡A divertirse!'],
    madres: ['🌸', 'Día de la Madre', 'Un abrazo a todas las mamás de la comunidad.'],
    ecuador: ['🇪🇨', '10 de Agosto', 'Primer Grito de la Independencia: orgullo ecuatoriano en Nova PX.']
  };
  function paintSeasonBanner(season) {
    const box = document.getElementById('season-banner');
    if (!box) return;
    const b = BANNERS[season];
    box.hidden = !b;
    if (!b) return;
    box.replaceChildren();
    const ico = document.createElement('span'); ico.className = 'sb-ico'; ico.textContent = b[0];
    const txt = document.createElement('div');
    const h = document.createElement('b'); h.textContent = b[1];
    const p = document.createElement('p'); p.textContent = b[2];
    txt.append(h, p);
    box.append(ico, txt);
  }
  let saveTimer = 0;

  // Texto oscuro o claro encima del color principal, según su luminosidad.
  function inkFor(hex) {
    const n = parseInt(hex.slice(1), 16);
    const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return lum > 0.58 ? '#1a1405' : '#ffffff';
  }

  function apply(s) {
    state = { ...state, ...s };
    root.dataset.theme = state.theme;
    root.dataset.season = seasonNow(state.season);
    paintSeasonBanner(root.dataset.season);
    if (g('season-select')) g('season-select').value = state.season;
    root.style.setProperty('--accent', state.accent);
    root.style.setProperty('--accent-ink', inkFor(state.accent));
    root.style.setProperty('--bg-dim', String(state.bgDim / 100));
    root.style.setProperty('--bg-blur', `${state.bgBlur}px`);
    root.classList.toggle('no-fx', !state.effects);
    document.querySelectorAll('[data-theme-value]').forEach((b) => b.classList.toggle('active', b.dataset.themeValue === state.theme));
    document.querySelectorAll('.swatch').forEach((b) => b.classList.toggle('active', b.dataset.color === state.accent));
    const picker = g('accent-picker');
    if (picker) picker.value = state.accent;
    if (g('bg-dim')) g('bg-dim').value = state.bgDim;
    if (g('bg-blur')) g('bg-blur').value = state.bgBlur;
    if (g('effects')) g('effects').checked = state.effects;
    fx.resize();
    fx.sync();
    window.dispatchEvent(new CustomEvent('nova-fx', { detail: state.effects }));
    syncTitleBar();
  }

  // La barra de la ventana (botones de minimizar/cerrar) toma el color de la barra superior del tema.
  function toHex(css) {
    const m = String(css).match(/\d+(\.\d+)?/g);
    if (!m || m.length < 3) return null;
    return '#' + m.slice(0, 3).map((n) => Math.round(Number(n)).toString(16).padStart(2, '0')).join('');
  }
  function syncTitleBar() {
    setTimeout(() => {
      try {
        const top = document.querySelector('.topbar');
        if (!top || !window.api.winOverlay) return;
        const bg = toHex(getComputedStyle(document.body).backgroundColor) || '#0d0f16';
        const fg = toHex(getComputedStyle(document.body).color) || '#e8eaf2';
        window.api.winOverlay({ color: bg, symbol: fg });
      } catch {}
    }, 60);
  }

  function persist(extra) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      window.api.saveSettings({ theme: state.theme, accent: state.accent, bgDim: state.bgDim, bgBlur: state.bgBlur, effects: state.effects, season: state.season, ...extra });
    }, 350);
  }

  function change(patch) {
    apply(patch);
    try { localStorage.setItem('px.themeTouched', '1'); } catch {} // el jugador eligió: el tema del administrador ya no lo pisa
    persist();
  }

  function setBackground(dataUrl) {
    if (dataUrl) {
      root.style.setProperty('--bg-image', `url("${dataUrl}")`);
      root.classList.add('has-bg');
    } else {
      root.style.removeProperty('--bg-image');
      root.classList.remove('has-bg');
    }
  }

  function themeMsg(text, isError) {
    const m = g('theme-msg');
    if (!m) return;
    m.textContent = text;
    m.className = isError ? 'msg error' : 'msg';
    setTimeout(() => (m.textContent = ''), 3500);
  }

  /* ---------- partículas ---------- */
  // Cada temporada tiene su propio efecto: nieve con copos de verdad, murciélagos y brasas, fuegos artificiales,
  // corazones, confeti que gira, pétalos... Se dibuja a unos 30 cuadros por segundo y se pausa si la ventana no se ve.
  const fx = (function () {
    const canvas = g('fx');
    const ctx = canvas.getContext('2d');
    const TAU = Math.PI * 2;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const pick = (list) => list[Math.floor(Math.random() * list.length)];
    let parts = [];
    let extra = []; // chispas de fuegos artificiales, murciélagos…
    let raf = 0;
    let last = 0;
    let clock = 0;
    let nextRocket = 0;
    let w = 0;
    let h = 0;
    let mode = '';

    // Brillo suave pre-dibujado (mucho más barato que shadowBlur en cada cuadro).
    const glowCache = new Map();
    function glow(color) {
      if (glowCache.has(color)) return glowCache.get(color);
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const x = c.getContext('2d');
      const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, color);
      gr.addColorStop(0.25, color);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = gr;
      x.fillRect(0, 0, 64, 64);
      glowCache.set(color, c);
      return c;
    }
    function drawGlow(color, x, y, r, a) {
      ctx.globalAlpha = a;
      ctx.drawImage(glow(color), x - r, y - r, r * 2, r * 2);
    }

    const CONFETTI = { carnaval: ['#ff3b4e', '#ffd23f', '#34e08a', '#4cc9f0', '#b46bff', '#ff8a3d'], ecuador: ['#ffd100', '#ffd100', '#0033a0', '#ef3340'], anio: ['#ffd23f', '#fff4c2', '#e8c15a'] };

    function spawn(m, anywhere) {
      const y0 = anywhere ? Math.random() * h : -20;
      if (m === 'snow') {
        const depth = Math.random();
        return { x: Math.random() * w, y: y0, depth, r: 1 + depth * 3.4, vy: 14 + depth * 38, a: 0.25 + depth * 0.6, ph: Math.random() * TAU, rot: Math.random() * TAU, vr: rnd(-0.6, 0.6), crystal: depth > 0.72 };
      }
      if (m === 'embers') return { x: Math.random() * w, y: anywhere ? Math.random() * h : h + 10, r: rnd(1, 2.6), vy: -rnd(18, 52), vx: rnd(-6, 6), a: rnd(0.35, 0.9), ph: Math.random() * TAU, color: pick(['#ff8a1f', '#ff5a1f', '#ffb347']) };
      if (m === 'hearts') return { x: Math.random() * w, y: anywhere ? Math.random() * h : h + 20, s: rnd(5, 13), vy: -rnd(14, 34), a: rnd(0.35, 0.8), ph: Math.random() * TAU, rot: rnd(-0.3, 0.3), color: pick(['#ff4d79', '#ff7aa2', '#e63462', '#ffb3c8']) };
      if (m === 'petals') return { x: Math.random() * w, y: y0, s: rnd(4, 8), vy: rnd(16, 34), a: rnd(0.6, 0.95), ph: Math.random() * TAU, rot: Math.random() * TAU, vr: rnd(-1.4, 1.4), flip: Math.random() * TAU, color: pick(['#ffb3d1', '#ffc9de', '#ff9ec4', '#fff0f6']) };
      if (m === 'confetti') {
        const list = CONFETTI[mode === 'tri' ? 'ecuador' : root.dataset.season] || CONFETTI.carnaval;
        return { x: Math.random() * w, y: y0, cw: rnd(5, 9), chh: rnd(3, 5), vy: rnd(30, 70), a: 0.9, ph: Math.random() * TAU, rot: Math.random() * TAU, vr: rnd(-3, 3), flip: Math.random() * TAU, vf: rnd(4, 9), color: pick(list) };
      }
      return { x: Math.random() * w, y: Math.random() * h, r: 1 + Math.random() * 1.6, vx: (Math.random() - 0.5) * 22, vy: (Math.random() - 0.5) * 22, a: 0.5 + Math.random() * 0.4 };
    }

    // Qué dibuja cada temporada: las partículas principales y lo que va encima.
    function engineFor(season) {
      if (season === 'navidad') return 'snow';
      if (season === 'halloween') return 'embers';
      if (season === 'anio') return 'fireworks';
      if (season === 'sanvalentin') return 'hearts';
      if (season === 'madres') return 'petals';
      if (season === 'carnaval') return 'confetti';
      if (season === 'ecuador') return 'tri';
      return state.theme === 'nova' ? 'net' : 'dots';
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      mode = engineFor(root.dataset.season);
      const base = mode === 'tri' ? 'confetti' : mode === 'fireworks' ? 'confetti' : mode;
      const per = { net: 30000, snow: 9000, embers: 26000, hearts: 34000, petals: 26000, confetti: 12000, dots: 22000 }[base] || 22000;
      const max = { net: 60, snow: 150, fireworks: 22, confetti: 110, tri: 110 }[mode] || 80;
      const count = Math.round(Math.min(max, Math.max(18, (w * h) / per)));
      parts = Array.from({ length: mode === 'fireworks' ? Math.min(22, count) : count }, () => spawn(base, true));
      extra = [];
      if (mode === 'embers') extra = Array.from({ length: 5 }, () => newBat(true));
    }

    /* --- formas --- */
    function snowflake(p) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = p.a;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.1;
      ctx.lineCap = 'round';
      const r = p.r * 2.4;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const an = (i * TAU) / 6;
        const cx = Math.cos(an), sy = Math.sin(an);
        ctx.moveTo(0, 0);
        ctx.lineTo(cx * r, sy * r);
        // ramitas del copo
        const bx = cx * r * 0.55, by = sy * r * 0.55;
        const b = r * 0.32;
        ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(an + 0.8) * b, by + Math.sin(an + 0.8) * b);
        ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(an - 0.8) * b, by + Math.sin(an - 0.8) * b);
      }
      ctx.stroke();
      ctx.restore();
    }
    function heart(x, y, s, rot, color, a) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.globalAlpha = a;
      const gr = ctx.createLinearGradient(0, -s, 0, s);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.18, color);
      gr.addColorStop(1, color);
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.moveTo(0, s * 0.35);
      ctx.bezierCurveTo(-s * 1.1, -s * 0.35, -s * 0.55, -s * 1.15, 0, -s * 0.5);
      ctx.bezierCurveTo(s * 0.55, -s * 1.15, s * 1.1, -s * 0.35, 0, s * 0.35);
      ctx.lineTo(0, s * 0.95);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    function petal(p) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, 0.35 + Math.abs(Math.cos(p.flip)) * 0.65); // gira en el aire
      ctx.globalAlpha = p.a;
      const s = p.s;
      const gr = ctx.createLinearGradient(-s, 0, s, 0);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(1, p.color);
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.moveTo(-s, 0);
      ctx.bezierCurveTo(-s * 0.4, -s * 0.9, s * 0.6, -s * 0.8, s, -s * 0.15);
      ctx.lineTo(s * 0.7, 0); // la muesca del pétalo de cerezo
      ctx.lineTo(s, s * 0.15);
      ctx.bezierCurveTo(s * 0.6, s * 0.8, -s * 0.4, s * 0.9, -s, 0);
      ctx.fill();
      ctx.restore();
    }
    function confetto(p) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      const k = Math.cos(p.flip); // se da la vuelta: se ve más fino y más oscuro de canto
      ctx.scale(1, Math.max(0.08, Math.abs(k)));
      ctx.globalAlpha = p.a * (0.65 + Math.abs(k) * 0.35);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.cw / 2, -p.chh / 2, p.cw, p.chh);
      ctx.restore();
    }

    /* --- murciélagos (Halloween) --- */
    function newBat(anywhere) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      return { x: anywhere ? Math.random() * w : dir > 0 ? -40 : w + 40, y: rnd(h * 0.06, h * 0.2), vx: dir * rnd(55, 110), s: rnd(14, 24), ph: Math.random() * TAU, flap: rnd(10, 15), bob: rnd(18, 40), a: rnd(0.75, 1) };
    }
    function bat(b) {
      const wing = Math.sin(b.ph * b.flap); // aleteo
      const s = b.s;
      const by = b.y + Math.sin(b.ph * 1.7) * b.bob * 0.3;
      drawGlow('#b46bff', b.x, by, s * 3.4, 0.38 * b.a); // halo morado para que se vea sobre el fondo oscuro
      ctx.save();
      ctx.translate(b.x, by);
      if (b.vx < 0) ctx.scale(-1, 1);
      ctx.globalAlpha = b.a;
      ctx.fillStyle = '#2e1a40';
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.28, s * 0.42, 0, 0, TAU); // cuerpo
      ctx.fill();
      const tip = -s * 0.9 * wing;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.15);
        ctx.quadraticCurveTo(side * s * 0.9, tip - s * 0.4, side * s * 1.9, tip);
        ctx.quadraticCurveTo(side * s * 1.45, tip * 0.4 + s * 0.25, side * s * 1.2, s * 0.25);
        ctx.quadraticCurveTo(side * s * 0.9, s * 0.05, side * s * 0.65, s * 0.35);
        ctx.quadraticCurveTo(side * s * 0.4, s * 0.1, 0, s * 0.2);
        ctx.fill();
      }
      // orejitas
      ctx.beginPath();
      ctx.moveTo(-s * 0.18, -s * 0.3); ctx.lineTo(-s * 0.1, -s * 0.62); ctx.lineTo(0, -s * 0.36);
      ctx.lineTo(s * 0.1, -s * 0.62); ctx.lineTo(s * 0.18, -s * 0.3);
      ctx.fill();
      ctx.restore();
    }

    /* --- fuegos artificiales (Año Nuevo) --- */
    function launchRocket() {
      const color = pick(['#ffd23f', '#ff4fa8', '#4cc9f0', '#ffffff', '#ff8a3d', '#9dff4f']);
      extra.push({ kind: 'rocket', x: rnd(w * 0.12, w * 0.88), y: h + 10, vy: -rnd(h * 0.75, h * 0.95), top: rnd(h * 0.08, h * 0.24), color }); // estallan arriba, donde la interfaz deja ver el fondo
    }
    function explode(r, into) {
      const n = 46;
      const speed = rnd(120, 190);
      const second = Math.random() < 0.4 ? pick(['#ffffff', '#ffd23f']) : r.color;
      for (let i = 0; i < n; i++) {
        const an = (i / n) * TAU + rnd(-0.05, 0.05);
        const v = speed * rnd(0.75, 1);
        into.push({ kind: 'spark', x: r.x, y: r.y, vx: Math.cos(an) * v, vy: Math.sin(an) * v, life: 1, decay: rnd(0.45, 0.65), color: i % 3 === 0 ? second : r.color });
      }
      into.push({ kind: 'flash', x: r.x, y: r.y, life: 1, color: r.color });
    }

    function frame(t) {
      raf = requestAnimationFrame(frame);
      if (t - last < 33) return; // unos 30 cuadros por segundo bastan y gastan poco
      const dt = last ? Math.min(0.1, (t - last) / 1000) : 0.033;
      last = t;
      clock += dt;
      ctx.clearRect(0, 0, w, h);
      const wind = Math.sin(clock * 0.23) * 18 + Math.sin(clock * 0.71) * 8; // ráfagas suaves

      if (mode === 'net' || mode === 'dots') {
        ctx.fillStyle = state.accent;
        for (const p of parts) {
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.x < -6) p.x = w + 6; else if (p.x > w + 6) p.x = -6;
          if (p.y < -6) p.y = h + 6; else if (p.y > h + 6) p.y = -6;
          ctx.globalAlpha = p.a;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
        }
        if (mode === 'net') {
          // constelación: une con líneas finas las partículas cercanas
          ctx.lineWidth = 1;
          ctx.strokeStyle = state.accent;
          for (let i = 0; i < parts.length; i++) {
            for (let j = i + 1; j < parts.length; j++) {
              const dx = parts[i].x - parts[j].x;
              const dy = parts[i].y - parts[j].y;
              const d2 = dx * dx + dy * dy;
              if (d2 < 16900) {
                ctx.globalAlpha = (1 - d2 / 16900) * 0.35;
                ctx.beginPath(); ctx.moveTo(parts[i].x, parts[i].y); ctx.lineTo(parts[j].x, parts[j].y); ctx.stroke();
              }
            }
          }
        }
        ctx.globalAlpha = 1;
        return;
      }

      if (mode === 'snow') {
        for (const p of parts) {
          p.ph += dt;
          p.rot += p.vr * dt;
          p.x += (wind * (0.4 + p.depth) + Math.sin(p.ph * 1.1) * 10) * dt;
          p.y += p.vy * dt;
          if (p.y > h + 10) Object.assign(p, spawn('snow', false));
          if (p.x < -10) p.x = w + 10; else if (p.x > w + 10) p.x = -10;
          if (p.crystal) snowflake(p);
          else drawGlow('#ffffff', p.x, p.y, p.r * 2.2, p.a);
        }
      } else if (mode === 'embers') {
        for (const p of parts) {
          p.ph += dt;
          p.x += (p.vx + Math.sin(p.ph * 2.3) * 12) * dt;
          p.y += p.vy * dt;
          if (p.y < -10) Object.assign(p, spawn('embers', false));
          const flicker = 0.6 + Math.sin(p.ph * 9) * 0.4;
          drawGlow(p.color, p.x, p.y, p.r * 4, p.a * flicker);
        }
        for (let i = 0; i < extra.length; i++) {
          const b = extra[i];
          b.ph += dt;
          b.x += b.vx * dt;
          if (b.x < -60 || b.x > w + 60) extra[i] = newBat(false);
          bat(b);
        }
      } else if (mode === 'hearts') {
        for (const p of parts) {
          p.ph += dt;
          p.x += Math.sin(p.ph * 1.2) * 16 * dt;
          p.y += p.vy * dt;
          if (p.y < -30) Object.assign(p, spawn('hearts', false));
          heart(p.x, p.y, p.s, p.rot + Math.sin(p.ph) * 0.2, p.color, p.a);
        }
      } else if (mode === 'petals') {
        for (const p of parts) {
          p.ph += dt;
          p.rot += p.vr * dt;
          p.flip += dt * 2.2;
          p.x += (wind * 0.8 + Math.sin(p.ph * 1.3) * 22) * dt;
          p.y += p.vy * dt;
          if (p.y > h + 20) Object.assign(p, spawn('petals', false));
          if (p.x < -20) p.x = w + 20; else if (p.x > w + 20) p.x = -20;
          petal(p);
        }
      } else if (mode === 'confetti' || mode === 'tri' || mode === 'fireworks') {
        for (const p of parts) {
          p.ph += dt;
          p.rot += p.vr * dt;
          p.flip += p.vf * dt;
          p.x += (wind * 0.6 + Math.sin(p.ph * 2) * 18) * dt;
          p.y += p.vy * dt * (mode === 'fireworks' ? 0.6 : 1);
          if (p.y > h + 20) Object.assign(p, spawn('confetti', false));
          if (p.x < -20) p.x = w + 20; else if (p.x > w + 20) p.x = -20;
          confetto(p);
        }
        if (mode === 'fireworks') {
          if (clock > nextRocket) { launchRocket(); nextRocket = clock + rnd(0.9, 2.2); }
          const next = [];
          for (const e of extra) {
            if (e.kind === 'rocket') {
              e.y += e.vy * dt;
              drawGlow('#fff4c2', e.x, e.y, 5, 0.9);
              drawGlow(e.color, e.x, e.y + 10, 4, 0.4);
              if (e.y <= e.top) explode(e, next); else next.push(e);
            } else if (e.kind === 'spark') {
              e.vy += 90 * dt; // gravedad
              e.vx *= 0.985; e.vy *= 0.985;
              e.x += e.vx * dt; e.y += e.vy * dt;
              e.life -= e.decay * dt;
              if (e.life > 0) {
                const tw = e.life < 0.35 ? (Math.sin(clock * 40 + e.x) > 0 ? 1 : 0.3) : 1; // chisporroteo al final
                drawGlow(e.color, e.x, e.y, 5.5, Math.min(1, e.life * 1.3) * tw);
                next.push(e);
              }
            } else if (e.kind === 'flash') {
              e.life -= dt * 3;
              if (e.life > 0) { drawGlow(e.color, e.x, e.y, 70, e.life * 0.25); next.push(e); }
            }
          }
          extra = next;
        }
      }
      ctx.globalAlpha = 1;
    }

    function start() {
      if (raf) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      cancelAnimationFrame(raf);
      raf = 0;
      ctx.clearRect(0, 0, w, h);
    }
    function sync() {
      const on = state.effects && !document.hidden;
      if (on) start();
      else stop();
    }

    resize();
    window.addEventListener('resize', () => { resize(); });
    document.addEventListener('visibilitychange', sync);
    return { sync, resize };
  })();

  /* ---------- inclinación de tarjetas y brillo del hero ---------- */
  let tiltRaf = 0;
  document.addEventListener('mousemove', (e) => {
    if (root.classList.contains('no-fx') || tiltRaf) return;
    tiltRaf = requestAnimationFrame(() => {
      tiltRaf = 0;
      const hero = e.target.closest && e.target.closest('.hero');
      if (hero) {
        const r = hero.getBoundingClientRect();
        hero.style.setProperty('--mx', `${e.clientX - r.left}px`);
        hero.style.setProperty('--my', `${e.clientY - r.top}px`);
      }
      const card = e.target.closest && e.target.closest('[data-tilt]');
      document.querySelectorAll('[data-tilt].tilting').forEach((c) => { if (c !== card) c.classList.remove('tilting'); });
      if (!card) return;
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      card.style.setProperty('--ry', `${(px * 10).toFixed(2)}deg`);
      card.style.setProperty('--rx', `${(-py * 10).toFixed(2)}deg`);
      card.classList.add('tilting');
    });
  });
  document.addEventListener('mouseleave', () => document.querySelectorAll('.tilting').forEach((c) => c.classList.remove('tilting')));

  /* ---------- controles de Ajustes ---------- */
  function bindControls() {
    document.querySelectorAll('[data-theme-value]').forEach((b) => b.addEventListener('click', () => change(b.dataset.accent ? { theme: b.dataset.themeValue, accent: b.dataset.accent } : { theme: b.dataset.themeValue })));

    const box = g('swatches');
    PRESETS.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.dataset.color = c;
      b.setAttribute('aria-label', `Color ${c}`);
      b.style.background = c;
      b.addEventListener('click', () => change({ accent: c }));
      box.append(b);
    });
    const picker = document.createElement('input');
    picker.type = 'color';
    picker.id = 'accent-picker';
    picker.setAttribute('aria-label', 'Elegir otro color');
    picker.addEventListener('input', () => change({ accent: picker.value.toLowerCase() }));
    box.append(picker);

    g('effects').addEventListener('change', (e) => change({ effects: e.target.checked }));
    g('season-select').addEventListener('change', (e) => change({ season: e.target.value }));
  }

  window.NovaTheme = {
    // Aplica sin guardar (tema por defecto del administrador y vista previa del panel).
    preview(patch) { apply(patch); },
    async init(settings) {
      bindControls();
      apply(settings);
      setBackground(null);
    }
  };
})();
