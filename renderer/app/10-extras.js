/* Interfaz de la 1.0.188 — galería de capturas, servidores con ping, modo rendimiento, avisos de actualizaciones de mods,
   códigos para compartir modpacks y tarjeta de amigos. Todo el texto que viene de fuera se pone con textContent. */

/* ---------- ventanas pequeñas reutilizables ---------- */
function openModal(className, label) {
  const dlg = el('dialog', `event-modal ${className || ''}`.trim());
  dlg.setAttribute('aria-label', label || '');
  const body = el('div', 'event-modal-body');
  const x = el('button', 'modal-x', '✕');
  x.type = 'button';
  x.setAttribute('aria-label', 'Cerrar');
  dlg.append(x, body);
  let closed = false;
  const close = () => { if (closed) return; closed = true; try { dlg.close(); } catch {} dlg.remove(); };
  x.addEventListener('click', close);
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  dlg.addEventListener('close', close);
  document.body.append(dlg);
  return { dlg, body, close, open: () => dlg.showModal() };
}

// Pide un texto con la estética del launcher. -> el texto o null si se cancela.
function askText({ title, message, placeholder, okLabel }) {
  return new Promise((resolve) => {
    const m = openModal('confirm-modal ask-text', title);
    const form = el('form', 'ask-text-form');
    const input = el('input');
    input.type = 'text';
    input.placeholder = placeholder || '';
    input.maxLength = 40;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label', title || '');
    const actions = el('div', 'mp-actions');
    const no = el('button', '', 'Cancelar'); no.type = 'button';
    const yes = el('button', 'primary', okLabel || 'Aceptar'); yes.type = 'submit';
    actions.append(no, yes);
    if (title) form.append(el('strong', 'ask-text-title', title));
    if (message) form.append(el('p', 'muted', message));
    form.append(input, actions);
    m.body.append(form);
    let done = false;
    const finish = (v) => { if (done) return; done = true; resolve(v); m.close(); };
    form.addEventListener('submit', (e) => { e.preventDefault(); finish(input.value.trim() || null); });
    no.addEventListener('click', () => finish(null));
    m.dlg.addEventListener('close', () => finish(null));
    m.open();
    input.focus();
  });
}

const fmtDate = (ms) => { try { return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); } catch { return ''; } };

/* ---------- galería de capturas (todas las instancias) ---------- */
const gallery = { items: [], filter: '', seq: 0, queue: [], busy: false, io: null };

async function shotsShow() {
  const seq = ++gallery.seq;
  const grid = $('shots-grid');
  $('shots-note').textContent = 'Cargando capturas…';
  let items = [];
  try { items = await window.api.shotsList(); } catch (e) { $('shots-note').textContent = cleanError(e); return; }
  if (seq !== gallery.seq) return;
  gallery.items = Array.isArray(items) ? items : [];
  // Filtro por instancia (solo las que tienen capturas)
  const sel = $('shots-filter');
  const sources = new Map();
  gallery.items.forEach((it) => { const v = sources.get(it.src) || { title: it.title, n: 0 }; v.n++; sources.set(it.src, v); });
  if (gallery.filter && !sources.has(gallery.filter)) gallery.filter = '';
  sel.replaceChildren(el('option', '', `Todas las instancias (${gallery.items.length})`));
  sel.firstChild.value = '';
  sources.forEach((v, k) => { const o = el('option', '', `${v.title} (${v.n})`); o.value = k; sel.append(o); });
  sel.value = gallery.filter;
  paintShots(grid);
}

function paintShots(grid) {
  const list = gallery.items.filter((it) => !gallery.filter || it.src === gallery.filter);
  grid.replaceChildren();
  if (gallery.io) gallery.io.disconnect();
  gallery.queue = [];
  if (!list.length) {
    const box = el('div', 'empty-state');
    box.append(el('div', 'empty-ico', '📷'), el('strong', 'empty-title', 'Todavía no hay capturas'), el('p', 'muted', 'Dentro de Minecraft pulsa F2 para sacar una. Aparecerán aquí, de todos tus perfiles.'));
    grid.append(box);
    $('shots-note').textContent = '';
    return;
  }
  $('shots-note').textContent = `${list.length} captura${list.length === 1 ? '' : 's'} · haz clic en una para verla en grande, copiarla o guardarla`;
  gallery.io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      gallery.io.unobserve(en.target);
      gallery.queue.push(en.target);
    });
    pumpThumbs();
  }, { rootMargin: '300px' });
  list.forEach((it, i) => {
    const card = el('button', 'shot-card');
    card.type = 'button';
    card.setAttribute('aria-label', `Captura de ${it.title}, ${fmtDate(it.mtime)}`);
    card._shot = it;
    const img = el('img', 'shot-img');
    img.alt = '';
    const cap = el('span', 'shot-cap');
    cap.append(el('strong', '', it.title), el('span', 'muted', fmtDate(it.mtime)));
    card.append(img, cap);
    card.addEventListener('click', () => openShotViewer(it, list, () => shotsShow()));
    grid.append(card);
    gallery.io.observe(card);
    if (i > 400) card.hidden = true;
  });
}

