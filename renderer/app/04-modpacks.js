/* Interfaz del launcher — Modpacks: biblioteca, explorar e instancias. (parte de lo que antes era app.js; se carga en este orden desde index.html). */

/* ---------- modpacks: biblioteca, explorar e instancia ---------- */
const mp = { view: 'library', provider: 'modrinth', query: '', offset: 0, total: 0, enabled: { modrinth: true }, installed: [], current: null, seq: 0, busy: false, pack: null, filter: 'all', items: [], addType: 'mod', addSeq: 0 };
const compact = new Intl.NumberFormat('es', { notation: 'compact' });
const LOADER_NAMES = { fabric: 'Fabric', forge: 'Forge', vanilla: 'Vanilla', neoforge: 'NeoForge', quilt: 'Quilt' };
const TYPE_NAMES = { mod: 'Mod', shader: 'Shader', resourcepack: 'Textura' };
const packMeta = (p) => `Minecraft ${p.mcVersion} · ${LOADER_NAMES[p.loader && p.loader.type] || 'Vanilla'}${p.version ? ' · ' + p.version : ''}`;

function iconEl(src, name, cls = 'mod-icon') {
  if (src) {
    const img = el('img', cls);
    img.alt = '';
    img.loading = 'lazy';
    img.src = src;
    return img;
  }
  return el('div', `${cls} mod-icon-empty`, (name || '?').slice(0, 1).toUpperCase());
}

/* Portada por defecto: si la instancia no tiene imagen propia, usa la imagen oficial de su versión de Minecraft
   (la misma de la página Versiones). Los snapshots usan la de la versión final a la que pertenecen. */
const versionArt = { map: null, meta: null, loading: null };
function loadVersionArt() {
  if (versionArt.loading) return versionArt.loading;
  versionArt.loading = (async () => {
    try { versionArt.map = (await window.api.mojangVersionArt()) || {}; } catch { versionArt.map = {}; }
    try { versionArt.meta = (await window.api.mcVersionMeta()) || null; } catch { versionArt.meta = null; }
    try { if (typeof renderRecent === 'function' && mp.installed.length) { renderRecent(mp.installed); renderLaunchpad(mp.installed); } } catch {}
  })();
  return versionArt.loading;
}
function artKey(v) {
  const m = /^(\d+)\.(\d+)/.exec(String(v));
  return m ? (+m[1] >= 26 ? m[1] : `${m[1]}.${m[2]}`) : null;
}
function artForVersion(mc, depth = 0) {
  const map = versionArt.map;
  if (!map || !mc) return '';
  if (map[mc]) return map[mc].image;
  const k = artKey(mc);
  if (k) {
    if (map[k]) return map[k].image;
    const sib = Object.keys(map).filter((x) => artKey(x) === k).sort().pop();
    if (sib) return map[sib].image;
    return '';
  }
  // Snapshot / pre-release: la primera versión final publicada después es su serie.
  const vm = versionArt.meta && versionArt.meta.versions;
  if (!vm || !vm[mc] || depth) return '';
  const t = Date.parse(vm[mc].time);
  let best = null;
  for (const [id, m] of Object.entries(vm)) {
    if (m.type !== 'release') continue;
    const mt = Date.parse(m.time);
    if (mt >= t && (!best || mt < best.t)) best = { id, t: mt };
  }
  return best ? artForVersion(best.id, 1) : '';
}

// Imagen de portada de una instancia: la suya o la de su versión de Minecraft (también en perfiles Nova).
function packCover(p) {
  if (!p) return '';
  if (p.icon) return p.icon;
  if (p.emoji) return '';
  const art = artForVersion(p.mcVersion);
  if (!art) loadVersionArt();
  return art || '';
}

// Icono de una instancia: imagen del modpack, emoji elegido por el jugador, portada de su versión o la inicial del nombre.
function packIcon(p, cls = 'mod-icon') {
  if (!p.icon && p.emoji) return el('div', `${cls} mod-icon-empty`, p.emoji);
  if (!p.icon) {
    // Todos los perfiles (también los Nova) usan la portada vanilla de su versión de Minecraft.
    const art = artForVersion(p.mcVersion);
    if (art) {
      const img = iconEl(art, p.title, `${cls} mod-icon-art`);
      img.addEventListener('error', () => { img.replaceWith(el('div', `${cls} mod-icon-empty`, (p.title || '?').slice(0, 1).toUpperCase())); }, { once: true });
      return img;
    }
    loadVersionArt();
  }
  return iconEl(p.icon, p.title, cls);
}

function showView(name) {
  mp.view = name;
  ['library', 'discover', 'detail'].forEach((v) => ($(`mp-view-${v}`).hidden = v !== name));
}

async function openModpacks() {
  try {
    mp.enabled = await window.api.modpackProviders();
  } catch {}
  if (mp.view === 'detail' && mp.pack) return; // vuelve a la instancia que estabas viendo
  showView('library');
  renderLibrary();
}

/* --- biblioteca --- */
async function loadInstalled() {
  try {
    mp.installed = await window.api.modpackInstalled();
  } catch {
    mp.installed = [];
  }
  if (mp.installed.some((p) => !p.icon && !p.emoji)) { try { await Promise.race([loadVersionArt(), new Promise((r) => setTimeout(r, 4000))]); } catch {} }
  return mp.installed;
}

const libView = { sort: 'recent', group: 'none', filter: 'all' };
// Muestra solo si el servidor del modpack está activo y cuántos jugadores hay; nunca la dirección.
function fillServerPill(node, id) {
  window.api.modpackServerStatus(id).then((s) => {
    if (!s || !s.found || s.unknown) return;
    node.hidden = false;
    node.className = `srv-pill ${s.online ? 'on' : 'off'}`;
    node.textContent = s.online ? (s.players ? `● ${s.players.online}/${s.players.max} en línea` : '● Servidor activo') : '● Servidor apagado';
  }).catch(() => {});
}

/* --- clic derecho: acciones rápidas y preferencias de la biblioteca (fijados y ocultos, solo en este equipo) --- */
const ctx = (node, build) => { if (window.NovaCtx) window.NovaCtx.attach(node, build); };
const prefSet = (k) => { try { return new Set(JSON.parse(localStorage.getItem(k) || '[]')); } catch { return new Set(); } };
const prefSave = (k, set) => { try { localStorage.setItem(k, JSON.stringify([...set])); } catch {} };
const libPins = prefSet('novapx-lib-pins');
const libHidden = prefSet('novapx-lib-hidden');
let libShowHidden = false;
const OWN_PROVIDERS = ['custom', 'copy', 'imported'];
const isOwnPack = (p) => !!p && OWN_PROVIDERS.includes(p.provider) && !p.protected;
const copyText = async (t, ok) => { try { await navigator.clipboard.writeText(t); toast(ok || 'Copiado'); } catch { toast('No se pudo copiar', 'error'); } };

async function duplicatePack(p) {
  const withWorlds = await askConfirm('¿Copiar también los mundos?\n\nCon mundos: copia todo. Solo mods: copia los mods y ajustes.', 'Con mundos', 'Solo mods');
  try {
    const copy = await window.api.modpackDuplicate({ id: p.id, withWorlds });
    toast(`Copia creada: ${copy.title}`, 'success');
    await loadInstalled();
    if (mp.view === 'library') renderLibrary();
  } catch (e) { toast(cleanError(e), 'error'); }
}
async function exportPack(p) {
  try {
    const r = await window.api.modpackExport({ id: p.id, bundleAll: false, includeSettings: true });
    if (r) toast(`Exportado: ${r.linked} mods por enlace, ${r.bundled} dentro del archivo`, 'success');
  } catch (e) { toast(cleanError(e), 'error'); }
}
async function deletePack(p) {
  if (!p || !await askConfirm(`¿Eliminar "${p.title}"? Se borrarán sus mods, mundos y ajustes.`)) return;
  try {
    await window.api.modpackRemove(p.id);
    libPins.delete(p.id); libHidden.delete(p.id); prefSave('novapx-lib-pins', libPins); prefSave('novapx-lib-hidden', libHidden);
    toast('Modpack eliminado');
    if (mp.pack && mp.pack.id === p.id) mp.pack = null;
    showView('library');
    renderLibrary();
  } catch (e) { toast(cleanError(e), 'error'); }
}
function packMenu(p, detail) {
  const pinned = libPins.has(p.id);
  return [
    { title: p.title },
    { icon: '▶', label: 'Jugar', onClick: () => playPack(p.id) },
    detail ? null : { icon: '📂', label: 'Abrir detalles', onClick: () => openDetail(p) },
    { icon: '🗂', label: 'Abrir carpeta', onClick: () => window.api.modpackFolder(p.id).catch((e) => toast(cleanError(e), 'error')) },
    'sep',
    { icon: '⧉', label: 'Duplicar…', onClick: () => duplicatePack(p) },
    { icon: '⬆', label: 'Exportar .novapx', onClick: () => exportPack(p) },
    detail ? null : { icon: pinned ? '📌' : '📍', label: pinned ? 'Quitar de fijados' : 'Fijar arriba', onClick: () => { if (pinned) libPins.delete(p.id); else libPins.add(p.id); prefSave('novapx-lib-pins', libPins); renderLibrary(); } },
    detail ? null : { icon: '🙈', label: 'Ocultar de la biblioteca', onClick: () => { libHidden.add(p.id); prefSave('novapx-lib-hidden', libHidden); toast(`"${p.title}" oculto. Clic derecho en el fondo para mostrar los ocultos.`); renderLibrary(); } },
    'sep',
    { icon: '🗑', label: 'Eliminar…', danger: true, onClick: () => deletePack(p) }
  ];
}

function packCard(p) {
  const card = el('div', 'event-card mp-card');
  card.tabIndex = 0;
  card.setAttribute('role', 'link');
  card.setAttribute('aria-label', `${p.title}: abrir`);
  card.dataset.tilt = '';
  const media = el('div', 'mp-media');
  media.append(packIcon(p, 'event-card-img mp-card-img'), el('span', 'mp-badge', p.preset === 'nova' ? '⚡ Nova' : LOADER_NAMES[p.loader && p.loader.type] || 'Vanilla'));
  const play = el('button', 'mp-play', '▶ Jugar');
  play.type = 'button';
  play.addEventListener('click', (e) => { e.stopPropagation(); playPack(p.id); });
  media.append(play);
  const body = el('div', 'event-card-body');
  body.append(el('h3', '', p.title), el('span', 'muted', `Minecraft ${p.mcVersion} · ${ago(p.lastPlayedAt)}`));
  const srv = el('span', 'srv-pill');
  srv.hidden = true;
  body.append(srv);
  fillServerPill(srv, p.id);
  card.append(media, body);
  const open = () => openDetail(p);
  ctx(card, () => packMenu(p, false));
  card.addEventListener('click', open);
  card.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === card) open(); });
  return card;
}

