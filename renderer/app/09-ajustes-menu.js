/* Interfaz del launcher — Ajustes con menú lateral. (parte de lo que antes era app.js; se carga en este orden desde index.html). */

/* ---------- Ajustes con menú lateral (secciones) ---------- */
(function settingsLayout() {
  const root = document.querySelector('#page-settings .settings');
  if (!root) return;
  const GROUPS = [
    ['Cuenta', ['Mi cuenta', 'Privacidad', 'Modo administrador']],
    ['Visualización', ['Apariencia', 'Idioma']],
    ['Juego', ['Memoria y Java', 'Ventana del juego', 'Al jugar']],
    ['Conexiones', ['Discord', 'Notificaciones']],
    ['Sistema', ['Actualizaciones', 'Archivos del juego']]
  ];
  const sets = [...root.querySelectorAll(':scope > fieldset')];
  const byName = new Map(sets.map((f) => [f.querySelector('legend').textContent.trim(), f]));
  const nav = el('nav', 'set-nav');
  nav.setAttribute('aria-label', 'Secciones de ajustes');
  const prof = el('div', 'set-profile');
  const pav = el('img', 'set-prof-avatar'); pav.id = 'set-prof-avatar'; pav.alt = ''; pav.hidden = true;
  const ptx = el('div', 'set-prof-text');
  const pname = el('strong', 'pii', 'Sin sesión'); pname.id = 'set-prof-name';
  const pmode = el('span', 'muted', ''); pmode.id = 'set-prof-mode';
  ptx.append(pname, pmode);
  prof.append(pav, ptx);
  const search = document.createElement('input');
  search.type = 'search'; search.className = 'set-search'; search.placeholder = 'Buscar ajustes'; search.setAttribute('aria-label', 'Buscar ajustes');
  const noHits = el('p', 'set-empty muted', 'Ningún ajuste coincide.');
  noHits.hidden = true;
  nav.append(prof, search, noHits);
  const body = el('div', 'set-body');
  const items = [];
  const show = (name) => {
    items.forEach((it) => it.btn.classList.toggle('active', it.name === name));
    byName.forEach((f, n) => (f.dataset.on = n === name ? '1' : ''));
  };
  GROUPS.forEach(([group, names]) => {
    const present = names.filter((n) => byName.has(n));
    if (!present.length) return;
    nav.append(el('span', 'nav-group', group));
    present.forEach((n) => {
      const b = el('button', 'set-item', n);
      b.type = 'button';
      b.addEventListener('click', () => show(n));
      nav.append(b);
      items.push({ name: n, btn: b });
      body.append(byName.get(n));
    });
  });
  sets.forEach((f) => { if (!body.contains(f)) body.append(f); }); // por si queda alguna sin grupo
  // Búsqueda: filtra el menú por el nombre de la sección o por cualquier texto de sus ajustes.
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    let first = null;
    items.forEach((it) => {
      const f = byName.get(it.name);
      const hit = !q || it.name.toLowerCase().includes(q) || f.textContent.toLowerCase().includes(q);
      it.btn.dataset.hide = hit ? '' : '1';
      if (hit && !first && !(f.hidden)) first = it.name;
    });
    nav.querySelectorAll('.nav-group').forEach((g) => {
      let n = g.nextElementSibling; let any = false;
      while (n && n.classList.contains('set-item')) { if (!n.dataset.hide && !n.hidden) any = true; n = n.nextElementSibling; }
      g.dataset.hide = any ? '' : '1';
    });
    noHits.hidden = !q || !!first;
    if (q && first) show(first);
  });
  root.append(nav, body);
  root.classList.add('set-split');
  // El botón del modo administrador sigue a la visibilidad de su sección.
  const adm = byName.get('Modo administrador');
  if (adm) {
    const sync = () => { const it = items.find((x) => x.name === 'Modo administrador'); if (it) { it.btn.hidden = adm.hidden; const lab = it.btn.previousElementSibling; if (lab && lab.classList.contains('nav-group')) lab.hidden = adm.hidden; } if (adm.hidden && adm.dataset.on) show('Mi cuenta'); };
    new MutationObserver(sync).observe(adm, { attributes: true, attributeFilter: ['hidden'] });
    sync();
  }
  show('Mi cuenta');
})();


