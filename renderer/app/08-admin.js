/* Interfaz del launcher — Modo administrador y herramientas del equipo. (parte de lo que antes era app.js; se carga en este orden desde index.html). */

/* ---------- modo administrador ---------- */
let isAdmin = false;
let adminProgress = null;
function setAdminUi(on, repo, err, eligible) {
  isAdmin = on;
  if (window.NovaMascot && window.NovaMascot.setAiAllowed) window.NovaMascot.setAiAllowed(on);
  syncSecretThemes();
  $('adm-fieldset').hidden = !eligible;
  $('nav-admin').hidden = !on;
  const wnTab = document.querySelector('.tab-btn[data-tab="whatsnew"]');
  if (wnTab) wnTab.hidden = !on;
  if (!on && $('page-whatsnew') && $('page-whatsnew').classList.contains('active')) goTo('home');
  if (window.serversRefreshNav) window.serversRefreshNav();
  $('adm-login-box').hidden = on;
  $('adm-logout-box').hidden = !on;
  $('adm-state').textContent = on ? `Activo: puedes publicar en ${repo}.` : err ? `Desactivado (${err})` : 'Desactivado.';
  moveIndicator();
}
// Permiso que pide cada pestaña (igual que lib/permisos.js; el programa vuelve a comprobarlo en cada acción).
const AD_TAB_PERM = { event: 'eventos', events: 'eventos', reco: 'eventos', news: 'noticias', team: 'contenido', ads: 'contenido', plugins: 'plugins', warnings: 'moderacion', users: 'usuarios', look: 'ajustes', config: 'ajustes', control: 'ajustes', status: 'ajustes', perms: 'permisos' };
const AD_PERMS = { eventos: 'Eventos y modpack del evento', noticias: 'Noticias', contenido: 'Equipo y publicidad', plugins: 'Plugins', moderacion: 'Advertencias de nicks', usuarios: 'Usuarios (contador)', ajustes: 'Ajustes, apariencia, Discord y estado' };
const AD_ROLES = { administrador: Object.keys(AD_PERMS), moderador: ['moderacion', 'usuarios', 'noticias'] };
let adPerms = new Set();
function applyAdminTabs(perms) {
  adPerms = new Set(perms || []);
  const tabs = [...document.querySelectorAll('[data-ad-tab]')];
  tabs.forEach((b) => { b.hidden = !adPerms.has(AD_TAB_PERM[b.dataset.adTab]); });
  const current = tabs.find((b) => b.classList.contains('active'));
  if (current && current.hidden) { const first = tabs.find((b) => !b.hidden); if (first) first.click(); }
}
function refreshAdmin() {
  window.api.adminStatus().then((r) => {
    setAdminUi(r.admin, r.repo, r.error, r.eligible);
    if (r.admin) applyAdminTabs(r.permisos);
    if (!r.admin && $('page-admin').classList.contains('active')) goTo('home');
  }).catch(() => {});
}
refreshAdmin();
$('adm-login').addEventListener('click', async () => {
  $('adm-login').disabled = true;
  try {
    const r = await window.api.adminLogin($('adm-token').value);
    $('adm-token').value = '';
    setAdminUi(true, r.repo, undefined, true);
    refreshAdmin();
    toast('Modo administrador activado');
  } catch (e) {
    $('adm-state').textContent = cleanError(e);
  }
  $('adm-login').disabled = false;
});
$('adm-logout').addEventListener('click', async () => {
  await window.api.adminLogout();
  setAdminUi(false, undefined, undefined, true);
  if ($('page-admin').classList.contains('active')) { goTo('home'); goTo('settings'); }
});

const adm = { sponsors: [], team: [], news: [], reco: [], launcher: null, manifest: {}, summary: null };
const AD_PACK_KEY = 'novapx.eventPack';
const keep = (k, v) => { try { v === undefined ? localStorage.getItem(k) : localStorage.setItem(k, v); } catch {} return (() => { try { return localStorage.getItem(k); } catch { return null; } })(); };

document.querySelectorAll('[data-ad-tab]').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('[data-ad-tab]').forEach((x) => x.classList.toggle('active', x === b));
    window.AD_TABS.forEach((t) => ($(`ad-tab-${t}`).hidden = t !== b.dataset.adTab));
    if (b.dataset.adTab === 'control') refreshSocial();
    if (b.dataset.adTab === 'users') loadUsers();
    if (b.dataset.adTab === 'warnings') openWarnings();
  })
);

/* ---------- advertencias de nombres (cambios de nick) ---------- */
const WARN_SCAN_KEY = 'px.warn.lastScan';
function paintWarnings(list) {
  const open = list.filter((w) => w.status === 'open');
  const badge = $('ad-warn-count');
  badge.hidden = !open.length; badge.textContent = String(open.length);
  const box = $('ad-warn-list');
  box.replaceChildren();
  if (!list.length) { box.append(el('p', 'muted', 'Sin advertencias. Todos los nicks coinciden con Minecraft.')); return; }
  const lbl = { open: 'Pendiente', ok: 'Revisado', hidden: 'Quitado', assigned: 'Reasignado' };
  list.slice().sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || String(b.at).localeCompare(String(a.at))).forEach((w) => {
    const row = el('div', 'mods-row');
    const head = w.kind === 'rename' ? `${w.from} ahora es ${w.to}` : `${w.nick} ya no existe en Minecraft`;
    const info = el('div', 'mods-main');
    info.append(el('b', '', head), el('small', 'muted', `${(w.where || []).join(' · ') || 'sin lugar'} · ${new Date(w.at).toLocaleString()} · ${lbl[w.status] || w.status}`));
    row.append(info);
    if (w.status === 'open') {
      const act = el('div', 'mp-actions');
      const mk = (t, fn, cls) => { const b = el('button', cls || '', t); b.type = 'button'; b.addEventListener('click', async () => { b.disabled = true; try { const r = await fn(); paintWarnings(r.warnings); } catch (e) { $('ad-warn-status').textContent = cleanError(e); b.disabled = false; } }); return b; };
      act.append(mk('Revisado', () => window.api.adminWarningAct(w.id, 'ok')), mk('Quitar del launcher', () => window.api.adminWarningAct(w.id, 'hide'), 'ghost'));
      if (w.kind === 'missing') {
        const inp = el('input'); inp.placeholder = 'Nick actual'; inp.maxLength = 16;
        act.append(inp, mk('Asignar', () => window.api.adminWarningAct(w.id, 'assign', inp.value.trim())));
      }
      row.append(act);
    }
    box.append(row);
  });
}
async function scanWarnings() {
  const st = $('ad-warn-status'); const btn = $('ad-warn-scan');
  btn.disabled = true; st.textContent = 'Revisando nicks en Mojang…';
  try {
    const r = await window.api.adminNickScan();
    try { localStorage.setItem(WARN_SCAN_KEY, String(Date.now())); } catch {}
    st.textContent = `Revisados ${r.scanned}${r.failed ? ` · ${r.failed} sin respuesta` : ''}${r.added ? ` · ${r.added} aviso(s) nuevo(s)` : ''}.`;
    paintWarnings(r.warnings);
  } catch (e) { st.textContent = cleanError(e); } finally { btn.disabled = false; }
}
async function openWarnings() {
  try { paintWarnings(await window.api.adminWarnings()); } catch (e) { $('ad-warn-status').textContent = cleanError(e); }
  let last = 0; try { last = Number(localStorage.getItem(WARN_SCAN_KEY)) || 0; } catch {}
  if (Date.now() - last > 6 * 3600 * 1000) scanWarnings();
}
$('ad-warn-scan').addEventListener('click', scanWarnings);

function chip(text, cls) { return el('span', `ad-chip${cls ? ' ' + cls : ''}`, text); }

