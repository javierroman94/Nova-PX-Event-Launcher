/* Tema, fondo personalizado y efectos. Todo se puede apagar y se pausa cuando la ventana no se ve. */
(function () {
  const root = document.documentElement;
  const g = (id) => document.getElementById(id);
  const PRESETS = ['#f2b84b', '#9d6bff', '#4cc9f0', '#5fd38d', '#ff6b8b', '#ff8a3d'];
  // Las animaciones se controlan con la casilla "Efectos animados" de Ajustes (no con la opción del sistema).

  let state = { theme: 'dark', accent: '#f2b84b', bgDim: 55, bgBlur: 6, effects: true };
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
    fx.sync();
    window.dispatchEvent(new CustomEvent('nova-fx', { detail: state.effects }));
  }

  function persist(extra) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      window.api.saveSettings({ theme: state.theme, accent: state.accent, bgDim: state.bgDim, bgBlur: state.bgBlur, effects: state.effects, ...extra });
    }, 350);
  }

  function change(patch) {
    apply(patch);
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
  const fx = (function () {
    const canvas = g('fx');
    const ctx = canvas.getContext('2d');
    let parts = [];
    let raf = 0;
    let last = 0;
    let w = 0;
    let h = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(70, Math.max(24, (w * h) / 26000)));
      parts = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.8 + Math.random() * 2.1,
        vy: -(8 + Math.random() * 22),
        vx: (Math.random() - 0.5) * 8,
        a: 0.15 + Math.random() * 0.4
      }));
    }

    function frame(t) {
      raf = requestAnimationFrame(frame);
      if (t - last < 33) return; // unos 30 cuadros por segundo bastan y gastan poco
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = state.accent;
      for (const p of parts) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.y < -6) { p.y = h + 6; p.x = Math.random() * w; }
        if (p.x < -6) p.x = w + 6;
        if (p.x > w + 6) p.x = -6;
        ctx.globalAlpha = p.a;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
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
    return { sync };
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
    document.querySelectorAll('[data-theme-value]').forEach((b) => b.addEventListener('click', () => change({ theme: b.dataset.themeValue })));

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

    g('bg-dim').addEventListener('input', (e) => change({ bgDim: Number(e.target.value) }));
    g('bg-blur').addEventListener('input', (e) => change({ bgBlur: Number(e.target.value) }));
    g('effects').addEventListener('change', (e) => change({ effects: e.target.checked }));

    g('bg-pick').addEventListener('click', async () => {
      try {
        const url = await window.api.pickBackground();
        if (url) setBackground(url);
      } catch (err) {
        themeMsg(String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), true);
      }
    });
    g('bg-clear').addEventListener('click', async () => {
      await window.api.clearBackground();
      setBackground(null);
    });
  }

  window.NovaTheme = {
    async init(settings) {
      bindControls();
      apply(settings);
      try {
        setBackground(await window.api.getBackground());
      } catch {}
    }
  };
})();