/* ---------- Ajustes: cabecera, resumen, iconos y atajos (se apoya en settingsLayout) ---------- */
(function settingsPolish() {
  const root = document.querySelector('#page-settings .settings.set-split');
  if (!root) return;
  const ICON = {
    'Mi cuenta': '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
    'Privacidad': '<path d="M12 3l8 3v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6z"/>',
    'Modo administrador': '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>',
    'Apariencia': '<path d="M12 3a9 9 0 100 18c1.5 0 2-1 1.5-2-.6-1.2.2-2.5 1.5-2.5H17a4 4 0 004-4c0-5-4-9.5-9-9.5z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
    'Idioma': '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
    'Memoria y Java': '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
    'Ventana del juego': '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    'Al jugar': '<path d="M7 4l13 8-13 8z"/>',
    'Actualizaciones': '<path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7"/>',
    'Discord': '<path d="M7 7c3-1.2 7-1.2 10 0 2 3 3 6 3 9-1.5 1.2-3 1.8-4.5 2l-1-2c-1 .3-3 .3-4 0l-1 2c-1.5-.2-3-.8-4.5-2 0-3 1-6 3-9z"/><circle cx="9.5" cy="12.5" r="1"/><circle cx="14.5" cy="12.5" r="1"/>',
    'Notificaciones': '<path d="M6 16V11a6 6 0 1112 0v5l2 2H4z"/><path d="M10 21h4"/>',
    'Archivos del juego': '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>'
  };
  const DESC = {
    'Mi cuenta': 'Tu perfil de jugador y cómo entras al juego',
    'Privacidad': 'Qué se ve y qué se comparte mientras juegas o transmites',
    'Modo administrador': 'Herramientas para publicar eventos y noticias',
    'Apariencia': 'Tema, color, fondo y decoración de temporada',
    'Idioma': 'Elige el idioma del launcher',
    'Memoria y Java': 'Rendimiento y versión de Java para Minecraft',
    'Ventana del juego': 'Tamaño de la ventana y pantalla completa',
    'Al jugar': 'Qué pasa cuando pulsas Jugar',
    'Actualizaciones': 'Mantén el launcher al día',
    'Discord': 'Muestra a tus amigos a qué estás jugando',
    'Notificaciones': 'Avisos de eventos',
    'Archivos del juego': 'Carpeta de datos, espacio usado y reparación'
  };
  const svg = (inner) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'set-ico'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = inner; return s; };

  // Iconos en el menú y cabecera de cada sección (el <legend> se conserva para la búsqueda pero ya no se ve).
  root.querySelectorAll('.set-item').forEach((b) => { const n = b.textContent.trim(); if (ICON[n]) b.prepend(svg(ICON[n])); });
  root.querySelectorAll('.set-body > fieldset').forEach((f) => {
    const n = f.querySelector('legend').textContent.trim();
    const head = el('div', 'set-head');
    const badge = el('span', 'set-badge'); if (ICON[n]) badge.append(svg(ICON[n]));
    const tx = el('div', 'set-head-tx');
    tx.append(el('h3', '', n), el('p', 'muted', DESC[n] || ''));
    head.append(badge, tx);
    f.prepend(head);
  });

  // Resumen arriba: quién eres y cómo está configurado, con atajos a cada sección.
  const body = root.querySelector('.set-body');
  const hero = el('div', 'set-hero');
  const hav = el('img', 'set-hero-avatar'); hav.alt = ''; hav.hidden = true;
  const hph = el('span', 'set-hero-ph', '?');
  const htx = el('div', 'set-hero-tx');
  const hname = el('strong', 'pii', 'Sin sesión');
  const hmode = el('span', 'muted', '');
  htx.append(hname, hmode);
  const chips = el('div', 'set-chips');
  const mkChip = (id, label, target) => {
    const c = el('button', 'set-chip'); c.type = 'button'; c.dataset.go = target;
    const l = el('small', 'muted', label); const v = el('b', '', '–'); v.id = id;
    c.append(l, v);
    c.addEventListener('click', () => [...root.querySelectorAll('.set-item')].find((b) => b.textContent.trim() === target)?.click());
    chips.append(c);
    return v;
  };
  const vRam = mkChip('chip-ram', 'Memoria RAM', 'Memoria y Java');
  const vJava = mkChip('chip-java', 'Java', 'Memoria y Java');
  const vLang = mkChip('chip-lang', 'Idioma', 'Idioma');
  const vTheme = mkChip('chip-theme', 'Tema', 'Apariencia');
  hero.append(hav, hph, htx, chips);
  body.prepend(hero);

  const $$ = (id) => document.getElementById(id);
  const refresh = () => {
    const pn = $$('set-prof-name'); const pm = $$('set-prof-mode'); const pa = $$('set-prof-avatar');
    hname.textContent = pn ? pn.textContent : 'Sin sesión';
    hmode.textContent = pm ? pm.textContent : '';
    const showAv = pa && !pa.hidden && pa.getAttribute('src');
    hav.hidden = !showAv; hph.hidden = !!showAv;
    if (showAv) hav.src = pa.getAttribute('src');
    hph.textContent = '?';
    vRam.textContent = $$('ram') ? `${$$('ram').value} GB` : '–';
    vJava.textContent = $$('java-path') && $$('java-path').value.trim() ? 'Manual' : 'Automática';
    const ls = $$('lang-select');
    vLang.replaceChildren();
    if (ls && ls.value) {
      const code = ls.value === 'auto' ? 'globe' : ls.value;
      const o = ls.options[ls.selectedIndex];
      vLang.append(window.NovaFlags.node(code), document.createTextNode(' ' + (o ? o.textContent.replace(/\s*\(.*\)$/, '') : '')));
    }
    const tc = document.querySelector('#theme-seg .theme-card.active .tc-name');
    vTheme.textContent = tc ? tc.textContent : '–';
  };
  const prof = $$('set-prof-name');
  if (prof) new MutationObserver(refresh).observe(prof.parentElement.parentElement, { childList: true, subtree: true, attributes: true, characterData: true });
  window.addEventListener('nova-lang', refresh);
  root.addEventListener('input', refresh);
  root.addEventListener('change', refresh);
  root.addEventListener('click', () => setTimeout(refresh, 80));
  setTimeout(refresh, 400);

  // Atajos de memoria y de tamaño de ventana.
  const presets = (afterEl, items, apply, isOn) => {
    if (!afterEl) return;
    const row = el('div', 'preset-row');
    const btns = items.map((it) => {
      const b = el('button', 'preset'); b.type = 'button';
      b.append(el('b', '', it.big), it.small ? el('small', 'muted', it.small) : document.createTextNode(''));
      b.addEventListener('click', () => { apply(it); refresh(); mark(); });
      row.append(b);
      return { b, it };
    });
    const mark = () => btns.forEach(({ b, it }) => b.classList.toggle('on', isOn(it)));
    afterEl.after(row);
    root.addEventListener('input', mark); root.addEventListener('click', () => setTimeout(mark, 60));
    setTimeout(mark, 500);
    return { btns, mark };
  };
  const ram = $$('ram');
  if (ram) {
    const items = [{ big: '2 GB', v: 2, small: 'Ligero' }, { big: '4 GB', v: 4, small: 'Equilibrado' }, { big: '6 GB', v: 6, small: 'Recomendado' }, { big: '8 GB', v: 8, small: 'Pesado' }];
    const r = presets(ram.closest('.range-row'), items, (it) => { ram.value = String(Math.min(it.v, Number(ram.max) || it.v)); ram.dispatchEvent(new Event('input', { bubbles: true })); }, (it) => Number(ram.value) === it.v);
    const hide = () => r && r.btns.forEach(({ b, it }) => { b.hidden = it.v > (Number(ram.max) || 16); });
    setTimeout(hide, 700);
  }
  const rw = $$('res-w'); const rh = $$('res-h');
  if (rw && rh) {
    const items = [{ big: '1280×720', w: 1280, h: 720, small: 'HD' }, { big: '1600×900', w: 1600, h: 900, small: 'HD+' }, { big: '1920×1080', w: 1920, h: 1080, small: 'Full HD' }, { big: '2560×1440', w: 2560, h: 1440, small: '2K' }];
    presets(rh.closest('.field'), items, (it) => { rw.value = it.w; rh.value = it.h; rw.dispatchEvent(new Event('input', { bubbles: true })); }, (it) => Number(rw.value) === it.w && Number(rh.value) === it.h);
  }

  // Aviso de cambios sin guardar junto al botón.
  const saveRow = document.querySelector('#page-settings .save-row');
  if (saveRow) {
    // El botón Guardar solo aparece cuando hay algo que guardar y se esconde al guardar.
    const dirty = el('span', 'set-dirty', 'Cambios sin guardar');
    saveRow.prepend(dirty);
    saveRow.hidden = true;
    const on = (e) => { if (e.target.closest('.set-nav') || e.target.id === 'lang-select') return; saveRow.hidden = false; };
    root.addEventListener('input', on); root.addEventListener('change', on);
    window.addEventListener('settings-saved', () => { saveRow.hidden = true; });
  }
})();


/* --- Nuevo perfil (asistente) --- */
$('mp-new-profile').addEventListener('click', () => { $('np-search').value = ''; $('np-modal').showModal(); });
$('np-close').addEventListener('click', () => $('np-modal').close());
$('np-modal').addEventListener('click', (e) => { if (e.target === $('np-modal')) $('np-modal').close(); });
$('np-wizard').addEventListener('click', () => { $('np-modal').close(); $('mp-go-create').click(); });
$('np-install').addEventListener('click', () => { $('np-modal').close(); $('mp-go-discover').click(); });
$('np-file').addEventListener('click', () => { $('np-modal').close(); doImport({ kind: 'file' }); });
$('np-server').addEventListener('click', () => { $('np-modal').close(); mcw.requestMode = 'server'; $('mp-go-create').click(); });
$('np-folder').addEventListener('click', () => { $('np-modal').close(); doImport({ kind: 'folder' }); });
$('np-other').addEventListener('click', () => { $('np-modal').close(); openLauncherImport(); });