function sponsorsEditor() {
  const box = $('ad-sponsors');
  const list = adm.sponsors;
  list.forEach((x) => { x.kind = spKind(x); });
  const groups = [
    { kind: 'host', icon: '🖥️', title: 'Hosting oficial', hint: 'Quien pone el servidor del evento (por ejemplo, Holi Hosting). Se muestra con una tarjeta grande y destacada, con enlace para contratar.', add: '+ Añadir hosting', roles: ['Servidor hospedado por'], ph: 'Holi Hosting', textPh: 'Frase corta o promo (ej. "Servidores de calidad: usa el código NOVA")', max: 2 },
    { kind: 'sponsor', icon: '💎', title: 'Patrocinadores del evento', hint: 'Marcas o personas que pagan para que se haga el evento. Aparecen con su logo y enlace.', add: '+ Añadir patrocinador', roles: ['Evento patrocinado por', 'Presentado por', 'Con el apoyo de'], ph: 'Nombre de la marca', textPh: 'Mensaje corto (opcional)', max: 8 },
    { kind: 'credit', icon: '🤝', title: 'Créditos', hint: 'Personas o equipos que hicieron el evento. Se muestran pequeños, al final.', add: '+ Añadir crédito', roles: ['Evento creado por', 'Diseño', 'Mapa', 'Colabora'], ph: 'Nombre', textPh: 'Texto corto (opcional)', max: 8 }
  ];
  const paint = () => {
    box.replaceChildren();
    groups.forEach((g) => {
      const mine = list.filter((x) => x.kind === g.kind);
      const sec = el('section', `brand-group bg-${g.kind}`);
      const head = el('div', 'brand-head');
      head.append(el('span', 'ad-ico', g.icon));
      const hd = el('div'); hd.append(el('strong', '', g.title), el('p', 'muted', g.hint)); head.append(hd);
      const cnt = el('span', 'brand-count', String(mine.length)); head.append(cnt);
      sec.append(head);
      mine.forEach((x) => {
        const row = el('div', 'brand-row');
        const lg = el('button', 'brand-logo-pick'); lg.type = 'button'; lg.title = 'Elegir logo';
        const showLogo = () => { lg.replaceChildren(); const u = x.logo && imageUrl(x.logo); if (u) { const im = el('img'); im.alt = ''; im.src = u; lg.append(im); } else lg.append(el('span', '', '＋ Logo')); };
        showLogo();
        lg.addEventListener('click', async () => {
          try { const a = await pickImageCropped(`sponsor-${x.name || 'logo'}`, 2); if (a) { x.logo = a.path; showLogo(); } } catch (e) { toast(cleanError(e), 'error'); }
        });
        const fields = el('div', 'brand-fields');
        const r = el('input'); r.type = 'text'; r.maxLength = 60; r.value = x.role || g.roles[0]; r.setAttribute('list', `ad-roles-${g.kind}`); r.placeholder = 'Rol';
        r.addEventListener('input', () => { x.role = r.value; });
        const n = el('input', 'brand-name'); n.type = 'text'; n.maxLength = 60; n.placeholder = g.ph; n.value = x.name || '';
        n.addEventListener('input', () => { x.name = n.value; });
        const u = el('input'); u.type = 'url'; u.maxLength = 300; u.placeholder = 'https://… (enlace, opcional)'; u.value = x.url || '';
        u.addEventListener('input', () => { x.url = u.value; });
        const t = el('input'); t.type = 'text'; t.maxLength = 160; t.placeholder = g.textPh; t.value = x.text || '';
        t.addEventListener('input', () => { x.text = t.value; });
        const l1 = el('div', 'brand-line'); l1.append(r, n);
        const l2 = el('div', 'brand-line'); l2.append(u, t);
        fields.append(l1, l2);
        if (g.kind !== 'host') {
          // Persona con Minecraft: se muestra su cabeza 3D si no hay logo (por usuario de Minecraft, o subiendo una skin PNG).
          const sk = el('details', 'brand-skin'); sk.open = !!(x.nick || x.skin);
          sk.append(el('summary', '', 'Skin de Minecraft (opcional)'));
          const nk = el('input'); nk.type = 'text'; nk.maxLength = 16; nk.placeholder = 'Usuario de Minecraft (si tiene cuenta premium)'; nk.value = x.nick || '';
          nk.addEventListener('input', () => { x.nick = nk.value.trim(); });
          sk.append(nk, skinEditor(Object.assign(x, { nick: x.nick || '' })), el('p', 'muted', 'Se usa en lugar del logo. Si pones el usuario premium se baja su skin; si no tiene cuenta, sube su skin en PNG.'));
          fields.append(sk);
        }
        const q = el('button', 'ghost brand-del', '✕'); q.type = 'button'; q.title = 'Quitar';
        q.addEventListener('click', () => { list.splice(list.indexOf(x), 1); paint(); });
        row.append(lg, fields, q);
        sec.append(row);
      });
      const dl = el('datalist'); dl.id = `ad-roles-${g.kind}`; g.roles.forEach((v) => { const o = el('option'); o.value = v; dl.append(o); }); sec.append(dl);
      if (mine.length < g.max && list.length < 16) {
        const add = el('button', 'brand-add', g.add); add.type = 'button';
        add.addEventListener('click', () => { list.push({ kind: g.kind, role: g.roles[0], name: '', url: '', text: '' }); paint(); });
        sec.append(add);
      }
      box.append(sec);
    });
  };
  paint();
}

function paintArtState() {
  $('ad-art-state').textContent = `${adm.evImage ? 'Con banner' : 'Sin banner'} · ${adm.evLogo ? 'con logo' : 'sin logo'}`;
  paintEvPreview();
}
/* Elige una imagen, deja acomodarla en un cuadro (como Instagram o X) y solo entonces la sube. Devuelve {path, preview} o null. */
async function pickImageCropped(label, aspect) {
  const r = await window.api.adminPickImage(label, { crop: true });
  if (!r) return null;
  if (!window.NovaCrop) return window.api.adminUploadImage(label, r.raw);
  const out = await window.NovaCrop.open(r.raw, aspect, r.kind);
  if (out === null) return null;
  return window.api.adminUploadImage(label, out === 'orig' ? r.raw : out);
}
async function pickEventArt(kind) {
  $('ad-status').textContent = 'Eligiendo imagen…';
  try {
    const r = await pickImageCropped(`${kind}-${$('ad-name').value || 'evento'}`, kind === 'banner' ? 16 / 9 : 1);
    if (!r) { $('ad-status').textContent = ''; return; }
    if (kind === 'banner') adm.evImage = r.path; else adm.evLogo = r.path;
    paintArtState();
    $('ad-status').textContent = `${kind === 'banner' ? 'Banner' : 'Logo'} subido. Se verá al publicar el evento.`;
  } catch (e) { $('ad-status').textContent = cleanError(e); }
}
$('ad-banner-pick').addEventListener('click', () => pickEventArt('banner'));
$('ad-logo-pick').addEventListener('click', () => pickEventArt('logo'));
$('ad-art-clear').addEventListener('click', () => { adm.evImage = ''; adm.evLogo = ''; paintArtState(); });

async function loadAdmin() {
  if (!isAdmin) return;
  try {
    const d = await window.api.adminLoad();
    const m = d.manifest;
    adm.manifest = m;
    const ev = m.event || {};
    $('ad-live-name').textContent = ev.name || 'Sin evento';
    $('ad-live-meta').textContent = `${({ soon: 'Próximamente', active: 'Activo', ended: 'Finalizado' })[ev.status || (ev.active ? 'active' : 'soon')]} · Minecraft ${m.minecraftVersion || '?'} · ${LOADER_NAMES[m.loader && m.loader.type] || 'Vanilla'}${m.protected ? ' · modpack protegido con contraseña' : ''}`;
    loadEvLib().catch(() => {});
    adm.team = d.team;
    adm.news = d.news;
    adm.ads = d.ads || [];
    paintAds();
    adm.newsSaved = (d.news || []).map((n) => ({ title: n.title, date: n.date }));
    adm.admins = d.admins;
    adm.events = d.events;
    paintAdminEvents();
    adm.owners = d.owners;
    paintPerms();
    paintTeam();
    paintNews();
    if (window.adminExtLoad) window.adminExtLoad(d);
    await loadAdminPacks();
  } catch (e) {
    $('ad-status').textContent = cleanError(e);
  }
}

async function loadAdminPacks() {
  const packs = await window.api.modpackInstalled();
  const sel = $('ad-pack');
  sel.replaceChildren();
  const none = el('option', '', 'Solo publicar los datos (sin cambiar mods)');
  none.value = '';
  sel.append(none);
  packs.forEach((p) => { const o = el('option', '', p.title); o.value = p.id; sel.append(o); });
  const saved = keep(AD_PACK_KEY);
  sel.value = packs.some((p) => p.id === saved) ? saved : packs.length ? packs[0].id : '';
  $('ad-pack-empty').hidden = packs.length > 0;
  await showAdminPack();
}

async function showAdminPack() {
  const id = $('ad-pack').value;
  keep(AD_PACK_KEY, id);
  adm.summary = null;
  const card = $('ad-pack-card');
  card.hidden = !id;
  ['ad-pack-edit', 'ad-pack-play'].forEach((b) => ($(b).disabled = !id));
  if (id) {
    try {
      const sm = await window.api.adminPackSummary(id);
      adm.summary = sm;
      const ic = $('ad-pack-icon');
      ic.replaceChildren();
      if (sm.icon) { const img = el('img'); img.alt = ''; img.src = sm.icon; ic.className = 'mod-icon'; ic.append(img); }
      else { ic.className = 'mod-icon mod-icon-empty'; ic.textContent = sm.emoji || sm.title.slice(0, 1).toUpperCase(); }
      $('ad-pack-title').textContent = sm.title;
      const chips = $('ad-pack-chips');
      chips.replaceChildren(chip(`Minecraft ${sm.mcVersion}`), chip(LOADER_NAMES[sm.loader] || 'Vanilla'), chip(`${sm.mods} mod${sm.mods === 1 ? '' : 's'} activos`, sm.mods ? 'ok' : 'warn'), chip(fmtSize(sm.bytes)));
    } catch (e) {
      $('ad-pack-title').textContent = cleanError(e);
    }
  }
  paintChecklist();
}

function paintChecklist() {
  const ul = $('ad-check');
  ul.replaceChildren();
  const sm = adm.summary;
  const hasPack = !!$('ad-pack').value;
  const items = [
    [!!$('ad-name').value.trim(), 'Nombre del evento'],
    [!hasPack || !!(sm && sm.mods), hasPack ? (sm ? `Modpack: ${sm.mods} mods activos de Minecraft ${sm.mcVersion}` : 'Modpack') : 'Sin modpack: solo se publican los datos', !hasPack],
    [!hasPack || $('ad-pass').value.length >= 10, 'Contraseña de al menos 10 caracteres', !hasPack]
  ];
  let ready = true;
  items.forEach(([ok, label, soft]) => {
    const li = el('li', ok ? 'ok' : soft ? 'warn' : 'bad', label);
    ul.append(li);
    if (!ok && !soft) ready = false;
  });
  $('ad-pass').closest('.field').hidden = !hasPack;
}
['ad-name', 'ad-pass'].forEach((id) => $(id).addEventListener('input', paintChecklist));