// Miniaturas de a 12: se piden solo las que se ven en pantalla.
async function pumpThumbs() {
  if (gallery.busy) return;
  gallery.busy = true;
  try {
    while (gallery.queue.length) {
      const batch = gallery.queue.splice(0, 12).filter((c) => c.isConnected);
      if (!batch.length) continue;
      const res = await window.api.shotsThumbs(batch.map((c) => ({ src: c._shot.src, name: c._shot.name })));
      (Array.isArray(res) ? res : []).forEach((r, i) => {
        const card = batch[i];
        if (!card || !r || !r.thumb) { if (card) card.classList.add('no-thumb'); return; }
        const img = card.querySelector('img');
        img.src = r.thumb;
        card.classList.add('ready');
      });
    }
  } catch {} finally { gallery.busy = false; }
}

$('shots-filter').addEventListener('change', () => { gallery.filter = $('shots-filter').value; paintShots($('shots-grid')); });

// Visor grande: copiar, guardar, abrir carpeta (solo perfiles propios) y borrar (a la papelera).
function openShotViewer(item, list, onChange) {
  const all = Array.isArray(list) && list.length ? list : [item];
  let idx = Math.max(0, all.findIndex((x) => x.src === item.src && x.name === item.name));
  const m = openModal('shot-viewer', 'Captura');
  const stage = el('div', 'shot-stage');
  const img = el('img', 'shot-big');
  img.alt = '';
  const prev = el('button', 'shot-nav prev', '‹'); prev.type = 'button'; prev.setAttribute('aria-label', 'Anterior');
  const next = el('button', 'shot-nav next', '›'); next.type = 'button'; next.setAttribute('aria-label', 'Siguiente');
  stage.append(prev, img, next);
  const info = el('div', 'shot-info');
  const title = el('strong');
  const meta = el('span', 'muted');
  info.append(title, meta);
  const actions = el('div', 'mp-actions');
  const bCopy = el('button', 'primary', 'Copiar imagen'); bCopy.type = 'button';
  const bSave = el('button', '', 'Guardar copia…'); bSave.type = 'button';
  const bFolder = el('button', '', 'Abrir carpeta'); bFolder.type = 'button';
  const bDel = el('button', 'danger', 'Borrar'); bDel.type = 'button';
  actions.append(bCopy, bSave, bFolder, bDel);
  m.body.append(stage, info, actions);
  let changed = false;
  const show = async () => {
    const it = all[idx];
    title.textContent = it.title || '';
    meta.textContent = `${fmtDate(it.mtime)} · ${idx + 1} de ${all.length}`;
    prev.disabled = idx === 0;
    next.disabled = idx >= all.length - 1;
    bFolder.hidden = !it.own;
    img.removeAttribute('src');
    stage.classList.add('loading');
    try {
      const r = await window.api.shotsFull(it.src, it.name);
      if (all[idx] === it && r && r.url) img.src = r.url;
    } catch (e) { toast(cleanError(e), 'error'); }
    stage.classList.remove('loading');
  };
  const go = (d) => { const n = idx + d; if (n >= 0 && n < all.length) { idx = n; show(); } };
  prev.addEventListener('click', () => go(-1));
  next.addEventListener('click', () => go(1));
  m.dlg.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1); });
  bCopy.addEventListener('click', async () => { try { await window.api.shotsCopy(all[idx].src, all[idx].name); toast('Captura copiada: pégala donde quieras con Ctrl+V'); } catch (e) { toast(cleanError(e), 'error'); } });
  bSave.addEventListener('click', async () => { try { if (await window.api.shotsSave(all[idx].src, all[idx].name)) toast('Captura guardada'); } catch (e) { toast(cleanError(e), 'error'); } });
  bFolder.addEventListener('click', async () => { try { await window.api.shotsFolder(all[idx].src); } catch (e) { toast(cleanError(e), 'error'); } });
  bDel.addEventListener('click', async () => {
    const it = all[idx];
    if (!(await askConfirm('¿Borrar esta captura? Irá a la papelera de reciclaje, por si cambias de idea.', 'Borrar', 'Cancelar'))) return;
    try {
      await window.api.shotsDelete(it.src, it.name);
      changed = true;
      all.splice(idx, 1);
      toast('Captura enviada a la papelera');
      if (!all.length) { m.close(); return; }
      idx = Math.min(idx, all.length - 1);
      show();
    } catch (e) { toast(cleanError(e), 'error'); }
  });
  m.dlg.addEventListener('close', () => { if (changed && onChange) onChange(); });
  m.open();
  show();
}
window.shotsShow = shotsShow;
window.openShotViewer = openShotViewer;

