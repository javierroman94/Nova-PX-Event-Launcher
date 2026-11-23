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

  // Temas con sonido: Nova Eclipse (cósmico y suave) y Vice Sunset (sintetizador retro de los 80).
  const themeId = () => { const t = document.documentElement.dataset.theme; return (t === 'eclipse' || t === 'vicesunset') && !document.documentElement.classList.contains('no-fx') ? t : ''; };
  const themed = () => !!themeId();
  const retro = () => document.documentElement.dataset.theme === 'vicesunset';
  // Vice Sunset: escala menor pentatónica aguda con "pluck" de sierra, riser de sintetizador y bombo corto.
  const RETRO = [392, 466.16, 523.25, 587.33, 698.46, 783.99];
  function rTick() {
    const a = audio(); if (!a) return;
    prev = core.pickIndex(prev, Math.random());
    const t = a.currentTime; const o = a.createOscillator(); const f = a.createBiquadFilter(); const g = a.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(RETRO[prev % RETRO.length] * 2, t); o.frequency.exponentialRampToValueAtTime(RETRO[prev % RETRO.length], t + 0.09);
    f.type = 'lowpass'; f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(500, t + 0.12);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    o.connect(f).connect(g).connect(out(a)); o.start(t); o.stop(t + 0.15);
  }
  function rRiser() {
    const a = audio(); if (!a) return;
    const t = a.currentTime; const o = a.createOscillator(); const o2 = a.createOscillator(); const f = a.createBiquadFilter(); const g = a.createGain();
    o.type = 'sawtooth'; o2.type = 'square';
    o.frequency.setValueAtTime(130.81, t); o.frequency.exponentialRampToValueAtTime(523.25, t + 0.34);
    o2.frequency.setValueAtTime(131.5, t); o2.frequency.exponentialRampToValueAtTime(526, t + 0.34);
    f.type = 'lowpass'; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(4200, t + 0.34);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.035, t + 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    o.connect(f); o2.connect(f); f.connect(g).connect(out(a)); o.start(t); o2.start(t); o.stop(t + 0.45); o2.stop(t + 0.45);
  }
  function rKick() {
    const a = audio(); if (!a) return;
    const t = a.currentTime; const o = a.createOscillator(); const g = a.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.16);
    g.gain.setValueAtTime(0.11, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(out(a)); o.start(t); o.stop(t + 0.24);
  }
  // Volumen general (0–100). Por defecto bajo (35) para que no moleste.
  const VKEY = 'px.fun.volume';
  let vol = 0.35;
  try { const v = parseFloat(localStorage.getItem(VKEY)); if (Number.isFinite(v)) vol = Math.max(0, Math.min(1, v)); } catch {}
  let master = null;
  function out(a) {
    if (!master || master.context !== a) { master = a.createGain(); master.connect(a.destination); }
    master.gain.value = vol * vol * 2; // curva suave: 35% ≈ 0.25 (más bajo que antes), 100% = 2×
    return master;
  }
  function audio() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx.state === 'running' || ctx.state === 'suspended' ? ctx : null;
  }
  function tick() {
    if (retro()) return rTick();
    const a = audio(); if (!a) return;
    prev = core.pickIndex(prev, Math.random());
    const t = a.currentTime; const o = a.createOscillator(); const g = a.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(core.note(prev), t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.035, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(out(a)); o.start(t); o.stop(t + 0.18);
  }
  function whoosh() {
    if (retro()) return rRiser();
    const a = audio(); if (!a) return;
    const t = a.currentTime; const len = Math.floor(a.sampleRate * 0.5);
    const buf = a.createBuffer(1, len, a.sampleRate); const d = buf.getChannelData(0);
    let b = 0; for (let i = 0; i < len; i++) { b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = b * 3.5; } // ruido marrón
    const src = a.createBufferSource(); src.buffer = buf;
    const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(260, t); f.frequency.exponentialRampToValueAtTime(1400, t + 0.3);
    const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.48);
    src.connect(f).connect(g).connect(out(a)); src.start(t); src.stop(t + 0.5);
  }
  function thud() {
    if (retro()) return rKick();
    const a = audio(); if (!a) return;
    const t = a.currentTime; const o = a.createOscillator(); const g = a.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(110, t + 0.14);
    g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(out(a)); o.start(t); o.stop(t + 0.2);
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
    set(v) { on = !!v; try { localStorage.setItem(KEY, String(on)); } catch {} },
    get volume() { return vol; },
    setVolume(v) { vol = Math.max(0, Math.min(1, Number(v) || 0)); try { localStorage.setItem(VKEY, String(vol)); } catch {} if (master) master.gain.value = vol * vol * 2; }
  };
  const vr = document.getElementById('fun-volume');
  if (vr) { vr.value = String(Math.round(vol * 100)); vr.addEventListener('input', () => window.NovaSound.setVolume(vr.value / 100)); vr.addEventListener('change', () => { try { tick(); } catch {} }); }
  const box = document.getElementById('fun-sound');
  if (box) { box.checked = on; box.addEventListener('change', () => window.NovaSound.set(box.checked)); }
}());