/* Contraseña de instalación: ver, comprobar, generar y recordar. */
const passMsg = (t, cls) => { const p = $('ad-pass-msg'); p.textContent = t; p.className = cls || 'muted'; };
$('ad-pass-eye').addEventListener('click', () => {
  const show = $('ad-pass').type === 'password';
  $('ad-pass').type = show ? 'text' : 'password';
  $('ad-pass-eye').setAttribute('aria-pressed', String(show));
  $('ad-pass-eye').setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
});
$('ad-pass').addEventListener('input', () => passMsg(''));
$('ad-pass-check').addEventListener('click', async () => {
  const pw = $('ad-pass').value;
  if (!pw) { passMsg('Escribe la contraseña para comprobarla.', 'warn'); return; }
  try {
    const r = await window.api.adminPasswordCheck(pw);
    if (r.state === 'ok') passMsg('✓ Es la contraseña actual del evento: los jugadores que ya instalaron no tendrán que escribir nada.', 'ok');
    else if (r.state === 'wrong') passMsg('✗ No es la contraseña actual. Si publicas así, será una contraseña nueva y los jugadores la escribirán una vez.', 'warn');
    else passMsg('Todavía no hay un modpack protegido publicado: cualquier contraseña de 10 caracteres o más sirve.', 'muted');
  } catch (e) { passMsg(cleanError(e), 'warn'); }
});
$('ad-pass-gen').addEventListener('click', () => {
  const abc = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = new Uint32Array(16);
  crypto.getRandomValues(buf);
  const pw = [...buf].map((n) => abc[n % abc.length]).join('');
  $('ad-pass').value = pw;
  $('ad-pass').type = 'text';
  $('ad-pass-eye').setAttribute('aria-pressed', 'true');
  paintChecklist();
  passMsg('Contraseña nueva generada. Cópiala o márcala para recordarla antes de publicar: no se puede recuperar.', 'ok');
});
$('ad-pass-copy').addEventListener('click', async () => {
  const pw = $('ad-pass').value;
  if (!pw) { passMsg('No hay nada que copiar.', 'warn'); return; }
  try { await navigator.clipboard.writeText(pw); toast('Contraseña copiada'); } catch { passMsg('No se pudo copiar; selecciónala y usa Ctrl+C.', 'warn'); }
});
(async () => {
  try {
    const s = await window.api.adminPasswordSaved();
    if (!s || !s.available) return;
    $('ad-pass-remember-row').hidden = false;
    if (s.password) { $('ad-pass-remember').checked = true; $('ad-pass').value = s.password; paintChecklist(); passMsg('Contraseña guardada en este equipo cargada.', 'muted'); }
  } catch {}
})();
$('ad-pack').addEventListener('change', showAdminPack);
$('ad-pack-edit').addEventListener('click', async () => {
  const p = (await window.api.modpackInstalled()).find((x) => x.id === $('ad-pack').value);
  if (!p) return;
  goTo('modpacks');
  openDetail(p);
});
$('ad-pack-play').addEventListener('click', () => playPack($('ad-pack').value));
$('ad-pack-new').addEventListener('click', () => { goTo('modpacks'); showView('library'); $('mp-go-create').click(); });