/* ---------- servidores de un perfil (ping directo) ---------- */
let srvSeq = 0;
function pingClass(ms) { return ms < 80 ? 'good' : ms < 160 ? 'ok' : 'bad'; }
async function renderPackServers() {
  const p = mp.pack;
  if (!p) return;
  const seq = ++srvSeq;
  const list = $('mp-srv-list');
  const note = $('mp-srv-note');
  note.textContent = 'Preguntando a los servidores…';
  if (!list.children.length) list.append(el('div', 'srv-row skeleton'));
  let rows = [];
  try { rows = await window.api.serversList(p.id); } catch (e) { note.textContent = cleanError(e); list.replaceChildren(); return; }
  if (seq !== srvSeq || !mp.pack || mp.pack.id !== p.id) return;
  list.replaceChildren();
  rows = Array.isArray(rows) ? rows : [];
  if (!rows.length) {
    note.textContent = '';
    const box = el('div', 'empty-state');
    box.append(el('div', 'empty-ico', '🖧'), el('strong', 'empty-title', 'Sin servidores guardados'), el('p', 'muted', 'Añade servidores en Multijugador dentro del juego: aquí verás su ping y cuánta gente hay antes de entrar.'));
    list.append(box);
    return;
  }
  const on = rows.filter((r) => r.online).length;
  note.textContent = `${on} de ${rows.length} en línea · el ping se mide desde tu PC`;
  rows.forEach((r) => {
    const row = el('div', `srv-row${r.online ? '' : ' off'}`);
    const icon = el('div', 'srv-icon');
    if (r.icon) { const im = el('img'); im.alt = ''; im.src = r.icon; icon.append(im); } else icon.textContent = '🖧';
    const main = el('div', 'srv-main');
    main.append(el('strong', 'srv-name', r.name));
    main.append(el('span', 'srv-motd muted', r.online ? r.motd || 'Sin mensaje' : 'No responde: puede estar apagado o la dirección cambió'));
    if (r.online && r.version) main.append(el('span', 'srv-ver', r.version));
    const side = el('div', 'srv-side');
    if (r.online) {
      const players = el('span', 'srv-players', `${r.players.online}/${r.players.max}`);
      players.title = r.players.sample && r.players.sample.length ? `En línea: ${r.players.sample.join(', ')}` : 'Jugadores en línea';
      const ping = el('span', `srv-ping ${pingClass(r.ms)}`);
      const bars = el('span', 'srv-bars');
      for (let i = 0; i < 4; i++) bars.append(el('i'));
      bars.dataset.level = r.ms < 80 ? '4' : r.ms < 160 ? '3' : r.ms < 300 ? '2' : '1';
      ping.append(bars, el('span', '', `${r.ms} ms`));
      side.append(players, ping);
    } else side.append(el('span', 'srv-players muted', 'Apagado'));
    const join = el('button', r.online ? 'primary' : '', 'Jugar aquí');
    join.type = 'button';
    join.title = 'Abre el juego y entra directo a este servidor';
    join.addEventListener('click', () => playPack(p.id, { serverIndex: r.i }));
    side.append(join);
    row.append(icon, main, side);
    list.append(row);
  });
}
$('mp-srv-refresh').addEventListener('click', () => renderPackServers());
window.renderPackServers = renderPackServers;