/* --- importar desde otros launchers (detección automática) --- */
const LM_ICONS = { 'Prism Launcher': '🔷', PolyMC: '🔷', MultiMC: '🟫', ATLauncher: '🟦', 'CurseForge App': '🔶', 'Modrinth App': '🟩', GDLauncher: '🟪' };
const lmSel = new Set();
function lmCount() {
  const total = document.querySelectorAll('#lm-list .lm-item:not(.off)').length;
  $('lm-count').textContent = `${lmSel.size} de ${total} marcadas`;
  $('lm-go').disabled = !lmSel.size;
  $('lm-go').textContent = lmSel.size ? `Importar ${lmSel.size} ${lmSel.size === 1 ? 'instancia' : 'instancias'}` : 'Importar seleccionadas';
  $('lm-all').checked = total > 0 && lmSel.size === total;
}
const LM_PICK = [
  ['Modrinth App', '#1bd96a'], ['CurseForge App', '#f16436'], ['Prism Launcher', '#8b5cf6'],
  ['MultiMC', '#a3a3a3'], ['ATLauncher', '#3b82f6'], ['GDLauncher', '#14b8a6']
];
let lmFound = [];
function lmShow(step) {
  const list = step === 'list';
  $('lm-picker').hidden = list; $('lm-step-list').hidden = !list; $('lm-back').hidden = !list;
  $('lm-h').textContent = list ? 'Elige qué importar' : 'Desde otros launchers';
  $('lm-sub').textContent = list ? 'Marca las que quieras copiar a Nova PX; las originales no se tocan.' : 'Elige el launcher del que quieres traer tus perfiles.';
}
function lmPaintPicker() {
  const box = $('lm-picker');
  box.replaceChildren();
  const count = (name) => lmFound.filter((x) => x.launcher === name || (name === 'Prism Launcher' && x.launcher === 'PolyMC')).length;
  LM_PICK.forEach(([name, color]) => {
    const n = count(name);
    const c = el('button', 'lm-pick' + (n ? '' : ' none'));
    c.type = 'button';
    const logo = el('span', 'lm-pick-logo', name.replace(/ (App|Launcher)$/, '').split(/(?=[A-Z])/).map((w) => w[0]).join('').slice(0, 2).toUpperCase());
    logo.style.setProperty('--c', color);
    c.append(logo, el('b', '', name), el('small', 'muted', n ? `${n} ${n === 1 ? 'perfil encontrado' : 'perfiles encontrados'}` : 'No encontrado'));
    c.addEventListener('click', () => lmPaintList(name));
    box.append(c);
  });
  const other = el('button', 'lm-pick lm-pick-folder'); other.type = 'button';
  other.append(el('span', 'lm-pick-logo', '📁'), el('b', '', 'Otra carpeta'), el('small', 'muted', 'Elige la carpeta de una instancia'));
  other.addEventListener('click', () => { $('lm-modal').close(); doImport({ kind: 'folder' }); });
  box.append(other);
}
function lmPaintList(name) {
  lmSel.clear();
  lmShow('list');
  const list = $('lm-list');
  list.replaceChildren();
  const found = lmFound.filter((x) => x.launcher === name || (name === 'Prism Launcher' && x.launcher === 'PolyMC'));
  if (!found.length) {
    const box = el('div', 'lm-empty');
    box.append(el('strong', '', `No encontré perfiles de ${name} en las carpetas habituales`), el('p', 'muted', 'Si los guardas en otro sitio, usa «Elegir carpeta a mano» y selecciona la carpeta de la instancia.'));
    list.append(box); lmCount(); return;
  }
  const g = el('section', 'lm-group');
  found.forEach((x) => {
    const row = el('label', `lm-item${x.unsupported ? ' off' : ''}`);
    const cb = el('input'); cb.type = 'checkbox'; cb.disabled = !!x.unsupported;
    cb.addEventListener('change', () => { cb.checked ? lmSel.add(x.dir) : lmSel.delete(x.dir); lmCount(); });
    const body = el('div', 'lm-body');
    body.append(el('strong', '', x.name));
    const chips = el('div', 'ad-chips');
    chips.append(chip(`Minecraft ${x.mcVersion}`), chip(x.loader && x.loader.type !== 'vanilla' ? x.loader.type[0].toUpperCase() + x.loader.type.slice(1) : 'Vanilla'));
    if (x.mods) chips.append(chip(`${x.mods} mods`, 'ok'));
    if (x.unsupported) chips.append(chip(`${x.unsupported}: aún no soportado`, 'warn'));
    body.append(chips);
    row.append(cb, body);
    g.append(row);
  });
  list.append(g);
  lmCount();
}
async function openLauncherImport() {
  lmSel.clear();
  lmShow('picker');
  lmFound = [];
  lmPaintPicker();
  $('lm-sub').textContent = 'Buscando tus perfiles…';
  $('lm-modal').showModal();
  try { lmFound = await window.api.launchersScan(); } catch (e) { toast(cleanError(e), 'error'); }
  $('lm-sub').textContent = 'Elige el launcher del que quieres traer tus perfiles.';
  lmPaintPicker();
}
$('lm-back').addEventListener('click', () => { lmSel.clear(); lmShow('picker'); });
$('lm-close').addEventListener('click', () => $('lm-modal').close());
$('lm-modal').addEventListener('click', (e) => { if (e.target === $('lm-modal')) $('lm-modal').close(); });
$('lm-manual').addEventListener('click', () => { $('lm-modal').close(); doImport({ kind: 'folder' }); });
$('lm-all').addEventListener('change', (e) => {
  document.querySelectorAll('#lm-list .lm-item:not(.off) input').forEach((cb) => { cb.checked = e.target.checked; cb.dispatchEvent(new Event('change')); });
});
$('lm-go').addEventListener('click', async () => {
  if (importing || !lmSel.size) return;
  importing = true;
  let failed = false;
  const dirs = [...lmSel];
  $('lm-modal').close();
  try {
    busyShow('Importando instancias', { text: 'Copiando archivos…' });
    const r = await window.api.launchersImport(dirs);
    if (r.ok.length) toast(`${r.ok.length} ${r.ok.length === 1 ? 'instancia importada' : 'instancias importadas'}`);
    r.failed.forEach((f) => toast(`${f.name}: ${f.error}`, 'error'));
    await loadInstalled();
  } catch (e) { failed = true; toast(cleanError(e), 'error'); renderLibrary(); } finally { busyHide(!failed); importing = false; }
});
$('np-search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = $('np-search').value.trim();
  $('np-modal').close();
  showView('discover');
  $('mp-search').value = q;
  searchPacks(true);
});