function toLocalInput(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function offerSaveToHistory(evName, entryInfo) {
  const nm = String(evName || '').trim();
  if (!nm) return;
  const list = Array.isArray(adm.events) ? adm.events : [];
  if (list.some((e) => String(e.name || '').trim().toLowerCase() === nm.toLowerCase())) return;
  if (!await askConfirm(`El evento "${nm}" quedó FINALIZADO.\n\n¿Quieres guardarlo en el apartado Historial?\nPodrás añadir ganadores, participantes y enlaces editándolo después.`)) return;
  const img = String((entryInfo && entryInfo.image) || adm.evImage || '');
  const entry = { name: nm.slice(0, 80), date: new Date().toISOString().slice(0, 10), image: /^(images\/|https:\/\/)/i.test(img) ? img : '', description: String((entryInfo && entryInfo.tagline) || $('ad-tag').value || '').slice(0, 800) };
  await saveAdminEvents([entry, ...list], false);
  toast('Evento guardado en Historial');
}

let usersList = [];
async function loadUsers() {
  const st = $('ad-users-status');
  st.textContent = 'Cargando…';
  try {
    const r = await window.api.adminUsers();
    usersList = r.users;
    $('ad-users-key').hidden = true;
    $('ad-users-body').hidden = false;
    st.textContent = '';
    const s = r.summary;
    const stats = $('ad-users-stats');
    stats.replaceChildren();
    [[s.total, 'Instalaciones'], [s.day, 'Activas hoy'], [s.week, 'Últimos 7 días'], [s.month, 'Últimos 30 días'], [s.premium, 'Premium']].forEach(([n, l]) => {
      const c = el('div', 'ad-stat');
      c.append(el('strong', '', String(n)), el('span', 'muted', l));
      stats.append(c);
    });
    paintUsers();
  } catch (e) {
    if (String(e.message || e).includes('NO_KEY')) {
      $('ad-users-key').hidden = false;
      $('ad-users-body').hidden = true;
      st.textContent = '';
    } else {
      st.textContent = cleanError(e);
    }
  }
}
function paintUsers() {
  const q = $('ad-users-search').value.trim().toLowerCase();
  const box = $('ad-users-list');
  box.replaceChildren();
  const list = usersList.filter((u) => !q || u.nick.toLowerCase().includes(q)).sort((a, b) => b.last - a.last).slice(0, 200);
  $('ad-users-note').textContent = `${list.length} de ${usersList.length} · ordenados por última vez visto`;
  list.forEach((u) => {
    const row = el('div', 'mod-card');
    const body = el('div', 'mod-body');
    body.append(el('strong', '', u.nick || 'Sin sesión iniciada'), el('span', 'muted', `v${u.version} · ${u.os === 'win32' ? 'Windows' : u.os === 'darwin' ? 'macOS' : 'Linux'} · visto ${new Date(u.last).toLocaleString('es')} · ${u.count} aperturas`));
    row.append(body, el('span', `ad-chip${u.premium ? ' ok' : ''}`, u.premium ? 'Premium' : u.nick ? 'No premium' : 'Anónimo'));
    const del = el('button', '', 'Quitar');
    del.type = 'button';
    del.addEventListener('click', async () => {
      if (!await askConfirm('¿Quitar este registro de la lista? Volverá a aparecer si esa persona abre el launcher.')) return;
      try { await window.api.adminUserDelete(u.id); usersList = usersList.filter((x) => x.id !== u.id); paintUsers(); } catch (e) { $('ad-users-status').textContent = cleanError(e); }
    });
    row.append(del);
    box.append(row);
  });
}
$('ad-users-search').addEventListener('input', paintUsers);
$('ad-users-refresh').addEventListener('click', loadUsers);
$('ad-users-key-save').addEventListener('click', async () => {
  try {
    await window.api.adminUsersKey($('ad-users-key-input').value);
    $('ad-users-key-input').value = '';
    loadUsers();
  } catch (e) { $('ad-users-status').textContent = cleanError(e); }
});

/* --- editor del historial de eventos --- */
const ade = { index: -1, draft: null, preview: '' };
let aeQuery = '';
function paintAdminEvents() {
  const box = $('ad-events');
  box.replaceChildren();
  const list = (adm.events || []).map((ev, i) => ({ ev, i })).sort((a, b) => ((a.ev.date || '') === (b.ev.date || '') ? 0 : (a.ev.date || '') < (b.ev.date || '') ? 1 : -1));
  const q = aeQuery.trim().toLowerCase();
  const wOf = (ev) => (ev.winners || (ev.winner ? [ev.winner] : [])).filter(Boolean);
  $('ad-events-stats').replaceChildren(
    el('span', 'tm-stat', `${list.length} eventos`),
    el('span', 'tm-stat', `👥 ${list.reduce((n, x) => n + (Number(x.ev.participants) || 0), 0)} participaciones`),
    el('span', 'tm-stat', `🖼 ${list.filter((x) => x.ev.image).length} con imagen`)
  );
  // Primera tarjeta: crear uno nuevo
  const add = el('button', 'ae-card ae-new'); add.type = 'button';
  add.append(el('span', 'ae-plus', '+'), el('b', '', 'Evento nuevo'), el('small', 'muted', 'Nombre, imagen, ganadores…'));
  add.addEventListener('click', () => $('ad-event-add').click());
  box.append(add);
  list.forEach(({ ev, i }) => {
    if (q && !(ev.name || '').toLowerCase().includes(q)) return;
    const card = el('div', 'ae-card');
    const src = imageUrl(ev.image);
    const m = el('div', 'ev-media ae-media');
    if (src) {
      m.style.setProperty('--ev-img', `url("${src.replace(/"/g, '%22')}")`);
      const img = el('img', 'ev-img'); img.alt = ''; img.loading = 'lazy'; img.src = src; m.append(img);
    } else { m.classList.add('no-img'); m.append(el('span', 'ev-initial', (ev.name || '?').trim().slice(0, 2).toUpperCase())); }
    const y = /^\d{4}/.test(ev.date || '') ? ev.date.slice(0, 4) : '';
    if (y) m.append(el('span', 'ev-year', y));
    const flags = el('div', 'ae-flags');
    if (ev.background) flags.append(el('span', 'tm2-chip', 'Fondo'));
    if (ev.commissioner && ev.commissioner.name) flags.append(el('span', 'tm2-chip', 'Comisionado'));
    if (!src) flags.append(el('span', 'tm2-chip warn', 'Sin imagen'));
    const body = el('div', 'ae-body');
    body.append(el('strong', '', ev.name || 'Sin título'));
    body.append(el('span', 'muted', `${ev.date || 'Sin fecha'}${ev.participants ? ' · 👥 ' + ev.participants : ''}`));
    const w = wOf(ev);
    if (w.length) {
      const row = el('div', 'ae-winners');
      w.slice(0, 5).forEach((n) => row.append(head3d({ nick: n }, 28)));
      row.append(el('span', 'muted', w.length === 1 ? w[0] : `${w.length} ganadores`));
      body.append(row);
    }
    body.append(flags);
    const edit = el('button', 'primary', 'Editar'); edit.type = 'button';
    edit.addEventListener('click', () => openAdminEvent(i));
    card.addEventListener('dblclick', () => openAdminEvent(i));
    ctx(card, () => [
      { title: ev.name || 'Evento' },
      { icon: '✎', label: 'Editar', onClick: () => openAdminEvent(i) },
      { icon: '⧉', label: 'Duplicar', onClick: () => { const copy = JSON.parse(JSON.stringify(ev)); copy.name = `${ev.name} (copia)`.slice(0, 80); const list = [...adm.events]; list.splice(i + 1, 0, copy); saveAdminEvents(list, false); } },
      { icon: '📋', label: 'Copiar título', onClick: () => copyText(ev.name || '', 'Título copiado') },
      'sep',
      { icon: '🗑', label: 'Eliminar…', danger: true, onClick: async () => { if (await askConfirm(`¿Eliminar "${ev.name}" del historial?`)) saveAdminEvents(adm.events.filter((_, k) => k !== i), false); } }
    ]);
    card.append(m, body, edit);
    box.append(card);
  });
  if (!(adm.events || []).length) box.append(el('p', 'muted', 'Todavía no hay eventos en el historial.'));
}
ctx($('ad-events'), () => [{ title: 'Historial' }, { icon: '＋', label: 'Evento nuevo', onClick: () => $('ad-event-add').click() }]);
$('ad-events-search').addEventListener('input', (e) => { aeQuery = e.target.value; paintAdminEvents(); });
function paintAdeWinners() {
  const box = $('ade-winners');
  box.replaceChildren();
  ade.draft.winners.forEach((n, i) => {
    const chip = el('div', 'ade-winner');
    const img = head3d({ nick: n }, 30);
    const x = el('button', '', '×');
    x.type = 'button';
    x.setAttribute('aria-label', `Quitar a ${n}`);
    x.addEventListener('click', () => { ade.draft.winners.splice(i, 1); paintAdeWinners(); });
    chip.append(img, el('span', '', n), x);
    box.append(chip);
  });
}
// Skin subida (PNG) para quien no tiene cuenta premium: reemplaza al Steve que se vería por no existir en Mojang.
function skinEditor(obj) {
  const row = el('div', 'links-row skin-row');
  const pick = el('button', '', obj.skin ? 'Cambiar skin (PNG)' : 'Subir skin (PNG)'); pick.type = 'button';
  pick.addEventListener('click', async () => {
    try {
      const r = await window.api.adminPickImage(`skin-${obj.nick || 'jugador'}`);
      if (!r) return;
      if (!/\.png$/i.test(r.path)) { toast('La skin tiene que ser un PNG de 64x64.', 'error'); return; }
      obj.skin = r.path; pick.textContent = 'Cambiar skin (PNG)';
    } catch (e) { toast(cleanError(e), 'error'); }
  });
  const clr = el('button', '', 'Quitar skin'); clr.type = 'button';
  clr.addEventListener('click', () => { delete obj.skin; delete obj.slim; pick.textContent = 'Subir skin (PNG)'; });
  const lab = el('label', 'check'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!obj.slim;
  cb.addEventListener('change', () => { obj.slim = cb.checked; });
  lab.append(cb, el('span', '', 'Brazos Slim'));
  row.append(pick, clr, lab);
  return row;
}
// Editor de personas nombradas (participantes / colaboradores): nick, rol opcional y enlaces.
function peopleEditor(box, list, withRole, addLabel, canAdd = true) {
  const paint = () => {
    box.replaceChildren();
    list.forEach((p, i) => {
      const row = el('div', 'person-row');
      const head = el('div', 'person-head');
      const img = el('img'); img.alt = ''; img.src = p.nick ? skinBust(p.nick) : '';
      const n = el('input'); n.type = 'text'; n.maxLength = 16; n.placeholder = 'Nick de Minecraft'; n.value = p.nick || '';
      n.addEventListener('change', () => { p.nick = n.value.trim(); img.src = /^[A-Za-z0-9_]{1,16}$/.test(p.nick) ? skinBust(p.nick) : ''; });
      head.append(img, n);
      if (withRole) {
        const r = el('input'); r.type = 'text'; r.maxLength = 60; r.placeholder = 'Qué hizo (opcional)'; r.value = p.role || '';
        r.addEventListener('input', () => { p.role = r.value; });
        head.append(r);
      }
      const x = el('button', '', 'Quitar'); x.type = 'button';
      x.addEventListener('click', () => { list.splice(i, 1); paint(); });
      head.append(x);
      const lk = el('details', 'team-links');
      lk.append(el('summary', '', `Skin y enlaces (${(p.links || []).length})`), skinEditor(p), linksEditor(p));
      row.append(head, lk);
      box.append(row);
    });
    if (canAdd) {
      const add = el('button', '', addLabel); add.type = 'button';
      add.addEventListener('click', () => { list.push({ nick: '', links: [] }); paint(); });
      box.append(add);
    }
  };
  paint();
}
function paintAdeImage() {
  const box = $('ade-img');
  box.replaceChildren();
  const src = ade.preview || imageUrl(ade.draft.image);
  if (src) { const img = el('img'); img.alt = ''; img.src = src; box.append(img); } else box.append(el('span', 'muted', 'Sin imagen'));
}
function openAdminEvent(idx) {
  ade.index = idx;
  const base = idx >= 0 ? adm.events[idx] : { name: '', date: new Date().toISOString().slice(0, 10), image: '', description: '' };
  ade.draft = { ...base, winners: [...(base.winners || (base.winner ? [base.winner] : []))], roster: (base.roster || []).map((p) => ({ ...p, links: [...(p.links || [])].map((l) => ({ ...l })) })), collabs: (base.collabs || []).map((p) => ({ ...p, links: [...(p.links || [])].map((l) => ({ ...l })) })) };
  // Alta de participantes en pausa (sin lista oficial de eventos pasados). Los ya guardados se conservan; se reactiva con localStorage px.admin.roster = 1.
  const rosterOn = (() => { try { return localStorage.getItem('px.admin.roster') === '1'; } catch { return false; } })();
  // Los participantes que ya están guardados siempre se pueden ver y quitar; añadir nuevos sigue en pausa.
  const showRoster = rosterOn || ade.draft.roster.length > 0;
  $('ade-roster-title').hidden = $('ade-roster').hidden = !showRoster;
  if (showRoster) peopleEditor($('ade-roster'), ade.draft.roster, false, '+ Participante', rosterOn);
  peopleEditor($('ade-collabs'), ade.draft.collabs, true, '+ Colaborador');
  ade.preview = '';
  ade.posts = { links: (base.posts || []).map((l) => ({ ...l })) };
  $('ade-posts').replaceChildren(linksEditor(ade.posts));
  $('ade-com-name').value = (base.commissioner && base.commissioner.name) || '';
  $('ade-com-url').value = (base.commissioner && base.commissioner.url) || '';
  $('ade-com-nick').value = (base.commissioner && base.commissioner.nick) || '';
  $('ade-bg-state').textContent = ade.draft.background ? 'Con fondo' : '';
  $('ade-title').textContent = idx >= 0 ? 'Editar evento' : 'Evento nuevo';
  $('ade-name').value = ade.draft.name;
  $('ade-date').value = ade.draft.date || '';
  $('ade-desc').value = ade.draft.description || '';
  $('ade-part').value = ade.draft.participants || '';
  $('ade-win').value = '';
  $('ade-status').textContent = '';
  $('ade-delete').hidden = idx < 0;
  paintAdeImage();
  paintAdeWinners();
  $('ad-event-modal').showModal();
}
$('ad-event-add').addEventListener('click', () => openAdminEvent(-1));
$('ade-cancel').addEventListener('click', () => $('ad-event-modal').close());
$('ade-clear').addEventListener('click', () => { ade.draft.image = ''; ade.preview = ''; paintAdeImage(); });
$('ade-pick').addEventListener('click', async () => {
  $('ade-status').textContent = 'Eligiendo imagen…';
  try {
    const r = await pickImageCropped($('ade-name').value, 4 / 3);
    if (!r) { $('ade-status').textContent = ''; return; }
    ade.draft.image = r.path;
    ade.preview = r.preview;
    paintAdeImage();
    $('ade-status').textContent = 'Imagen subida. Se verá en el historial al guardar.';
  } catch (e) { $('ade-status').textContent = cleanError(e); }
});
$('ade-bg-clear').addEventListener('click', () => { delete ade.draft.background; $('ade-bg-state').textContent = ''; });
$('ade-bg-pick').addEventListener('click', async () => {
  $('ade-status').textContent = 'Eligiendo fondo…';
  try {
    const r = await pickImageCropped(`fondo-${$('ade-name').value}`, 16 / 9);
    if (!r) { $('ade-status').textContent = ''; return; }
    ade.draft.background = r.path;
    $('ade-bg-state').textContent = 'Con fondo';
    $('ade-status').textContent = 'Fondo subido. Se verá al guardar.';
  } catch (e) { $('ade-status').textContent = cleanError(e); }
});
function addWinner() {
  const n = $('ade-win').value.trim();
  if (!/^[A-Za-z0-9_]{1,16}$/.test(n)) { $('ade-status').textContent = 'Escribe un nick de Minecraft válido (letras, números y _).'; return; }
  if (!ade.draft.winners.some((w) => w.toLowerCase() === n.toLowerCase())) ade.draft.winners.push(n);
  $('ade-win').value = '';
  $('ade-status').textContent = '';
  paintAdeWinners();
}
$('ade-win-add').addEventListener('click', addWinner);
$('ade-win').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addWinner(); } });
async function saveAdminEvents(list, closeModal) {
  try {
    adm.events = await window.api.adminSaveEvents(list);
    paintAdminEvents();
    $('ad-events-status').textContent = 'Historial publicado. Los jugadores lo verán en unos minutos.';
    window.refreshContent && window.refreshContent();
    if (closeModal) $('ad-event-modal').close();
  } catch (e) { $('ade-status').textContent = cleanError(e); $('ad-events-status').textContent = cleanError(e); }
}
$('ade-save').addEventListener('click', () => {
  const name = $('ade-name').value.trim();
  if (!name) { $('ade-status').textContent = 'Ponle un título al evento.'; return; }
  const ev = { ...ade.draft, name, date: $('ade-date').value, description: $('ade-desc').value, participants: Number($('ade-part').value) || 0 };
  delete ev.winner;
  ev.posts = ade.posts.links;
  const comName = $('ade-com-name').value.trim();
  if (comName) ev.commissioner = { name: comName, url: $('ade-com-url').value.trim(), nick: $('ade-com-nick').value.trim() }; else delete ev.commissioner;
  const list = [...adm.events];
  if (ade.index >= 0) list[ade.index] = ev; else list.unshift(ev);
  saveAdminEvents(list, true);
});
$('ade-delete').addEventListener('click', async () => {
  if (!await askConfirm(`¿Eliminar "${ade.draft.name}" del historial?`)) return;
  saveAdminEvents(adm.events.filter((_, i) => i !== ade.index), true);
});

