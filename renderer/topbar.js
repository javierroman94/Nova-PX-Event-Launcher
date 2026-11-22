'use strict';
/* Barra superior: búsqueda rápida (Ctrl+K), campana de avisos y tu cuenta con menú. */
(function () {
  const $ = (id) => document.getElementById(id);
  const right = document.querySelector('.top-right');
  if (!right) return;
  const mk = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };
  const ICON = {
    search: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
    bell: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 1112 0v5l2 2H4z"/><path d="M10 21h4"/></svg>'
  };

  /* ---- avisos: todo lo que sale como aviso emergente se guarda aquí ---- */
  const log = [];
  let unread = 0;
  const baseToast = window.toast;
  window.toast = function (text, kind) {
    try { log.unshift({ text: String(text), kind, at: Date.now() }); log.length = Math.min(log.length, 30); unread++; paintBell(); } catch {}
    return baseToast.apply(this, arguments);
  };

  const btnSearch = mk('button', 'top-ico');
  btnSearch.type = 'button'; btnSearch.title = 'Buscar (Ctrl+K)'; btnSearch.setAttribute('aria-label', 'Buscar'); btnSearch.innerHTML = ICON.search;
  const btnHelp = mk('button', 'top-ico');
  btnHelp.type = 'button'; btnHelp.title = 'Ayuda'; btnHelp.setAttribute('aria-label', 'Ayuda');
  btnHelp.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 114 2c-.9.6-1.6 1.1-1.6 2.1"/><path d="M12 17h.01"/></svg>';
  const btnBell = mk('button', 'top-ico');
  btnBell.type = 'button'; btnBell.title = 'Avisos'; btnBell.setAttribute('aria-label', 'Avisos'); btnBell.innerHTML = ICON.bell;
  const dot = mk('i', 'top-badge'); dot.hidden = true; btnBell.append(dot);
  const chip = mk('button', 'top-acct'); chip.type = 'button'; chip.title = 'Tu cuenta';
  const av = mk('img'); av.alt = ''; av.width = 22; av.height = 22; av.hidden = true;
  const nm = mk('span', '', 'Iniciar sesión');
  chip.append(av, nm);
  right.prepend(chip);
  right.prepend(btnHelp);
  right.prepend(btnBell);
  right.prepend(btnSearch);

  function paintBell() { dot.hidden = unread === 0; dot.textContent = unread > 9 ? '9+' : String(unread); }
  function paintAcct() {
    const n = $('chip-name'), a = $('chip-avatar');
    nm.textContent = n ? n.textContent : 'Iniciar sesión';
    if (a && !a.hidden && a.src) { av.src = a.src; av.hidden = false; } else av.hidden = true;
  }
  const sess = $('chip-name');
  if (sess) new MutationObserver(paintAcct).observe(sess, { childList: true, characterData: true, subtree: true });
  const avSrc = $('chip-avatar');
  if (avSrc) new MutationObserver(paintAcct).observe(avSrc, { attributes: true });
  paintAcct();

  /* ---- menús desplegables ---- */
  let pop = null;
  function closePop() { if (pop) { pop.remove(); pop = null; } }
  function openPop(anchor, build) {
    const was = pop && pop.dataset.for === anchor.title;
    closePop();
    if (was) return;
    pop = mk('div', 'top-pop'); pop.dataset.for = anchor.title;
    build(pop);
    document.body.append(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.top = `${r.bottom + 8}px`;
    pop.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
  }
  document.addEventListener('mousedown', (e) => { if (pop && !pop.contains(e.target) && !e.target.closest('.top-ico, .top-acct')) closePop(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePop(); });

  btnBell.addEventListener('click', () => {
    openPop(btnBell, (p) => {
      p.append(mk('h4', '', 'Avisos'));
      if (!log.length) p.append(mk('p', 'muted', 'No hay avisos nuevos.'));
      for (const n of log.slice(0, 12)) {
        const row = mk('div', n.kind === 'error' ? 'pop-row err' : 'pop-row');
        row.append(mk('span', '', n.text), mk('small', 'muted', new Date(n.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })));
        p.append(row);
      }
      unread = 0; paintBell();
    });
  });

  btnHelp.addEventListener('click', () => {
    openPop(btnHelp, (p) => {
      const go = (label, fn) => { const b = mk('button', 'pop-item', label); b.type = 'button'; b.addEventListener('click', () => { closePop(); fn(); }); p.append(b); };
      p.append(mk('h4', '', 'Ayuda'));
      if (typeof isAdmin !== 'undefined' && isAdmin) go('Novedades y soporte', () => goTo('whatsnew'));
      go('Consola del juego (para resolver errores)', () => goTo('console'));
      go('Buscar en el launcher (Ctrl+K)', () => openSearch());
      go('Versiones y loaders', () => goTo('versions'));
      p.append(mk('p', 'muted', 'Dentro del juego, con Nova Client, abre su menú con Shift derecho. Zoom: mantén C.'));
    });
  });

  chip.addEventListener('click', () => {
    openPop(chip, (p) => {
      const go = (label, fn) => { const b = mk('button', 'pop-item', label); b.type = 'button'; b.addEventListener('click', () => { closePop(); fn(); }); p.append(b); };
      p.append(mk('h4', '', nm.textContent));
      go('Cuenta y sesión', () => goTo('account'));
      go('Skins y capas', () => goTo('skins'));
      go('Ajustes', () => goTo('settings'));
      const out = $('logout-btn');
      if (out && !out.hidden) go('Cerrar sesión', () => out.click());
    });
  });

  /* ---- búsqueda rápida ---- */
  async function openSearch() {
    closePop();
    if ($('qs-back')) return;
    const back = mk('div', 'qs-back'); back.id = 'qs-back';
    const box = mk('div', 'qs-box');
    const inp = mk('input'); inp.type = 'text'; inp.placeholder = 'Buscar una página o un modpack…'; inp.setAttribute('aria-label', 'Buscar');
    const list = mk('div', 'qs-list');
    box.append(inp, list); back.append(box); document.body.append(back);
    let packs = [];
    try { packs = await window.api.modpackInstalled(); } catch {}
    const items = [];
    for (const [tab, t] of Object.entries(PAGE_TITLES)) {
      if (tab === 'mods') continue;
      const btn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
      if (btn && btn.hidden) continue;
      items.push({ label: t[0], hint: t[1], run: () => goTo(tab) });
    }
    for (const p of packs) items.push({ label: p.title, hint: `Modpack · Minecraft ${p.mcVersion}`, run: () => { goTo('modpacks'); } });
    let sel = 0, shown = [];
    const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    function paint() {
      const q = norm(inp.value.trim());
      shown = items.filter((i) => !q || norm(i.label).includes(q) || norm(i.hint).includes(q)).slice(0, 9);
      sel = Math.min(sel, Math.max(0, shown.length - 1));
      list.replaceChildren(...shown.map((i, n) => {
        const r = mk('button', n === sel ? 'qs-item on' : 'qs-item'); r.type = 'button';
        r.append(mk('b', '', i.label), mk('small', 'muted', i.hint));
        r.addEventListener('click', () => run(i));
        return r;
      }));
      if (!shown.length) list.append(mk('p', 'muted', 'Nada coincide.'));
    }
    const close = () => back.remove();
    function run(i) { close(); i.run(); }
    inp.addEventListener('input', () => { sel = 0; paint(); });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, shown.length - 1); paint(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); paint(); e.preventDefault(); }
      else if (e.key === 'Enter' && shown[sel]) run(shown[sel]);
      else if (e.key === 'Escape') close();
    });
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    paint(); inp.focus();
  }
  btnSearch.addEventListener('click', openSearch);
  document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); } });
})();
