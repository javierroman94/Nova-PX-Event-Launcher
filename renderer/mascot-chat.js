/* PX nivel 2: chat con IA, bromas, memoria y ayuda con errores. Es opcional (Ajustes → Apariencia) y siempre tiene respaldo:
 * sin internet, sin cupo o con la opción apagada, PX sigue hablando con sus reglas locales. */
(function () {
  'use strict';
  const M = window.NovaMascot, Brain = window.NovaMascotBrain;
  if (!M || !Brain || !window.api || !window.api.petChat) return;
  const AI = 'px.pet.ai', FACTS = 'px.pet.facts', IDK = 'px.pet.id';
  const get = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } };
  const put = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

  let want = get(AI, '0') === '1';
  let allowed = false; // la IA de PX es solo para administradores
  let on = false;
  const refreshOn = () => { on = want && allowed; };
  let facts = [];
  try { facts = JSON.parse(get(FACTS, '[]')) || []; } catch { facts = []; }
  facts = Brain.addFacts([], facts, 30);
  const saveFacts = () => put(FACTS, JSON.stringify(facts));
  let id = get(IDK, '');
  if (!/^[0-9a-f-]{36}$/.test(id)) { id = (crypto.randomUUID && crypto.randomUUID()) || '00000000-0000-4000-8000-' + String(Date.now()).padStart(12, '0'); put(IDK, id); }

  let logProvider = null, lastCrash = false;
  let history = [];            // solo en memoria: se pierde al cerrar el launcher
  let left = null, busy = false, lastReact = 0, cooldownUntil = 0;

  /* ---------- llamada al Worker ---------- */
  async function ask(mode, messages, log) {
    const mem = M.memory ? M.memory() : {};
    const r = await window.api.petChat({ id, mode, messages, memory: Brain.memoryString(mem, facts, M.name()), log: log || '' });
    const st = r && r.status, d = r && r.data;
    if (st === 200 && d && d.text) {
      if (typeof d.left === 'number') left = d.left;
      if (Array.isArray(d.remember)) { facts = Brain.addFacts(facts, d.remember, 30); saveFacts(); }
      return { text: Brain.clean(d.text, 900) };
    }
    if (st === 429) { cooldownUntil = Date.now() + 5 * 60000; left = 0; return { limit: true }; }
    if (st === 422) return { secret: true };
    return { off: true };
  }

  /* ---------- reacciones a eventos del launcher (con respaldo de reglas) ---------- */
  const EVT = {
    'game-start': (c) => `Acabo de abrir Minecraft${c.name ? ' (me llamo ' + c.name + ')' : ''}. Despídeme con una broma.`,
    'game-end': (c) => (c.code ? `Minecraft se cerró con error (código ${c.code}) tras ${c.minutes || 0} minutos. Reacciona con ánimo y una broma suave; dime que puedo pedirte que revises el error.` : `Cerré Minecraft tras ${c.minutes || 0} minutos de juego. Reacciona con una broma.`),
    'pack-done': () => 'Acabo de terminar de instalar un modpack. Reacciona con una broma.',
    'theme': () => 'Acabo de cambiar el tema del launcher. Reacciona con una broma.'
  };
  M.setProvider(async (event, c) => {
    if (!on || !EVT[event] || Date.now() < cooldownUntil || busy) return null;
    const crash = event === 'game-end' && c && c.code;
    if (!crash && Date.now() - lastReact < 150000) return null;
    lastReact = Date.now();
    if (event === 'game-end') lastCrash = !!crash;
    try { const r = await ask('react', [{ role: 'user', content: EVT[event](c || {}) }]); return r.text || null; } catch { return null; }
  });

  /* ---------- ventana de chat ---------- */
  const panel = document.createElement('div');
  panel.id = 'pet-chat';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Chat con PX');
  panel.innerHTML = '<div class="pc-head"><b>PX 🐼</b><small class="pc-left"></small><button type="button" class="ghost pc-x" aria-label="Cerrar">✕</button></div>' +
    '<div class="pc-log" role="log" aria-live="polite"></div>' +
    '<div class="pc-tools"><button type="button" class="ghost pc-help" hidden>🔧 Revisar mi último error</button><button type="button" class="ghost pc-forget">🧹 Olvidar todo</button></div>' +
    '<form class="pc-form"><input type="text" maxlength="300" autocomplete="off" placeholder="Escríbele a PX…" aria-label="Mensaje para PX" /><button type="submit" class="primary">Enviar</button></form>';
  document.body.appendChild(panel);
  const logEl = panel.querySelector('.pc-log'), input = panel.querySelector('input'), leftEl = panel.querySelector('.pc-left');
  const helpBtn = panel.querySelector('.pc-help');

  function line(who, text) {
    const d = document.createElement('div');
    d.className = 'pc-msg ' + who;
    d.textContent = text;           // siempre texto, nunca HTML
    logEl.appendChild(d);
    logEl.scrollTop = logEl.scrollHeight;
    return d;
  }
  function paintLeft() { leftEl.textContent = left == null ? '' : `Te quedan ${left} mensajes hoy`; }
  function open() {
    panel.hidden = false;
    helpBtn.hidden = !lastCrash;
    if (!logEl.children.length) line('px', facts.length ? '¡Ey, volviste! ¿De qué hablamos hoy?' : '¡Hola! Soy PX 🐼. Pregúntame lo que quieras de Minecraft o del launcher… o pídeme un chiste.');
    paintLeft();
    setTimeout(() => input.focus(), 50);
  }
  const close = () => { panel.hidden = true; };
  panel.querySelector('.pc-x').addEventListener('click', close);
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  async function send(text, mode, log) {
    if (busy) return;
    const t = Brain.clean(text, 300);
    if (!t) return;
    if (Brain.looksSecret(t)) { line('px', 'Eso parece una clave o un dato personal. ¡No lo compartas con nadie, ni conmigo! 🔒'); return; }
    if (Date.now() < cooldownUntil) { line('px', 'Hoy ya hablamos mucho, ¡mañana seguimos! Mientras, sigo con mis reglas de siempre. 🐼'); return; }
    line('me', mode === 'help' ? '🔧 Revisa mi último error' : t);
    history.push({ role: 'user', content: t });
    history = history.slice(-8);
    busy = true;
    const wait = line('px', 'PX está pensando…');
    try {
      const r = await ask(mode, history, log);
      wait.remove();
      if (r.text) { line('px', r.text); history.push({ role: 'assistant', content: r.text }); history = history.slice(-8); }
      else if (r.limit) line('px', 'Ya gastamos todos mis mensajes de hoy. ¡Mañana volvemos con más chistes! 🌙');
      else if (r.secret) line('px', 'Mejor no compartas claves ni datos personales. 🔒');
      else line('px', 'Uf, no logro conectarme ahora. Revisa tu internet y prueba de nuevo. 📡');
    } catch { wait.remove(); line('px', 'Algo falló, intenta otra vez.'); }
    busy = false;
    paintLeft();
  }
  panel.querySelector('.pc-form').addEventListener('submit', (e) => { e.preventDefault(); const v = input.value; input.value = ''; send(v, 'chat'); });
  helpBtn.addEventListener('click', () => {
    const lines = logProvider ? logProvider() : [];
    const log = Brain.redactLog(lines, 1700);
    if (!log) { line('px', 'No tengo ningún registro reciente para revisar.'); return; }
    send('Mira el final del registro de mi último error y dime qué pasó y cómo arreglarlo.', 'help', log);
  });
  panel.querySelector('.pc-forget').addEventListener('click', () => {
    facts = []; saveFacts(); history = []; logEl.replaceChildren();
    line('px', '¡Listo! Olvidé todo lo que sabía de ti (lo que aprendí y esta charla). Empezamos de cero. 🧽');
  });

  /* ---------- enganches ---------- */
  M.onClick(() => { if (!on) return false; if (panel.hidden) open(); else close(); return true; });
  M.setLogProvider = (fn) => { logProvider = typeof fn === 'function' ? fn : null; };
  const origNotify = M.notify;
  M.notify = (type, data) => { if (type === 'game-end') { lastCrash = !!(data && data.code); helpBtn.hidden = !lastCrash; } return origNotify(type, data); };
  M.forget = () => { facts = []; saveFacts(); };

  const box = document.getElementById('fun-pet-ai');
  if (box) {
    box.checked = want;
    box.addEventListener('change', () => { want = box.checked; put(AI, want ? '1' : '0'); refreshOn(); if (!on) close(); });
  }
  const aiRows = () => ['fun-pet-ai-row', 'fun-pet-ai-note'].map((i) => document.getElementById(i)).filter(Boolean);
  // La llama app.js cuando cambia el modo administrador.
  M.setAiAllowed = (v) => { allowed = !!v; refreshOn(); aiRows().forEach((e) => { e.hidden = !allowed; }); if (!on) close(); };
  M.setAiAllowed(false);
})();