function paintPerms() {
  const box = $('ad-perms');
  box.replaceChildren();
  const owners = adm.owners || [], admins = adm.admins || [];
  const stats = $('ad-perm-stats');
  if (stats) {
    stats.replaceChildren();
    [[owners.length, 'Dueños'], [admins.filter((x) => x.rol !== 'moderador').length, 'Administradores'], [admins.filter((x) => x.rol === 'moderador').length, 'Moderadores'], [owners.length + admins.length, 'Con acceso al panel']].forEach(([n, l]) => {
      const t = el('div', 'ad-stat'); t.append(el('strong', '', String(n)), el('span', 'muted', l)); stats.append(t);
    });
  }
  owners.forEach((o) => {
    const c = el('div', 'perm-card owner');
    c.append(head3d({ nick: o }, 46));
    const b = el('div', 'perm-body'); b.append(el('strong', '', o), el('span', 'perm-role owner', '👑 Dueño'), el('small', 'muted', 'Siempre tiene acceso'));
    c.append(b); box.append(c);
  });
  const saveAdmins = async (list) => {
    try { adm.admins = await window.api.adminSaveAdmins(list); paintPerms(); } catch (e) { $('ad-perm-status').textContent = cleanError(e); }
  };
  admins.forEach((a, idx) => {
    const c = el('div', 'perm-card perm-editable');
    c.append(head3d({ nick: a.nick }, 46));
    const rol = a.rol === 'moderador' ? 'moderador' : 'administrador';
    const mine = Array.isArray(a.permisos) ? a.permisos : AD_ROLES[rol];
    const b = el('div', 'perm-body');
    const sel = el('select', 'perm-rol');
    [['administrador', '🛡 Administrador'], ['moderador', '🔧 Moderador']].forEach(([v, t]) => { const o = el('option', '', t); o.value = v; sel.append(o); });
    sel.value = rol;
    sel.setAttribute('aria-label', `Rol de ${a.nick}`);
    sel.addEventListener('change', () => { const next = adm.admins.map((x, i) => (i === idx ? { nick: x.nick, uuid: x.uuid, ...(sel.value === 'moderador' ? { rol: 'moderador' } : {}) } : x)); saveAdmins(next); });
    const custom = Array.isArray(a.permisos);
    b.append(el('strong', '', a.nick), sel, el('small', 'muted', custom ? 'Permisos personalizados' : 'Permisos del rol'));
    const grid = el('div', 'perm-checks');
    Object.entries(AD_PERMS).forEach(([key, label]) => {
      const lab = el('label', 'perm-check');
      const cb = el('input'); cb.type = 'checkbox'; cb.checked = mine.includes(key);
      cb.addEventListener('change', () => {
        const list = Object.keys(AD_PERMS).filter((k) => (k === key ? cb.checked : mine.includes(k)));
        saveAdmins(adm.admins.map((x, i) => (i === idx ? { ...x, permisos: list } : x)));
      });
      lab.append(cb, document.createTextNode(` ${label}`));
      grid.append(lab);
    });
    b.append(grid);
    if (custom) {
      const reset = el('button', 'ghost', 'Volver al rol'); reset.type = 'button';
      reset.addEventListener('click', () => saveAdmins(adm.admins.map((x, i) => (i === idx ? { nick: x.nick, uuid: x.uuid, ...(rol === 'moderador' ? { rol } : {}) } : x))));
      b.append(reset);
    }
    const del = el('button', 'perm-del ghost', 'Quitar');
    del.type = 'button'; del.title = 'Quitar permiso';
    del.addEventListener('click', async () => {
      if (!await askConfirm(`¿Quitar el permiso a ${a.nick}?`)) return;
      saveAdmins(adm.admins.filter((_, i) => i !== idx));
    });
    c.append(b, del); box.append(c);
  });
  if (!owners.length && !admins.length) box.append(el('p', 'muted', 'Aún no hay nadie con acceso.'));
}
$('ad-invite').addEventListener('click', async () => {
  const st = $('ad-invite-status');
  const user = $('ad-invite-user').value.trim();
  if (!user) { st.textContent = 'Escribe su usuario de GitHub.'; return; }
  st.textContent = 'Invitando…';
  try {
    const r = await window.api.adminInvite(user);
    if (r.ok) {
      st.textContent = r.already ? `${user} ya es colaborador del repositorio.` : `Invitación enviada a ${user}. Cuando la acepte, sigue con el paso 3.`;
      $('ad-invite-user').value = '';
    } else {
      st.textContent = 'Tu token no puede invitar gente (es normal). Se abrió GitHub: pulsa “Add people”, escribe su usuario y elige el rol Write.';
      window.api.openLink(r.url).catch(() => {});
    }
  } catch (e) { st.textContent = cleanError(e); }
});
$('ad-perm-add').addEventListener('click', async () => {
  $('ad-perm-status').textContent = 'Comprobando el nick en Mojang…';
  try {
    const who = await window.api.adminResolveNick($('ad-perm-nick').value);
    adm.admins = await window.api.adminSaveAdmins([...(adm.admins || []), who]);
    $('ad-perm-nick').value = '';
    $('ad-perm-status').textContent = `${who.nick} ya puede ver el modo administrador.`;
    paintPerms();
  } catch (e) { $('ad-perm-status').textContent = cleanError(e); }
});