async function renderLibrary() {
  const host = $('mp-library');
  await loadInstalled();
  const q = $('mp-lib-search').value.trim().toLowerCase();
  const f = libView.filter;
  let list = mp.installed.filter((p) => !p.protected && p.provider !== 'event').filter((p) => (!q || p.title.toLowerCase().includes(q)) && (f === 'all' || (f === 'custom' ? p.provider === 'custom' : (p.loader && p.loader.type) === f)));
  const byName = (a, b) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' });
  const sorters = {
    recent: (a, b) => String(b.lastPlayedAt || '').localeCompare(String(a.lastPlayedAt || '')) || byName(a, b),
    name: byName,
    mc: (a, b) => String(b.mcVersion).localeCompare(String(a.mcVersion), undefined, { numeric: true }) || byName(a, b)
  };
  list = list.sort(sorters[libView.sort]);
  const hiddenCount = list.filter((p) => libHidden.has(p.id)).length;
  if (!libShowHidden) list = list.filter((p) => !libHidden.has(p.id));
  list = [...list.filter((p) => libPins.has(p.id)), ...list.filter((p) => !libPins.has(p.id))];
  host.replaceChildren();
  paintLibStats();
  if (window.serversPaintLibrary) window.serversPaintLibrary();
  $('mp-import-hint').hidden = mp.installed.length > 0 && !$('mp-import-hint').classList.contains('over');
  $('mp-lib-note').textContent = mp.installed.length
    ? `${list.length} de ${mp.installed.length} modpack${mp.installed.length === 1 ? '' : 's'}${hiddenCount ? ` · ${hiddenCount} oculto${hiddenCount === 1 ? '' : 's'}${libShowHidden ? ' (visibles)' : ''}` : ''}`
    : '';
  if (!list.length) host.append(libraryEmptyState(mp.installed.length === 0));
  const groups = new Map();
  list.forEach((p) => {
    const key = libView.group === 'loader' ? LOADER_NAMES[p.loader && p.loader.type] || 'Vanilla' : libView.group === 'mc' ? `Minecraft ${p.mcVersion}` : '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  });
  groups.forEach((items, key) => {
    if (key) host.append(el('h3', 'mp-group', `${key} · ${items.length}`));
    const grid = el('div', 'events-grid mp-grid');
    items.forEach((p) => { const c = packCard(p); c.classList.toggle('pinned', libPins.has(p.id)); c.classList.toggle('is-hidden', libHidden.has(p.id)); grid.append(c); });
    host.append(grid);
  });
}
function paintLibStats() {
  const box = $('mp-lib-stats');
  const all = mp.installed.filter((p) => !p.protected && p.provider !== 'event');
  if (!all.length) { box.hidden = true; return; }
  box.hidden = false; box.replaceChildren();
  const last = [...all].filter((p) => p.lastPlayedAt).sort((a, b) => String(b.lastPlayedAt).localeCompare(String(a.lastPlayedAt)))[0];
  const loaders = {};
  all.forEach((p) => { const n = LOADER_NAMES[p.loader && p.loader.type] || 'Vanilla'; loaders[n] = (loaders[n] || 0) + 1; });
  const top = Object.entries(loaders).sort((a, b) => b[1] - a[1])[0];
  const mine = all.filter((p) => p.provider === 'custom').length;
  [['📦', String(all.length), all.length === 1 ? 'modpack' : 'modpacks'], ['🛠', String(mine), 'creados por ti'], ['🧩', top ? top[0] : '–', 'loader más usado'], ['🕘', last ? last.title : 'Aún nada', 'último que jugaste']].forEach(([i, v, l]) => {
    const t = el('div', 'lib-stat'); const b = el('div'); b.append(el('strong', '', v), el('span', 'muted', l)); t.append(el('span', 'lib-stat-ico', i), b); box.append(t);
  });
}
// Estado vacío de la biblioteca: con acciones directas en vez de una línea de texto suelta.
function libraryEmptyState(firstTime) {
  const box = el('div', 'empty-state');
  if (firstTime) {
    box.append(
      el('div', 'empty-ico', '📦'),
      el('strong', 'empty-title', 'Tu biblioteca está vacía'),
      el('p', 'muted', 'Crea tu propia instancia, impórtala de otro launcher o explora Modrinth.')
    );
    const row = el('div', 'empty-actions');
    const create = el('button', 'primary', '+ Nuevo perfil');
    create.type = 'button';
    create.addEventListener('click', () => $('mp-new-profile').click());
    const explore = el('button', '', 'Explorar modpacks');
    explore.type = 'button';
    explore.addEventListener('click', () => $('mp-go-discover').click());
    row.append(create, explore);
    box.append(row);
  } else {
    box.append(el('div', 'empty-ico', '🔍'), el('strong', 'empty-title', 'Ningún modpack coincide'), el('p', 'muted', 'Prueba con otro nombre o cambia el filtro.'));
  }
  return box;
}
ctx($('mp-library'), () => [
  { title: 'Biblioteca' },
  { icon: '＋', label: 'Nuevo perfil', onClick: () => $('mp-new-profile').click() },
  { icon: '⬇', label: 'Importar archivo…', onClick: () => $('mp-import-file').click() },
  { icon: '📁', label: 'Importar carpeta…', onClick: () => $('mp-import-folder').click() },
  { icon: '🔎', label: 'Explorar modpacks', onClick: () => $('mp-go-discover').click() },
  'sep',
  { icon: libShowHidden ? '🙈' : '👁', label: libShowHidden ? 'Ocultar de nuevo los ocultos' : `Mostrar ocultos${libHidden.size ? ` (${libHidden.size})` : ''}`, disabled: !libHidden.size && !libShowHidden, onClick: () => { libShowHidden = !libShowHidden; renderLibrary(); } },
  libHidden.size ? { icon: '↩', label: 'Volver a mostrar todos', onClick: () => { libHidden.clear(); prefSave('novapx-lib-hidden', libHidden); renderLibrary(); } } : null,
  { icon: '↻', label: 'Actualizar lista', onClick: () => renderLibrary() }
]);
$('mp-lib-sort').addEventListener('change', (e) => { libView.sort = e.target.value; renderLibrary(); });
$('mp-lib-group').addEventListener('change', (e) => { libView.group = e.target.value; renderLibrary(); });
document.querySelectorAll('[data-lf]').forEach((b) => b.addEventListener('click', () => {
  libView.filter = b.dataset.lf;
  document.querySelectorAll('[data-lf]').forEach((x) => x.classList.toggle('active', x === b));
  renderLibrary();
}));
$('mp-lib-search').addEventListener('input', renderLibrary);

$('mp-go-discover').addEventListener('click', () => {
  showView('discover');
  if (!$('mp-results').childNodes.length) searchPacks(true);
});
$('mp-back-lib').addEventListener('click', () => { showView('library'); renderLibrary(); });
$('mp-detail-back').addEventListener('click', () => { mp.pack = null; showView('library'); renderLibrary(); });

async function playPack(id) {
  if (!loggedIn) {
    goTo('account');
    showMsg('Inicia sesión como premium o no premium para jugar.', true);
    return;
  }
  const p = mp.installed.find((x) => x.id === id) || (await window.api.modpackInstalled()).find((x) => x.id === id) || {};
  // La pantalla de carga de un modpack usa su propia portada (o la de su versión), no el logo del evento.
  launchTarget = { kind: 'pack', title: p.title || 'Modpack', icon: packCover(p) || '', preset: p.preset || '' };
  setPlaying(true);
  showCrash(null);
  goTo('home');
  $('np-status').textContent = 'Preparando el modpack…';
  $('np-progress').hidden = true;
  try {
    await window.api.launch({ modpackId: id });
  } catch (err) {
    $('np-status').textContent = `No se pudo iniciar: ${cleanError(err)}`;
    $('np-progress').hidden = true;
    setPlaying(false);
    toast(`No se pudo iniciar: ${cleanError(err)}`, 'error');
  }
}

/* --- instancia --- */
function setTab(tab) {
  document.querySelectorAll('[data-mp-tab]').forEach((b) => b.classList.toggle('active', b.dataset.mpTab === tab));
  ['content', 'files', 'worlds', 'shots', 'logs', 'share'].forEach((t) => ($(`mp-tab-${t}`).hidden = t !== tab));
  if (tab === 'content') renderContent();
  if (tab === 'worlds') renderWorlds();
  if (tab === 'shots') renderShots();
  if (tab === 'logs') renderPackLog();
}
document.querySelectorAll('[data-mp-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.mpTab)));

function openDetailHeader(p) {
  const cover = packCover(p);
  const icon = $('mp-detail-icon');
  icon.hidden = !cover;
  if (cover) icon.src = cover;
  $('mp-detail-title').textContent = `${!p.icon && p.emoji ? p.emoji + ' ' : ''}${p.title}`;
  $('mp-detail-meta').textContent = packMeta(p);
  const head = $('mp-view-detail').querySelector('.mp-detail-head');
  if (cover) head.style.setProperty('--mp-img', `url("${String(cover).replace(/"/g, '%22')}")`); else head.style.removeProperty('--mp-img');
  head.classList.toggle('has-img', !!cover);
  paintPackChips(p);
  paintPackStats(p);
}
// Cuadros de datos bajo la cabecera de la instancia.
function paintPackStats(p) {
  let box = $('mp-detail-stats');
  if (!box) { box = el('div', 'mp-stats'); box.id = 'mp-detail-stats'; $('mp-view-detail').querySelector('.mp-detail-head').after(box); }
  box.replaceChildren();
  const tile = (ico, label, value) => { const t = el('div', 'mp-stat'); t.append(el('span', 'mp-stat-ico', ico), el('div', 'mp-stat-txt', null)); t.lastChild.append(el('small', '', label), el('b', '', value)); box.append(t); };
  const items = mp.pack === p && mp.items ? mp.items : null;
  tile('🕒', 'Última partida', p.lastPlayedAt ? ago(p.lastPlayedAt) : 'Aún sin jugar');
  tile('🎮', 'Minecraft', `${p.mcVersion} · ${LOADER_NAMES[p.loader && p.loader.type] || 'Vanilla'}`);
  tile('🧩', 'Mods', items ? String(items.filter((i) => i.type === 'mod').length) : '…');
  tile('💾', 'Tamaño', items ? fmtSize(items.reduce((n, i) => n + (i.size || 0), 0)) : '…');
}
const SRC_NAMES = { modrinth: 'Modrinth', custom: 'Perfil propio', copy: 'Copia', curseforge: 'CurseForge', ftb: 'FTB' };
function paintPackChips(p) {
  let box = $('mp-detail-chips');
  if (!box) {
    box = el('div', 'mp-chips'); box.id = 'mp-detail-chips';
    $('mp-detail-meta').after(box);
  }
  box.replaceChildren();
  const add = (cls, text) => box.append(el('span', `mp-chip ${cls || ''}`, text));
  add('mc', `Minecraft ${p.mcVersion}`);
  add('loader', LOADER_NAMES[p.loader && p.loader.type] || 'Vanilla');
  if (p.provider) add('', SRC_NAMES[p.provider] || p.provider);
  if (p.lastPlayedAt) add('', `Jugado ${ago(p.lastPlayedAt)}`); else add('', 'Sin jugar');
  if (mp.items && mp.pack === p && mp.items.length) {
    const c = (t) => mp.items.filter((i) => i.type === t).length;
    const total = mp.items.reduce((n, i) => n + (i.size || 0), 0);
    add('ok', `🧩 ${c('mod')} mods`);
    if (c('shader')) add('ok', `✨ ${c('shader')} shaders`);
    if (c('resourcepack')) add('ok', `🎨 ${c('resourcepack')} texturas`);
    const off = mp.items.filter((i) => !i.enabled).length;
    if (off) add('warn', `⏸ ${off} desactivados`);
    add('', fmtSize(total));
  }
}

function openDetail(p) {
  mp.pack = p;
  mp.filter = 'all';
  mp.baseOpen = false;
  $('mp-content-search').value = '';
  document.querySelectorAll('[data-mp-filter]').forEach((b) => b.classList.toggle('active', b.dataset.mpFilter === 'all'));
  openDetailHeader(p);
  showView('detail');
  setTab('content');
}

$('mp-detail-play').addEventListener('click', () => mp.pack && playPack(mp.pack.id));
$('mp-detail-folder').addEventListener('click', () => mp.pack && window.api.modpackFolder(mp.pack.id).catch((e) => toast(cleanError(e), 'error')));
$('mp-detail-delete').addEventListener('click', () => deletePack(mp.pack));
ctx($('mp-view-detail').querySelector('.mp-detail-head'), () => (mp.pack ? packMenu(mp.pack, true) : null));

const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

async function renderContent() {
  const p = mp.pack;
  if (!p) return;
  const list = $('mp-content-list');
  const note = $('mp-content-note');
  note.textContent = 'Cargando contenido…';
  try {
    const r = await window.api.instanceContent(p.id);
    if (mp.pack !== p) return;
    mp.items = r.items;
    paintPackChips(p); paintPackStats(p);
    paintContent(r.offline);
    if ($('mp-base-modal').open) paintBaseModal();
    if (!r.offline && r.items.length) autoCheckUpdates(p);
  } catch (err) {
    list.replaceChildren();
    note.textContent = cleanError(err);
  }
}

function paintContent(offline) {
  const list = $('mp-content-list');
  const q = $('mp-content-search').value.trim().toLowerCase();
  const shown = mp.items.filter((it) => (mp.filter === 'all' || it.type === mp.filter) && (!q || it.name.toLowerCase().includes(q) || it.file.toLowerCase().includes(q)));
  list.replaceChildren();
  const count = (t) => mp.items.filter((i) => i.type === t).length;
  $('mp-content-note').textContent = mp.items.length
    ? `${shown.length} de ${mp.items.length} · ${count('mod')} mods · ${count('shader')} shaders · ${count('resourcepack')} texturas${offline ? ' · sin conexión: nombres e iconos pueden faltar' : ''}`
    : 'Este modpack todavía no tiene mods, shaders ni texturas. Usa "Explorar contenido" o "Cargar archivos".';
  if (!shown.length && mp.items.length && !mp.items.some((i) => i.base)) {
    const EMPTY = { mod: 'No tienes ningún mod instalado. Explora contenido para buscar uno.', shader: 'No tienes ningún shader instalado. Explora contenido para buscar uno.', resourcepack: 'No tienes ninguna textura instalada. Explora contenido para buscar una.' };
    list.append(el('p', 'muted empty-note', q ? 'Nada coincide con tu búsqueda.' : EMPTY[mp.filter] || 'No hay nada para mostrar.'));
  }
  const buildRow = (it, locked) => {
    const row = el('div', `mod-card${it.enabled ? '' : ' mod-off'}${locked ? ' mod-locked' : ''}`);
    row.append(iconEl(it.icon, it.name));
    const body = el('div', 'mod-body');
    const top = el('div', 'mod-top');
    top.append(el('strong', '', it.name), el('span', `type-chip t-${it.type}`, TYPE_NAMES[it.type]));
    if (!it.enabled) top.append(el('span', 'type-chip t-off', 'Desactivado'));
    body.append(top, el('span', 'muted', `${it.version ? it.version + ' · ' : ''}${it.file.replace(/\.disabled$/i, '')} · ${fmtSize(it.size)}`));
    row.append(body);
    if (locked) { row.append(el('span', 'type-chip t-lock', '🔒 Del modpack')); return row; }
    const sw = el('input', 'switch');
    sw.type = 'checkbox';
    sw.checked = it.enabled;
    sw.setAttribute('aria-label', `${it.enabled ? 'Desactivar' : 'Activar'} ${it.name}`);
    sw.addEventListener('change', async () => {
      sw.disabled = true;
      try {
        await window.api.instanceToggle({ id: mp.pack.id, type: it.type, file: it.file });
        await renderContent();
      } catch (e) {
        toast(cleanError(e), 'error');
        sw.checked = !sw.checked;
        sw.disabled = false;
      }
    });
    const del = el('button', '', 'Quitar');
    del.type = 'button';
    del.addEventListener('click', async () => {
      if (!await askConfirm(`¿Quitar "${it.name}" de este modpack?`)) return;
      try {
        await window.api.instanceRemove({ id: mp.pack.id, type: it.type, file: it.file });
        await renderContent();
      } catch (e) {
        toast(cleanError(e), 'error');
      }
    });
    row.append(sw, del);
    ctx(row, () => [
      { title: it.name },
      { icon: it.enabled ? '⏸' : '▶', label: it.enabled ? 'Desactivar' : 'Activar', onClick: () => sw.click() },
      { icon: '📋', label: 'Copiar nombre', onClick: () => copyText(it.name, 'Nombre copiado') },
      { icon: '📋', label: 'Copiar nombre del archivo', onClick: () => copyText(it.file.replace(/\.disabled$/i, ''), 'Archivo copiado') },
      'sep',
      { icon: '🗑', label: 'Quitar del modpack…', danger: true, onClick: () => del.click() }
    ]);
    return row;
  };
  const baseAll = mp.items.filter((i) => i.base);
  const baseShown = shown.filter((i) => i.base);
  const extraShown = shown.filter((i) => !i.base);
  const extraAll = mp.items.filter((i) => !i.base);
  if (baseAll.length) {
    const bc = (t) => baseAll.filter((i) => i.type === t).length;
    const card = el('div', 'mp-base');
    const head = el('div', 'mp-base-head');
    head.append(packIcon(mp.pack));
    const info = el('div', 'mp-base-info');
    info.append(el('strong', '', 'Contenido del modpack'), el('span', 'muted', [`${bc('mod')} mods`, bc('resourcepack') ? `${bc('resourcepack')} texturas` : '', bc('shader') ? `${bc('shader')} shaders` : ''].filter(Boolean).join(' · ')));
    const toggle = el('button', 'ghost', 'Ver contenido');
    toggle.type = 'button';
    toggle.addEventListener('click', openBaseModal);
    const wrench = el('button', 'ghost', '🔧'); wrench.type = 'button'; wrench.title = 'Instalación del modpack'; wrench.setAttribute('aria-label', 'Instalación del modpack');
    wrench.addEventListener('click', async () => { await renderPackSettings(); psSection('install'); $('ps-modal').showModal(); });
    head.append(info, toggle, wrench);
    card.append(head, el('div', 'mp-base-lock muted', `🔒 Proporcionado por ${mp.pack.title}. Es el contenido original: no se puede quitar ni cambiar, así no se daña.`));
    list.append(card);
    list.append(el('h3', 'mp-extra-title', 'Contenido extra (tuyo)'));
    if (!extraAll.length) {
      const empty = el('div', 'mp-extra-empty');
      const art = el('div', 'mp-empty-art', '📥');
      const eb = el('div', 'mp-actions');
      const up = el('button', '', '📂 Cargar archivos'); up.type = 'button'; up.addEventListener('click', () => $('mp-add-local').click());
      const br = el('button', 'primary', '🧭 Explorar contenido'); br.type = 'button'; br.addEventListener('click', () => $('mp-add-explore').click());
      eb.append(up, br);
      empty.append(art, el('strong', '', 'No hay contenido extra instalado'), el('span', 'muted', 'Añade contenido encima de este modpack: queda aparte y no toca el original.'), eb);
      list.append(empty);
    } else if (!extraShown.length) {
      list.append(el('p', 'muted empty-note', q ? 'Nada coincide con tu búsqueda.' : 'No hay contenido extra de este tipo.'));
    }
    extraShown.forEach((it) => list.append(buildRow(it, false)));
    return;
  }
  shown.forEach((it) => list.append(buildRow(it, false)));
}
async function bulkToggle(enable) {
  const targets = mp.items.filter((it) => !it.base && (mp.filter === 'all' || it.type === mp.filter) && it.enabled !== enable);
  if (!targets.length) { toast(enable ? 'Todo está activado ya' : 'Todo está desactivado ya'); return; }
  if (!await askConfirm(`¿${enable ? 'Activar' : 'Desactivar'} ${targets.length} elemento${targets.length === 1 ? '' : 's'}${mp.filter === 'all' ? '' : ' de este tipo'}?`)) return;
  let n = 0;
  for (const it of targets) {
    try { await window.api.instanceToggle({ id: mp.pack.id, type: it.type, file: it.file }); n++; } catch {}
  }
  toast(`${n} ${enable ? 'activado' : 'desactivado'}${n === 1 ? '' : 's'}`, 'success');
  renderContent();
}
ctx($('mp-tab-content'), () => [
  { title: 'Contenido' },
  { icon: '🔎', label: 'Explorar contenido', onClick: () => $('mp-add-explore').click() },
  { icon: '＋', label: 'Cargar archivos…', onClick: () => $('mp-add-local').click() },
  { icon: '⟳', label: 'Buscar actualizaciones', onClick: () => $('mp-check-updates').click() },
  ...(isOwnPack(mp.pack) ? [
    'sep',
    { icon: '▶', label: 'Activar todo', hint: mp.filter === 'all' ? '' : 'este tipo', onClick: () => bulkToggle(true) },
    { icon: '⏸', label: 'Desactivar todo', hint: mp.filter === 'all' ? '' : 'este tipo', onClick: () => bulkToggle(false) }
  ] : [])
]);

$('mp-content-search').addEventListener('input', () => paintContent(false));
// El menú de tipo junto a "Cargar archivos" también filtra la lista, para que no parezca un filtro roto.
$('mp-add-type').addEventListener('change', () => {
  mp.filter = $('mp-add-type').value;
  document.querySelectorAll('[data-mp-filter]').forEach((x) => x.classList.toggle('active', x.dataset.mpFilter === mp.filter));
  paintContent(false);
});
document.querySelectorAll('[data-mp-filter]').forEach((b) =>
  b.addEventListener('click', () => {
    mp.filter = b.dataset.mpFilter;
    document.querySelectorAll('[data-mp-filter]').forEach((x) => x.classList.toggle('active', x === b));
    if (mp.filter !== 'all') $('mp-add-type').value = mp.filter;
    paintContent(false);
  })
);

$('mp-add-local').addEventListener('click', async () => {
  try {
    const r = await window.api.instanceAddLocal({ id: mp.pack.id, type: $('mp-add-type').value });
    if (r.added.length) toast(`${r.added.length} archivo(s) añadido(s)`);
    r.errors.forEach((m) => toast(m, 'error'));
    if (r.added.length) renderContent();
  } catch (e) {
    toast(cleanError(e), 'error');
  }
});

let worldsData = [];
// Ícono por defecto de un mundo sin icon.png: bloque de pasto pixelado (se dibuja una vez).
let grassIcon = '';
function defaultWorldIcon() {
  if (grassIcon) return grassIcon;
  const c = document.createElement('canvas');
  c.width = 16; c.height = 16;
  const g = c.getContext('2d');
  let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const top = y < 5 || (y < 7 && rnd() < 0.5);
      const v = 0.85 + rnd() * 0.3;
      const base = top ? [92, 160, 56] : [134, 96, 67];
      g.fillStyle = `rgb(${Math.round(base[0] * v)},${Math.round(base[1] * v)},${Math.round(base[2] * v)})`;
      g.fillRect(x, y, 1, 1);
    }
  }
  grassIcon = c.toDataURL('image/png');
  return grassIcon;
}
const fmtMb = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1e6))} MB`);
function paintWorlds() {
  const list = $('mp-worlds-list');
  list.replaceChildren();
  const q = $('mp-worlds-search').value.trim().toLowerCase();
  const sort = $('mp-worlds-sort').value;
  const items = worldsData.filter((w) => !q || w.name.toLowerCase().includes(q)).sort((x, y) => (sort === 'az' ? x.name.localeCompare(y.name, 'es') : sort === 'size' ? y.size - x.size : y.lastPlayed - x.lastPlayed));
  $('mp-worlds-note').textContent = !worldsData.length ? 'Todavía no hay mundos. Se crean la primera vez que juegues o puedes importarlos de otro launcher.' : items.length ? `${items.length} mundo${items.length === 1 ? '' : 's'}` : 'Ningún mundo coincide con la búsqueda.';
  items.forEach((w) => {
    const row = el('div', 'mod-card mw-row');
    const body = el('div', 'mod-body');
    const meta = [w.version, w.gameMode, w.hardcore ? 'Extremo' : '', w.size ? fmtMb(w.size) : '', `Última vez: ${new Date(w.lastPlayed).toLocaleString('es')}`].filter(Boolean).join(' · ');
    body.append(el('strong', '', w.name), el('span', 'muted', meta));
    const bk = el('button', '', 'Respaldar');
    bk.type = 'button';
    bk.addEventListener('click', async () => {
      bk.disabled = true;
      bk.textContent = 'Respaldando…';
      try {
        const r = await window.api.instanceBackup({ id: mp.pack.id, world: w.name });
        toast(`Respaldo creado: ${r.name}`);
        renderBackups();
      } catch (e) {
        toast(cleanError(e), 'error');
      }
      bk.disabled = false;
      bk.textContent = 'Respaldar';
    });
    let ico;
    ico = el('img', 'mw-icon'); ico.alt = ''; ico.src = w.icon && /^data:image\/png;base64,/.test(w.icon) ? w.icon : defaultWorldIcon();
    row.append(ico, body, bk);
    ctx(row, () => [
      { title: w.name },
      { icon: '💾', label: 'Respaldar este mundo', onClick: () => bk.click() },
      { icon: '📋', label: 'Copiar nombre', onClick: () => copyText(w.name, 'Nombre copiado') },
      { icon: '🗂', label: 'Abrir carpeta de mundos', onClick: () => window.api.instanceOpenSaves(mp.pack.id).catch((e) => toast(cleanError(e), 'error')) },
      ...(isOwnPack(mp.pack) ? [
        'sep',
        { icon: '⧉', label: 'Duplicar mundo', onClick: async () => { try { const r = await window.api.instanceWorldDuplicate({ id: mp.pack.id, world: w.name }); toast(`Copia creada: ${r.name}`, 'success'); renderWorlds(); } catch (e) { toast(cleanError(e), 'error'); } } },
        { icon: '🗑', label: 'Eliminar mundo…', danger: true, onClick: async () => {
          if (!await askConfirm(`¿Eliminar el mundo "${w.name}"?\n\nAntes se guarda un respaldo en la pestaña Mundos > Respaldos.`, 'Eliminar', 'Cancelar')) return;
          try { const r = await window.api.instanceWorldDelete({ id: mp.pack.id, world: w.name }); toast(`Mundo eliminado. Respaldo: ${r.backup}`); renderWorlds(); renderBackups(); } catch (e) { toast(cleanError(e), 'error'); }
        } }
      ] : [])
    ]);
    list.append(row);
  });
}

async function renderWorlds() {
  $('mp-worlds-list').replaceChildren();
  $('mp-worlds-note').textContent = 'Cargando…';
  $('mp-worlds-import').hidden = !isOwnPack(mp.pack);
  try {
    worldsData = await window.api.instanceWorlds(mp.pack.id);
    paintWorlds();
    renderBackups();
  } catch (e) {
    $('mp-worlds-note').textContent = cleanError(e);
  }
}
$('mp-worlds-search').addEventListener('input', paintWorlds);
$('mp-worlds-sort').addEventListener('change', paintWorlds);
$('mp-worlds-folder').addEventListener('click', () => window.api.instanceOpenSaves(mp.pack.id).catch((e) => toast(cleanError(e), 'error')));

/* Importar mundos de otros launchers: lista los que encuentra solo, o se elige un .zip / una carpeta. */
$('mp-worlds-import').addEventListener('click', async () => {
  const dlg = el('dialog', 'event-modal mw-import');
  dlg.setAttribute('aria-label', 'Importar mundos');
  const body = el('div', 'event-modal-body');
  const close = () => { try { dlg.close(); } catch {} dlg.remove(); };
  const done = (r) => { toast(`Mundo importado: ${r.name}`, 'success'); close(); renderWorlds(); };
  const guard = async (fn) => { try { const r = await fn(); if (r) done(r); } catch (e) { toast(cleanError(e), 'error'); } };
  const pick = el('div', 'mp-actions');
  const bz = el('button', '', '📦 Elegir archivo .zip'); bz.type = 'button';
  const bf = el('button', '', '📁 Elegir carpeta'); bf.type = 'button';
  bz.addEventListener('click', () => guard(() => window.api.instanceWorldImportPick({ id: mp.pack.id, kind: 'zip' })));
  bf.addEventListener('click', () => guard(() => window.api.instanceWorldImportPick({ id: mp.pack.id, kind: 'folder' })));
  pick.append(bz, bf);
  const found = el('div', 'mods-list mw-found');
  const note = el('p', 'muted', 'Buscando mundos en tus otros launchers…');
  const x = el('button', 'modal-x', '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Cerrar'); x.addEventListener('click', close);
  body.append(el('h3', 'mp-heading', 'Importar mundos'), el('p', 'muted', 'Se copian a este modpack; el mundo original no se toca.'), pick, el('h4', 'mp-heading', 'Encontrados en tu computadora'), note, found);
  dlg.append(x, body);
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  document.body.append(dlg);
  dlg.showModal();
  try {
    const src = await window.api.instanceWorldSources();
    note.textContent = src.length ? `${src.length} mundo${src.length === 1 ? '' : 's'} encontrados. Pulsa uno para importarlo.` : 'No encontré mundos en otros launchers. Usa "Elegir archivo .zip" o "Elegir carpeta".';
    src.forEach((s) => {
      const row = el('button', 'mod-card mw-src');
      row.type = 'button';
      const b = el('div', 'mod-body');
      b.append(el('strong', '', s.name), el('span', 'muted', [s.launcher, s.instance, s.version, s.gameMode].filter(Boolean).join(' · ')));
      const ic = el('img', 'mw-icon'); ic.alt = ''; ic.src = defaultWorldIcon();
      row.append(ic, b);
      row.addEventListener('click', () => guard(() => window.api.instanceWorldImport({ id: mp.pack.id, dir: s.dir })));
      found.append(row);
    });
  } catch (e) {
    note.textContent = cleanError(e);
  }
});

async function renderShots() {
  const grid = $('mp-shots-grid');
  grid.replaceChildren();
  $('mp-shots-note').textContent = 'Cargando…';
  try {
    const shots = await window.api.instanceScreenshots(mp.pack.id);
    $('mp-shots-note').textContent = shots.length ? `${shots.length} captura${shots.length === 1 ? '' : 's'} recientes (F2 dentro del juego)` : 'Todavía no hay capturas. Pulsa F2 dentro del juego para sacar una.';
    shots.forEach((s) => {
      const card = el('div', 'event-card');
      if (s.thumb) {
        const img = el('img', 'event-card-img');
        img.alt = s.name;
        img.src = s.thumb;
        card.append(img);
      }
      const body = el('div', 'event-card-body');
      body.append(el('span', 'muted', new Date(s.mtime).toLocaleString('es')));
      card.append(body);
      grid.append(card);
    });
  } catch (e) {
    $('mp-shots-note').textContent = cleanError(e);
  }
}
$('mp-shots-open').addEventListener('click', () => window.api.instanceOpenScreenshots(mp.pack.id).catch((e) => toast(cleanError(e), 'error')));

async function renderBackups() {
  const list = $('mp-backups-list');
  list.replaceChildren();
  try {
    const items = await window.api.instanceBackups(mp.pack.id);
    $('mp-backups-note').textContent = items.length ? `${items.length} respaldo${items.length === 1 ? '' : 's'}` : 'Aún no hay respaldos. Pulsa "Respaldar" en un mundo.';
    items.forEach((b) => {
      const row = el('div', 'mod-card');
      const body = el('div', 'mod-body');
      body.append(el('strong', '', b.name), el('span', 'muted', `${new Date(b.mtime).toLocaleString('es')} · ${fmtSize(b.size)}`));
      row.append(el('div', 'mod-icon mod-icon-empty', '🗜'), body);
      list.append(row);
    });
  } catch (e) {
    $('mp-backups-note').textContent = cleanError(e);
  }
}
$('mp-backups-open').addEventListener('click', () => window.api.instanceOpenBackups(mp.pack.id).catch((e) => toast(cleanError(e), 'error')));

async function renderPackLog() {
  const box = $('mp-log');
  box.replaceChildren();
  try {
    const text = await window.api.instanceLog(mp.pack.id);
    if (!text.trim()) return box.append(el('p', 'log-empty', 'Todavía no hay registro. Aparece después de jugar este modpack.'));
    const frag = document.createDocumentFragment();
    text.split('\n').forEach((line) => frag.append(logRow(line)));
    box.append(frag);
    box.scrollTop = box.scrollHeight;
  } catch (e) {
    box.append(el('p', 'log-empty', cleanError(e)));
  }
}


/* --- crear instancia propia --- */
let mcList = null;
async function loadMcVersions(...selects) {
  try {
    mcList = await window.api.modpackMcVersions({ snapshots: !!($('mc-snap') && $('mc-snap').checked) });
  } catch (e) {
    mcList = mcList || [];
    toast(cleanError(e), 'error');
  }
  selects.forEach((sel) => {
    const keep = sel.value;
    sel.replaceChildren();
    mcList.forEach((v) => { const o = el('option', '', v); o.value = v; sel.append(o); });
    if (keep && mcList.includes(keep)) sel.value = keep;
  });
}

/* --- asistente "Crear instancia" --- */
const LOADER_INFO = {
  nova: { icon: '⚡', name: 'Nova', tag: 'Recomendado', desc: 'Fabric + Sodium, Lithium, Iris, Mod Menu y Nova Client. Máximo rendimiento.' },
  fabric: { icon: '🧵', name: 'Fabric', tag: '', desc: 'Ligero y rápido. Mods modernos (desde 1.14).' },
  quilt: { icon: '🪡', name: 'Quilt', tag: '', desc: 'Basado en Fabric, usa sus mods y los de Quilt (desde 1.14).' },
  neoforge: { icon: '🦊', name: 'NeoForge', tag: '', desc: 'El Forge moderno, para mods nuevos (desde 1.20.2).' },
  forge: { icon: '🔨', name: 'Forge', tag: '', desc: 'El clásico: el más compatible con modpacks antiguos.' },
  optifine: { icon: '🔭', name: 'OptiFine', tag: 'Con tu .jar', desc: 'OptiFine solo (sin Forge): el launcher baja el oficial de optifine.net y lo instala solo. Usa Java 8 en versiones viejas.' },
  vanilla: { icon: '🧱', name: 'Vanilla', tag: '', desc: 'Minecraft puro, sin mods.' }
};
const QUICK_EMOJIS = ['🌲', '⚔️', '⛏️', '🏰', '🚀', '🔥', '💎', '🐉', '🎮', '🌙'];
// Versión como lista de números para comparar ("1.20.1" → [1,20,1]); los snapshots (24w14a) no se comparan.
const verParts = (v) => { const m = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(String(v || '')); return m ? [+m[1], +m[2], +(m[3] || 0)] : null; };
const verAtLeast = (v, min) => { const a = verParts(v); if (!a) return true; for (let i = 0; i < 3; i++) { if (a[i] !== (min[i] || 0)) return a[i] > (min[i] || 0); } return true; };
const javaFor = (v) => { const a = verParts(v); if (!a) return null; if (a[0] >= 26) return 25; if (verAtLeast(v, [1, 20, 5])) return 21; if (verAtLeast(v, [1, 18, 0])) return 17; if (verAtLeast(v, [1, 17, 0])) return 16; return 8; };
const loaderOk = (loader, v) => (loader === 'fabric' || loader === 'nova' || loader === 'quilt') ? verAtLeast(v, [1, 14, 0]) : loader === 'neoforge' ? verAtLeast(v, [1, 20, 2]) : true;

const NOVA_CLIENT_26 = ['26.1', '26.1.1', '26.1.2', '26.2', '26.3'];
const NOVA_CLIENT_MC = { includes: (v) => NOVA_CLIENT_26.includes(String(v)) || String(v) === '1.15.2' || (/^1\./.test(String(v)) && verAtLeast(v, [1, 16, 5]) && !verAtLeast(v, [1, 21, 12])) }; // versiones para las que ya hay Nova Client (releases de javierroman94/Nova-Client)
const RANDOM_EMOJIS = ['🌲', '⚔️', '⛏️', '🏰', '🚀', '🔥', '💎', '🐉', '🎮', '🌙', '🧪', '🛡️', '🍀', '🌋', '🦊', '👑'];
const RANDOM_TINTS = ['#a855f7', '#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#14b8a6', '#6366f1'];
const mcw = { mode: 'instance', iconData: '', tint: RANDOM_TINTS[0], srvType: '', srvTypes: [], ram: 4 };

function paintIcon() {
  const box = $('mcw-icon');
  box.replaceChildren();
  box.style.setProperty('--tint', mcw.tint);
  if (mcw.iconData) { const im = document.createElement('img'); im.src = mcw.iconData; im.alt = ''; box.append(im); }
  else box.textContent = $('mc-emoji').value.trim() || (LOADER_INFO[$('mc-loader').value] || LOADER_INFO.nova).icon;
}

function wizChip(label, on, onClick, disabled = false, title = '', icon = null) {
  const c = el('button', 'mcw2-chip' + (on ? ' on' : ''));
  c.type = 'button'; c.disabled = disabled; if (title) c.title = title;
  c.setAttribute('role', 'radio'); c.setAttribute('aria-checked', String(!!on));
  c.textContent = (on ? '✓ ' : '') + label;
  if (icon) c.prepend(icon);
  c.addEventListener('click', onClick);
  return c;
}

function paintWizard() {
  const server = mcw.mode === 'server';
  const ver = $('mc-version').value;
  const box = $('mcw-loaders');
  box.replaceChildren();
  const desc = $('mcw-loader-desc');
  const sum = $('mcw-summary');
  sum.replaceChildren();
  if (server) {
    mcw.srvTypes.forEach((t) => {
      const info = window.serversApi.typeInfo(t.id);
      box.append(wizChip(t.label, mcw.srvType === t.id, () => { mcw.srvType = t.id; loadServerVersions().then(paintWizard); paintWizard(); }));
    });
    const info = window.serversApi.typeInfo(mcw.srvType);
    desc.textContent = `${info[1]} (${info[2]})`;
    sum.append(el('small', 'muted', mcw.srvType === 'spigot' ? 'Spigot se compila al crearlo y la primera vez tarda varios minutos.' : 'Se crea en tu PC para probar; luego lo exportas a tu host. Se descarga solo lo necesario.'));
    const rc = $('mcw-ram-chips');
    rc.replaceChildren();
    [2, 4, 6, 8].forEach((n) => rc.append(wizChip(`${n} GB`, mcw.ram === n, () => { mcw.ram = n; paintWizard(); })));
    $('mc-create').disabled = !ver;
    return;
  }
  let loader = $('mc-loader').value;
  if (!loaderOk(loader, ver)) { loader = 'forge'; $('mc-loader').value = loader; }
  Object.entries(LOADER_INFO).forEach(([id, info]) => {
    const ok = loaderOk(id, ver);
    box.append(wizChip(info.name, loader === id, () => { $('mc-loader').value = id; paintWizard(); }, !ok, ok ? '' : `No disponible en Minecraft ${ver} (necesita 1.14 o más).`, window.loaderIcon ? window.loaderIcon(id) : null));
  });
  const info = LOADER_INFO[loader];
  desc.textContent = info.desc;
  const java = javaFor(ver);
  const row = el('div', 'mcw-sum-row');
  const loaderChip = el('span', 'chip', info.name);
  const loaderArt = window.loaderIcon && window.loaderIcon(loader);
  if (loaderArt) loaderChip.prepend(loaderArt); else loaderChip.textContent = `${info.icon} ${info.name}`;
  row.append(el('span', 'chip', `Minecraft ${ver}`), loaderChip);
  if (java) row.append(el('span', 'chip', `Java ${java}`));
  sum.append(row);
  const notes = [];
  if (loader === 'nova') notes.push(NOVA_CLIENT_MC.includes(ver) ? 'Incluye Nova Client (menú con Shift derecho).' : `Nova Client todavía no existe para ${ver}; se instalan solo los mods de rendimiento.`);
  if (loader === 'optifine') notes.push('OptiFine se baja de optifine.net al crear el perfil y se instala solo la primera vez que juegas (sin Forge).');
  if (java) notes.push(`El launcher instala Java ${java} solo si hace falta.`);
  sum.append(el('small', 'muted', notes.join(' ')));
  if (!$('mc-name').value.trim()) $('mc-name').placeholder = `${info.name} ${ver}`;
  paintIcon();
  $('mc-create').disabled = !(mcList || []).length;
}

async function loadServerVersions() {
  const sel = $('mc-version');
  sel.replaceChildren(); sel.disabled = true;
  $('mc-status').textContent = 'Buscando versiones…';
  const mine = mcw.srvType;
  try {
    const v = await window.serversApi.versions(mine);
    if (mine !== mcw.srvType) return;
    v.slice(0, 80).forEach((x, i) => { const o = el('option', '', i === 0 ? `${x} (la más nueva)` : x); o.value = x; sel.append(o); });
    $('mc-status').textContent = v.length ? '' : 'No hay versiones disponibles.';
  } catch (e) { $('mc-status').textContent = cleanError(e); }
  sel.disabled = false;
}

async function setWizardMode(mode) {
  mcw.mode = mode;
  const server = mode === 'server';
  $('mcw-mode').querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  $('mcw-title').textContent = server ? 'Crear servidor de prueba' : 'Crear instancia';
  $('mc-create').textContent = server ? '＋ Crear servidor' : '＋ Crear instancia';
  $('mcw-iconrow').hidden = server; $('mcw-emojis').hidden = true;
  $('mcw-ram').hidden = !server;
  $('mc-snap').closest('label').hidden = server;
  $('mc-name').placeholder = server ? 'Ej.: Survival, Minijuegos, Pruebas…' : 'Mi survival';
  $('mc-status').textContent = '';
  if (server) {
    if (!mcw.srvTypes.length) mcw.srvTypes = await window.serversApi.types();
    if (!mcw.srvType) mcw.srvType = (mcw.srvTypes.find((t) => t.id === 'paper') || mcw.srvTypes[0] || {}).id || 'vanilla';
    paintWizard();
    await loadServerVersions();
  } else {
    await loadMcVersions($('mc-version'));
    if (mcList.length) $('mc-version').value = mcList.includes('1.21.1') ? '1.21.1' : mcList[0];
  }
  paintWizard();
}

$('mp-go-create').addEventListener('click', async () => {
  $('mc-name').value = '';
  $('mc-emoji').value = '';
  $('mc-loader').value = 'nova';
  mcw.iconData = ''; mcw.tint = RANDOM_TINTS[Math.floor(Math.random() * RANDOM_TINTS.length)];
  $('mc-create').disabled = true;
  let allowed = false;
  try { allowed = !!(await window.api.srvAllowed()); } catch {}
  $('mcw-mode-server').hidden = !allowed;
  const eb = $('mcw-emojis');
  eb.replaceChildren();
  QUICK_EMOJIS.forEach((e) => {
    const b = el('button', 'mcw-emoji', e); b.type = 'button';
    b.addEventListener('click', () => { $('mc-emoji').value = e; mcw.iconData = ''; paintIcon(); });
    eb.append(b);
  });
  $('mp-create-modal').showModal();
  await setWizardMode(mcw.requestMode === 'server' && allowed ? 'server' : 'instance');
  mcw.requestMode = '';
  $('mc-name').focus();
});
$('mcw-mode').addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (b && b.dataset.mode !== mcw.mode) setWizardMode(b.dataset.mode); });
$('mcw-upload').addEventListener('click', async () => {
  try { const r = await window.api.modpackPickIconRaw(); const d = r && await window.NovaCrop.openSized(r.raw, 'modpack', r.kind, 128); if (d) { mcw.iconData = d; paintIcon(); } } catch (e) { toast(cleanError(e), 'error'); }
});
$('mcw-random').addEventListener('click', () => {
  mcw.iconData = '';
  $('mc-emoji').value = RANDOM_EMOJIS[Math.floor(Math.random() * RANDOM_EMOJIS.length)];
  mcw.tint = RANDOM_TINTS[Math.floor(Math.random() * RANDOM_TINTS.length)];
  paintIcon();
});
$('mcw-custom').addEventListener('click', () => { $('mcw-emojis').hidden = !$('mcw-emojis').hidden; });
$('mc-version').addEventListener('change', paintWizard);
$('mc-snap').addEventListener('change', async () => { const keep = $('mc-version').value; await loadMcVersions($('mc-version')); if (mcList.includes(keep)) $('mc-version').value = keep; paintWizard(); });
$('mc-name').addEventListener('input', paintWizard);
$('mcw-x').addEventListener('click', () => $('mp-create-modal').close());
$('mc-cancel').addEventListener('click', () => $('mp-create-modal').close());
$('mp-create-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('mc-create').disabled = true;
  try {
    if (mcw.mode === 'server') {
      window.serversApi.progress((d) => { if (d.text) $('mc-status').textContent = d.text; else if (d.percent != null) $('mc-status').textContent = `Descargando… ${d.percent}%`; });
      $('mc-status').textContent = 'Creando servidor…';
      const made = await window.serversApi.create({ name: $('mc-name').value.trim() || `${mcw.srvType} ${$('mc-version').value}`, type: mcw.srvType, mc: $('mc-version').value, ramGb: mcw.ram });
      $('mp-create-modal').close();
      toast('Servidor creado.');
      try { await window.serversApi.after(made.id); } catch {}
      goTo('servers');
      return;
    }
    const loader = $('mc-loader').value;
    const name = $('mc-name').value.trim() || `${LOADER_INFO[loader].name} ${$('mc-version').value}`;
    $('mc-status').textContent = loader === 'nova' ? 'Instalando mods de rendimiento… puede tardar un poco.' : loader === 'optifine' ? 'Descargando OptiFine…' : 'Creando…';
    const entry = await window.api.modpackCreate({ name, icon: $('mc-emoji').value, iconData: mcw.iconData, mcVersion: $('mc-version').value, loader });
    $('mp-create-modal').close();
    toast(`Instancia "${entry.title}" creada${entry.novaSkipped && entry.novaSkipped.length ? ` (sin ${entry.novaSkipped.length} mod(s) que no existen para esa versión)` : ''}`);
    if (entry.preset === 'nova') toast(entry.novaClient ? 'Nova Client instalado: en el juego pulsa Shift derecho para abrir su menú.' : `Nova Client todavía no tiene versión para Minecraft ${entry.mcVersion} (por ahora 1.16.5 a 1.21.11).`);
    if (entry.preset === 'optifine') toast(entry.optifine ? `OptiFine descargado (${entry.optifine.replace(/^OptiFine_|\.jar$/g, '').replace(/_/g, ' ')}); se instala al pulsar Jugar.` : entry.optifineError ? `No se pudo bajar OptiFine: ${entry.optifineError}` : `OptiFine no tiene versión para Minecraft ${entry.mcVersion}; no se puede crear este perfil.`);
    await loadInstalled();
    openDetail(entry);
  } catch (err) {
    $('mc-status').textContent = cleanError(err);
  }
  $('mc-create').disabled = false;
});

/* --- ajustes de la instancia --- */
async function renderPackSettings() {
  const p = mp.pack;
  const s = p.settings || {};
  const own = p.provider === 'custom';
  $('ps-title').value = p.title;
  $('ps-head-title').textContent = p.title;
  const hi = $('ps-head-icon'); const cover = packCover(p);
  hi.hidden = !cover; if (cover) hi.src = cover;
  const info = $('ps-info'); info.replaceChildren();
  const irow = (k, v) => { const r = el('div', 'ps-info-row'); r.append(el('span', 'muted', k), el('strong', '', v)); info.append(r); };
  const LN = { vanilla: 'Vanilla', fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge' };
  irow('Plataforma', LN[(p.loader && p.loader.type) || 'vanilla'] || 'Vanilla');
  irow('Versión del juego', p.mcVersion);
  if (p.loader && p.loader.version) irow('Versión del loader', p.loader.version);
  if (p.provider !== 'custom') irow('Modpack instalado', `${p.title}${p.version ? ' · ' + p.version : ''}`);
  $('ps-emoji').value = p.emoji || '';
  $('ps-notes').value = p.notes || '';
  $('ps-ram').value = s.ramGb || '';
  $('ps-args').value = s.jvmArgs || '';
  $('ps-java').value = s.javaPath || '';
  $('ps-w').value = s.width || '';
  $('ps-h').value = s.height || '';
  $('ps-full').checked = !!s.fullscreen;
  $('ps-account').value = '';
  paintPackAccounts();
  $('ps-status').textContent = '';
  $('ps-version-box').hidden = !own;
  const linked = ['modrinth', 'curseforge', 'ftb'].includes(p.provider);
  $('ps-linked').hidden = !linked;
  $('ps-change-version').hidden = p.provider !== 'modrinth';
  if (linked) {
    const lc = $('ps-linked-card'); lc.replaceChildren();
    const lt = el('div', 'mp-base-info');
    lt.append(el('strong', '', p.title), el('span', 'muted', `${{ modrinth: 'Modrinth', curseforge: 'CurseForge', ftb: 'FTB' }[p.provider]}${p.version ? ' · ' + p.version : ''}`));
    lc.append(packIcon(p), lt);
  }
  psChannel(p.channel || 'release');
  const big = $('ps-icon-big'); big.replaceChildren(); big.append(packIcon(p, 'ps-icon-img'));
  $('ps-env').value = s.env || '';
  $('ps-pre').value = s.preLaunch || '';
  $('ps-post').value = s.postExit || '';
  document.querySelectorAll('[data-sync]').forEach((c) => { c.checked = !!(s.sync && s.sync[c.dataset.sync]); });
  try {
    const si = await window.api.systemInfo();
    const max = Math.max(2, Math.min(32, si.totalRamGb || 8));
    $('ps-ram-range').max = String(max); $('ps-ram-max').textContent = `${max} GB`;
  } catch {}
  $('ps-ram-range').value = s.ramGb || 4;
  psJavaCheck();
  $('ps-version-note').textContent = own
    ? 'Cambiar la versión o el loader no borra tus mods: revisa que sigan siendo compatibles.'
    : `Modpack de ${p.provider === 'modrinth' ? 'Modrinth' : p.provider === 'curseforge' ? 'CurseForge' : 'otro origen'}: su versión de Minecraft y su loader los define el autor.`;
  if (own) {
    await loadMcVersions($('ps-mc'));
    if (![...$('ps-mc').options].some((o) => o.value === p.mcVersion)) { const o = el('option', '', p.mcVersion); o.value = p.mcVersion; $('ps-mc').prepend(o); }
    $('ps-mc').value = p.mcVersion;
    $('ps-loader').value = (p.loader && p.loader.type) || 'vanilla';
    $('ps-loader-version').value = (p.loader && p.loader.version) || '';
  }
}

$('ps-save').addEventListener('click', async () => {
  const p = mp.pack;
  const num = (id) => ($(id).value ? Number($(id).value) : undefined);
  const changes = {
    title: $('ps-title').value, emoji: $('ps-emoji').value, notes: $('ps-notes').value,
    channel: psChannelValue,
    settings: {
      account: $('ps-account').value, ramGb: num('ps-ram'), jvmArgs: $('ps-args').value, javaPath: $('ps-java').value, width: num('ps-w'), height: num('ps-h'), ...($('ps-full').checked ? { fullscreen: true } : {}),
      env: $('ps-env').value, preLaunch: $('ps-pre').value, postExit: $('ps-post').value,
      sync: Object.fromEntries([...document.querySelectorAll('[data-sync]')].map((c) => [c.dataset.sync, c.checked]))
    }
  };
  if (p.provider === 'custom') { changes.mcVersion = $('ps-mc').value; changes.loader = $('ps-loader').value; changes.loaderVersion = $('ps-loader-version').value.trim(); }
  try {
    mp.pack = await window.api.modpackUpdate({ id: p.id, changes });
    $('ps-status').textContent = 'Ajustes guardados.';
    openDetailHeader(mp.pack);
    await loadInstalled();
  } catch (e) {
    $('ps-status').textContent = cleanError(e);
  }
});

$('ps-icon-pick').addEventListener('click', async () => {
  try {
    const r = await window.api.modpackPickIconRaw();
    const d = r && await window.NovaCrop.openSized(r.raw, 'modpack', r.kind, 128);
    if (!d) return;
    const e = await window.api.modpackSetIcon({ id: mp.pack.id, data: d });
    mp.pack = e;
    openDetailHeader(e);
    await loadInstalled();
    $('ps-status').textContent = 'Imagen actualizada.';
  } catch (err) { $('ps-status').textContent = cleanError(err); }
});
$('ps-icon-clear').addEventListener('click', async () => {
  try {
    mp.pack = await window.api.modpackUpdate({ id: mp.pack.id, changes: { removeIcon: true } });
    openDetailHeader(mp.pack);
    await loadInstalled();
    $('ps-status').textContent = 'Imagen quitada.';
  } catch (err) { $('ps-status').textContent = cleanError(err); }
});
window.api.onModpacksChanged(async () => { await loadInstalled(); if (mp.view === 'library') renderLibrary(); });

$('ps-dup').addEventListener('click', async () => {
  const withWorlds = await askConfirm('¿Copiar también los mundos?\n\nCon mundos: copia todo. Solo mods: copia los mods y ajustes.', 'Con mundos', 'Solo mods');
  $('ps-dup').disabled = true;
  try {
    const copy = await window.api.modpackDuplicate({ id: mp.pack.id, withWorlds });
    toast(`Copia creada: ${copy.title}`);
    await loadInstalled();
    openDetail(copy);
  } catch (e) {
    $('ps-status').textContent = cleanError(e);
  }
  $('ps-dup').disabled = false;
});

$('ps-change-version').addEventListener('click', () => {
  const p = mp.pack;
  openPackModal({ provider: p.provider, id: p.projectId, title: p.title, icon: p.icon, author: '', summary: 'Elige otra versión de este modpack. Tus mundos y ajustes se conservan; los mods se reemplazan por los de la versión elegida.', url: '' });
});
$('mp-modal').addEventListener('close', async () => {
  if (mp.view !== 'detail' || !mp.pack) return;
  const fresh = (await loadInstalled()).find((x) => x.id === mp.pack.id);
  if (fresh) { mp.pack = fresh; openDetailHeader(fresh); renderContent(); }
});

// Buscar y aplicar actualizaciones de mods.
// Cuadro de actualizaciones: una fila por mod con su versión nueva y casilla para elegir cuáles actualizar.
function updatesDialog(ups) {
  return new Promise((resolve) => {
    const dlg = el('dialog', 'event-modal upd-dialog');
    dlg.setAttribute('aria-label', 'Actualizar contenido');
    const body = el('div', 'event-modal-body');
    const known = (f, t) => (mp.items || []).find((i) => i.file === f && (!t || i.type === t));
    const head = el('div', 'upd-head');
    head.append(el('h3', '', `${ups.length} elemento${ups.length === 1 ? '' : 's'} con versión nueva`), el('p', 'muted', 'Elige cuáles quieres actualizar. Se descargan de Modrinth y se comprueba su huella antes de reemplazar el archivo.'));
    const tools = el('div', 'upd-tools');
    const all = el('button', 'ghost', 'Marcar todos'); all.type = 'button';
    const none = el('button', 'ghost', 'Quitar todos'); none.type = 'button';
    tools.append(all, none);
    const list = el('div', 'upd-list');
    const rows = ups.map((u) => {
      const it = known(u.file, u.type);
      const row = el('label', 'upd-row');
      const cb = el('input'); cb.type = 'checkbox'; cb.checked = true;
      const txt = el('div', 'upd-txt');
      const top = el('div', 'upd-top');
      top.append(el('strong', '', it ? it.name : u.file.replace(/\.disabled$/i, '').replace(/\.jar$/i, '')));
      top.append(el('span', `type-chip t-${u.type || 'mod'}`, TYPE_NAMES[u.type || 'mod']));
      if (!u.enabled) top.append(el('span', 'type-chip t-off', 'Desactivado'));
      const ver = el('div', 'upd-ver');
      ver.append(el('span', 'upd-old', (it && it.version) || 'actual'), el('span', 'upd-arrow', '→'), el('span', 'upd-new', u.version || 'nueva'));
      txt.append(top, ver, el('small', 'muted upd-file', `${u.newFile}`));
      row.append(cb, iconEl(it && it.icon, it ? it.name : u.file), txt);
      list.append(row);
      return { u, cb };
    });
    const foot = el('div', 'upd-foot');
    const count = el('span', 'muted upd-count');
    const cancel = el('button', '', 'Cancelar'); cancel.type = 'button';
    const ok = el('button', 'primary', 'Actualizar'); ok.type = 'button';
    foot.append(count, cancel, ok);
    const refresh = () => {
      const n = rows.filter((r) => r.cb.checked).length;
      count.textContent = `${n} de ${rows.length} seleccionados`;
      ok.disabled = !n;
      ok.textContent = n ? `Actualizar ${n}` : 'Actualizar';
    };
    rows.forEach((r) => r.cb.addEventListener('change', refresh));
    all.addEventListener('click', () => { rows.forEach((r) => (r.cb.checked = true)); refresh(); });
    none.addEventListener('click', () => { rows.forEach((r) => (r.cb.checked = false)); refresh(); });
    let done = false;
    const finish = (v) => { if (done) return; done = true; dlg.close(); dlg.remove(); resolve(v); };
    cancel.addEventListener('click', () => finish(null));
    ok.addEventListener('click', () => finish(rows.filter((r) => r.cb.checked).map((r) => `${r.u.type || 'mod'}:${r.u.file}`)));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(null); });
    body.append(head, tools, list, foot);
    dlg.append(body);
    document.body.append(dlg);
    refresh();
    dlg.showModal();
  });
}

// Aviso en el botón: al abrir el contenido se busca solo en segundo plano y se muestra cuántas hay.
function setUpdBadge(n) {
  const b = $('mp-check-updates');
  if (b) b.textContent = n ? `Buscar actualizaciones (${n})` : 'Buscar actualizaciones';
  if (b) b.classList.toggle('has-upd', n > 0);
}
let updAuto = 0;
async function autoCheckUpdates(p) {
  const my = ++updAuto;
  setUpdBadge(0);
  try {
    const ups = await window.api.instanceUpdatesCheck(p.id);
    if (my === updAuto && mp.pack === p) setUpdBadge(ups.length);
  } catch { /* sin conexión: no se avisa */ }
}
$('mp-check-updates').addEventListener('click', async () => {
  const btn = $('mp-check-updates');
  const note = $('mp-content-note');
  btn.disabled = true;
  try {
    note.textContent = 'Buscando actualizaciones en Modrinth…';
    const ups = await window.api.instanceUpdatesCheck(mp.pack.id);
    if (!ups.length) { note.textContent = 'Todo está al día.'; setUpdBadge(0); return; }
    const chosen = await updatesDialog(ups);
    if (!chosen) { note.textContent = `${ups.length} actualizaciones disponibles.`; return; }
    note.textContent = 'Actualizando…';
    const r = await window.api.instanceUpdatesApply({ id: mp.pack.id, only: chosen });
    toast(`${r.updated} elemento${r.updated === 1 ? '' : 's'} actualizado${r.updated === 1 ? '' : 's'}`, 'success');
    r.errors.forEach((m) => toast(m, 'error'));
    await renderContent();
  } catch (e) {
    note.textContent = cleanError(e);
  } finally {
    btn.disabled = false;
  }
});


/* --- importar y exportar --- */
let importing = false;
async function doImport(arg) {
  if (importing) return;
  importing = true;
  const note = $('mp-lib-note');
  note.textContent = 'Importando… esto puede tardar si hay muchos mods.';
  try {
    busyShow('Importando modpack', { text: 'Elige el archivo…' });
    const entry = await window.api.modpackImport(arg);
    if (!entry) { await renderLibrary(); return; }
    toast(`"${entry.title}" importado`);
    await loadInstalled();
    openDetail(entry);
  } catch (e) {
    toast(cleanError(e), 'error');
    renderLibrary();
  } finally {
    busyHide();
    importing = false;
  }
}
$('mp-import-launchers').addEventListener('click', () => openLauncherImport());
$('mp-import-file').addEventListener('click', () => doImport({ kind: 'file' }));
$('mp-import-folder').addEventListener('click', () => doImport({ kind: 'folder' }));

const hint = $('mp-import-hint');
['dragenter', 'dragover'].forEach((t) => $('mp-view-library').addEventListener(t, (e) => { e.preventDefault(); hint.hidden = false; hint.classList.add('over'); }));
$('mp-view-library').addEventListener('dragleave', (e) => { if (e.target !== hint) { hint.classList.remove('over'); hint.hidden = mp.installed.length > 0; } });
$('mp-view-library').addEventListener('drop', (e) => {
  e.preventDefault();
  hint.classList.remove('over');
  hint.hidden = mp.installed.length > 0;
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (!f) return;
  const p = window.api.pathForFile(f);
  if (p) doImport({ path: p });
});
// Doble clic en un .novapx desde el Explorador.
window.api.onImportOpen(async (d) => {
  goTo('modpacks');
  showView('library');
  if (d && d.path && await askConfirm(`¿Importar este modpack?\n\n${d.path}`)) doImport({ path: d.path });
});

$('ps-export').addEventListener('click', async () => {
  const btn = $('ps-export');
  btn.disabled = true;
  $('ps-status').textContent = 'Empaquetando…';
  try {
    const r = await window.api.modpackExport({ id: mp.pack.id, bundleAll: $('ps-ex-all').checked, includeSettings: $('ps-ex-settings').checked });
    $('ps-status').textContent = r ? `Exportado: ${r.linked} mods por enlace, ${r.bundled} dentro del archivo (${fmtSize(r.bytes)}).` : '';
  } catch (e) {
    $('ps-status').textContent = cleanError(e);
  }
  btn.disabled = false;
});

/* --- añadir contenido desde Modrinth --- */
let addTimer = 0;
function openAddModal() {
  const p = mp.pack;
  $('mp-add-title').textContent = `Añadir a ${p.title}`;
  $('mp-add-info').textContent = `Solo se muestra lo compatible con Minecraft ${p.mcVersion}${p.loader && p.loader.type !== 'vanilla' ? ' y ' + LOADER_NAMES[p.loader.type] : ''}.`;
  $('mp-add-status').textContent = '';
  $('mp-add-search').value = '';
  mp.addType = $('mp-add-type').value;
  document.querySelectorAll('[data-add-type]').forEach((b) => b.classList.toggle('active', b.dataset.addType === mp.addType));
  if (!$('mp-add-modal').open) $('mp-add-modal').showModal();
  searchContent();
}
$('mp-add-explore').addEventListener('click', openAddModal);
$('mp-add-close').addEventListener('click', () => { if (!mp.busy) $('mp-add-modal').close(); });
$('mp-add-modal').addEventListener('cancel', (e) => { if (mp.busy) e.preventDefault(); });
$('mp-add-modal').addEventListener('close', () => renderContent());
document.querySelectorAll('[data-add-type]').forEach((b) =>
  b.addEventListener('click', () => {
    mp.addType = b.dataset.addType;
    document.querySelectorAll('[data-add-type]').forEach((x) => x.classList.toggle('active', x === b));
    searchContent();
  })
);
$('mp-add-search').addEventListener('input', () => {
  clearTimeout(addTimer);
  addTimer = setTimeout(searchContent, 350);
});

async function searchContent() {
  const seq = ++mp.addSeq;
  const box = $('mp-add-results');
  box.replaceChildren();
  $('mp-add-status').textContent = 'Buscando…';
  try {
    const r = await window.api.instanceSearch({ id: mp.pack.id, type: mp.addType, query: $('mp-add-search').value, offset: 0 });
    if (seq !== mp.addSeq) return;
    $('mp-add-status').textContent = r.items.length ? '' : 'No hay resultados compatibles.';
    r.items.forEach((it) => {
      const row = el('div', 'mod-card');
      row.append(iconEl(it.icon, it.title));
      const body = el('div', 'mod-body');
      body.append(el('strong', '', it.title), el('span', 'muted', it.summary));
      row.append(body, el('span', 'muted mp-dl', `${compact.format(it.downloads)} desc.`));
      const btn = el('button', 'primary', 'Instalar');
      btn.type = 'button';
      btn.addEventListener('click', async () => {
        if (mp.busy) return;
        mp.busy = true;
        btn.disabled = true;
        btn.textContent = 'Instalando…';
        try {
          const res = await window.api.instanceInstall({ id: mp.pack.id, type: mp.addType, projectId: it.id });
          btn.textContent = res.installed.length ? 'Instalado' : 'Ya lo tenías';
          if (res.installed.length > 1) toast(`${res.installed.length} archivos instalados (con sus dependencias)`);
          else if (res.installed.length) toast(`${it.title} instalado`);
        } catch (e) {
          btn.textContent = 'Instalar';
          btn.disabled = false;
          $('mp-add-status').textContent = cleanError(e);
        } finally {
          mp.busy = false;
          busyHide();
        }
      });
      row.append(btn);
      box.append(row);
    });
  } catch (e) {
    if (seq === mp.addSeq) $('mp-add-status').textContent = cleanError(e);
  }
}

/* --- explorar modpacks --- */
async function loadRecommended() {
  const box = $('mp-reco');
  const grid = $('mp-reco-grid');
  if (mp.provider !== 'modrinth' || mp.query) { box.hidden = true; return; }
  try {
    const items = await window.api.modpackRecommended();
    grid.replaceChildren();
    items.forEach((it) => {
      const card = el('button', 'event-card');
      card.type = 'button';
      card.append(iconEl(it.icon, it.title, 'event-card-img mp-card-img'));
      const body = el('div', 'event-card-body');
      body.append(el('h3', '', it.title), el('p', 'mp-summary', it.summary));
      card.append(body);
      card.addEventListener('click', () => openPackModal(it));
      grid.append(card);
    });
    box.hidden = !items.length;
  } catch {
    box.hidden = true;
  }
}

async function searchPacks(reset) {
  if (mp.dType && mp.dType !== 'modpack') return searchLoose(reset);
  const seq = ++mp.seq;
  const note = $('mp-note');
  const grid = $('mp-results');
  if (reset) {
    mp.offset = 0;
    grid.replaceChildren();
  }
  $('mp-more').hidden = true;
  if (reset) loadRecommended();
  note.textContent = 'Buscando…';
  try {
    const r = await window.api.modpackSearch({ provider: mp.provider, query: mp.query, offset: mp.offset, loader: mp.fLoader || '', mc: mp.fMc || '', sort: mp.fSort || '' });
    if (seq !== mp.seq) return;
    mp.total = r.total;
    r.items.forEach((it) => {
      const card = el('button', 'event-card');
      card.type = 'button';
      card.append(iconEl(it.icon, it.title, 'event-card-img mp-card-img'));
      const body = el('div', 'event-card-body');
      body.append(el('h3', '', it.title));
      body.append(el('span', 'muted', `${it.author ? 'por ' + it.author + ' · ' : ''}${compact.format(it.downloads)} descargas`));
      body.append(el('p', 'mp-summary', it.summary));
      card.append(body);
      card.addEventListener('click', () => openPackModal(it));
      grid.append(card);
    });
    mp.offset += r.items.length;
    note.textContent = r.items.length || grid.childNodes.length ? `${grid.childNodes.length} de ${compact.format(mp.total)} modpacks` : 'No se encontró ningún modpack con ese nombre.';
    $('mp-more').hidden = mp.offset >= mp.total || !r.items.length;
  } catch (err) {
    if (seq === mp.seq) note.textContent = `No se pudo buscar: ${cleanError(err)}`;
  }
}

async function openPackModal(it) {
  mp.current = it;
  const modal = $('mp-modal');
  $('mp-modal-title').textContent = it.title;
  $('mp-modal-author').textContent = it.author ? `por ${it.author}` : '';
  $('mp-modal-summary').textContent = it.summary;
  $('mp-modal-icon').hidden = !it.icon;
  if (it.icon) $('mp-modal-icon').src = it.icon;
  $('mp-web').hidden = !it.url;
  $('mp-progress').hidden = true;
  $('mp-status').textContent = '';
  $('mp-version-info').textContent = 'Cargando versiones…';
  $('mp-version').replaceChildren();
  $('mp-install').disabled = true;
  $('mp-install').textContent = mp.installed.some((p) => p.provider === it.provider && p.projectId === it.id) ? 'Actualizar' : 'Instalar';
  if (!modal.open) modal.showModal();
  try {
    const versions = await window.api.modpackVersions({ provider: it.provider, id: it.id });
    if (mp.current !== it) return;
    const sel = $('mp-version');
    let first = -1;
    versions.forEach((v, i) => {
      // FTB no da un enlace directo: el launcher baja los archivos de la lista del modpack, así que no está bloqueado.
      const hasLink = v.downloadUrl || it.provider === 'ftb';
      const ok = v.supported && hasLink;
      const label = `${v.name || v.number}${v.mcVersions[0] ? ' · MC ' + v.mcVersions[0] : ''}${v.loaders.length ? ' · ' + v.loaders.map((l) => LOADER_NAMES[l] || l).join('/') : ''}${!v.supported ? ' (no compatible)' : !hasLink ? ' (descarga bloqueada)' : ''}`;
      const o = el('option', '', label);
      o.value = v.id;
      o.disabled = !ok;
      sel.append(o);
      if (ok && first < 0) first = i;
    });
    if (first >= 0) {
      sel.selectedIndex = first;
      $('mp-install').disabled = false;
      $('mp-version-info').textContent = 'Se instala en su propia carpeta, separado de tus otros modpacks.';
    } else {
      $('mp-version-info').textContent = versions.length
        ? 'Ninguna versión se puede instalar desde aquí (loader no soportado o descarga bloqueada por su autor).'
        : 'Este modpack no tiene versiones disponibles.';
    }
  } catch (err) {
    $('mp-version-info').textContent = `No se pudieron cargar las versiones: ${cleanError(err)}`;
  }
}

$('mp-close').addEventListener('click', () => { if (!mp.busy) $('mp-modal').close(); });
$('mp-modal').addEventListener('cancel', (e) => { if (mp.busy) e.preventDefault(); });
$('mp-web').addEventListener('click', () => mp.current && mp.current.url && window.api.openLink(mp.current.url));
$('mp-install').addEventListener('click', async () => {
  const it = mp.current;
  if (!it || mp.busy) return;
  mp.busy = true;
  $('mp-install').disabled = true;
  $('mp-progress').hidden = false;
  $('mp-progress').removeAttribute('value');
  try {
    const entry = await window.api.modpackInstall({ provider: it.provider, id: it.id, versionId: $('mp-version').value, title: it.title, icon: it.icon });
    toast(`${entry.title} instalado`);
    if (entry.skipped && entry.skipped.length) {
      toast(`${entry.skipped.length} archivo(s) no se pudieron descargar porque su autor lo bloquea. El modpack puede no funcionar completo.`, 'error');
      blockedDialog(entry);
    }
    mp.busy = false;
    $('mp-modal').close();
    mp.pack = null;
    showView('library');
    renderLibrary();
  } catch (err) {
    $('mp-status').textContent = cleanError(err);
    $('mp-progress').hidden = true;
    $('mp-install').disabled = false;
  } finally {
    mp.busy = false;
  }
});
let busyTimer = null;
let busyTitle = 'Trabajando…';
// El avance ya no sale en un cuadro abajo: va al botón de descargas de arriba (panel con en curso e historial).
function busyShow(title, d) {
  if (title) busyTitle = title;
  const pct = d && d.total ? Math.round((d.done / d.total) * 100) : -1;
  if (window.Downloads) window.Downloads.progress('busy', busyTitle, (d && d.text) || '', pct);
  clearTimeout(busyTimer);
  busyTimer = setTimeout(() => busyHide(), 90000);
}
function busyHide(ok = true) {
  clearTimeout(busyTimer);
  if (window.Downloads) window.Downloads.done('busy', ok);
}
window.api.onModpackProgress((d) => {
  const text = d.text || '';
  if (text === 'Listo') { busyHide(); if (window.NovaMascot) window.NovaMascot.notify('pack-done'); } else busyShow(null, d);
  if (adminProgress) adminProgress(d);
  if ($('mp-add-modal').open) $('mp-add-status').textContent = text;
  $('mp-status').textContent = text;
  const bar = $('mp-progress');
  if (d.total) {
    bar.max = d.total;
    bar.value = d.done;
  } else bar.removeAttribute('value');
});

$('mp-search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  mp.query = $('mp-search').value.trim();
  searchPacks(true);
});
$('mp-more').addEventListener('click', () => searchPacks(false));

// Todas las skins del equipo se dibujan con UN solo contexto WebGL compartido (ahorra memoria).
let teamEnv = null;
let teamViewers = [];
const TEAM_STATES = ['idle', 'wave', 'walk', 'jump', 'spin'];

window.addEventListener('nova-fx', (e) => teamViewers.forEach((v) => v.setAnimated(e.detail)));

/* --- enlaces (redes / portafolio) --- */
// Logo de la red (SVG real); la web de Nova PX usa el logo del launcher; el resto, un emoji.
function linkIcon(l) {
  const box = el('span', 'link-ico');
  const svg = window.brandIcon && window.brandIcon(l);
  if (svg) { box.append(svg); return box; }
  const t = `${l.name} ${l.url}`.toLowerCase();
  if (/nova|novapx|web|portafolio|portfolio/.test(t)) {
    const im = el('img', 'brand-ico'); im.alt = ''; im.src = 'images/logo.png';
    box.append(im);
  } else box.textContent = /mail|correo|contacto/.test(t) ? '✉️' : '🔗';
  return box;
}

function linkChips(links) {
  const box = el('div', 'link-chips');
  (links || []).forEach((l) => {
    const b = el('button', 'link-chip');
    const ic = window.brandIcon && window.brandIcon(l);
    if (ic) b.append(ic);
    b.append(document.createTextNode(l.name));
    b.type = 'button';
    b.title = l.url;
    b.addEventListener('click', (e) => { e.stopPropagation(); window.api.openLink(l.url).catch(() => {}); });
    box.append(b);
  });
  box.hidden = !box.childElementCount;
  return box;
}
// Editor de enlaces para un objeto { links: [{name,url}] }
function linksEditor(obj) {
  const box = el('div', 'links-editor');
  const paint = () => {
    box.replaceChildren();
    (obj.links = obj.links || []).forEach((l, i) => {
      const row = el('div', 'links-row');
      const n = el('input'); n.type = 'text'; n.maxLength = 30; n.placeholder = 'Red (Instagram, Portafolio…)'; n.value = l.name || '';
      n.addEventListener('input', () => { l.name = n.value; });
      const u = el('input'); u.type = 'url'; u.maxLength = 300; u.placeholder = 'https://…'; u.value = l.url || '';
      u.addEventListener('input', () => { l.url = u.value; });
      const x = el('button', '', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Quitar enlace');
      x.addEventListener('click', () => { obj.links.splice(i, 1); paint(); });
      row.append(n, u, x);
      box.append(row);
    });
    if (obj.links.length < 6) {
      const add = el('button', 'ghost', '+ Enlace'); add.type = 'button';
      add.addEventListener('click', () => { obj.links.push({ name: '', url: 'https://' }); paint(); });
      box.append(add);
    }
  };
  paint();
  return box;
}

// Tarjeta de perfil: la usa el diálogo del Equipo y la vista previa del editor de Administración.
const avatarPreviews = new WeakMap(); // foto recién subida (todavía sin publicar) → vista previa
function profileCard(m, preview) {
  const kind = m.tribute ? 'tribute' : m.featured ? 'featured' : 'normal';
  const card = el('div', `pf-card pf-${kind}`);
  const avatarSrc = avatarPreviews.get(m) || imageUrl(m.avatar);
  const banner = el('div', 'pf-banner');
  if (avatarSrc) banner.style.setProperty('--pf-img', `url("${avatarSrc.replace(/"/g, '%22')}")`);
  else banner.classList.add('no-img');
  const badges = el('div', 'pf-badges');
  if (m.tribute) badges.append(el('span', 'pf-badge pf-b-tribute', '💛 Siempre parte de Nova'));
  else if (m.featured) badges.append(el('span', 'pf-badge pf-b-featured', '★ Destacado'));
  banner.append(badges);
  const ring = el('div', 'pf-ring');
  const face = el('img', 'pf-avatar'); face.alt = '';
  const nick = String(m.nick || '').trim();
  if (avatarSrc) face.src = avatarSrc;
  else { face.classList.add('is-bust'); face.src = /^[A-Za-z0-9_]{1,16}$/.test(nick) ? skinBust(nick) : 'images/logo.png'; }
  ring.append(face);
  const body = el('div', 'pf-body');
  body.append(el('h3', 'pf-name', m.name || nick || 'Nueva persona'));
  const sub = el('div', 'pf-sub');
  if (m.name && nick) sub.append(el('span', 'pf-handle', '@' + nick));
  if (m.role) sub.append(el('span', 'pf-role', m.role));
  if (sub.childNodes.length) body.append(sub);
  if (m.tribute && m.years) body.append(el('div', 'pf-years', m.years));
  const text = m.tribute && m.tributeText ? m.tributeText : m.bio;
  if (text) { const q = el('blockquote', 'pf-bio'); q.append(el('span', '', text)); body.append(q); }
  const links = (m.links || []).filter((l) => l && l.url);
  if (links.length) {
    body.append(el('div', 'pf-section', 'Enlaces'));
    const box = el('div', 'pf-links');
    links.forEach((l) => {
      const b = el('button', 'link-tile');
      b.type = 'button';
      const host = (() => { try { return new URL(l.url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
      b.append(linkIcon(l), el('span', 'link-name', l.name || host), el('span', 'link-host muted', host));
      if (!preview) b.addEventListener('click', () => window.api.openLink(l.url).catch(() => {}));
      box.append(b);
    });
    body.append(box);
  }
  if (!text && !links.length) body.append(el('p', 'pf-empty muted', preview ? 'Añade una presentación y enlaces para que se vea completo.' : ''));
  card.append(banner, ring, body);
  return card;
}

function openMember(m) {
  const host = $('mm-card');
  host.replaceChildren(profileCard(m, false));
  const copy = $('mm-copy');
  copy.hidden = !m.nick;
  copy.textContent = 'Copiar nick';
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(m.nick); copy.textContent = 'Copiado ✓'; setTimeout(() => { copy.textContent = 'Copiar nick'; }, 1600); } catch { toast('No se pudo copiar', 'error'); }
  };
  if (!$('member-modal').open) $('member-modal').showModal();
}
$('mm-close').addEventListener('click', () => $('member-modal').close());
$('member-modal').addEventListener('click', (e) => { if (e.target === $('member-modal')) $('member-modal').close(); });

// Textura de una persona: la skin que subió el admin (sin premium) o la de Mojang por su nick.
async function textureFor(p) {
  if (p.skin) {
    const r = await window.api.skinCustom(imageUrl(p.skin));
    if (r) return { dataUrl: r.dataUrl, slim: !!p.slim, cape: null };
  }
  return window.api.skinTexture(p.nick);
}
// Cabeza (cara + capa exterior) dibujada desde una skin subida; si no hay, el busto de siempre.
function personFace(p) {
  if (!p.skin && !p.forceCanvas) {
    const img = el('img'); img.alt = `Skin de ${p.nick}`; img.loading = 'lazy'; img.src = skinBust(p.nick);
    return img;
  }
  const c = el('canvas'); c.width = 64; c.height = 64;
  c.setAttribute('aria-label', `Skin de ${p.nick}`);
  const fallback = () => {
    if (!c.isConnected) return;
    const img = el('img'); img.alt = `Skin de ${p.nick}`; img.loading = 'lazy'; img.src = skinBust(p.nick);
    c.replaceWith(img);
  };
  textureFor(p).then(async (r) => {
    if (!r || !r.dataUrl) { fallback(); return; }
    const im = await loadImageUrl(r.dataUrl);
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.drawImage(im, 8, 8, 8, 8, 0, 0, 64, 64);
    x.drawImage(im, 40, 8, 8, 8, 0, 0, 64, 64);
  }).catch(fallback);
  return c;
}

// Cabeza 3D (cubo CSS con las 6 caras de la skin + capa exterior). p = { nick, skin?, slim? }.
function head3d(p, size) {
  const wrap = el('span', 'head3d');
  wrap.style.setProperty('--s', (size || 44) + 'px');
  wrap.title = p.nick || '';
  const cube = el('span', 'h3d-cube');
  const faces = { front: [8, 8], back: [24, 8], right: [0, 8], left: [16, 8], top: [8, 0], bottom: [16, 0] };
  const cs = {};
  Object.keys(faces).forEach((k) => {
    const c = el('canvas', 'h3d-face h3d-' + k); c.width = 16; c.height = 16;
    cs[k] = c; cube.append(c);
  });
  wrap.append(cube);
  const paint = (im) => {
    Object.entries(faces).forEach(([k, [sx, sy]]) => {
      const x = cs[k].getContext('2d');
      x.imageSmoothingEnabled = false;
      x.clearRect(0, 0, 16, 16);
      x.drawImage(im, sx, sy, 8, 8, 0, 0, 16, 16);
      x.drawImage(im, sx + 32, sy, 8, 8, 0, 0, 16, 16);
    });
  };
  const nick = String(p.nick || '').trim();
  textureFor({ ...p, nick: nick || 'Steve' })
    .then((r) => (r && r.dataUrl ? loadImageUrl(r.dataUrl).then(paint) : loadImageUrl('images/logo.png').then(paint)))
    .catch(() => loadImageUrl('images/logo.png').then(paint).catch(() => {}));
  return wrap;
}

function teamCard(m, index, featured) {
  const card = el('div', m.tribute ? 'member tribute' : featured ? 'member featured' : 'member');
  card.dataset.tilt = '';
  const stage = el('div', 'member-stage');
  const canvas = el('canvas', 'member-3d');
  canvas.setAttribute('aria-label', `Skin 3D de ${m.nick}`);
  stage.append(canvas);

  let viewer = null;
  try {
    teamEnv = teamEnv || window.SkinViewer.createEnv();
    if (teamEnv) {
      viewer = window.SkinViewer.create(canvas, {
        env: teamEnv,
        distance: 106,
        states: TEAM_STATES,
        start: index % TEAM_STATES.length, // cada uno empieza con una animación distinta
        animated: !document.documentElement.classList.contains('no-fx')
      });
    }
  } catch {}

  if (viewer) {
    teamViewers.push(viewer);
    // la skin se pide de a poco para no saturar a Mojang
    setTimeout(async () => {
      try {
        const r = await textureFor(m);
        if (!r) return;
        viewer.setSkin(await loadImageUrl(r.dataUrl), r.slim);
        viewer.setCape(r.cape ? await loadImageUrl(r.cape) : null);
      } catch {}
    }, 150 * index);
    card.addEventListener('mouseenter', () => viewer.trigger('wave'));
  } else {
    // sin WebGL: busto plano
    canvas.remove();
    const img = el('img');
    img.alt = `Skin de ${m.nick}`;
    img.src = skinBust(m.nick);
    stage.append(img);
  }

  const info = el('div', 'member-info');
  if (m.tribute) {
    info.append(el('div', 'tribute-label', '💛 Siempre parte de Nova'), el('div', 'nick', m.nick), el('div', 'role', m.role || ''));
    if (m.years) info.append(el('div', 'tribute-years', m.years));
    if (m.tributeText) info.append(el('p', 'tribute-text', m.tributeText));
  } else info.append(el('div', 'nick', m.nick), el('div', 'role', m.role || ''));
  if (m.links && m.links.length) info.append(linkChips(m.links));
  card.append(stage, info);
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.addEventListener('click', () => openMember(m));
  card.addEventListener('keydown', (e) => { if (e.key === 'Enter') openMember(m); });
  return card;
}

let lastTeamJson = '';
async function renderTeam(force) {
  const grid = $('team-grid');
  const top = $('team-featured');
  const trib = $('team-tribute');
  let team;
  try {
    const nickMap = await window.api.getData('nicks').then((d) => (d && d.map) || null).catch(() => null);
    team = window.NovaNicks.team(await window.api.getData('team'), nickMap);
  } catch {
    if (!lastTeamJson) { grid.replaceChildren(el('p', 'muted', 'No se pudo cargar el equipo.')); }
    return;
  }
  const json = JSON.stringify(team);
  if (!force && json === lastTeamJson) return; // sin cambios: no se recrean los visores 3D
  lastTeamJson = json;
  grid.replaceChildren();
  top.replaceChildren();
  trib.replaceChildren();
  teamViewers.forEach((v) => v.destroy());
  teamViewers = [];
  let i = 0;
  team.forEach((m) => {
    const featured = !!m.featured;
    (m.tribute ? trib : featured ? top : grid).append(teamCard(m, i++, featured));
  });
}
