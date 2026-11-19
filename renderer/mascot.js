/* PX, la mascota con personalidad: reacciona a ti, te saluda, se duerme si no haces nada y comenta lo que pasa.
 * Nivel 1: reglas locales (sin red ni costo). Deja un gancho (setProvider) para conectar una IA más adelante. */
(function () {
  'use strict';
  const Brain = window.NovaMascotBrain;
  if (!Brain) return;
  const root = document.documentElement;
  const KEY = 'px.pet';
  const OPT = 'px.fun.pet';
  const flag = () => { try { const v = localStorage.getItem(OPT); return v === null ? true : v === '1'; } catch { return true; } };
  let on = flag();
  let mem = {};
  try { mem = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { mem = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch {} };
  const note = (ev, extra) => { mem = Brain.remember(mem, ev, extra, Date.now()); save(); };

  let userName = '';
  let provider = null; // (evento, contexto) => Promise<string|null>; para un posible nivel 2 con IA
  let lastSay = 0;
  let hideT = 0;
  let sleeping = false;
  let lastActive = Date.now();
  let playing = false, playStart = 0;
  let petCount = 0, petReset = 0;
  let greeted = false;
  let clickHook = null; // nivel 2: si devuelve true, el clic lo atiende el chat

  const bubble = document.createElement('div');
  bubble.id = 'pet-bubble';
  bubble.setAttribute('role', 'status');
  bubble.hidden = true;
  const hit = document.createElement('div');
  hit.id = 'pet-hit';
  hit.title = 'Pexy 🐼 — haz clic o pásale el cursor';
  hit.hidden = true;
  document.body.append(bubble, hit);

  const ctl = () => (window.NovaFun && window.NovaFun.petCtl) || null;
  const ex = (o) => Object.assign({ name: userName || 'amigo' }, o || {});

  function say(text, ms, force) {
    if (!on) return;
    const t = Brain.clean(text, 160);
    if (!t) return;
    const now = Date.now();
    if (!force && now - lastSay < 12000) return; // no ser pesado
    lastSay = now;
    bubble.textContent = t;
    bubble.hidden = false;
    place();
    clearTimeout(hideT);
    hideT = setTimeout(() => { if (!sleeping) bubble.hidden = true; }, ms || 5200);
  }

  function place() {
    const g = window.NovaFun && window.NovaFun.getPet && window.NovaFun.getPet();
    if (!on || !g) { hit.hidden = true; bubble.hidden = true; return; }
    hit.hidden = false;
    hit.style.left = Math.round(g.x - g.w / 2) + 'px';
    hit.style.top = Math.round(g.top) + 'px';
    hit.style.width = g.w + 'px';
    hit.style.height = g.h + 'px';
    if (!bubble.hidden) {
      const bw = bubble.offsetWidth || 160;
      const x = Math.min(window.innerWidth - bw - 8, Math.max(8, g.x - bw / 2));
      bubble.style.left = Math.round(x) + 'px';
      bubble.style.top = Math.round(Math.max(8, g.top - (bubble.offsetHeight || 40) - 8)) + 'px';
    }
  }
  setInterval(() => { if (!document.hidden) place(); }, 90);

  async function react(event, extra) {
    if (!on) return;
    let text = null;
    if (provider) { try { text = await provider(event, ex(extra)); } catch { text = null; } }
    if (!text) text = event === 'click' ? Brain.click(mem, ex(extra)) : Brain.line(event, mem, ex(extra));
    say(text, 5200, event === 'click' || event === 'pet');
  }

  function hop() { const c = ctl(); if (c) c.hop(); }
  function wakeUp(speak) {
    lastActive = Date.now();
    if (!sleeping) return;
    sleeping = false;
    const c = ctl(); if (c) c.sleep = false;
    hop();
    if (speak) say(Brain.wake(), 4500, true);
  }

  // Cualquier señal del usuario cuenta como estar activo.
  ['mousemove', 'keydown', 'mousedown', 'wheel'].forEach((e) => window.addEventListener(e, () => {
    if (sleeping) wakeUp(true); else lastActive = Date.now();
  }, { passive: true }));

  hit.addEventListener('click', () => { wakeUp(false); hop(); note('pet'); if (clickHook && clickHook()) return; react('click'); });
  hit.addEventListener('mouseenter', () => { petCount = 0; });
  hit.addEventListener('mousemove', () => {
    const now = Date.now();
    if (now - petReset > 1500) petCount = 0;
    petReset = now;
    petCount += 1;
    if (petCount === 18) { note('pet'); const c = ctl(); if (c) c.happy(2.4); say(Brain.pet(Math.floor(mem.pets % 8), mem, ex()), 4200, true); }
  });

  // Charla ocasional + sueño. Un solo reloj ligero.
  setInterval(() => {
    if (!on || document.hidden || root.classList.contains('no-fx')) return;
    const idle = Date.now() - lastActive;
    if (!sleeping && !playing && Brain.shouldSleep(idle, 90000)) {
      sleeping = true;
      const c = ctl(); if (c) c.sleep = true;
      bubble.textContent = Brain.sleepLine();
      bubble.hidden = false;
      clearTimeout(hideT);
      return;
    }
    if (!sleeping && !playing && idle > 20000 && Date.now() - lastSay > 75000 && Math.random() < 0.35) say(Brain.tip(), 6500);
  }, 5000);

  /* ---------- API ---------- */
  function notify(type, data) {
    if (!on) return;
    if (type === 'session') {
      const first = !userName;
      userName = Brain.clean((data && data.name) || '', 24);
      if (first && userName && !greeted) { greeted = true; setTimeout(() => { say(Brain.greeting(mem, Date.now(), ex()), 6000, true); note('visit'); }, 1800); }
      return;
    }
    if (type === 'game-start') { playing = true; playStart = Date.now(); react('game-start'); return; }
    if (type === 'game-end') {
      const minutes = playStart ? Math.round((Date.now() - playStart) / 60000) : 0;
      playing = false; playStart = 0;
      note('game-end', { code: data && data.code, minutes });
      react('game-end', { code: data && data.code, minutes });
      return;
    }
    if (type === 'pack-done') { react('pack-done'); const c = ctl(); if (c) c.happy(2); return; }
    if (type === 'theme') { react('theme'); return; }
  }

  function setEnabled(v) {
    on = !!v;
    try { localStorage.setItem(OPT, on ? '1' : '0'); } catch {}
    if (!on) { bubble.hidden = true; hit.hidden = true; wakeUp(false); }
  }
  const box = document.getElementById('fun-pet');
  if (box) { box.checked = on; box.addEventListener('change', () => setEnabled(box.checked)); }

  // Si no hubo sesión (aún sin cuenta), saluda igualmente pasado un momento.
  setTimeout(() => { if (!greeted && on) { greeted = true; say(Brain.greeting(mem, Date.now(), ex()), 6000, true); note('visit'); } }, 9000);

  window.NovaMascot = { onClick: (fn) => { clickHook = typeof fn === 'function' ? fn : null; }, name: () => userName, say: (t, ms) => say(t, ms, true), notify, setProvider: (fn) => { provider = typeof fn === 'function' ? fn : null; }, setEnabled, memory: () => Object.assign({}, mem) };
})();