function rowInputs(row, fields) {
  const inputs = {};
  fields.forEach(([key, ph, max, cls]) => {
    const i = el('input', cls || '');
    i.type = 'text'; i.placeholder = ph; i.maxLength = max; i.value = row[key] || '';
    i.addEventListener('input', () => { row[key] = i.value; });
    inputs[key] = i;
  });
  return inputs;
}
const tmOpen = new WeakSet();
let tmSel = null;
let tmQuery = '';
function paintTeam() {
  const box = $('ad-team');
  box.replaceChildren();
  const q = tmQuery.trim().toLowerCase();
  const prev = $('ad-team-preview');
  const showPreview = (m) => { tmSel = m; prev.replaceChildren(m ? profileCard(m, true) : el('p', 'muted', 'Elige a alguien para ver su perfil.')); };
  const refreshPreview = (m) => { if (tmSel === m) showPreview(m); };
  if (!tmSel || !adm.team.includes(tmSel)) tmSel = adm.team[0] || null;

  // Contadores
  const st = $('ad-team-stats');
  st.replaceChildren(
    el('span', 'tm-stat', `${adm.team.length} personas`),
    el('span', 'tm-stat', `★ ${adm.team.filter((m) => m.featured && !m.tribute).length} destacados`),
    el('span', 'tm-stat', `💛 ${adm.team.filter((m) => m.tribute).length} homenaje`)
  );

  adm.team.forEach((m, idx) => {
    const hay = `${m.nick || ''} ${m.name || ''} ${m.role || ''}`.toLowerCase();
    const row = el('div', 'mod-card tm2');
    if (q && !hay.includes(q)) row.hidden = true;
    row.classList.toggle('open', tmOpen.has(m));
    row.classList.toggle('is-sel', tmSel === m);
    if (m.tribute) row.classList.add('is-tribute'); else if (m.featured) row.classList.add('is-featured');

    // ----- cabecera (siempre visible)
    const head = el('div', 'tm2-head');
    const av = el('img', 'tm-av'); av.alt = '';
    const paintAv = () => {
      const src = avatarPreviews.get(m) || imageUrl(m.avatar);
      av.classList.toggle('is-photo', !!src);
      av.src = src || (/^[A-Za-z0-9_]{1,16}$/.test(m.nick || '') ? skinBust(m.nick) : 'images/logo.png');
    };
    paintAv();
    const id = el('div', 'tm2-id');
    const title = el('strong', '', m.nick || 'Nueva persona');
    const role = el('span', 'muted', m.role || 'Sin rol todavía');
    id.append(title, role);
    const chips = el('div', 'tm2-chips');
    const paintChips = () => {
      chips.replaceChildren();
      if (m.tribute) chips.append(el('span', 'tm2-chip tr', '💛 Siempre parte de Nova'));
      else if (m.featured) chips.append(el('span', 'tm2-chip ft', '★ Destacado'));
      if (m.avatar) chips.append(el('span', 'tm2-chip', 'Foto'));
      if (m.skin) chips.append(el('span', 'tm2-chip', 'Skin'));
      if ((m.links || []).length) chips.append(el('span', 'tm2-chip', `${m.links.length} enlace${m.links.length > 1 ? 's' : ''}`));
    };
    paintChips();
    const caret = el('span', 'tm2-caret', '▾'); caret.setAttribute('aria-hidden', 'true');
    const mv = el('div', 'tm2-move');
    const up = el('button', 'ghost', '↑'); up.type = 'button'; up.title = 'Subir'; up.disabled = idx === 0;
    const dn = el('button', 'ghost', '↓'); dn.type = 'button'; dn.title = 'Bajar'; dn.disabled = idx === adm.team.length - 1;
    const swap = (to) => { const [it] = adm.team.splice(idx, 1); adm.team.splice(to, 0, it); paintTeam(); };
    up.addEventListener('click', (e) => { e.stopPropagation(); swap(idx - 1); });
    dn.addEventListener('click', (e) => { e.stopPropagation(); swap(idx + 1); });
    mv.append(up, dn);
    head.append(av, id, chips, mv, caret);
    head.tabIndex = 0;
    head.setAttribute('role', 'button');
    const toggle = () => {
      if (tmOpen.has(m)) tmOpen.delete(m); else tmOpen.add(m);
      row.classList.toggle('open', tmOpen.has(m));
      showPreview(m);
      box.querySelectorAll('.tm2').forEach((r) => r.classList.toggle('is-sel', r === row));
    };
    head.addEventListener('click', toggle);
    head.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });

    // ----- cuerpo (se abre al pulsar la cabecera)
    const bodyEl = el('div', 'tm2-body');
    const sec = (title2, hint) => { const s2 = el('section', 'tm2-sec'); const h = el('div', 'tm2-sec-h'); h.append(el('b', '', title2)); if (hint) h.append(el('small', 'muted', hint)); s2.append(h); return s2; };
    const field = (label, input) => { const l = el('label', 'tm2-field'); l.append(el('span', 'muted', label), input); return l; };
    const sync = () => { title.textContent = m.nick || 'Nueva persona'; role.textContent = m.role || 'Sin rol todavía'; paintChips(); refreshPreview(m); };

    const base = rowInputs(m, [['nick', 'Nick de Minecraft', 16], ['role', 'Ej. Lead Systems Architect', 80]]);
    const nm = rowInputs(m, [['name', 'Nombre real (opcional)', 40]]);
    [base.nick, base.role, nm.name].forEach((i) => i.addEventListener('input', sync));
    base.nick.addEventListener('change', paintAv);
    const s1 = sec('Datos', 'Lo primero que se ve en la tarjeta');
    const g1 = el('div', 'tm2-grid'); g1.append(field('Nick', base.nick), field('Rol', base.role), field('Nombre real', nm.name));
    s1.append(g1);

    const s2 = sec('Presentación', 'Aparece en su perfil');
    const bio = el('textarea'); bio.rows = 3; bio.maxLength = 300; bio.placeholder = 'Cuéntanos quién es y qué hace en Nova PX…'; bio.value = m.bio || '';
    const cnt = el('small', 'muted tm2-count', `${bio.value.length}/300`);
    bio.addEventListener('input', () => { m.bio = bio.value; cnt.textContent = `${bio.value.length}/300`; refreshPreview(m); });
    s2.append(bio, cnt);

    const s3 = sec('Foto de perfil', 'Cuadrada se ve mejor · PNG, JPG o WEBP hasta 3 MB');
    const phRow = el('div', 'tm2-photo');
    const phImg = el('img', 'tm2-photo-img'); phImg.alt = '';
    const paintPh = () => { const src = avatarPreviews.get(m) || imageUrl(m.avatar); phImg.hidden = !src; if (src) phImg.src = src; phNo.hidden = !!src; };
    const phNo = el('div', 'tm2-photo-none muted', 'Sin foto: se usa el busto de su skin');
    const avPick = el('button', '', m.avatar ? 'Cambiar foto' : 'Subir foto'); avPick.type = 'button';
    avPick.addEventListener('click', async () => {
      try {
        const r = await pickImageCropped(m.nick || 'perfil', 1);
        if (r) { m.avatar = r.path; if (r.preview) avatarPreviews.set(m, r.preview); avPick.textContent = 'Cambiar foto'; paintPh(); paintAv(); sync(); }
      } catch (e) { $('ad-team-status').textContent = cleanError(e); }
    });
    const avClear = el('button', 'ghost', 'Quitar foto'); avClear.type = 'button';
    avClear.addEventListener('click', () => { delete m.avatar; avatarPreviews.delete(m); avPick.textContent = 'Subir foto'; paintPh(); paintAv(); sync(); });
    const phBtns = el('div', 'tm2-photo-btns'); phBtns.append(avPick, avClear);
    phRow.append(phImg, phNo, phBtns);
    paintPh();
    s3.append(phRow);

    const s4 = sec('Skin 3D', 'Para quien no tiene cuenta premium');
    s4.append(skinEditor(m));

    const s5 = sec('Enlaces', 'Redes, canal, portafolio…');
    s5.append(linksEditor(m));
    s5.addEventListener('click', () => setTimeout(() => { paintChips(); refreshPreview(m); }, 0));
    s5.addEventListener('input', () => { paintChips(); refreshPreview(m); });

    const s6 = sec('Etiquetas');
    const tags = el('div', 'tm2-tags');
    const tag = (icon, name, desc, key, onSet) => {
      const t = el('label', 'tm2-tag');
      const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!m[key];
      cb.addEventListener('change', () => { m[key] = cb.checked; onSet(); });
      const tx = el('div'); tx.append(el('b', '', `${icon} ${name}`), el('small', 'muted', desc));
      t.append(cb, tx);
      return t;
    };
    tags.append(
      tag('★', 'Destacado', 'Tarjeta grande arriba del Equipo', 'featured', () => { paintTeam(); }),
      tag('💛', 'Homenaje', 'Para quien falleció o tuvo que dejar el proyecto', 'tribute', () => { paintTeam(); })
    );
    s6.append(tags);
    bodyEl.append(s1, s2, s3, s4, s5, s6);

    if (m.tribute) {
      const s7 = sec('Homenaje', 'Para alguien que falleció o tuvo que dejar el proyecto: se muestra con una tarjeta especial de recuerdo');
      const yrs = el('input'); yrs.type = 'text'; yrs.maxLength = 30; yrs.placeholder = 'Años (ej. 1994 – 2024, o 2022 – 2024 en el proyecto)'; yrs.value = m.years || '';
      yrs.addEventListener('input', () => { m.years = yrs.value; refreshPreview(m); });
      const txt = el('textarea'); txt.rows = 2; txt.maxLength = 300; txt.placeholder = 'Mensaje de agradecimiento o recuerdo'; txt.value = m.tributeText || '';
      txt.addEventListener('input', () => { m.tributeText = txt.value; refreshPreview(m); });
      const g7 = el('div', 'tm2-grid one'); g7.append(field('Años', yrs), field('Mensaje', txt));
      s7.append(g7);
      bodyEl.append(s7);
    }
    const foot = el('div', 'tm2-foot');
    const del = el('button', 'danger', 'Quitar de la lista'); del.type = 'button';
    del.addEventListener('click', () => { adm.team.splice(idx, 1); paintTeam(); });
    foot.append(del);
    bodyEl.append(foot);

    row.append(head, bodyEl);
    row.addEventListener('focusin', () => { if (tmSel !== m) { showPreview(m); box.querySelectorAll('.tm2').forEach((r) => r.classList.toggle('is-sel', r === row)); } });
    box.append(row);
  });
  if (!adm.team.length) box.append(el('p', 'muted tm2-empty', 'Todavía no hay nadie. Pulsa «+ Persona» para añadir al primero.'));
  showPreview(tmSel);
  if (window.makeSortable) window.makeSortable(box, adm.team, paintTeam);
}
$('ad-team-search').addEventListener('input', (e) => { tmQuery = e.target.value; paintTeam(); });
$('ad-team-toggle').addEventListener('click', () => {
  const all = adm.team.length && adm.team.every((m) => tmOpen.has(m));
  adm.team.forEach((m) => (all ? tmOpen.delete(m) : tmOpen.add(m)));
  $('ad-team-toggle').textContent = all ? 'Expandir todo' : 'Contraer todo';
  paintTeam();
});
function paintNews() {
  const box = $('ad-news');
  box.replaceChildren();
  const cnt = $('ad-news-count'); if (cnt) cnt.textContent = `${adm.news.length} ${adm.news.length === 1 ? 'noticia' : 'noticias'}`;
  adm.news.forEach((n, idx) => {
    const row = el('div', 'mod-card news-edit');
    // imagen
    const media = el('div', 'ne-media');
    const showImg = () => {
      media.replaceChildren();
      const u = n.image && imageUrl(n.image);
      if (u) { const im = el('img'); im.alt = ''; im.src = u; media.append(im); } else media.append(el('span', 'ne-ph', '🖼\nSin imagen'));
    };
    showImg();
    const pick = el('button', 'ne-pick', n.image ? 'Cambiar imagen' : '+ Imagen'); pick.type = 'button';
    pick.addEventListener('click', async () => {
      try { const r = await pickImageCropped(n.title || 'noticia', 16 / 9); if (r) { n.image = r.path; pick.textContent = 'Cambiar imagen'; showImg(); prev(); } } catch (e) { $('ad-news-status').textContent = cleanError(e); }
    });
    const clr = el('button', 'ne-clr ghost', 'Quitar'); clr.type = 'button';
    clr.addEventListener('click', () => { delete n.image; pick.textContent = '+ Imagen'; showImg(); prev(); });
    const left = el('div', 'ne-left'); left.append(media, el('div', 'ne-btns'));
    left.lastChild.append(pick, clr);
    // campos
    const fields = el('div', 'ne-fields');
    const top = el('div', 'ne-top');
    const badge = el('span', 'ne-badge', idx === 0 ? 'Más reciente' : `#${idx + 1}`);
    const date = el('input'); date.type = 'date'; date.value = /^\d{4}-\d{2}-\d{2}$/.test(n.date || '') ? n.date : '';
    date.addEventListener('input', () => { n.date = date.value; prev(); });
    const del = el('button', 'ne-del ghost', '🗑 Quitar'); del.type = 'button';
    del.addEventListener('click', async () => { if (!await askConfirm(`¿Quitar la noticia "${n.title || 'sin título'}"?`)) return; adm.news.splice(idx, 1); paintNews(); });
    top.append(badge, date, del);
    const title = el('input', 'ne-title'); title.type = 'text'; title.maxLength = 100; title.placeholder = 'Título de la noticia'; title.value = n.title || '';
    title.addEventListener('input', () => { n.title = title.value; prev(); });
    const text = el('textarea', 'ne-text'); text.rows = 3; text.maxLength = 600; text.placeholder = 'Cuenta qué pasó. Se ve en Inicio y, si activaste el aviso, se envía a Discord.'; text.value = n.text || '';
    const count = el('small', 'ne-count muted', `${(n.text || '').length}/600`);
    text.addEventListener('input', () => { n.text = text.value; count.textContent = `${text.value.length}/600`; prev(); });
    const textWrap = el('div', 'ne-textwrap'); textWrap.append(text, count);
    // vista previa
    const pv = el('div', 'ne-preview');
    const prev = () => {
      pv.replaceChildren(el('span', 'ne-pv-label', 'Así se ve en Inicio'));
      const card = el('article', 'news-item news-card');
      const u = n.image && imageUrl(n.image);
      if (u) { const im = el('img', 'news-img'); im.alt = ''; im.src = u; card.append(im); }
      card.append(el('h3', '', n.title || 'Título de la noticia'), el('time', '', n.date || ''), el('p', '', n.text || 'El texto aparecerá aquí.'));
      pv.append(card);
    };
    prev();
    const more = el('details', 'ne-links');
    more.open = (n.links || []).length > 0;
    more.append(el('summary', '', `🔗 Enlaces (${(n.links || []).length})`), linksEditor(n));
    fields.append(top, title, textWrap, more);
    row.append(left, fields, pv);
    box.append(row);
  });
  if (!adm.news.length) box.append(el('p', 'muted ne-empty', 'Todavía no hay noticias. Pulsa «+ Noticia» para crear la primera.'));
  if (window.makeSortable) window.makeSortable(box, adm.news, paintNews);
}
$('ad-team-add').addEventListener('click', () => { const n = { nick: '', role: '' }; adm.team.push(n); tmOpen.add(n); tmSel = n; paintTeam(); });
$('ad-news-add').addEventListener('click', () => { adm.news.unshift({ title: '', date: new Date().toISOString().slice(0, 10), text: '' }); paintNews(); });
$('ad-team-save').addEventListener('click', async () => {
  try {
    adm.team = await window.api.adminSaveTeam(adm.team.filter((m) => (m.nick || '').trim()));
    paintTeam();
    window.adminListSaved('team');
    $('ad-team-status').textContent = 'Equipo publicado. Ya lo ves en la pestaña Equipo; los jugadores lo reciben en pocos minutos.';
    window.refreshContent && window.refreshContent();
  } catch (e) { $('ad-team-status').textContent = cleanError(e); }
});
$('ad-news-save').addEventListener('click', async () => {
  try {
    const before = new Set((adm.newsSaved || []).map((n) => `${n.title}|${n.date}`));
    adm.news = await window.api.adminSaveNews(adm.news);
    const fresh = adm.news.filter((n) => !before.has(`${n.title}|${n.date}`));
    adm.newsSaved = adm.news.map((n) => ({ title: n.title, date: n.date }));
    for (const n of fresh) await autoDiscord('news', { title: n.title, text: n.text, image: imageUrl(n.image), link: (n.links && n.links[0] && n.links[0].url) || '' });
    paintNews();
    window.adminListSaved('news');
    $('ad-news-status').textContent = 'Noticias publicadas.';
    window.refreshContent && window.refreshContent();
  } catch (e) { $('ad-news-status').textContent = cleanError(e); }
});