/* --- filtros de Explorar --- */
document.querySelectorAll('#mp-f-loader button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('#mp-f-loader button').forEach((x) => x.classList.toggle('active', x === b));
  mp.fLoader = b.dataset.fl;
  searchPacks(true);
}));
$('mp-f-mc').addEventListener('change', () => { mp.fMc = $('mp-f-mc').value; searchPacks(true); });
$('mp-f-sort').addEventListener('change', () => { mp.fSort = $('mp-f-sort').value; searchPacks(true); });
$('mp-go-discover').addEventListener('click', async () => {
  if ($('mp-f-mc').options.length > 1) return;
  await loadMcVersions();
  (mcList || []).slice(0, 60).forEach((v) => { const o = el('option', '', v); o.value = v; $('mp-f-mc').append(o); });
});

/* --- barra lateral compacta (solo iconos) --- */
(function rail() {
  const root = document.documentElement;
  try { root.classList.toggle('rail', localStorage.getItem('novapx-rail') === '1'); } catch {}
  document.querySelectorAll('.tab-btn').forEach((b) => { const l = b.querySelector('.nav-label'); if (l) b.title = l.textContent; });
  $('rail-toggle').addEventListener('click', () => {
    const on = root.classList.toggle('rail');
    try { localStorage.setItem('novapx-rail', on ? '1' : '0'); } catch {}
  });
})();


/* --- Amigos: solicitudes, estado en línea y chat --- */
const lastUnread = new Map();
let friendsFirst = true;
const agoMs = (ms) => {
  const m = Math.max(1, Math.round(ms / 60000));
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
};
const friendHead = (nick) => head3d({ nick }, 26);

async function renderFriends() {
  const list = $('friends-list');
  const req = $('friends-req');
  try {
    const r = await window.api.friendsList();
    if (!r.enabled) { $('friends-card').hidden = true; return; }
    $('friends-card').hidden = false;
    list.replaceChildren();
    req.replaceChildren();
    $('friends-form').hidden = !r.loggedIn;
    if (!r.loggedIn) { $('friends-count').textContent = ''; $('friends-note').textContent = 'Inicia sesión para añadir amigos, ver cuándo están en línea y chatear.'; req.hidden = true; return; }
    const online = r.friends.filter((f) => f.online).length;
    $('friends-count').textContent = r.friends.length ? `(${online} en línea)` : '';
    const notes = [];
    if (!r.reachable) notes.push(r.error || 'No se pudo consultar el estado ahora.');
    else if (!r.sharing) notes.push('Tienes desactivado «compartir uso»: tus amigos te verán desconectado. Actívalo en Ajustes.');
    else if (!r.friends.length && !r.incoming.length && !r.outgoing.length) notes.push('Envía una solicitud con el nick de un amigo. Cuando la acepte, verás si está en línea y podrán chatear.');
    $('friends-note').textContent = notes.join(' ');

    // solicitudes recibidas y enviadas
    req.hidden = !(r.incoming.length || r.outgoing.length);
    if (!req.hidden) {
      r.incoming.forEach((n) => {
        const row = el('div', 'friend-req');
        const ok = el('button', 'primary', 'Aceptar'); ok.type = 'button';
        const no = el('button', 'ghost', 'Rechazar'); no.type = 'button';
        ok.addEventListener('click', async () => { try { await window.api.friendsAccept(n); } catch (e) { toast(cleanError(e), 'error'); } renderFriends(); });
        no.addEventListener('click', async () => { try { await window.api.friendsRemove(n); } catch (e) { toast(cleanError(e), 'error'); } renderFriends(); });
        row.append(friendHead(n), el('span', 'friend-name pii', n), el('span', 'muted friend-st', 'quiere ser tu amigo'), ok, no);
        req.append(row);
      });
      r.outgoing.forEach((n) => {
        const row = el('div', 'friend-req out');
        const no = el('button', 'ghost', 'Cancelar'); no.type = 'button';
        no.addEventListener('click', async () => { try { await window.api.friendsRemove(n); } catch {} renderFriends(); });
        row.append(friendHead(n), el('span', 'friend-name pii', n), el('span', 'muted friend-st', 'solicitud enviada'), no);
        req.append(row);
      });
    }

    r.friends.forEach((f) => {
      const li = el('li', 'friend');
      const dot = el('span', 'live-dot');
      dot.classList.toggle('off', !f.online);
      const name = el('span', 'friend-name pii', f.nick);
      const stTxt = f.playing ? 'Jugando' : f.online ? 'En línea' : f.seen ? `Activo ${agoMs(Date.now() - f.seen)}` : 'Desconectado';
      const st = el('span', 'muted friend-st', stTxt);
      st.dataset.on = f.online || f.playing ? '1' : '0';
      const chat = el('button', 'ghost friend-chat');
      chat.innerHTML = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16a1.5 1.5 0 011.5 1.5v9a1.5 1.5 0 01-1.5 1.5H10l-4.5 3.5V17.5H4A1.5 1.5 0 012.5 16V7A1.5 1.5 0 014 5.5z"/></svg>';
      chat.type = 'button';
      chat.title = `Chatear con ${f.nick}`;
      if (f.unread) chat.append(el('span', 'friend-badge', String(Math.min(f.unread, 9))));
      chat.addEventListener('click', () => openChat(f));
      const rm = el('button', 'ghost friend-rm');
      rm.innerHTML = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      rm.type = 'button';
      rm.setAttribute('aria-label', `Quitar a ${f.nick}`);
      rm.addEventListener('click', async () => {
        if (!(await askConfirm(`¿Quitar a ${f.nick} de tus amigos? También se borrará la conversación.`, 'Quitar', 'Cancelar'))) return;
        try { await window.api.friendsRemove(f.nick); } catch (e) { toast(cleanError(e), 'error'); }
        renderFriends();
      });
      li.append(dot, friendHead(f.nick), el('span', 'friend-info', ''), chat, rm);
      const info = li.querySelector('.friend-info');
      info.append(name, st);
      list.append(li);
      const prev = lastUnread.get(f.nick) || 0;
      if (!friendsFirst && f.unread > prev && !(chatWith && chatWith.toLowerCase() === f.nick.toLowerCase())) toast(`💬 ${f.nick} te escribió`, 'info');
      lastUnread.set(f.nick, f.unread);
    });
    friendsFirst = false;
  } catch { $('friends-note').textContent = 'No se pudo cargar la lista de amigos.'; }
}
$('friends-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const n = $('friends-input').value.trim();
  if (!n) return;
  try {
    const st = await window.api.friendsAdd(n);
    $('friends-input').value = '';
    toast(st === 'accepted' ? `¡Ahora eres amigo de ${n}!` : `Solicitud enviada a ${n}`, 'success');
    await renderFriends();
  } catch (err) { $('friends-note').textContent = cleanError(err); }
});

