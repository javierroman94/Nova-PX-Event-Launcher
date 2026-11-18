'use strict';
/* Menú contextual (clic derecho) con la estética del launcher.
   NovaCtx.attach(elemento, () => [ { label, icon, onClick, danger, disabled, hint } | 'sep' ]) */
(function () {
  let menu = null;
  function close() {
    if (!menu) return;
    menu.remove();
    menu = null;
    window.removeEventListener('blur', close);
    window.removeEventListener('resize', close);
  }
  function open(x, y, items) {
    close();
    const list = (items || []).filter(Boolean);
    if (!list.length) return;
    menu = document.createElement('div');
    menu.className = 'ctx-menu';
    menu.setAttribute('role', 'menu');
    list.forEach((it) => {
      if (it === 'sep') { const s = document.createElement('div'); s.className = 'ctx-sep'; menu.append(s); return; }
      if (it.title) { const t = document.createElement('div'); t.className = 'ctx-title'; t.textContent = it.title; menu.append(t); return; }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ctx-item' + (it.danger ? ' danger' : '');
      b.setAttribute('role', 'menuitem');
      b.disabled = !!it.disabled;
      const ic = document.createElement('span'); ic.className = 'ctx-ico'; ic.textContent = it.icon || '';
      const lb = document.createElement('span'); lb.className = 'ctx-label'; lb.textContent = it.label;
      b.append(ic, lb);
      if (it.hint) { const h = document.createElement('span'); h.className = 'ctx-hint'; h.textContent = it.hint; b.append(h); }
      b.addEventListener('click', (e) => { e.stopPropagation(); close(); try { const r = it.onClick && it.onClick(); if (r && r.catch) r.catch(() => {}); } catch {} });
      menu.append(b);
    });
    document.body.append(menu);
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.max(6, Math.min(x, window.innerWidth - r.width - 6)) + 'px';
    menu.style.top = Math.max(6, Math.min(y, window.innerHeight - r.height - 6)) + 'px';
    const first = menu.querySelector('.ctx-item:not(:disabled)');
    if (first) first.focus({ preventScroll: true });
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
  }
  document.addEventListener('mousedown', (e) => { if (menu && !menu.contains(e.target)) close(); }, true);
  document.addEventListener('scroll', close, true);
  document.addEventListener('wheel', close, { passive: true });
  document.addEventListener('keydown', (e) => {
    if (!menu) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = [...menu.querySelectorAll('.ctx-item:not(:disabled)')];
      if (!items.length) return;
      const i = items.indexOf(document.activeElement);
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    }
  }, true);

  // Un elemento más interno que también tenga menú gana: el evento se marca como manejado.
  function attach(node, build) {
    node.addEventListener('contextmenu', (e) => {
      if (e.__ctxDone) return;
      let items;
      try { items = build(e); } catch { return; }
      if (!items || !items.length) return;
      e.preventDefault();
      e.__ctxDone = true;
      open(e.clientX, e.clientY, items);
    });
  }
  window.NovaCtx = { open, close, attach };
})();
