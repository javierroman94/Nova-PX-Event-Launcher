/* Sonidos suaves de Nova Eclipse: un "tic" musical al pasar el cursor por botones y un susurro cósmico al pasar por tarjetas grandes.
   Se generan con WebAudio (sin archivos), solo suenan con el tema Nova Eclipse y se apagan en Ajustes → Apariencia. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NovaSoundCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  // Escala pentatónica (La menor) para que cualquier orden de notas suene bien.
  const SCALE = [440, 523.25, 587.33, 659.25, 783.99, 880];
  const note = (n) => SCALE[((n % SCALE.length) + SCALE.length) % SCALE.length];
  const pickIndex = (prev, rnd) => { let i = Math.floor(rnd * SCALE.length); if (i === prev) i = (i + 1) % SCALE.length; return i; };
  return { SCALE, note, pickIndex };
}));

(function () {
  if (typeof document === 'undefined') return;
  const core = window.NovaSoundCore;
  const KEY = 'px.fun.sound';
  const SMALL = 'button, .nav-item, .theme-card, .link-chip, .ctx-item, summary, [role="button"]';
  const BIG = '.ev-card, .member, .link-tile, .mp-card, .event-card, .lp-hero';
  let ctx = null; let last = 0; let lastBig = null; let prev = -1; let on = true;
  try { const v = localStorage.getItem(KEY); on = v === null ? true : v === 'true'; } catch {}

  const themed = () => document.documentElement.dataset.theme === 'eclipse' && !document.documentElement.classList.contains('no-fx');
  function audio() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx.state === 'running' || ctx.state === 'suspended' ? ctx : null;
  }
  function tick() {
    const a = audio(); if (!a) return;
    prev = core.pickIndex(prev, Math.random());
    const t = a.currentTime; const o = a.createOscillator(); const g = a.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(core.note(prev), t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.035, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + 0.18);
  }
  function whoosh() {
    const a = audio(); if (!a) return;
    const t = a.currentTime; const len = Math.floor(a.sampleRate * 0.5);
    const buf = a.createBuffer(1, len, a.sampleRate); const d = buf.getChannelData(0);
    let b = 0; for (let i = 0; i < len; i++) { b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = b * 3.5; } // ruido marrón
    const src = a.createBufferSource(); src.buffer = buf;
    const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(260, t); f.frequency.exponentialRampToValueAtTime(1400, t + 0.3);
    const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.48);
    src.connect(f).connect(g).connect(a.destination); src.start(t); src.stop(t + 0.5);
  }
  function thud() {
    const a = audio(); if (!a) return;
    const t = a.currentTime; const o = a.createOscillator(); const g = a.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(110, t + 0.14);
    g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + 0.2);
  }
  document.addEventListener('pointerover', (e) => {
    if (!on || !themed() || !e.target.closest) return;
    const now = performance.now();
    const big = e.target.closest(BIG);
    if (big && big !== lastBig) { lastBig = big; if (now - last > 220) { last = now; whoosh(); } return; }
    if (!big) lastBig = null;
    if (e.target.closest(SMALL) && now - last > 90) { last = now; tick(); }
  }, true);
  document.addEventListener('pointerdown', (e) => { if (on && themed() && e.target.closest && e.target.closest(SMALL + ',' + BIG)) thud(); }, true);

  window.NovaSound = {
    get enabled() { return on; },
    set(v) { on = !!v; try { localStorage.setItem(KEY, String(on)); } catch {} }
  };
  const box = document.getElementById('fun-sound');
  if (box) { box.checked = on; box.addEventListener('change', () => window.NovaSound.set(box.checked)); }
}());