// Ventana de chat con un amigo (consulta al Worker cada pocos segundos mientras está abierta).
let chatWith = null;
let chatSince = 0;
let chatTimer = null;
function chatBubble(m, me) {
  const mine = m.f.toLowerCase() === String(me).toLowerCase();
  const b = el('div', mine ? 'chat-msg mine' : 'chat-msg');
  b.append(el('span', 'chat-text', m.t), el('small', 'chat-time muted', new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })));
  return b;
}
async function chatPoll() {
  if (!chatWith) return;
  try {
    const r = await window.api.chatPoll(chatWith, chatSince);
    if (!chatWith) return;
    const log = $('chat-log');
    const atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
    if (r.messages && r.messages.length) log.querySelector('.chat-empty')?.remove();
    (r.messages || []).forEach((m) => { log.append(chatBubble(m, r.me)); chatSince = Math.max(chatSince, m.id); });
    if (r.messages && r.messages.length && atEnd) log.scrollTop = log.scrollHeight;
    $('chat-status').textContent = r.playing ? 'Jugando' : r.online ? 'En línea' : 'Desconectado'; $('chat-status').dataset.on = r.online || r.playing ? '1' : '0';
  } catch (e) { $('chat-status').textContent = cleanError(e); }
}
function openChat(f) {
  chatWith = f.nick;
  chatSince = 0;
  $('chat-name').textContent = f.nick;
  $('chat-status').textContent = f.playing ? 'Jugando' : f.online ? 'En línea' : 'Desconectado'; $('chat-status').dataset.on = f.online || f.playing ? '1' : '0';
  $('chat-face').replaceChildren(head3d({ nick: f.nick }, 40));
  const log = $('chat-log');
  log.replaceChildren(el('p', 'muted chat-empty', 'Aquí empieza la conversación. Los mensajes se guardan unos días en el servidor del launcher.'));
  $('chat-input').value = '';
  if (!$('chat-modal').open) $('chat-modal').showModal();
  clearInterval(chatTimer);
  chatPoll().then(() => { log.scrollTop = log.scrollHeight; });
  chatTimer = setInterval(chatPoll, 4000);
  setTimeout(() => $('chat-input').focus(), 50);
}
$('chat-close').addEventListener('click', () => $('chat-modal').close());
$('chat-modal').addEventListener('close', () => { clearInterval(chatTimer); chatWith = null; renderFriends(); });
$('chat-modal').addEventListener('click', (e) => { if (e.target === $('chat-modal')) $('chat-modal').close(); });
$('chat-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $('chat-input').value.trim();
  if (!text || !chatWith) return;
  $('chat-input').value = '';
  try {
    await window.api.chatSend(chatWith, text);
    await chatPoll();
    $('chat-log').scrollTop = $('chat-log').scrollHeight;
  } catch (err) { toast(cleanError(err), 'error'); $('chat-input').value = text; }
});
renderFriends();
setInterval(() => { if (!document.hidden) renderFriends(); }, 45 * 1000);


/* --- Catálogo de modpacks (Modrinth o FTB) --- */
$('mp-provider').addEventListener('change', () => {
  mp.provider = $('mp-provider').value;
  const ftb = mp.provider === 'ftb';
  $('mp-filters').hidden = ftb; // FTB no filtra por loader ni versión desde la búsqueda
  if (ftb) { mp.fLoader = ''; mp.fMc = ''; mp.fSort = ''; }
  searchPacks(true);
});

/* --- Explorar mods, texturas y shaders (como la app de Modrinth) --- */
const D_NAMES = { mod: 'mods', resourcepack: 'texturas', shader: 'shaders' };
document.querySelectorAll('#mp-d-types button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('#mp-d-types button').forEach((x) => x.classList.toggle('active', x === b));
  mp.dType = b.dataset.dt;
  const isPack = mp.dType === 'modpack';
  $('mp-provider').hidden = !isPack;
  $('mp-f-loader').hidden = !(isPack || mp.dType === 'mod');
  $('mp-search').placeholder = isPack ? 'Buscar modpacks…' : `Buscar ${D_NAMES[mp.dType]}…`;
  if (!isPack) $('mp-reco').hidden = true;
  searchPacks(true);
}));

async function searchLoose(reset) {
  const seq = ++mp.seq;
  const note = $('mp-note');
  const grid = $('mp-results');
  if (reset) { mp.offset = 0; grid.replaceChildren(); }
  $('mp-more').hidden = true;
  $('mp-reco').hidden = true;
  note.textContent = 'Buscando…';
  try {
    const r = await window.api.contentSearch({ type: mp.dType, query: mp.query, offset: mp.offset, loader: mp.dType === 'mod' ? (mp.fLoader || '') : '', mc: mp.fMc || '', sort: mp.fSort || '' });
    if (seq !== mp.seq) return;
    mp.total = r.total;
    r.items.forEach((it) => {
      const card = el('div', 'event-card');
      card.append(iconEl(it.icon, it.title, 'event-card-img mp-card-img'));
      const body = el('div', 'event-card-body');
      body.append(el('h3', '', it.title), el('span', 'muted', `${it.author ? 'por ' + it.author + ' · ' : ''}${compact.format(it.downloads)} descargas`), el('p', 'mp-summary', it.summary));
      const btn = el('button', 'primary', 'Instalar en…');
      btn.type = 'button';
      btn.addEventListener('click', () => openPicker(it));
      body.append(btn);
      card.append(body);
      grid.append(card);
    });
    mp.offset += r.items.length;
    note.textContent = r.items.length || grid.childNodes.length ? `${grid.childNodes.length} de ${compact.format(mp.total)} ${D_NAMES[mp.dType]}` : 'No se encontró nada con ese nombre.';
    $('mp-more').hidden = mp.offset >= mp.total || !r.items.length;
  } catch (err) {
    if (seq === mp.seq) note.textContent = `No se pudo buscar: ${cleanError(err)}`;
  }
}

function openPicker(it) {
  $('mp-pick-title').textContent = `Instalar ${it.title}`;
  $('mp-pick-status').textContent = '';
  const list = $('mp-pick-list');
  list.replaceChildren();
  const cands = mp.installed.filter((p) => mp.dType !== 'mod' || (p.loader && p.loader.type && p.loader.type !== 'vanilla'));
  $('mp-pick-info').textContent = cands.length ? 'Elige la instancia. Se instala la última versión compatible con su Minecraft.' : 'No tienes instancias compatibles. Crea una en Biblioteca con "+ Nuevo perfil".';
  cands.forEach((p) => {
    const row = el('div', 'mod-card');
    row.append(packIcon(p, 'mod-icon'));
    const body = el('div', 'mod-body');
    body.append(el('strong', '', p.title), el('span', 'muted', `Minecraft ${p.mcVersion} · ${LOADER_NAMES[p.loader && p.loader.type] || 'Vanilla'}`));
    const btn = el('button', 'primary', 'Instalar');
    btn.type = 'button';
    btn.addEventListener('click', async () => {
      if (mp.busy) return;
      mp.busy = true;
      btn.disabled = true;
      btn.textContent = 'Instalando…';
      try {
        const res = await window.api.instanceInstall({ id: p.id, type: mp.dType, projectId: it.id });
        btn.textContent = res.installed.length ? 'Instalado' : 'Ya lo tenías';
        if (res.installed.length) toast(`${it.title} instalado en ${p.title}`);
      } catch (e) {
        btn.textContent = 'Instalar';
        btn.disabled = false;
        $('mp-pick-status').textContent = cleanError(e);
      } finally { mp.busy = false; busyHide(); }
    });
    row.append(body, btn);
    list.append(row);
  });
  if (!$('mp-pick-modal').open) $('mp-pick-modal').showModal();
}
$('mp-pick-close').addEventListener('click', () => $('mp-pick-modal').close());


