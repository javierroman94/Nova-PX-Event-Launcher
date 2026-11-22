/* Novedades y soporte: muestra el historial de cambios del launcher, avisa de lo nuevo tras actualizar
 * y reúne los accesos de ayuda. Usa $, el, toast, cleanError y askConfirm de app.js solo cuando se llama. */
(function () {
  const g = (id) => document.getElementById(id);
  const DISCORD = 'https://discord.gg/VAfuFEQtjv';
  const GUIDE = 'https://github.com/javierroman94/Nova-PX-Event-Launcher/blob/main/docs/REPORTAR-ERRORES.md';
  const SEEN_KEY = 'px.seenVersion';
  let cache = null;

  const ver = (v) => String(v).split('.').map((n) => parseInt(n, 10) || 0);
  const newer = (a, b) => { const x = ver(a), y = ver(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };

  // "## 1.0.105 – Título" + líneas "- texto con **negrita**" -> [{ version, title, items:[texto] }]
  function parse(md) {
    const out = [];
    let cur = null;
    for (const raw of String(md || '').split(/\r?\n/)) {
      const h = /^##\s+(\d+\.\d+\.\d+)\s*(?:[–—-]\s*(.*))?$/.exec(raw);
      if (h) { cur = { version: h[1], title: (h[2] || '').trim(), items: [] }; out.push(cur); continue; }
      if (!cur) continue;
      const b = /^\s*[-*]\s+(.*)$/.exec(raw);
      if (b) cur.items.push(b[1]);
      else if (raw.trim() && cur.items.length) cur.items[cur.items.length - 1] += ' ' + raw.trim();
    }
    return out;
  }
  window.parseChangelog = parse;

  // Texto con **negrita** y `código` sin usar innerHTML.
  function richText(parent, text) {
    String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g).forEach((part) => {
      if (!part) return;
      if (part.startsWith('**')) { const b = document.createElement('b'); b.textContent = part.slice(2, -2); parent.append(b); }
      else if (part.startsWith('`')) { const c = document.createElement('code'); c.textContent = part.slice(1, -1); parent.append(c); }
      else parent.append(document.createTextNode(part));
    });
  }

  // Etiqueta de cada punto: arreglo o novedad (se adivina por las palabras del texto).
  const isFix = (t) => /\b(error|arregl|ya no|ya se|salían|salia|antes |congel|fallaba|corrig)/i.test(t);
  function renderEntry(e, withTitle, opts = {}) {
    const box = el('article', 'news-item wn-entry');
    const head = el('div', 'wn-entry-head');
    head.append(el('span', 'wn-badge', `v${e.version}`));
    if (opts.current) head.append(el('span', 'wn-now', 'Tu versión'));
    if (withTitle && e.title) head.append(el('span', 'wn-entry-title', e.title));
    box.append(head);
    const ul = document.createElement('ul');
    ul.className = 'wn-items';
    e.items.forEach((t) => {
      const li = document.createElement('li');
      const fix = isFix(String(t).split(':')[0]);
      li.append(el('span', fix ? 'wn-tag wn-tag-fix' : 'wn-tag wn-tag-new', fix ? 'Arreglo' : 'Nuevo'));
      const txt = document.createElement('span'); txt.className = 'wn-li-text'; richText(txt, t); li.append(txt);
      ul.append(li);
    });
    if (!e.items.length && e.title && !withTitle) box.append(el('p', '', e.title));
    box.append(ul);
    return box;
  }

  async function load() {
    if (cache) return cache;
    try { cache = parse(await window.api.getChangelog()); } catch { cache = []; }
    return cache;
  }

  async function show() {
    const list = g('wn-list');
    list.textContent = '';
    const entries = await load();
    let version = '';
    try {
      const cfg = await window.api.getConfig();
      version = cfg.version;
      const sys = await window.api.systemInfo().catch(() => null);
      g('wn-ver-num').textContent = `v${cfg.version}`;
      g('wn-info').textContent = sys && sys.platform ? sys.platform : '';
    } catch {}
    if (!entries.length) list.append(el('p', 'muted', 'No pude cargar el historial de cambios.'));
    entries.slice(0, 25).forEach((e, i) => {
      const card = renderEntry(e, true, { current: e.version === version });
      // Las 3 más recientes salen abiertas; las demás se despliegan al pulsar.
      if (i < 3) { list.append(card); return; }
      const d = document.createElement('details'); d.className = 'wn-old';
      const sm = document.createElement('summary'); sm.append(el('span', 'wn-badge', `v${e.version}`), el('span', 'wn-old-count', `${e.items.length} cambio${e.items.length === 1 ? '' : 's'}`));
      d.append(sm, card);
      list.append(d);
    });
  }
  window.whatsnewShow = show;

  g('wn-discord').addEventListener('click', () => window.api.openLink(DISCORD).catch((e) => toast(cleanError(e))));
  g('wn-guide').addEventListener('click', () => window.api.openLink(GUIDE).catch((e) => toast(cleanError(e))));
  g('wn-folder').addEventListener('click', () => window.api.openGameFolder().catch((e) => toast(cleanError(e))));
  g('wn-report').addEventListener('click', () => { const b = g('log-report'); if (b) b.click(); });

  // Tras actualizar, una ventana con lo nuevo (solo si ya había abierto el launcher antes).
  async function announce() {
    if (typeof isAdmin === 'undefined' || !isAdmin) return; // solo administradores por ahora
    let cfg;
    try { cfg = await window.api.getConfig(); } catch { return; }
    let seen = null;
    try { seen = localStorage.getItem(SEEN_KEY); } catch {}
    try { localStorage.setItem(SEEN_KEY, cfg.version); } catch {}
    if (!seen || !newer(cfg.version, seen)) return;
    const fresh = (await load()).filter((e) => newer(e.version, seen) && !newer(e.version, cfg.version)).slice(0, 4);
    if (!fresh.length) return;
    const dlg = el('dialog', 'event-modal confirm-modal');
    dlg.setAttribute('aria-label', 'Novedades');
    const body = el('div', 'event-modal-body');
    body.append(el('h3', '', `¡Nova PX se actualizó a la ${cfg.version}!`));
    const scroll = el('div', 'wn-modal-scroll');
    fresh.forEach((e) => scroll.append(renderEntry(e, true)));
    const actions = el('div', 'mp-actions');
    const all = el('button', '', 'Ver todas las novedades'); all.type = 'button';
    const ok = el('button', 'primary', 'Entendido'); ok.type = 'button';
    actions.append(all, ok);
    body.append(scroll, actions);
    dlg.append(body);
    const close = () => { try { dlg.close(); } catch {} dlg.remove(); };
    ok.addEventListener('click', close);
    all.addEventListener('click', () => { close(); goTo('whatsnew'); });
    dlg.addEventListener('cancel', (ev) => { ev.preventDefault(); close(); });
    document.body.append(dlg);
    dlg.showModal();
    ok.focus();
  }
  // Espera a que termine la pantalla de inicio: el aviso no debe aparecer encima de la animación.
  function whenSplashGone(fn) {
    let n = 0;
    const t = setInterval(() => {
      if (!document.getElementById('splash') || ++n > 80) { clearInterval(t); setTimeout(fn, 600); }
    }, 250);
  }
  window.addEventListener('load', () => whenSplashGone(announce));
})();
