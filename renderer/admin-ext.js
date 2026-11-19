/* Panel administrador ampliado: apariencia, ajustes, control remoto, recomendados, estado,
 * vista previa en vivo, arrastrar y soltar, historial (deshacer) y borradores.
 * Usa las utilidades de app.js ($, el, toast, cleanError, adm) solo cuando se llama, nunca al cargar. */
(function () {
  const AD_TABS = ['event', 'team', 'events', 'news', 'look', 'config', 'reco', 'control', 'status', 'warnings', 'users', 'perms', 'ads'];
  window.AD_TABS = AD_TABS;
  const LAUNCHER_TABS = ['look', 'config', 'control'];
  const g = (id) => document.getElementById(id);
  const draftKey = (n) => `px.draft.${n}`;
  const getDraft = (n) => { try { return JSON.parse(localStorage.getItem(draftKey(n)) || 'null'); } catch { return null; } };
  const setDraft = (n, v) => { try { v == null ? localStorage.removeItem(draftKey(n)) : localStorage.setItem(draftKey(n), JSON.stringify(v)); } catch {} };

  /* ---------- arrastrar y soltar ---------- */
  // Cada fila .mod-card recibe un asa; al soltar se mueve el elemento dentro de la lista y se repinta.
  window.makeSortable = function (box, list, repaint, afterChange) {
    if (!box || !Array.isArray(list)) return;
    const rows = [...box.children].filter((r) => r.classList.contains('mod-card'));
    let from = -1;
    rows.forEach((row, idx) => {
      const handle = el('span', 'drag-handle', '⠿');
      handle.title = 'Arrastra para ordenar';
      handle.setAttribute('aria-hidden', 'true');
      handle.addEventListener('mousedown', () => { row.draggable = true; });
      handle.addEventListener('mouseup', () => { row.draggable = false; });
      row.prepend(handle);
      row.addEventListener('dragstart', (e) => { from = idx; row.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(idx)); } catch {} });
      row.addEventListener('dragend', () => { row.draggable = false; row.classList.remove('dragging'); rows.forEach((r) => r.classList.remove('drop-before', 'drop-after')); });
      row.addEventListener('dragover', (e) => {
        if (from < 0) return;
        e.preventDefault();
        const after = e.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2;
        row.classList.toggle('drop-before', !after);
        row.classList.toggle('drop-after', after);
      });
      row.addEventListener('dragleave', () => row.classList.remove('drop-before', 'drop-after'));
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        if (from < 0) return;
        const after = e.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2;
        let to = idx + (after ? 1 : 0);
        const [item] = list.splice(from, 1);
        if (from < to) to--;
        list.splice(to, 0, item);
        from = -1;
        repaint();
        if (afterChange) afterChange();
      });
    });
  };

  /* ---------- formulario de configuración del launcher ---------- */
  const F = {
    name: 'lk-name', sub: 'lk-sub', preset: 'lk-preset', season: 'lk-season', accent: 'lk-accent', wtitle: 'lk-wtitle', wtext: 'lk-wtext',
    ram: 'cf-ram', discord: 'cf-discord', x: 'cf-x', youtube: 'cf-youtube', web: 'cf-web', nonPremium: 'cf-nonpremium', imp: 'cf-import', usage: 'cf-usage',
    anOn: 'ct-an-on', anLevel: 'ct-an-level', anUrl: 'ct-an-url', anText: 'ct-an-text', anLabel: 'ct-an-label', anImg: 'ct-an-img', mtOn: 'ct-mt-on', mtText: 'ct-mt-text', minVer: 'ct-minver'
  };
  let accentSet = false;
  let snap = ''; // JSON de lo publicado, para saber si hay cambios
  let published = null;

  function readForm() {
    const v = (k) => g(F[k]).value.trim();
    return {
      version: 1,
      brand: { name: v('name'), subtitle: v('sub') },
      theme: { preset: v('preset'), accent: accentSet ? g(F.accent).value : '', season: v('season') },
      welcome: { title: v('wtitle'), text: v('wtext') },
      announcement: { enabled: g(F.anOn).checked, level: v('anLevel'), text: v('anText'), url: v('anUrl'), urlLabel: v('anLabel'), image: v('anImg') },
      maintenance: { enabled: g(F.mtOn).checked, text: v('mtText') },
      minVersion: v('minVer'),
      links: { discord: v('discord'), x: v('x'), youtube: v('youtube'), web: v('web') },
      defaults: { ramGb: Number(v('ram')) || 0 },
      features: { nonPremium: g(F.nonPremium).checked, usageCounter: g(F.usage).checked, importPacks: g(F.imp).checked }
    };
  }
  function paintForm(c) {
    const set = (k, val) => { g(F[k]).value = val == null ? '' : val; };
    set('name', c.brand.name); set('sub', c.brand.subtitle);
    set('preset', c.theme.preset); set('season', c.theme.season);
    accentSet = !!c.theme.accent;
    g(F.accent).value = c.theme.accent || '#35d6ff';
    set('wtitle', c.welcome.title); set('wtext', c.welcome.text);
    set('ram', c.defaults.ramGb || '');
    set('discord', c.links.discord); set('x', c.links.x); set('youtube', c.links.youtube); set('web', c.links.web);
    g(F.nonPremium).checked = c.features.nonPremium; g(F.imp).checked = c.features.importPacks; g(F.usage).checked = c.features.usageCounter;
    g(F.anOn).checked = c.announcement.enabled; set('anLevel', c.announcement.level); set('anUrl', c.announcement.url); set('anLabel', c.announcement.urlLabel); set('anImg', c.announcement.image); set('anText', c.announcement.text);
    g(F.mtOn).checked = c.maintenance.enabled; set('mtText', c.maintenance.text); set('minVer', c.minVersion);
  }
  const dirty = () => JSON.stringify(readForm()) !== snap;
  let previewOn = false;
  function onFormChange() {
    const d = dirty();
    previewOn = d;
    g('ad-preview-bar').hidden = !d;
    if (d) { window.applyRemoteConfig(readForm(), { preview: true }); setDraft('launcher', readForm()); }
    else { setDraft('launcher', null); window.restoreRemote(published); }
    setStatus(d ? 'Cambios sin publicar.' : '');
  }
  function setStatus(t) { document.querySelectorAll('.ad-launcher-actions .ad-l-status').forEach((p) => { p.textContent = t; }); }

  function mountActions() {
    document.querySelectorAll('.ad-launcher-actions').forEach((box) => {
      if (box.dataset.ready) return;
      box.dataset.ready = '1';
      box.className = 'mp-actions ad-launcher-actions';
      const pub = el('button', 'primary', 'Publicar cambios');
      pub.type = 'button';
      pub.addEventListener('click', publish);
      const undo = el('button', 'ghost', 'Deshacer');
      undo.type = 'button';
      undo.addEventListener('click', discard);
      box.append(pub, undo, el('span', 'muted ad-l-status'));
    });
  }
  async function publish() {
    setStatus('Publicando…');
    try {
      const saved = await window.api.adminSaveLauncher(readForm());
      published = saved; adm.launcher = saved;
      paintForm(saved);
      snap = JSON.stringify(readForm());
      setDraft('launcher', null);
      previewOn = false;
      g('ad-preview-bar').hidden = true;
      window.restoreRemote(saved);
      setStatus('Publicado. Los jugadores lo reciben al abrir el launcher (o en unos minutos).');
      toast('Configuración publicada');
    } catch (e) { setStatus(cleanError(e)); }
  }
  function discard() {
    if (!published) return;
    paintForm(published);
    snap = JSON.stringify(readForm());
    setDraft('launcher', null);
    previewOn = false;
    g('ad-preview-bar').hidden = true;
    window.restoreRemote(published);
    setStatus('Cambios descartados.');
  }
  window.adminLeft = function () { if (previewOn && published) window.restoreRemote(published); };
  window.adminEntered = function () { if (previewOn) window.applyRemoteConfig(readForm(), { preview: true }); };

  /* ---------- listas con borrador, deshacer e historial ---------- */
  // lists[name] = { get, set, repaint, snap }
  const lists = {};
  function track(name, tabId, get, set, repaint) {
    lists[name] = { get, set, repaint, snap: '' };
    const tab = g(tabId);
    const touch = () => setTimeout(() => {
      const now = JSON.stringify(get());
      setDraft(name, now === lists[name].snap ? null : get());
    }, 0);
    ['input', 'change', 'click', 'drop'].forEach((ev) => tab.addEventListener(ev, touch));
  }
  window.adminListSaved = function (name) { if (lists[name]) { lists[name].snap = JSON.stringify(lists[name].get()); setDraft(name, null); } };
  function undoList(name) {
    const l = lists[name];
    if (!l) return;
    l.set(JSON.parse(l.snap || '[]'));
    setDraft(name, null);
    l.repaint();
  }

  /* ---------- recomendados ---------- */
  function paintReco() {
    const box = g('ad-reco');
    box.replaceChildren();
    adm.reco.forEach((r, i) => {
      const row = el('div', 'mod-card');
      const id = el('input'); id.type = 'text'; id.maxLength = 64; id.placeholder = 'nombre-en-modrinth'; id.value = r.id || '';
      id.addEventListener('input', () => { r.id = id.value; });
      const note = el('input'); note.type = 'text'; note.maxLength = 160; note.placeholder = 'Por qué lo recomiendas'; note.value = r.note || '';
      note.addEventListener('input', () => { r.note = note.value; });
      const del = el('button', '', 'Quitar'); del.type = 'button';
      del.addEventListener('click', () => { adm.reco.splice(i, 1); paintReco(); });
      row.append(id, note, del);
      box.append(row);
    });
    if (!adm.reco.length) box.append(el('p', 'muted', 'No hay recomendados. Añade uno con "+ Modpack".'));
    window.makeSortable(box, adm.reco, paintReco);
  }

  /* ---------- historial (deshacer versiones publicadas) ---------- */
  const NAMES = { launcher: 'Configuración del launcher', news: 'Noticias', events: 'Historial de eventos', team: 'Equipo', recommended: 'Recomendados', ads: 'Publicidad' };
  const fmt = (iso) => { const d = new Date(iso); return Number.isNaN(+d) ? '' : d.toLocaleString(); };
  async function openHistory(name) {
    g('adh-title').textContent = `Historial: ${NAMES[name] || name}`;
    g('adh-status').textContent = 'Cargando…';
    const box = g('adh-list');
    box.replaceChildren();
    g('ad-history-modal').showModal();
    try {
      const list = await window.api.adminHistory(name);
      g('adh-status').textContent = list.length ? '' : 'Todavía no hay versiones anteriores.';
      list.forEach((c, i) => {
        const row = el('div', 'mod-card');
        const body = el('div', 'mod-body');
        body.append(el('strong', '', c.message || 'Cambio'), el('span', 'muted', `${fmt(c.date)} · ${c.author || ''}${i === 0 ? ' · versión actual' : ''}`));
        row.append(body);
        if (i > 0) {
          const b = el('button', '', 'Restaurar');
          b.type = 'button';
          b.addEventListener('click', async () => {
            if (!(await askConfirm(`¿Restaurar "${NAMES[name] || name}" a la versión del ${fmt(c.date)}?`))) return;
            b.disabled = true;
            try {
              const out = await window.api.adminRestore(name, c.sha);
              applyRestored(name, out);
              g('ad-history-modal').close();
              toast('Versión restaurada y publicada');
            } catch (e) { g('adh-status').textContent = cleanError(e); b.disabled = false; }
          });
          row.append(b);
        }
        box.append(row);
      });
    } catch (e) { g('adh-status').textContent = cleanError(e); }
  }
  function applyRestored(name, out) {
    if (name === 'launcher') { published = out; adm.launcher = out; paintForm(out); snap = JSON.stringify(readForm()); setDraft('launcher', null); g('ad-preview-bar').hidden = true; previewOn = false; window.restoreRemote(out); }
    else if (name === 'recommended') { adm.reco = out; paintReco(); window.adminListSaved('reco'); }
    else if (name === 'news') { adm.news = out; paintNews(); window.adminListSaved('news'); }
    else if (name === 'team') { adm.team = out; paintTeam(); window.adminListSaved('team'); }
    else if (name === 'events') { adm.events = out; paintAdminEvents(); }
    else if (name === 'ads') { adm.ads = out; window.paintAds && window.paintAds(); }
    if (window.refreshContent) window.refreshContent();
  }

  /* ---------- estado ---------- */
  async function paintStatus() {
    const stats = g('ad-status-stats');
    stats.replaceChildren();
    const card = (n, l) => { const c = el('div', 'ad-stat'); c.append(el('strong', '', String(n)), el('span', 'muted', l)); stats.append(c); };
    let ver = '?';
    try { ver = (await window.api.getConfig()).version; } catch {}
    const pub = published || {};
    card(ver, 'Versión del launcher');
    card((pub.minVersion) || 'Sin mínimo', 'Versión mínima');
    card(pub.maintenance && pub.maintenance.enabled ? 'Activo' : 'No', 'Mantenimiento');
    card(pub.announcement && pub.announcement.enabled && pub.announcement.text ? 'Publicado' : 'No', 'Anuncio global');
    try {
      const s = await window.api.serverStatus();
      card(!s.configured ? 'Sin servidor' : s.unknown ? 'Sin datos' : s.online ? 'En línea' : 'Apagado', 'Servidor del evento');
      if (s.configured && s.online) card(`${s.players == null ? '–' : s.players}${s.max ? ' / ' + s.max : ''}`, 'Jugadores ahora');
    } catch {}
    const box = g('ad-recent');
    box.replaceChildren(el('p', 'muted', 'Cargando…'));
    try {
      const all = [];
      await Promise.all(Object.keys(NAMES).map(async (n) => {
        try { (await window.api.adminHistory(n)).slice(0, 4).forEach((c) => all.push({ ...c, n })); } catch {}
      }));
      all.sort((a, b) => String(b.date).localeCompare(String(a.date)));
      box.replaceChildren();
      all.slice(0, 10).forEach((c) => {
        const row = el('div', 'mod-card');
        const body = el('div', 'mod-body');
        body.append(el('strong', '', c.message || 'Cambio'), el('span', 'muted', `${fmt(c.date)} · ${c.author || ''}`));
        row.append(body, el('span', 'ad-chip', NAMES[c.n]));
        box.append(row);
      });
      if (!all.length) box.append(el('p', 'muted', 'Todavía no hay cambios.'));
    } catch { box.replaceChildren(el('p', 'muted', 'No se pudo leer el historial.')); }
  }

  /* ---------- borradores ---------- */
  function offerDrafts() {
    const pend = [];
    if (getDraft('launcher') && JSON.stringify(getDraft('launcher')) !== snap) pend.push({ name: 'launcher', label: 'la configuración del launcher', apply: () => { paintForm(getDraft('launcher')); onFormChange(); } });
    [['team', 'el equipo'], ['news', 'las noticias'], ['reco', 'los recomendados']].forEach(([n, label]) => {
      const d = getDraft(n);
      if (d && Array.isArray(d) && JSON.stringify(d) !== lists[n].snap) pend.push({ name: n, label, apply: () => { lists[n].set(d); lists[n].repaint(); } });
    });
    const bar = g('ad-draft-bar');
    const show = () => {
      const cur = pend[0];
      bar.hidden = !cur;
      if (!cur) return;
      g('ad-draft-text').textContent = `Tienes un borrador sin publicar de ${cur.label}.`;
      g('ad-draft-keep').onclick = () => { cur.apply(); pend.shift(); show(); };
      g('ad-draft-drop').onclick = () => { setDraft(cur.name, null); pend.shift(); show(); };
    };
    show();
  }

  /* ---------- arranque ---------- */
  let wired = false;
  function wire() {
    if (wired) return;
    wired = true;
    mountActions();
    Object.values(F).forEach((id) => {
      const n = g(id);
      n.addEventListener('input', () => { if (id === F.accent) accentSet = true; onFormChange(); });
      n.addEventListener('change', () => { if (id === F.accent) accentSet = true; onFormChange(); });
    });
    g('lk-accent-clear').addEventListener('click', () => { accentSet = false; onFormChange(); });
    g('ct-an-imgpick').addEventListener('click', async () => {
      try {
        setStatus('Eligiendo imagen…');
        const r = await (async () => { const q = await window.api.adminPickImage('anuncio', { crop: true }); if (!q) return null; const o = window.NovaCrop ? await window.NovaCrop.open(q.raw, 16 / 9, q.kind) : 'orig'; if (o === null) return null; return window.api.adminUploadImage('anuncio', o === 'orig' ? q.raw : o); })();
        if (r) { g(F.anImg).value = r.path; onFormChange(); } else setStatus('');
      } catch (err) { setStatus(String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); }
    });
    g('ct-an-imgclear').addEventListener('click', () => { g(F.anImg).value = ''; onFormChange(); });
    g('ad-prev-discard').addEventListener('click', discard);
    document.querySelectorAll('[data-history]').forEach((b) => b.addEventListener('click', () => openHistory(b.dataset.history)));
    g('adh-close').addEventListener('click', () => g('ad-history-modal').close());
    g('ad-reco-add').addEventListener('click', () => { adm.reco.push({ provider: 'modrinth', id: '', note: '' }); paintReco(); });
    g('ad-reco-undo').addEventListener('click', () => undoList('reco'));
    g('ad-team-undo').addEventListener('click', () => undoList('team'));
    g('ad-news-undo').addEventListener('click', () => undoList('news'));
    g('ad-reco-save').addEventListener('click', async () => {
      try {
        adm.reco = await window.api.adminSaveRecommended(adm.reco.filter((r) => (r.id || '').trim()));
        paintReco(); window.adminListSaved('reco');
        g('ad-reco-status').textContent = 'Recomendados publicados.';
      } catch (e) { g('ad-reco-status').textContent = cleanError(e); }
    });
    g('ad-recent-refresh').addEventListener('click', paintStatus);
    track('reco', 'ad-tab-reco', () => adm.reco, (v) => { adm.reco = v; }, paintReco);
    track('team', 'ad-tab-team', () => adm.team, (v) => { adm.team = v; }, () => paintTeam());
    track('news', 'ad-tab-news', () => adm.news, (v) => { adm.news = v; }, () => paintNews());
    document.querySelectorAll('[data-ad-tab]').forEach((b) => b.addEventListener('click', () => { if (b.dataset.adTab === 'status') paintStatus(); }));
  }

  // Lo llama loadAdmin() de app.js cuando llegan los datos publicados.
  window.adminExtLoad = function (d) {
    wire();
    published = d.launcher; adm.launcher = d.launcher;
    paintForm(d.launcher);
    snap = JSON.stringify(readForm());
    adm.reco = d.recommended || [];
    paintReco();
    lists.reco.snap = JSON.stringify(adm.reco);
    lists.team.snap = JSON.stringify(adm.team);
    lists.news.snap = JSON.stringify(adm.news);
    offerDrafts();
  };
})();
