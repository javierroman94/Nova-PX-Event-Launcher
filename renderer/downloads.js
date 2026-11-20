'use strict';
/*
 * Panel de descargas: el botón de arriba muestra el avance y, al pulsarlo, abre una lista con lo que se está
 * descargando ahora y el historial de lo ya terminado (se guarda en este equipo).
 */
(function () {
  const KEY = 'px.dlHistory';
  const MAX_HISTORY = 30;
  const tasks = new Map(); // id -> { title, text, pct, started }
  let history = [];
  try { const h = JSON.parse(localStorage.getItem(KEY) || '[]'); if (Array.isArray(h)) history = h.slice(0, MAX_HISTORY); } catch {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(history.slice(0, MAX_HISTORY))); } catch {} };

  const $ = (id) => document.getElementById(id);
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const clean = (t) => String(t || '').replace(/…+$/, '').slice(0, 120);
  const ago = (ts) => {
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return 'hace un momento';
    if (s < 3600) return `hace ${Math.round(s / 60)} min`;
    if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
    return `hace ${Math.round(s / 86400)} d`;
  };

  let panel = null;
  const idleTimers = new Map();

  function paintButton() {
    const b = $('top-dl'), t = $('top-dl-text');
    if (!b || !t) return;
    const list = [...tasks.values()];
    if (!list.length) { b.classList.remove('busy'); t.hidden = true; b.style.removeProperty('--p'); return; }
    const known = list.filter((x) => x.pct >= 0);
    const pct = known.length ? Math.round(known.reduce((n, x) => n + x.pct, 0) / known.length) : 0;
    b.classList.add('busy');
    t.hidden = false;
    t.textContent = known.length ? `${pct}%` : '…';
    b.style.setProperty('--p', `${known.length ? pct : 0}%`);
  }

  function paintPanel() {
    if (!panel || panel.hidden) return;
    panel.replaceChildren();
    const head = mk('div', 'dl-head');
    head.append(mk('strong', '', 'Descargas'));
    if (history.length) {
      const clear = mk('button', 'dl-clear', 'Borrar historial');
      clear.type = 'button';
      clear.addEventListener('click', () => { history = []; save(); paintPanel(); });
      head.append(clear);
    }
    panel.append(head);

    panel.append(mk('div', 'dl-sec', 'En curso'));
    if (!tasks.size) panel.append(mk('div', 'dl-empty', 'No hay nada descargándose.'));
    for (const t of tasks.values()) {
      const row = mk('div', 'dl-item');
      row.append(mk('div', 'dl-title', t.title));
      if (t.text) row.append(mk('div', 'dl-text', t.text));
      const bar = mk('progress');
      bar.max = 100;
      if (t.pct >= 0) bar.value = t.pct; else bar.removeAttribute('value');
      row.append(bar);
      panel.append(row);
    }

    panel.append(mk('div', 'dl-sec', 'Historial'));
    if (!history.length) panel.append(mk('div', 'dl-empty', 'Aquí aparecerá lo que descargues.'));
    for (const h of history) {
      const row = mk('div', 'dl-item dl-done');
      const top = mk('div', 'dl-title');
      top.append(mk('span', h.ok === false ? 'dl-bad' : 'dl-ok', h.ok === false ? '✕' : '✓'), document.createTextNode(` ${h.title}`));
      row.append(top);
      if (h.text) row.append(mk('div', 'dl-text', h.text));
      row.append(mk('div', 'dl-when', ago(h.at)));
      panel.append(row);
    }
  }

  function repaint() { paintButton(); paintPanel(); }

  // Avance de una tarea. pct < 0 = no se sabe cuánto falta.
  function progress(id, title, text, pct) {
    const prev = tasks.get(id);
    tasks.set(id, { title: title || (prev && prev.title) || 'Descarga', text: clean(text), pct: Number.isFinite(pct) ? Math.max(-1, Math.min(100, pct)) : -1, started: prev ? prev.started : Date.now() });
    repaint();
  }

  // Termina una tarea y la pasa al historial.
  function done(id, ok, text) {
    clearTimeout(idleTimers.get(id)); idleTimers.delete(id);
    const t = tasks.get(id);
    if (!t) return;
    tasks.delete(id);
    history.unshift({ title: t.title, text: clean(text != null ? text : (ok === false ? 'No se pudo completar' : 'Terminado')), ok: ok !== false, at: Date.now() });
    history = history.slice(0, MAX_HISTORY);
    save();
    repaint();
  }

  // Para descargas que solo avisan de su avance: si pasan unos segundos sin noticias, se dan por terminadas.
  function progressAuto(id, title, text, pct, idleMs = 5000) {
    progress(id, title, text, pct);
    clearTimeout(idleTimers.get(id));
    idleTimers.set(id, setTimeout(() => done(id, true, 'Terminado'), idleMs));
  }

  function toggle(force) {
    if (!panel) {
      panel = mk('div', 'dl-panel');
      panel.id = 'dl-panel';
      panel.hidden = true;
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'Descargas');
      document.body.append(panel);
    }
    panel.hidden = force === undefined ? !panel.hidden : !force;
    if (!panel.hidden) paintPanel();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const b = $('top-dl');
    if (b) b.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
  });
  document.addEventListener('mousedown', (e) => {
    if (panel && !panel.hidden && !panel.contains(e.target) && !(e.target.closest && e.target.closest('#top-dl'))) toggle(false);
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panel && !panel.hidden) toggle(false); });

  window.Downloads = { progress, progressAuto, done, toggle, active: () => tasks.size };
})();