/* --- Discord y X (Admin → Control) --- */
function socialMsg(t, bad) { const m = $('soc-msg'); m.textContent = t; m.classList.toggle('bad', !!bad); }
async function refreshSocial() {
  try {
    const r = await window.api.socialStatus();
    $('soc-state').textContent = r.hasWebhook ? 'Webhook guardado: los avisos a Discord están listos.' : 'Todavía no hay webhook: pega uno arriba para poder avisar en Discord.';
  } catch { $('soc-state').textContent = ''; }
}
$('soc-auto-news').checked = keep('soc-auto-news') === '1';
$('soc-auto-event').checked = keep('soc-auto-event') === '1';
$('soc-auto-news').addEventListener('change', () => keep('soc-auto-news', $('soc-auto-news').checked ? '1' : '0'));
$('soc-auto-event').addEventListener('change', () => keep('soc-auto-event', $('soc-auto-event').checked ? '1' : '0'));
$('soc-save').addEventListener('click', async () => {
  try { await window.api.socialSetWebhook($('soc-hook').value); $('soc-hook').value = ''; socialMsg('Webhook guardado.'); refreshSocial(); }
  catch (e) { socialMsg(cleanError(e), true); }
});
$('soc-clear').addEventListener('click', async () => { await window.api.socialClearWebhook().catch(() => {}); socialMsg('Webhook quitado.'); refreshSocial(); });
$('soc-send').addEventListener('click', async () => {
  if (!$('soc-title').value.trim() && !$('soc-text').value.trim()) { socialMsg('Escribe un título o un texto.', true); return; }
  $('soc-send').disabled = true;
  try { await window.api.socialPost({ title: $('soc-title').value, text: $('soc-text').value, link: $('soc-link').value }); socialMsg('Enviado a Discord.'); }
  catch (e) { socialMsg(cleanError(e), true); }
  $('soc-send').disabled = false;
});
$('soc-x').addEventListener('click', async () => {
  const text = [$('soc-title').value.trim(), $('soc-text').value.trim()].filter(Boolean).join(' - ');
  if (!text) { socialMsg('Escribe un título o un texto.', true); return; }
  try { await window.api.socialXShare({ text, link: $('soc-link').value }); socialMsg('Se abrió X con el texto listo; solo falta pulsar Publicar.'); }
  catch (e) { socialMsg(cleanError(e), true); }
});
// Aviso automático (si está activado y hay webhook). Un fallo nunca rompe la publicación.
async function autoDiscord(kind, payload) {
  if (keep(kind === 'news' ? 'soc-auto-news' : 'soc-auto-event') !== '1') return;
  try { await window.api.socialPost(payload); toast('Aviso enviado a Discord'); } catch (e) { toast(`No se pudo avisar en Discord: ${cleanError(e)}`, 'error'); }
}

// Paneles de administración: iconos en pestañas y encabezados de tarjeta (solo decoración).
(function decorateAdmin() {
  const tabIcons = { event: '🎮', team: '👥', events: '🏆', news: '📰', plugins: '🧩', users: '📊', look: '🎨', config: '⚙️', reco: '⭐', control: '🛰️', status: '🩺', warnings: '⚠️', perms: '🔑' };
  document.querySelectorAll('#ad-tabs [data-ad-tab]').forEach((b) => {
    const ic = tabIcons[b.dataset.adTab];
    if (ic && !b.querySelector('.ad-tab-ico')) b.prepend(el('span', 'ad-tab-ico', ic));
  });
  const cardIcons = [
    [/Equipo/, '👥'], [/Historial de eventos/, '🏆'], [/Noticias/, '📰'], [/Conectar el contador/, '🔌'], [/^Usuarios/, '📊'],
    [/apariencia/i, '🎨'], [/Ajustes del launcher/, '⚙️'], [/Discord y X/, '💬'], [/Anuncio global/, '📣'], [/Mantenimiento/, '🛠️'],
    [/recomendados/i, '⭐'], [/Últimos cambios/, '🕘'], [/Quién ve/, '🔑'], [/publique sin/, '🤝']
  ];
  document.querySelectorAll('#page-admin .ad-card > header').forEach((h) => {
    if (h.querySelector('.ad-step, .ad-ico')) return;
    const t = (h.querySelector('h3') || {}).textContent || '';
    const hit = cardIcons.find(([re]) => re.test(t));
    h.prepend(el('span', 'ad-ico', hit ? hit[1] : '•'));
  });
})();

// Vista previa 3D del nick mientras se escribe en Permisos.
(function permPreview() {
  const inp = $('ad-perm-nick'), box = $('ad-perm-preview');
  if (!inp || !box) return;
  let t = 0;
  inp.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const n = inp.value.trim();
      box.replaceChildren();
      if (/^[A-Za-z0-9_]{3,16}$/.test(n)) box.append(head3d({ nick: n }, 40));
    }, 400);
  });
})();


