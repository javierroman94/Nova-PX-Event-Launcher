/* Pantalla de carga y panel de juego (al estilo de Mission Control de Lunar).
   Fase 1 «loading»: fondo borroso, icono, estado y barra de progreso mientras se prepara el juego.
   Fase 2 «running»: consola en vivo, datos de la instancia y promos propias mientras Minecraft está abierto.
   app.js le avisa con NovaLaunchPanel.open/status/progress/log/close; la ventana se oculta con «Ocultar»
   y se vuelve a abrir desde el aviso «Jugando ahora» de Inicio. */
(function () {
  const KEY = 'novaLaunchPanelAuto';
  const TIPS = [
    'Pulsa Shift derecho dentro del juego para abrir el menú de Nova Client.',
    'Cada perfil tiene su propia carpeta: tus mundos y mods no se mezclan.',
    'Puedes ajustar la RAM de cada perfil desde sus opciones.',
    'Si algo falla, el panel de Consola guarda el registro completo.',
    'Cambia el tema del launcher en Ajustes: hay uno para cada estilo.'
  ];
  let root = null;
  let state = { open: false, hidden: false, phase: 'loading', lines: 0, startedAt: 0, timer: 0, tipTimer: 0 };
  const $$ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const ctx = () => (window.__novaGameCtx ? window.__novaGameCtx() : { target: null, packs: [], links: [], event: {} });
  const auto = () => { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } };

  function build() {
    if (root) return;
    root = el('div', 'lpanel');
    root.id = 'lpanel';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Panel de juego');
    root.innerHTML = `
      <div class="lp-bg" id="lpn-bg"></div>
      <div class="lp-shade"></div>
      <div class="lp-load" id="lpn-load">
        <img id="lpn-icon" class="lp-load-icon" alt="" />
        <div class="lp-load-title" id="lpn-title"></div>
        <div class="lp-load-status" id="lpn-status">Preparando…</div>
        <div class="lp-bar" id="lpn-bar"><i id="lpn-fill"></i></div>
        <div class="lp-tip" id="lpn-tip"></div>
        <button type="button" class="ghost lp-hide-load" id="lpn-hide-load">Ocultar</button>
      </div>
      <div class="lp-run" id="lpn-run" hidden>
        <header class="lp-run-top">
          <div class="lp-run-crumb"><span class="live-dot"></span><b id="lpn-run-title"></b><span class="muted" id="lpn-run-state">Minecraft en ejecución</span></div>
          <div class="lp-run-actions">
            <button type="button" class="ghost" id="lpn-follow" aria-pressed="true">Seguir el final</button>
            <button type="button" class="ghost" id="lpn-console">Abrir consola</button>
            <button type="button" id="lpn-hide">Ocultar</button>
          </div>
        </header>
        <div class="lp-run-body">
          <div class="lp-log" id="lpn-log" tabindex="0" aria-live="off"></div>
          <aside class="lp-side">
            <div class="lp-card lp-inst">
              <img id="lpn-inst-img" alt="" />
              <div class="lp-inst-body"><strong id="lpn-inst-title"></strong><span class="muted" id="lpn-inst-sub"></span></div>
            </div>
            <dl class="lp-facts" id="lpn-facts"></dl>
            <div class="lp-promos" id="lpn-promos"></div>
            <label class="lp-auto"><input type="checkbox" id="lpn-auto" /> Abrir este panel al jugar</label>
          </aside>
        </div>
      </div>`;
    document.body.append(root);
    $$('lpn-hide').addEventListener('click', hide);
    root.addEventListener('mousedown', (e) => { if (state.phase === 'running' && e.target.classList.contains('lp-shade')) hide(); }); // clic fuera de la ventana = ocultar
    $$('lpn-hide-load').addEventListener('click', hide);
    $$('lpn-console').addEventListener('click', () => { hide(); if (window.goTo) window.goTo('console'); });
    $$('lpn-follow').addEventListener('click', (e) => { const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', String(on)); if (on) scrollEnd(); });
    $$('lpn-auto').checked = auto();
    $$('lpn-auto').addEventListener('change', (e) => { try { localStorage.setItem(KEY, e.target.checked ? '1' : '0'); } catch {} });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.open && !state.hidden) hide(); });
  }

  function scrollEnd() { const b = $$('lpn-log'); if (b && $$('lpn-follow').getAttribute('aria-pressed') === 'true') b.scrollTop = b.scrollHeight; }
  function hide() { state.hidden = true; if (root) root.hidden = true; }
  function show() { build(); state.hidden = false; root.hidden = false; }

  function setPhase(phase) {
    state.phase = phase;
    $$('lpn-load').hidden = phase !== 'loading';
    $$('lpn-run').hidden = phase !== 'running';
    root.classList.toggle('is-running', phase === 'running');
    if (phase === 'running') { fillInfo(); scrollEnd(); }
  }

  function fillInfo() {
    const c = ctx();
    const t = c.target || state.target || {};
    const pack = (c.packs || []).find((p) => p.title === t.title) || null;
    $$('lpn-run-title').textContent = t.title || 'Minecraft';
    $$('lpn-inst-title').textContent = t.title || 'Minecraft';
    $$('lpn-inst-img').src = t.icon || 'images/logo.png';
    const loader = pack && pack.loader && pack.loader.type ? (({ fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge', quilt: 'Quilt', vanilla: 'Vanilla' })[pack.loader.type] || pack.loader.type) : '';
    $$('lpn-inst-sub').textContent = pack ? `${loader} · Minecraft ${pack.mcVersion}` : (t.kind === 'event' ? 'Evento actual' : '');
    const facts = $$('lpn-facts');
    facts.replaceChildren();
    const add = (k, v) => { if (v == null || v === '') return; facts.append(el('dt', null, k), el('dd', null, String(v))); };
    add('Minecraft', pack ? pack.mcVersion : '');
    add('Loader', loader);
    add('Jugando desde', new Date(state.startedAt || Date.now()).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }));
    const dur = el('dd', null, '0:00');
    dur.id = 'lpn-time';
    facts.append(el('dt', null, 'Tiempo de sesión'), dur);
    const lc = el('dd', null, String(state.lines));
    lc.id = 'lpn-lines';
    facts.append(el('dt', null, 'Líneas de registro'), lc);
    paintPromos(c);
  }

  function paintPromos(c) {
    const box = $$('lpn-promos');
    box.replaceChildren();
    const card = (title, text, onClick) => {
      const b = el('button', 'lp-card lp-promo');
      b.type = 'button';
      b.append(el('strong', null, title), el('span', 'muted', text));
      b.addEventListener('click', onClick);
      return b;
    };
    const links = (c.links || []);
    const discord = links.find((l) => /discord/i.test(`${l.url} ${l.name || ''}`));
    if (discord) box.append(card('Únete al Discord', 'Conoce a la comunidad Nova PX y entérate de todo.', () => window.api.openLink(discord.url)));
    const ev = c.event || {};
    if (ev.name) box.append(card(ev.name, 'Mira el evento y sus novedades en el launcher.', () => { hide(); if (window.goTo) window.goTo('event'); }));
    if (typeof isAdmin !== 'undefined' && isAdmin) box.append(card('Novedades de Nova PX', 'Lo nuevo de cada versión del launcher.', () => { hide(); if (window.goTo) window.goTo('whatsnew'); }));
  }

  function tickTime() {
    const t = $$('lpn-time');
    if (!t || !state.startedAt) return;
    const s = Math.max(0, Math.round((Date.now() - state.startedAt) / 1000));
    t.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    const lc = $$('lpn-lines');
    if (lc) lc.textContent = String(state.lines);
  }

  const api = {
    open(target) {
      build();
      state.open = true;
      state.lines = 0;
      state.startedAt = Date.now();
      state.target = target || null;
      $$('lpn-log').replaceChildren();
      const t = target || {};
      $$('lpn-title').textContent = t.title || 'Minecraft';
      const icon = t.icon || 'images/logo.png';
      $$('lpn-icon').src = icon;
      $$('lpn-bg').style.backgroundImage = `url("${String(icon).replace(/"/g, '%22')}")`;
      $$('lpn-status').textContent = 'Preparando…';
      $$('lpn-bar').classList.add('indeterminate');
      $$('lpn-fill').style.width = '0%';
      let i = Math.floor(Math.random() * TIPS.length);
      $$('lpn-tip').textContent = `Consejo: ${TIPS[i]}`;
      clearInterval(state.tipTimer);
      state.tipTimer = setInterval(() => { i = (i + 1) % TIPS.length; $$('lpn-tip').textContent = `Consejo: ${TIPS[i]}`; }, 6000);
      clearInterval(state.timer);
      state.timer = setInterval(tickTime, 1000);
      setPhase('loading');
      if (auto()) show(); else { state.hidden = true; root.hidden = true; }
    },
    // Si el launcher se abre con el juego ya en marcha, se pasa directo al panel.
    resume(target, hasLog) {
      api.open(target);
      if (hasLog) { $$('lpn-bar').classList.remove('indeterminate'); setPhase('running'); }
    },
    status(text) {
      if (!state.open || !root) return;
      if (state.phase === 'loading') $$('lpn-status').textContent = text;
    },
    progress(task, total, text) {
      if (!state.open || !root || state.phase !== 'loading') return;
      const bar = $$('lpn-bar');
      bar.classList.remove('indeterminate');
      $$('lpn-fill').style.width = `${Math.max(2, Math.min(100, Math.round((task / total) * 100)))}%`;
      if (text) $$('lpn-status').textContent = text;
    },
    log(line, source) {
      if (!state.open || !root) return;
      state.lines++;
      if (source === 'minecraft' && state.phase === 'loading') {
        $$('lpn-status').textContent = 'Iniciando Minecraft…';
        $$('lpn-fill').style.width = '100%';
        $$('lpn-bar').classList.remove('indeterminate');
        setPhase('running');
      }
      const box = $$('lpn-log');
      const row = el('div', /\b(ERROR|FATAL|Exception)\b/.test(line) ? 'lp-line err' : /\bWARN/.test(line) ? 'lp-line warn' : 'lp-line', line);
      box.append(row);
      while (box.childNodes.length > 400) box.removeChild(box.firstChild);
      scrollEnd();
    },
    reopen() { if (state.open) show(); },
    isOpen: () => state.open,
    close() {
      state.open = false;
      clearInterval(state.timer);
      clearInterval(state.tipTimer);
      if (root) root.hidden = true;
    }
  };
  window.NovaLaunchPanel = api;
})();