$('nav-back').addEventListener('click', () => navStep(-1));
$('nav-fwd').addEventListener('click', () => navStep(1));
// Botones laterales del mouse (atrás = 3, adelante = 4). Primero cierra un diálogo abierto, si lo hay.
['mouseup', 'auxclick'].forEach((type) => window.addEventListener(type, (e) => {
  if (e.button !== 3 && e.button !== 4) return;
  e.preventDefault();
  if (type === 'auxclick') return;
  const open = document.querySelector('dialog[open]');
  if (open && e.button === 3) { try { open.close(); } catch {} return; }
  navStep(e.button === 3 ? -1 : 1);
}));

/* --- llave de firma de datos --- */
async function paintSignKey() {
  const box = $('ad-sign');
  try {
    const st = await window.api.adminSignKeyStatus();
    box.hidden = !st.enabled;
    $('ad-sign-status').textContent = st.imported
      ? 'Llave importada: lo que publiques desde aquí sale firmado.'
      : st.mandatory ? 'Falta la llave: no se podrá publicar hasta importarla.' : 'Aún no importaste la llave: lo que publiques saldrá sin firma.';
  } catch { box.hidden = true; }
}
$('ad-sign-import').addEventListener('click', async () => {
  try {
    const r = await window.api.adminSignKeyImport();
    if (!r.canceled) $('ad-sign-status').textContent = 'Llave importada: lo que publiques desde aquí sale firmado.';
  } catch (e) { $('ad-sign-status').textContent = cleanError(e); }
});
document.querySelector('[data-ad-tab="config"]')?.addEventListener('click', paintSignKey);


/* --- eventos: lista, configurar y publicar --- */
let evLib = [];
let evEditKey = null; // id de la tarjeta que se está configurando (null = ninguna)
let evImporting = false;
const evSlug = (name) => `${String(name || 'evento').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'evento'}-${Date.now().toString(36)}`.slice(0, 40);
const evWhen = (iso) => new Date(iso).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function readEditorEvent() {
  return {
    name: $('ad-name').value.trim(), tagline: $('ad-tag').value, image: adm.evImage || '', logo: adm.evLogo || '',
    sponsors: (adm.sponsors || []).map((x) => ({ ...x })), lockPack: $('ad-lock').checked, instanceId: $('ad-pack').value || ''
  };
}
function fillEditorEvent(e) {
  adm.evImage = e.image || '';
  adm.evLogo = e.logo || '';
  adm.sponsors = (e.sponsors || []).map((x) => ({ ...x }));
  sponsorsEditor();
  $('ad-name').value = e.name || '';
  $('ad-tag').value = e.tagline || '';
  $('ad-lock').checked = e.lockPack !== false;
  const has = e.instanceId && [...$('ad-pack').options].some((o) => o.value === e.instanceId);
  $('ad-pack').value = has ? e.instanceId : '';
  $('ad-pack').dispatchEvent(new Event('change'));
  paintArtState();
}
function paintEvPreview() {
  const box = $('ev-preview');
  if (!box) return;
  const img = imageUrl(adm.evImage || '');
  box.style.backgroundImage = img ? `linear-gradient(90deg, rgba(0,0,0,.65), rgba(0,0,0,.15)), url(${JSON.stringify(img)})` : '';
  const logo = imageUrl(adm.evLogo || '');
  const lg = $('ev-preview-logo');
  lg.hidden = !logo;
  if (logo) lg.src = logo;
  $('ev-preview-name').textContent = $('ad-name').value.trim() || 'Nombre del evento';
  $('ev-preview-desc').textContent = $('ad-tag').value;
}
['ad-name', 'ad-tag'].forEach((id) => $(id).addEventListener('input', paintEvPreview));

function showEvScreen(edit) {
  $('ev-screen-list').hidden = edit;
  $('ev-screen-edit').hidden = !edit;
}
function openEvEditor(key, entry) {
  evEditKey = key;
  fillEditorEvent(entry);
  $('ad-editing-title').textContent = entry.name ? `Configurar: ${entry.name}` : 'Evento nuevo';
  $('ad-status').textContent = '';
  paintChecklist();
  showEvScreen(true);
}

// El evento que ven los jugadores ahora, según data/manifest.json.
function liveInfo() {
  const m = adm.manifest || {};
  const ev = m.event || {};
  if (!ev.name) return null;
  let status = ev.status || (ev.active ? 'active' : 'soon');
  if (status === 'soon' && ev.autoStart && Date.parse(ev.startsAt || '') <= Date.now()) status = 'active';
  return { id: ev.id || '', name: ev.name, status, startsAt: ev.startsAt || '', autoStart: !!ev.autoStart };
}
function isLiveEntry(e, live) {
  if (!live) return false;
  if (e.publishedId) return e.publishedId === live.id;
  return String(e.name || '').trim().toLowerCase() === live.name.trim().toLowerCase();
}