/* --- ventana de ajustes de la instancia --- */
function psSection(name) {
  document.querySelectorAll('[data-ps-sec]').forEach((b) => b.classList.toggle('active', b.dataset.psSec === name));
  document.querySelectorAll('[data-ps-panel]').forEach((x) => { x.hidden = x.dataset.psPanel !== name; });
}
document.querySelectorAll('[data-ps-sec]').forEach((b) => b.addEventListener('click', () => psSection(b.dataset.psSec)));
$('mp-detail-gear').addEventListener('click', async () => {
  if (!mp.pack) return;
  psSection('general');
  await renderPackSettings();
  $('ps-modal').showModal();
});
$('ps-delete').addEventListener('click', () => { $('ps-modal').close(); deletePack(mp.pack); });
document.querySelectorAll('[data-close-dialog]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
document.querySelectorAll('dialog.big-modal').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

/* --- ventana con el contenido que trae el modpack (solo lectura) --- */
const bm = { filter: 'all', sel: new Set() };
const bmKey = (it) => `${it.type}:${it.file}`;
function paintBaseModal() {
  const q = $('bm-search').value.trim().toLowerCase();
  const sort = $('bm-sort').value;
  const state = $('bm-state').value;
  const all = mp.items.filter((i) => i.base);
  let rows = all.filter((i) => (bm.filter === 'all' || i.type === bm.filter) && (state === 'all' || (state === 'on') === i.enabled) && (!q || i.name.toLowerCase().includes(q) || i.file.toLowerCase().includes(q)));
  rows = rows.slice().sort((a, b) => (sort === 'size' ? b.size - a.size : sort === 'za' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name)));
  const valid = new Set(all.map(bmKey));
  for (const k of [...bm.sel]) if (!valid.has(k)) bm.sel.delete(k);
  const list = $('bm-list');
  list.replaceChildren();
  if (!rows.length) list.append(el('p', 'muted empty-note', 'Nada coincide.'));
  rows.forEach((it) => {
    const row = el('div', `bm-row${it.enabled ? '' : ' mod-off'}`);
    const chk = el('input'); chk.type = 'checkbox'; chk.checked = bm.sel.has(bmKey(it)); chk.setAttribute('aria-label', `Seleccionar ${it.name}`);
    chk.addEventListener('change', () => { if (chk.checked) bm.sel.add(bmKey(it)); else bm.sel.delete(bmKey(it)); bmBulk(rows); });
    const proj = el('div', 'bm-proj');
    proj.append(iconEl(it.icon, it.name), el('span', 'type-chip t-' + it.type, TYPE_NAMES[it.type]), el('strong', '', it.name));
    const ver = el('div', 'bm-ver');
    ver.append(el('strong', '', it.version || '—'), el('span', 'muted', it.file.replace(/\.disabled$/i, '')));
    const act = el('div', 'bm-act');
    const sw = el('input', 'switch'); sw.type = 'checkbox'; sw.checked = it.enabled; sw.setAttribute('aria-label', `${it.enabled ? 'Desactivar' : 'Activar'} ${it.name}`);
    sw.addEventListener('change', async () => {
      sw.disabled = true;
      try { await window.api.instanceToggle({ id: mp.pack.id, type: it.type, file: it.file }); await renderContent(); } catch (e) { toast(cleanError(e), 'error'); sw.checked = !sw.checked; sw.disabled = false; }
    });
    const lock = el('span', 'bm-lock', '🔒'); lock.title = 'Viene con el modpack: se puede desactivar, pero no quitar';
    act.append(sw, lock);
    row.append(chk, proj, ver, act);
    ctx(row, () => [
      { title: it.name },
      { icon: '📋', label: 'Copiar nombre', onClick: () => copyText(it.name, 'Nombre copiado') },
      { icon: '📋', label: 'Copiar nombre del archivo', onClick: () => copyText(it.file.replace(/\.disabled$/i, ''), 'Archivo copiado') }
    ]);
    list.append(row);
  });
  bmBulk(rows);
  const c = (t) => all.filter((i) => i.type === t).length;
  $('bm-foot').textContent = `${c('mod')} mods · ${c('shader')} shaders · ${c('resourcepack')} texturas`;
}
function bmBulk(rows) {
  const n = bm.sel.size;
  $('bm-bulk').hidden = !n;
  $('bm-bulk-n').textContent = `${n} seleccionado${n === 1 ? '' : 's'}`;
  const a = $('bm-all'); const vis = rows.filter((r) => bm.sel.has(bmKey(r))).length;
  a.checked = !!rows.length && vis === rows.length; a.indeterminate = vis > 0 && vis < rows.length;
}
async function bmApply(enable) {
  const targets = mp.items.filter((i) => i.base && bm.sel.has(bmKey(i)) && i.enabled !== enable);
  for (const it of targets) { try { await window.api.instanceToggle({ id: mp.pack.id, type: it.type, file: it.file }); } catch {} }
  bm.sel.clear();
  await renderContent();
  toast(`${targets.length} ${enable ? 'activado' : 'desactivado'}${targets.length === 1 ? '' : 's'}`, 'success');
}
$('bm-bulk-on').addEventListener('click', () => bmApply(true));
$('bm-bulk-off').addEventListener('click', () => bmApply(false));
$('bm-state').addEventListener('change', paintBaseModal);
$('bm-all').addEventListener('change', () => {
  const q = $('bm-search').value.trim().toLowerCase(); const state = $('bm-state').value;
  mp.items.filter((i) => i.base && (bm.filter === 'all' || i.type === bm.filter) && (state === 'all' || (state === 'on') === i.enabled) && (!q || i.name.toLowerCase().includes(q))).forEach((i) => { if ($('bm-all').checked) bm.sel.add(bmKey(i)); else bm.sel.delete(bmKey(i)); });
  paintBaseModal();
});
function openBaseModal() {
  const cover = packCover(mp.pack);
  $('bm-icon').hidden = !cover; if (cover) $('bm-icon').src = cover;
  $('bm-title').textContent = 'Contenido del modpack';
  $('bm-search').value = ''; bm.filter = 'all'; bm.sel.clear(); $('bm-state').value = 'all';
  document.querySelectorAll('[data-bm-filter]').forEach((b) => b.classList.toggle('active', b.dataset.bmFilter === 'all'));
  $('bm-search').placeholder = `Buscar ${mp.items.filter((i) => i.base).length} proyectos…`;
  paintBaseModal();
  $('mp-base-modal').showModal();
}
$('bm-search').addEventListener('input', paintBaseModal);
$('bm-sort').addEventListener('change', paintBaseModal);
document.querySelectorAll('[data-bm-filter]').forEach((b) => b.addEventListener('click', () => {
  bm.filter = b.dataset.bmFilter;
  document.querySelectorAll('[data-bm-filter]').forEach((x) => x.classList.toggle('active', x === b));
  paintBaseModal();
}));


