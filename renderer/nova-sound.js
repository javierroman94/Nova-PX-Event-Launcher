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
  // Sonidos de eventos (notas en Hz, en el orden en que suenan). Todos son melodías originales, sintetizadas aquí.
  const EVENTS = {
    ok: [659.25, 987.77],
    info: [880, 1318.51],
    error: [293.66, 220],
    startup: { default: [523.25, 659.25, 783.99], xp: [392, 493.88, 587.33, 739.99, 987.77], win7: [329.63, 493.88, 659.25, 830.61, 987.77, 1318.51] }
  };
  return { SCALE, EVENTS, note, pickIndex };
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
  // Perfiles de sonido por tema (los de Eclipse y Vice Sunset tienen su propio sonido de arriba).
  // wave: forma de onda · notes: notas del "tic" (Hz) · dur: duración · dec: caída del filtro · riser: [inicio, fin] del susurro · kick: [inicio, fin] del golpe
  const PROFILES = {
    nether:    { wave: 'sawtooth', notes: [98, 110, 123.47, 146.83, 164.81], dur: 0.2, filt: 900, gain: 0.03, riser: [70, 220], kick: [120, 36] },
    end:       { wave: 'triangle', notes: [523.25, 659.25, 783.99, 987.77, 1174.66], dur: 0.28, filt: 6000, gain: 0.028, riser: [260, 1500], kick: [200, 80] },
    sakura:    { wave: 'sine', notes: [659.25, 739.99, 880, 987.77, 1108.73], dur: 0.32, filt: 7000, gain: 0.03, riser: [320, 1700], kick: [260, 120] },
    cyberpunk: { wave: 'square', notes: [220, 261.63, 329.63, 392, 440], dur: 0.1, filt: 2600, gain: 0.02, riser: [110, 880], kick: [150, 45] },
    synthwave: { wave: 'sawtooth', notes: [349.23, 415.3, 466.16, 523.25, 622.25], dur: 0.14, filt: 3000, gain: 0.026, riser: [130, 700], kick: [160, 46] }
  };
  const PROF = new Set(Object.keys(PROFILES));
  const profile = () => PROFILES[document.documentElement.dataset.theme] || null;
  function pTick(p) {
    const a = audio(); if (!a) return;
    prev = core.pickIndex(prev, Math.random());
    const t = a.currentTime; const o = a.createOscillator(); const f = a.createBiquadFilter(); const g = a.createGain();
    o.type = p.wave; o.frequency.setValueAtTime(p.notes[prev % p.notes.length], t);
    f.type = 'lowpass'; f.frequency.setValueAtTime(p.filt, t); f.frequency.exponentialRampToValueAtTime(Math.max(200, p.filt / 5), t + p.dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(p.gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + p.dur);
    o.connect(f).connect(g).connect(out(a)); o.start(t); o.stop(t + p.dur + 0.03);
  }
  function pRiser(p) {
    const a = audio(); if (!a) return;
    const t = a.currentTime; const o = a.createOscillator(); const g = a.createGain();
    o.type = p.wave === 'square' ? 'square' : 'sine'; o.frequency.setValueAtTime(p.riser[0], t); o.frequency.exponentialRampToValueAtTime(p.riser[1], t + 0.34);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(p.gain * 1.2, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    o.connect(g).connect(out(a)); o.start(t); o.stop(t + 0.45);
  }
  function pKick(p) {
    const a = audio(); if (!a) return;
    const t = a.currentTime; const o = a.createOscillator(); const g = a.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(p.kick[0], t); o.frequency.exponentialRampToValueAtTime(p.kick[1], t + 0.15);
    g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(out(a)); o.start(t); o.stop(t + 0.22);
  }
  const themeId = () => { const t = document.documentElement.dataset.theme; return (t === 'eclipse' || t === 'vicesunset' || t === 'xp' || t === 'win7' || PROF.has(t)) && !document.documentElement.classList.contains('no-fx') ? t : ''; };
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
  // ---- Sonidos clásicos (Windows XP y Windows 7 Aero): originales, sintetizados; recuerdan al estilo de la época sin copiar los de Microsoft ----
  const classic = () => { const t = document.documentElement.dataset.theme; return t === 'xp' || t === 'win7'; };
  function noiseBurst(a, t, dur, f0, q, gain) {
    const len = Math.max(1, Math.floor(a.sampleRate * dur));
    const buf = a.createBuffer(1, len, a.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.createBufferSource(); src.buffer = buf;
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = f0; f.Q.value = q;
    const g = a.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out(a)); src.start(t); src.stop(t + dur + 0.01);
  }
  // Campana de cristal: seno + parcial inarmónico que cae más rápido (suena a vidrio/metal fino).
  function bell(a, freq, t, dur, gain) {
    const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const o1 = a.createOscillator(); o1.type = 'sine'; o1.frequency.setValueAtTime(freq, t);
    const o2 = a.createOscillator(); o2.type = 'sine'; o2.frequency.setValueAtTime(freq * 2.76, t);
    const g2 = a.createGain(); g2.gain.setValueAtTime(gain * 0.35, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.45);
    o1.connect(g); o2.connect(g2).connect(g); g.connect(out(a));
    o1.start(t); o2.start(t); o1.stop(t + dur + 0.05); o2.stop(t + dur * 0.5 + 0.05);
  }
  function pad(a, freq, t, dur, gain) {
    const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(1800, t); f.frequency.exponentialRampToValueAtTime(5200, t + dur * 0.5);
    for (const det of [-5, 5]) { const o = a.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(freq, t); o.detune.value = det; o.connect(f); o.start(t); o.stop(t + dur + 0.05); }
    f.connect(g).connect(out(a));
  }
  const cTick = () => { const a = audio(); if (!a) return; noiseBurst(a, a.currentTime, 0.012, 4200, 1.2, 0.05); };
  const cClick = () => { const a = audio(); if (!a) return; const t = a.currentTime; noiseBurst(a, t, 0.03, 2200, 0.9, 0.14); const o = a.createOscillator(); const g = a.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(1100, t); o.frequency.exponentialRampToValueAtTime(700, t + 0.04); g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06); o.connect(g).connect(out(a)); o.start(t); o.stop(t + 0.08); };
  const cSwoosh = () => { const a = audio(); if (!a) return; const t = a.currentTime; noiseBurst(a, t, 0.16, 1800, 0.6, 0.06); };

  // Sonidos de eventos para todos los temas (suaves): confirmar, avisar, error y bienvenida. El tema clásico usa su propio timbre.
  function playEvent(name) {
    if (!on || document.documentElement.classList.contains('no-fx')) return;
    const a = audio(); if (!a) return;
    const t = a.currentTime; const cl = document.documentElement.dataset.theme;
    const ev = core.EVENTS;
    if (name === 'ok') { ev.ok.forEach((f, i) => bell(a, f, t + i * 0.09, 0.55, 0.05)); }
    else if (name === 'info') { ev.info.forEach((f, i) => bell(a, f, t + i * 0.11, 0.5, 0.04)); }
    else if (name === 'error') {
      ev.error.forEach((f, i) => {
        const o = a.createOscillator(); const g = a.createGain(); const lp = a.createBiquadFilter();
        o.type = 'triangle'; o.frequency.setValueAtTime(f, t + i * 0.16); lp.type = 'lowpass'; lp.frequency.value = 1400;
        g.gain.setValueAtTime(0.0001, t + i * 0.16); g.gain.exponentialRampToValueAtTime(0.07, t + i * 0.16 + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.16 + 0.2);
        o.connect(lp).connect(g).connect(out(a)); o.start(t + i * 0.16); o.stop(t + i * 0.16 + 0.24);
      });
    } else if (name === 'startup') {
      const notes = ev.startup[cl] || ev.startup.default;
      if (cl === 'xp') { notes.forEach((f, i) => bell(a, f, t + i * 0.16, 1.1, 0.045)); pad(a, notes[0] / 2, t, 1.8, 0.04); pad(a, notes[2] / 2, t + 0.1, 1.7, 0.03); }
      else if (cl === 'win7') { notes.forEach((f, i) => bell(a, f, t + i * 0.11, 1.4, 0.04)); pad(a, notes[0] / 2, t, 2.2, 0.05); pad(a, notes[3] / 2, t + 0.2, 2, 0.035); }
      else notes.forEach((f, i) => bell(a, f, t + i * 0.12, 0.8, 0.04));
    }
  }
  // Volumen general (0–100). Por defecto bajo (35) para que no moleste.
  const VKEY = 'px.fun.volume';
  let vol = 0.35;
  try { const v = parseFloat(localStorage.getItem(VKEY)); if (Number.isFinite(v)) vol = Math.max(0, Math.min(1, v)); } catch {}
  let master = null;
  function out(a) {
    if (!master || master.context !== a) {
      // Bus maestro: compresor (evita saturar al sumarse varios sonidos) + eco corto y filtrado que da cuerpo a las campanas.
      master = a.createGain();
      const comp = a.createDynamicsCompressor();
      comp.threshold.value = -20; comp.knee.value = 24; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
      master.connect(comp); comp.connect(a.destination);
      const dl = a.createDelay(); dl.delayTime.value = 0.085;
      const fb = a.createGain(); fb.gain.value = 0.3;
      const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
      const wet = a.createGain(); wet.gain.value = 0.2;
      master.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(wet); wet.connect(comp);
    }
    master.gain.value = vol * vol * 2; // curva suave: 35% ≈ 0.25 (más bajo que antes), 100% = 2×
    return master;
  }
  function audio() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx.state === 'running' || ctx.state === 'suspended' ? ctx : null;
  }
  function tick() {
    if (classic()) return cTick();
    if (retro()) return rTick();
    { const pr = profile(); if (pr) return pTick(pr); }
    const a = audio(); if (!a) return;
    prev = core.pickIndex(prev, Math.random());
    const t = a.currentTime; const o = a.createOscillator(); const g = a.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(core.note(prev), t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.035, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(out(a)); o.start(t); o.stop(t + 0.18);
  }
  function whoosh() {
    if (classic()) return cSwoosh();
    if (retro()) return rRiser();
    { const pr = profile(); if (pr) return pRiser(pr); }
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
    if (classic()) return cClick();
    if (retro()) return rKick();
    { const pr = profile(); if (pr) return pKick(pr); }
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
    event: playEvent,
    get enabled() { return on; },
    set(v) { on = !!v; try { localStorage.setItem(KEY, String(on)); } catch {} },
    get volume() { return vol; },
    setVolume(v) { vol = Math.max(0, Math.min(1, Number(v) || 0)); try { localStorage.setItem(VKEY, String(vol)); } catch {} if (master) master.gain.value = vol * vol * 2; }
  };
  // Bienvenida al abrir (solo temas clásicos) y al elegirlos en Ajustes.
  setTimeout(() => { if (classic()) playEvent('startup'); }, 900);
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-theme-value]'); if (b && (b.dataset.themeValue === 'xp' || b.dataset.themeValue === 'win7')) setTimeout(() => playEvent('startup'), 120); }, true);
  const vr = document.getElementById('fun-volume');
  if (vr) { vr.value = String(Math.round(vol * 100)); vr.addEventListener('input', () => window.NovaSound.setVolume(vr.value / 100)); vr.addEventListener('change', () => { try { tick(); } catch {} }); }
  const box = document.getElementById('fun-sound');
  if (box) { box.checked = on; box.addEventListener('change', () => window.NovaSound.set(box.checked)); }
}());