/* ---------- modo rendimiento ---------- */
$('mp-perf').addEventListener('click', async () => {
  const p = mp.pack;
  if (!p) return;
  const btn = $('mp-perf');
  let info;
  try { info = await window.api.perfInfo(p.id); } catch (e) { toast(cleanError(e), 'error'); return; }
  if (!info || !info.loader) return;
  const msg = info.supported
    ? `Se instalarán los que falten de: ${info.mods.join(', ')} (solo versiones compatibles con Minecraft ${p.mcVersion}).\n\nLa RAM de este perfil quedará en ${info.ramGb} GB (tu PC tiene ${info.pcGb} GB).`
    : `Este perfil es Vanilla y no admite mods: solo se ajustará su RAM a ${info.ramGb} GB (tu PC tiene ${info.pcGb} GB).\n\nPara muchos más FPS, crea un perfil Nova o Fabric.`;
  if (!(await askConfirm(msg, 'Aplicar', 'Cancelar'))) return;
  btn.disabled = true;
  try {
    const r = await window.api.perfApply(p.id);
    const parts = [];
    if (r.installed.length) parts.push(`instalé ${r.installed.join(', ')}`);
    if (r.already.length) parts.push(`ya tenías ${r.already.join(', ')}`);
    if (r.optifine) parts.push('no puse Sodium porque tienes OptiFine');
    if (r.failed.length) parts.push(`sin versión para ${r.failed.join(', ')}`);
    toast(`⚡ Modo rendimiento: ${parts.length ? parts.join('; ') + '; ' : ''}RAM en ${r.ramGb} GB.`, 'success');
    if (window.renderContent) renderContent();
  } catch (e) {
    toast(cleanError(e), 'error');
  } finally { btn.disabled = false; }
});

/* ---------- avisos de actualizaciones de mods ---------- */
let updCounts = {};
function paintUpdPill(node, id) {
  const n = Number(updCounts[id]) || 0;
  node.hidden = !n;
  node.textContent = n ? `↑ ${n} actualizaci${n === 1 ? 'ón' : 'ones'}` : '';
  node.title = n ? 'Hay versiones nuevas de mods, texturas o shaders que añadiste. Ábrelo y pulsa «Actualizar todo».' : '';
}
function paintAllUpd() {
  document.querySelectorAll('.mp-card[data-pack]').forEach((card) => {
    const pill = card.querySelector('.upd-pill');
    if (pill) paintUpdPill(pill, card.dataset.pack);
  });
  paintUpdateAllBtn();
}
function paintUpdateAllBtn() {
  const b = $('mp-update-all');
  const n = mp.pack ? Number(updCounts[mp.pack.id]) || 0 : 0;
  b.hidden = !n;
  b.textContent = `↑ Actualizar todo (${n})`;
}
function setUpdCounts(c) { updCounts = c && typeof c === 'object' && !Array.isArray(c) ? c : {}; paintAllUpd(); }
window.paintUpdPill = paintUpdPill;
window.setPackUpdCount = (id, n) => { const c = { ...updCounts }; if (n > 0) c[id] = n; else delete c[id]; setUpdCounts(c); };
window.api.updatesSummary().then(setUpdCounts).catch(() => {});
if (window.api.onUpdatesSummary) window.api.onUpdatesSummary(setUpdCounts);
$('mp-update-all').addEventListener('click', async () => {
  const p = mp.pack;
  if (!p) return;
  const b = $('mp-update-all');
  b.disabled = true;
  try {
    const r = await window.api.instanceUpdatesApply(p.id);
    toast(r.errors && r.errors.length ? `Se actualizaron ${r.updated}; ${r.errors.length} no se pudieron.` : `Listo: ${r.updated} actualizado${r.updated === 1 ? '' : 's'}.`, r.errors && r.errors.length ? 'error' : 'success');
    if (window.renderContent) renderContent();
  } catch (e) { toast(cleanError(e), 'error'); } finally { b.disabled = false; paintUpdateAllBtn(); }
});
// Al abrir la ficha de un modpack se muestra (o no) el botón.
new MutationObserver(paintUpdateAllBtn).observe($('mp-detail-title'), { childList: true, characterData: true, subtree: true });