/* --- ajustes: canal, memoria, Java, ↺, desvincular y reinstalar --- */
let psChannelValue = 'release';
const CHANNEL_NOTE = { release: 'Solo se ofrecerán versiones estables como actualización.', beta: 'También se ofrecerán versiones beta (pueden tener fallos).', alpha: 'Se ofrecerá cualquier versión, incluidas las alpha (pueden fallar).' };
function psChannel(v) {
  psChannelValue = v;
  document.querySelectorAll('[data-channel]').forEach((b) => { const on = b.dataset.channel === v; b.classList.toggle('active', on); b.textContent = (on ? '✓ ' : '') + b.dataset.channel.charAt(0).toUpperCase() + b.dataset.channel.slice(1); });
  $('ps-channel-note').textContent = CHANNEL_NOTE[v];
}
document.querySelectorAll('[data-channel]').forEach((b) => b.addEventListener('click', () => psChannel(b.dataset.channel)));
$('ps-ram-range').addEventListener('input', () => { $('ps-ram').value = $('ps-ram-range').value; });
$('ps-ram').addEventListener('input', () => { if ($('ps-ram').value) $('ps-ram-range').value = $('ps-ram').value; });
document.querySelectorAll('.ps-reset').forEach((b) => b.addEventListener('click', () => {
  const t = $(b.dataset.reset);
  if (t.type === 'checkbox') t.checked = false; else t.value = '';
  if (b.dataset.reset === 'ps-ram') $('ps-ram-range').value = 4;
  if (b.dataset.reset === 'ps-java') psJavaCheck();
}));
async function psJavaCheck() {
  const st = $('ps-java-state'); const path = $('ps-java').value.trim();
  if (!path) { st.textContent = 'Automática: el launcher elige y descarga la que haga falta.'; st.className = 'muted'; return; }
  st.textContent = 'Comprobando…';
  try {
    const r = await window.api.javaCheck({ path });
    st.textContent = r.valid ? `✓ Válida · Java ${r.major}` : '✕ No se pudo ejecutar esa ruta';
    st.className = r.valid ? 'ps-ok' : 'ps-bad';
  } catch { st.textContent = ''; }
}
$('ps-java').addEventListener('change', psJavaCheck);
$('ps-java-detect').addEventListener('click', async () => {
  const btn = $('ps-java-detect'); btn.disabled = true;
  try {
    const r = await window.api.javaDetect({ mc: mp.pack && mp.pack.mcVersion });
    if (r.best) { $('ps-java').value = r.best.path; await psJavaCheck(); toast(`Java ${r.best.major} encontrada`, 'success'); }
    else toast('No encontré Java instalada. Déjalo vacío y el launcher la descarga sola.', 'error');
  } catch (e) { toast(cleanError(e), 'error'); }
  btn.disabled = false;
});
$('ps-unlink').addEventListener('click', async () => {
  const p = mp.pack;
  if (!await askConfirm(`¿Desvincular "${p.title}"? Se corta la conexión con el modpack para siempre: podrás cambiar el loader y la versión, pero no recibirás sus actualizaciones.`)) return;
  try {
    mp.pack = await window.api.modpackUnlink({ id: p.id });
    await loadInstalled(); openDetailHeader(mp.pack); await renderPackSettings();
    toast('Modpack desvinculado', 'success');
  } catch (e) { toast(cleanError(e), 'error'); }
});
$('ps-reinstall').addEventListener('click', async () => {
  const p = mp.pack;
  if (!await askConfirm(`¿Reinstalar "${p.title}"? Se vuelven a descargar los archivos del modpack. Tus mundos y el contenido extra se conservan.`)) return;
  const btn = $('ps-reinstall'); btn.disabled = true; btn.textContent = 'Reinstalando…';
  try {
    await window.api.modpackInstall({ provider: p.provider, id: p.projectId, versionId: p.versionId, title: p.title, icon: p.icon });
    const fresh = (await loadInstalled()).find((x) => x.id === p.id);
    if (fresh) { mp.pack = fresh; openDetailHeader(fresh); renderContent(); }
    toast('Modpack reinstalado', 'success');
  } catch (e) { toast(cleanError(e), 'error'); }
  btn.disabled = false; btn.textContent = '⭳ Reinstalar modpack';
});


/* --- pestañas Archivos y Compartir --- */
document.querySelectorAll('[data-open-sub]').forEach((b) => b.addEventListener('click', () => {
  if (!mp.pack) return;
  window.api.instanceOpenSub({ id: mp.pack.id, sub: b.dataset.openSub }).catch((e) => toast(cleanError(e), 'error'));
}));
$('mp-share-export').addEventListener('click', () => $('ps-export').click());
$('mp-share-opts').addEventListener('click', async () => { await renderPackSettings(); psSection('general'); $('ps-modal').showModal(); });


/* --- archivos que su autor no deja descargar desde otros programas (CurseForge) --- */
function blockedDialog(entry) {
  const list = (entry.blocked && entry.blocked.length) ? entry.blocked : (entry.skipped || []).map((n) => ({ name: n, projectId: 0, fileId: 0 }));
  if (!list.length) return;
  const dlg = el('dialog', 'event-modal');
  dlg.setAttribute('aria-label', 'Archivos bloqueados por su autor');
  const body = el('div', 'event-modal-body');
  body.append(el('h3', '', `${list.length} archivo${list.length === 1 ? '' : 's'} bloqueado${list.length === 1 ? '' : 's'} por su autor`));
  body.append(el('p', 'muted', 'Los autores de estos mods no permiten bajarlos desde otros programas. El modpack puede fallar sin ellos. Descárgalos tú desde la web: el launcher los detecta en tu carpeta Descargas y los pone solo en la carpeta de mods.'));
  const ul = el('div', 'mp-blocked');
  list.forEach((b) => {
    const row = el('div', 'mp-blocked-row');
    row.append(el('span', '', b.name));
    if (b.projectId && b.fileId) {
      const open = el('button', 'ghost', 'Descargar en la web'); open.type = 'button';
      open.addEventListener('click', () => window.api.openLink(`https://www.curseforge.com/api/v1/mods/${b.projectId}/files/${b.fileId}/download`).catch((e) => toast(cleanError(e), 'error')));
      row.append(open);
    }
    row.dataset.name = b.name;
    ul.append(row);
  });
  body.append(ul);
  // Cuando el jugador baja el archivo, el launcher lo detecta en Descargas y lo mueve solo a la carpeta de mods.
  const names = list.map((b) => b.name);
  const timer = setInterval(async () => {
    try {
      const done = await window.api.instanceCollectDownloads({ id: entry.id, names });
      ul.querySelectorAll('.mp-blocked-row').forEach((row) => {
        if (done.includes(row.dataset.name) && !row.classList.contains('is-done')) {
          row.classList.add('is-done');
          row.replaceChildren(el('span', '', row.dataset.name), el('span', 'muted', '✓ Colocado en mods'));
        }
      });
      if (done.length === names.length) clearInterval(timer);
    } catch {}
  }, 2500);
  dlg.addEventListener('close', () => clearInterval(timer));
  const act = el('div', 'mp-actions');
  const folder = el('button', '', '📁 Abrir carpeta de mods'); folder.type = 'button';
  folder.addEventListener('click', () => window.api.instanceOpenSub({ id: entry.id, sub: 'mods' }).catch((e) => toast(cleanError(e), 'error')));
  const close = el('button', 'primary', 'Cerrar'); close.type = 'button';
  close.addEventListener('click', () => { clearInterval(timer); dlg.close(); dlg.remove(); });
  act.append(folder, close);
  body.append(act);
  dlg.append(body);
  document.body.append(dlg);
  dlg.showModal();
}

// Aviso de zona horaria junto a la fecha de inicio del evento.
(function () {
  const hint = document.getElementById('ad-start-tz');
  if (!hint) return;
  const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || '').replace(/_/g, ' ');
  const off = -new Date().getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0');
  const mm = String(Math.abs(off) % 60).padStart(2, '0');
  hint.textContent = `Hora de tu PC (${tz} · UTC${sign}${hh}:${mm}). Cada jugador la ve en su propia hora local.`;
})();