async function loadEvLib() {
  evLib = await window.api.adminEvLibList();
  const live = liveInfo();
  // El evento que ya está publicado se guarda solo en la lista la primera vez.
  if (live && !evImporting && !evLib.some((e) => isLiveEntry(e, live))) {
    evImporting = true;
    const m = adm.manifest || {};
    const ev = m.event || {};
    try {
      evLib = await window.api.adminEvLibSave([...evLib, { id: evSlug(ev.name), name: ev.name, tagline: ev.tagline || '', startsAt: ev.startsAt || '', status: ev.status || (ev.active ? 'active' : 'soon'), image: ev.image || '', logo: ev.logo || '', sponsors: m.sponsors || [], lockPack: m.lockPack !== false, instanceId: '', publishedId: ev.id || '' }]);
    } catch {}
    evImporting = false;
  }
  paintEvLib();
}
async function saveEvLib(list, okText) {
  const st = $('ad-evlib-status');
  try {
    evLib = await window.api.adminEvLibSave(list);
    st.textContent = okText || '';
    paintEvLib();
    return true;
  } catch (e) { st.textContent = cleanError(e); return false; }
}
const upsertEv = (e, id) => (evLib.some((x) => x.id === id) ? evLib.map((x) => (x.id === id ? { ...x, ...e, id } : x)) : [...evLib, { ...e, id }]);

function paintEvLib() {
  const box = $('ad-evlib-cards');
  if (!box) return;
  box.replaceChildren();
  if (!evLib.length) { box.append(el('p', 'evlib-empty', 'Sin eventos guardados')); return; }
  const live = liveInfo();
  evLib.forEach((e) => {
    const row = el('div', 'evlib-row');
    const img = imageUrl(e.image || '');
    if (img) { row.classList.add('has-banner'); row.style.backgroundImage = `linear-gradient(90deg, rgba(10,10,14,.92) 8%, rgba(10,10,14,.35)), url(${JSON.stringify(img)})`; }
    const main = el('div', 'evlib-main');
    const mine = isLiveEntry(e, live);
    main.append(el('strong', '', e.name));
    const acts = el('div', 'evlib-actions');
    const btn = (text, fn, cls) => { const b = el('button', cls || '', text); b.type = 'button'; b.addEventListener('click', fn); acts.append(b); return b; };
    if (mine && live.status === 'active') acts.append(el('span', 'evlib-badge on', 'ACTIVO'));
    else if (mine && live.status === 'soon') acts.append(el('span', 'evlib-badge', live.autoStart && live.startsAt ? `PROGRAMADO · ${evWhen(live.startsAt)}` : 'PRÓXIMAMENTE'));
    else if (mine && live.status === 'ended') acts.append(el('span', 'evlib-badge', 'FINALIZADO'));
    btn('Editar', () => openEvEditor(e.id, e), 'ghost');
    if (mine && live.status !== 'ended') btn('Finalizar', () => finishEvent(e), 'ghost');
    if (!mine || live.status === 'ended') btn('Publicar', () => togglePublishPanel(row, e), 'primary');
    btn('Duplicar', async () => { await saveEvLib([...evLib, { ...e, id: evSlug(e.name), name: `${e.name} (copia)`.slice(0, 80), publishedId: '' }], 'Evento duplicado.'); }, 'ghost');
    btn('Eliminar', async () => {
      if (!await askConfirm(`¿Eliminar "${e.name}" de tus eventos?${mine && live.status !== 'ended' ? '\n\nSigue publicado: los jugadores lo seguirán viendo hasta que lo finalices.' : ''}`)) return;
      await saveEvLib(evLib.filter((x) => x.id !== e.id), 'Evento eliminado.');
    }, 'ghost');
    row.append(main, acts);
    box.append(row);
  });
}

// Panel que se abre bajo la fila: publicar ahora o programar para una fecha.
function togglePublishPanel(row, e) {
  const open = row.querySelector('.evlib-publish');
  if (open) { open.remove(); return; }
  const panel = el('div', 'evlib-publish');
  const now = el('button', 'primary', 'Publicar ahora'); now.type = 'button';
  const when = el('input'); when.type = 'datetime-local';
  const d = new Date(Date.now() + 24 * 3600 * 1000); d.setMinutes(0, 0, 0);
  when.value = toLocalInput(d.toISOString());
  const sched = el('button', '', 'Programar'); sched.type = 'button';
  const note = el('small', 'muted', 'Programado: los jugadores lo ven como «Próximamente» con cuenta atrás y se abre solo a esa hora.');
  now.addEventListener('click', () => publishEntry(e, ''));
  sched.addEventListener('click', () => {
    const t = when.value ? new Date(when.value) : null;
    if (!t || Number.isNaN(t.getTime()) || t.getTime() <= Date.now()) { $('ad-evlib-status').textContent = 'Elige una fecha y hora futuras.'; return; }
    publishEntry(e, t.toISOString());
  });
  panel.append(now, el('span', 'muted', 'o el'), when, sched, note);
  row.append(panel);
}

async function publishEntry(e, whenIso) {
  const st = $('ad-evlib-status');
  const bar = $('ad-evpub-progress');
  const hasPack = !!e.instanceId;
  const pw = $('ad-pass').value;
  if (!e.name) { st.textContent = 'El evento necesita un nombre.'; return; }
  if (hasPack && !(await window.api.modpackInstalled()).some((p) => p.id === e.instanceId)) { st.textContent = 'La instancia de este evento no está en este equipo. Ábrelo y elige otra.'; return; }
  if (hasPack && pw.length < 10) { st.textContent = 'Falta la clave de acceso: abre el evento («Editar») y escríbela en «Clave de acceso».'; return; }
  const live = liveInfo();
  if (!await askConfirm(`¿Publicar "${e.name}"?\n\n${whenIso ? `Los jugadores lo verán como próximamente y se abrirá solo el ${evWhen(whenIso)}.` : 'Queda ACTIVO: los jugadores podrán entrar ya.'}${live && !isLiveEntry(e, live) && live.status !== 'ended' ? `\n\nReemplaza al evento publicado ahora ("${live.name}").` : ''}`)) return;
  document.querySelectorAll('#ad-evlib-cards button').forEach((b) => { b.disabled = true; });
  bar.hidden = false;
  bar.removeAttribute('value');
  adminProgress = (d) => { if (d.total) { bar.max = d.total; bar.value = d.done; } st.textContent = d.text || ''; };
  try {
    const r = await window.api.adminPublishEvent({
      id: hasPack ? e.instanceId : undefined, password: pw,
      form: { status: whenIso ? 'soon' : 'active', active: !whenIso, autoStart: !!whenIso, sponsors: e.sponsors || [], image: e.image || '', logo: e.logo || '', name: e.name, tagline: e.tagline || '', startsAt: whenIso || new Date().toISOString(), newEvent: !(live && isLiveEntry(e, live)), lockPack: e.lockPack !== false }
    });
    if (hasPack) { try { await window.api.adminPasswordRemember({ remember: $('ad-pass-remember').checked, password: pw }); } catch (err) { toast(cleanError(err), 'error'); } }
    if (!$('ad-pass-remember').checked) { $('ad-pass').value = ''; $('ad-pass').type = 'password'; }
    try { await loadAdmin(); } catch {}
    const ev = (adm.manifest && adm.manifest.event) || {};
    await saveEvLib(upsertEv({ ...e, publishedId: ev.id || '', status: whenIso ? 'soon' : 'active', startsAt: whenIso || '' }, e.id), r.mods ? `Publicado: "${r.name}" con ${r.mods} mods cifrados. ${r.sameSalt ? 'Quien ya instaló no tendrá que escribir la contraseña.' : 'Contraseña nueva: los jugadores la escribirán una vez.'}` : `Publicado: "${r.name}". Los jugadores lo ven en unos minutos.`);
    toast(whenIso ? 'Evento programado' : 'Evento publicado');
    await autoDiscord('event', { title: `${r.name}: ${whenIso ? 'evento programado' : 'evento publicado'}`, text: e.tagline || '', image: imageUrl(e.image) });
    window.refreshContent && window.refreshContent();
  } catch (err) {
    st.textContent = cleanError(err);
  }
  adminProgress = null;
  bar.hidden = true;
  paintEvLib();
}

async function finishEvent(e) {
  if (!await askConfirm(`¿Finalizar "${e.name}"?\n\nDeja de verse en Inicio y en la pestaña Evento, y los jugadores ya no podrán entrar.`)) return;
  try {
    await window.api.adminSetEventState('ended');
    try { await loadAdmin(); } catch {}
    await saveEvLib(upsertEv({ ...e, status: 'ended' }, e.id), 'Evento finalizado.');
    window.refreshContent && window.refreshContent();
    await offerSaveToHistory(e.name, e);
  } catch (err) { $('ad-evlib-status').textContent = cleanError(err); }
}

$('ad-evlib-new').addEventListener('click', () => {
  openEvEditor(evSlug('evento'), { name: '', tagline: '', image: '', logo: '', sponsors: [], lockPack: true, instanceId: '' });
  $('ad-name').focus();
});
$('ad-editing-close').addEventListener('click', () => { evEditKey = null; showEvScreen(false); paintEvLib(); });
$('ad-editing-save').addEventListener('click', async () => {
  const e = readEditorEvent();
  if (!e.name) { $('ad-status').textContent = 'Ponle un nombre al evento.'; return; }
  const id = evEditKey || evSlug(e.name);
  if (await saveEvLib(upsertEv(e, id), 'Cambios guardados.')) { evEditKey = null; showEvScreen(false); toast('Evento guardado'); }
});