/* ---------- compartir con código ---------- */
$('mp-share-code').addEventListener('click', async () => {
  const p = mp.pack;
  if (!p) return;
  const b = $('mp-share-code');
  b.disabled = true;
  $('mp-share-code-note').textContent = 'Creando el código…';
  try {
    const r = await window.api.shareCreate(p.id);
    $('mp-share-code-text').textContent = r.code;
    $('mp-share-code-box').hidden = false;
    $('mp-share-code-note').textContent = `Lleva ${r.included} archivo${r.included === 1 ? '' : 's'} de Modrinth${r.skipped ? `; ${r.skipped} no están en Modrinth y no van en el código` : ''}. Caduca en 90 días.`;
  } catch (e) {
    $('mp-share-code-note').textContent = cleanError(e);
  } finally { b.disabled = false; }
});
$('mp-share-code-copy').addEventListener('click', () => copyText($('mp-share-code-text').textContent, 'Código copiado'));
// Al cambiar de modpack se oculta el código anterior.
new MutationObserver(() => { $('mp-share-code-box').hidden = true; $('mp-share-code-note').textContent = ''; }).observe($('mp-detail-title'), { childList: true, characterData: true, subtree: true });

$('mp-use-code').addEventListener('click', async () => {
  const code = await askText({ title: 'Usar un código', message: 'Pega el código que te pasaron (se ve así: NPX\u20117K2QF9X). Se creará un perfil nuevo con sus mods, texturas y shaders.', placeholder: 'NPX-XXXXXXX', okLabel: 'Importar' });
  if (!code) return;
  const b = $('mp-use-code');
  b.disabled = true;
  toast('Importando el modpack…', 'info');
  try {
    const r = await window.api.shareImport(code);
    toast(`Listo: «${r.entry.title}» con ${r.installed} archivo${r.installed === 1 ? '' : 's'}${r.missing ? ` (${r.missing} ya no están disponibles)` : ''}.`, 'success');
    if (window.renderLibrary) await renderLibrary();
    const fresh = (mp.installed || []).find((x) => x.id === r.entry.id) || r.entry;
    openDetail(fresh);
  } catch (e) { toast(cleanError(e), 'error'); } finally { b.disabled = false; }
});

/* ---------- tarjeta de amigo ---------- */
function openFriendCard(f) {
  if (!f || !f.nick) return;
  const m = openModal('friend-card', `Perfil de ${f.nick}`);
  const top = el('div', 'fc-top');
  top.append(head3d({ nick: f.nick }, 84));
  const who = el('div', 'fc-who');
  who.append(el('strong', 'fc-nick pii', f.nick));
  const status = f.playing ? (f.game ? `Jugando: ${f.game}` : 'Jugando') : f.online ? 'En línea' : f.seen ? `Activo ${agoMs(Date.now() - f.seen)}` : 'Desconectado';
  const st = el('span', `fc-status${f.online || f.playing ? ' on' : ''}`);
  st.append(el('span', `live-dot${f.online ? '' : ' off'}`), el('span', '', status));
  who.append(st);
  top.append(who);
  const stats = el('div', 'fc-stats');
  const stat = (value, label) => { const s = el('div', 'fc-stat'); s.append(el('strong', '', value), el('span', 'muted', label)); return s; };
  stats.append(stat(f.hours === null || f.hours === undefined ? '—' : `${f.hours} h`, 'jugadas con Nova PX'), stat(f.playing ? (f.game || 'Minecraft') : f.online ? 'En el launcher' : 'Desconectado', 'ahora mismo'));
  const actions = el('div', 'mp-actions');
  const chat = el('button', 'primary', 'Chatear'); chat.type = 'button';
  chat.addEventListener('click', () => { m.close(); openChat(f); });
  const rm = el('button', 'danger', 'Quitar amigo'); rm.type = 'button';
  rm.addEventListener('click', async () => {
    if (!(await askConfirm(`¿Quitar a ${f.nick} de tus amigos? También se borrará la conversación.`, 'Quitar', 'Cancelar'))) return;
    try { await window.api.friendsRemove(f.nick); m.close(); renderFriends(); } catch (e) { toast(cleanError(e), 'error'); }
  });
  actions.append(chat, rm);
  m.body.append(top, stats);
  if (f.hours === null || f.hours === undefined) m.body.append(el('p', 'muted fc-note', 'Tu amigo no comparte sus horas o todavía no actualizó el launcher.'));
  m.body.append(actions);
  m.open();
}
window.openFriendCard = openFriendCard;
