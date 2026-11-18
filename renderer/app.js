/* Interfaz del launcher. Todo el texto remoto se inserta con textContent (nunca innerHTML). */

const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Skins por nick (sirve para premium y no premium; si no existe, muestra la skin de Steve).
const skinBust = (nick) => `https://minotar.net/armor/bust/${encodeURIComponent(nick)}/160.png`;
const skinHead = (nick) => `https://minotar.net/helm/${encodeURIComponent(nick)}/64.png`;

/* ---------- animación de inicio ---------- */
// El launcher se muestra cuando termina de cargar (mínimo ~3,2 s para que se vea la animación, máximo 6 s).
// Se salta con clic o cualquier tecla, y se puede desactivar en Ajustes > Apariencia.
(function splash() {
  const s = document.getElementById('splash');
  if (!s) return;
  let closed = false;
  let ready = !!window.__novaReady;
  let minDone = false;
  const MIN = 3200;
  const steps = ['Iniciando…', 'Cargando tu perfil…', 'Buscando eventos…', 'Preparando el launcher…', '¡Listo!'];
  const st = document.getElementById('sp-status');
  let si = 0;
  const tick = setInterval(() => { si = Math.min(si + 1, steps.length - 2); if (st) st.textContent = steps[si]; }, 700);
  function close() {
    if (closed) return;
    closed = true;
    clearInterval(tick);
    s.classList.add('hide');
    setTimeout(() => s.remove(), 600);
  }
  function tryClose() { if (ready && minDone) { clearInterval(tick); if (st) st.textContent = steps[steps.length - 1]; s.classList.add('ready'); setTimeout(close, 450); } }
  window.addEventListener('nova-ready', () => { ready = true; tryClose(); });
  setTimeout(() => { minDone = true; tryClose(); }, MIN);
  setTimeout(close, 6000);
  window.api.getSettings().then((st) => {
    if (st && st.intro === false) { minDone = true; if (ready) close(); else window.addEventListener('nova-ready', close, { once: true }); }
  }).catch(() => {});
  s.addEventListener('click', close);
  document.addEventListener('keydown', close, { once: true });
})();

/* ---------- skin 3D del jugador ---------- */
let homeViewer = null;
try {
  homeViewer = window.SkinViewer.create($('player3d'));
} catch {}
if (!homeViewer) {
  $('player3d').hidden = true;
  $('player-bust').hidden = false;
}
window.addEventListener('nova-fx', (e) => homeViewer && homeViewer.setAnimated(e.detail));

function loadImageUrl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

let skinLoadSeq = 0;
async function loadHomeSkin(nick, fresh) {
  if (!homeViewer) return;
  const seq = ++skinLoadSeq;
  if (!nick) return homeViewer.setSkin(null, false);
  try {
    const r = await window.api.skinTexture(nick, !!fresh);
    if (seq !== skinLoadSeq) return;
    if (!r) {
      homeViewer.setSkin(null, false);
      homeViewer.setCape(null);
      return;
    }
    homeViewer.setSkin(await loadImageUrl(r.dataUrl), r.slim);
    homeViewer.setCape(r.cape ? await loadImageUrl(r.cape) : null);
  } catch {
    if (seq === skinLoadSeq) homeViewer.setSkin(null, false);
  }
}
window.addEventListener('nova-skin-changed', () => currentUser && loadHomeSkin(currentUser.name, true));

let loggedIn = false;
let currentUser = null;

let remoteBase = '';

// Las imágenes de los JSON pueden ser un enlace https completo o una ruta relativa (ej. images/evento1.png).
// Con remoteBase (GitHub) la ruta relativa se descarga de data/ en el repositorio, así se actualiza sola.
// Sin remoteBase se busca dentro de renderer/ (útil al probar en tu computadora).
function imageUrl(path) {
  const p = String(path || '').trim();
  if (!p) return '';
  if (/^https:\/\//i.test(p)) return p;
  if (/^[a-z]+:/i.test(p) || p.includes('..') || p.startsWith('/')) return ''; // ignora otros esquemas y rutas raras
  if (remoteBase) return `${remoteBase}/${p.split('/').map(encodeURIComponent).join('/')}`;
  return new URL(p, document.baseURI).href;
}

// Si una skin no carga (sin internet, nick inexistente), oculta el icono de imagen rota.
document.addEventListener('error', (e) => {
  if (e.target.tagName === 'IMG') e.target.style.visibility = 'hidden';
}, true);
document.addEventListener('load', (e) => {
  if (e.target.tagName === 'IMG') e.target.style.visibility = '';
}, true);

function cleanError(err) {
  // Electron antepone "Error invoking remote method ...: Error: " al mensaje real.
  return String(err && err.message ? err.message : err).replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    ''
  );
}

/* ---------- navegación ---------- */
function moveIndicator() {
  const active = document.querySelector('.tab-btn.active');
  const ind = $('tab-ind');
  if (!active) {
    ind.style.height = '0px';
    return;
  }
  const h = Math.round(active.offsetHeight * 0.56);
  ind.style.height = `${h}px`;
  ind.style.transform = `translateY(${active.offsetTop + Math.round((active.offsetHeight - h) / 2)}px)`;
}

const PAGE_TITLES = {
  home: ['Inicio', 'Lo que estás jugando y las novedades'],
  event: ['Evento actual', 'Lo que prepara Nova PX para ti'],
  events: ['Historial', 'Los eventos anteriores del equipo'],
  team: ['Equipo', 'Las personas que hacen posible cada evento'],
  skins: ['Skins y capas', 'Cambia tu aspecto en Minecraft'],
  mods: ['Mods', 'Lo que lleva instalado el evento'],
  modpacks: ['Modpacks', 'Tus modpacks, los de Modrinth y los de la comunidad'],
  settings: ['Ajustes', 'Memoria, Java, apariencia y más'],
  admin: ['Administración', 'Publica el evento, el modpack, el equipo y las noticias'],
  console: ['Consola', 'El registro del juego, para resolver problemas'],
  account: ['Cuenta', 'Inicia sesión como premium o no premium']
};

/* ---------- avisos emergentes ---------- */
function toast(text, kind) {
  const box = $('toasts');
  const t = el('div', kind === 'error' ? 'toast error' : 'toast', maskNick(text));
  box.append(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 320);
  }, kind === 'error' ? 5200 : 3200);
}
window.toast = toast;

// Anima un número hasta su valor final (solo si los efectos están activos).
function countUp(node, to, suffix) {
  const text = (v) => `${v}${suffix || ''}`;
  if (document.documentElement.classList.contains('no-fx') || !Number.isFinite(to)) {
    node.textContent = text(to);
    return;
  }
  const from = Number(node.dataset.v || 0);
  node.dataset.v = String(to);
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / 700);
    node.textContent = text(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
window.addEventListener('resize', moveIndicator);

const navHist = { stack: [], i: -1, skip: false };
function navButtons() {
  $('nav-back').disabled = navHist.i <= 0;
  $('nav-fwd').disabled = navHist.i >= navHist.stack.length - 1;
}
function navStep(d) {
  const n = navHist.i + d;
  if (n < 0 || n >= navHist.stack.length) return;
  navHist.i = n;
  navHist.skip = true;
  goTo(navHist.stack[n]);
}
function goTo(tab) {
  if (!navHist.skip && navHist.stack[navHist.i] !== tab) {
    navHist.stack = navHist.stack.slice(0, navHist.i + 1);
    navHist.stack.push(tab);
    navHist.i = navHist.stack.length - 1;
  }
  navHist.skip = false;
  setTimeout(navButtons, 0);
  const navTab = tab === 'mods' ? 'event' : tab; // los mods del evento cuelgan de la pestaña Evento
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === navTab));
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  $(`page-${tab}`).classList.add('active');
  const [title, sub] = PAGE_TITLES[tab] || ['', ''];
  $('top-title').textContent = title;
  $('top-sub').textContent = sub;
  moveIndicator();
  if (tab === 'skins' && window.NovaSkins) window.NovaSkins.show();
  document.querySelector('.top-right').hidden = !(tab === 'event' || tab === 'mods');
  if (tab === 'mods' && !isAdmin) { goTo('event'); return; }
  if (tab === 'mods') renderMods();
  if (tab === 'modpacks') openModpacks();
  if (tab === 'admin') { loadAdmin(); if (window.adminEntered) window.adminEntered(); } else if (window.adminLeft) window.adminLeft();
  if (tab === 'home') renderContinue();
}
document.querySelectorAll('[data-tab]').forEach((btn) => btn.addEventListener('click', () => goTo(btn.dataset.tab)));

/* ---------- inicio: hero ---------- */
let eventActive = true;
let eventState = 'active';
let eventInfo = { name: 'Evento', tagline: '', logo: '' };

// Patrocinadores y créditos del evento (Evento). Sin datos muestra una tarjeta de invitación.
function paintSponsors(list) {
  const box = $('sponsors-list');
  box.replaceChildren();
  const items = Array.isArray(list) ? list : [];
  if (!items.length) {
    const c = el('div', 'sponsor sponsor-empty');
    c.append(el('span', 'sponsor-role', 'Tu marca aquí'), el('strong', '', 'Espacio para patrocinadores'), el('span', 'muted', 'Habla con el equipo de Nova PX para aparecer en los eventos.'));
    box.append(c);
    return;
  }
  for (const x of items) {
    const c = el(x.url ? 'button' : 'div', 'sponsor');
    if (x.url) { c.type = 'button'; c.addEventListener('click', () => window.api.openLink(x.url).catch(() => {})); }
    const logo = imageUrl(x.logo);
    if (logo) { const im = el('img', 'sponsor-logo'); im.alt = ''; im.src = logo; c.append(im); }
    const t = el('div', 'sponsor-text');
    if (x.role) t.append(el('span', 'sponsor-role', x.role));
    t.append(el('strong', '', x.name));
    if (x.text) t.append(el('span', 'muted', x.text));
    c.append(t);
    box.append(c);
  }
}

async function paintCommunity() {
  const box = $('community-stat');
  try {
    const st = await window.api.communityStats();
    if (!st || !st.total) { box.hidden = true; return; }
    box.replaceChildren(el('span', 'live-dot'), document.createTextNode(` ${st.day.toLocaleString()} jugadores activos hoy · ${st.total.toLocaleString()} en la comunidad Nova PX`));
    box.hidden = false;
    const lo = $('lp-online');
    lo.replaceChildren(el('span', 'live-dot'), document.createTextNode(` ${st.day.toLocaleString()} en línea hoy`));
    lo.hidden = false;
  } catch { box.hidden = true; }
}

async function renderHero() {
  try {
    const m = await window.api.getData('manifest');
    const evState = (m.event && m.event.status) || (m.event && m.event.active === false ? 'soon' : 'active');
    eventState = evState;
    eventActive = evState === 'active';
    const heroBox = document.querySelector('.hero');
    heroBox.classList.toggle('soon', !eventActive);
    heroBox.classList.toggle('ended', evState === 'ended');
    $('hero-badge-text').textContent = evState === 'ended' ? 'Evento finalizado' : eventActive ? 'Evento actual' : 'Próximamente';
    $('soon-art').hidden = eventActive || !!(m.event && (m.event.logo || m.event.image));
    setPlaying(playing);
    if (m.event && m.event.name) $('hero-title').textContent = m.event.name;
    eventInfo = { name: (m.event && m.event.name) || 'Evento', image: imageUrl(m.event && m.event.image), logo: imageUrl(m.event && m.event.logo), mc: m.minecraftVersion, loader: String((m.loader && m.loader.type) || 'vanilla') };
    renderContinue();
    $('hero-tagline').textContent = (m.event && m.event.tagline) || '';
    // Logo del evento (PNG con fondo transparente) a la derecha de la portada.
    const art = $('hero-art');
    const artUrl = imageUrl(m.event && m.event.logo);
    art.hidden = !artUrl;
    if (artUrl) art.src = artUrl;
    const heroImg = imageUrl(m.event && m.event.image);
    const hero = document.querySelector('.hero');
    hero.classList.toggle('has-banner', !!heroImg);
    if (heroImg) hero.style.setProperty('--hero-image', `url(${JSON.stringify(heroImg)})`);
    else hero.style.removeProperty('--hero-image');
    const chips = $('hero-chips');
    chips.replaceChildren();
    if (eventActive) chips.append(el('span', 'chip', `Minecraft ${m.minecraftVersion}`));
    const loader = String((m.loader && m.loader.type) || 'vanilla').toLowerCase();
    const loaderNames = { vanilla: 'Vanilla', fabric: 'Fabric', forge: 'Forge' };
    if (eventActive) chips.append(el('span', 'chip', loaderNames[loader] || loader));
    const mods = (m.mods || []).length;
    if (mods && eventActive) chips.append(el('span', 'chip', `${mods} ${mods === 1 ? 'mod' : 'mods'}`));
    if (m.protected && eventActive) chips.append(el('span', 'chip', 'Protegido'));
    $('stat-ver').textContent = eventActive ? m.minecraftVersion : '–';
    $('stat-ver-label').textContent = eventActive ? loaderNames[loader] || loader : 'Minecraft';
    startCountdown(m.event && m.event.startsAt, evState);
    lastEventLinks = m.links;
    paintSponsors(m.sponsors);
    paintCommunity();
    window.refreshLinks();
  } catch {
    $('hero-tagline').textContent = 'No se pudo leer la configuración del evento.';
  }
}

/* ---------- inicio: jugando ahora y continuar ---------- */
let launchTarget = null; // { kind: 'event' | 'pack', title, icon }

function nowPlayingSet(on) {
  const np = $('np');
  np.hidden = !on;
  if (!on) return;
  const t = launchTarget || { kind: 'event', title: eventInfo.name, icon: '' };
  $('np-title').textContent = t.title;
  $('np-icon').src = t.icon || 'images/logo.png';
}

function ago(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return 'sin jugar';
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 1) return 'ahora mismo';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d < 30 ? `hace ${d} día${d === 1 ? '' : 's'}` : new Date(t).toLocaleDateString('es');
}

function renderRecent(packs) {
  const box = $('nav-recent');
  box.querySelectorAll('.nav-item').forEach((n) => n.remove());
  const recent = packs.filter((p) => p.lastPlayedAt).sort((a, b) => b.lastPlayedAt.localeCompare(a.lastPlayedAt)).slice(0, 4);
  box.hidden = !recent.length;
  recent.forEach((p) => {
    const b = el('button', 'tab-btn nav-item');
    b.type = 'button';
    b.title = `${p.title} · abrir`;
    b.append(packIcon(p, 'nav-mini'), el('span', 'nav-label', p.title));
    b.addEventListener('click', () => { goTo('modpacks'); openDetail(p); });
    box.append(b);
  });
}

/* --- Launchpad (pantalla principal tipo Lunar) --- */
let lpPackId = null;
function renderLaunchpad(packs) {
  const w = $('lp-welcome');
  w.replaceChildren(document.createTextNode('Bienvenido de nuevo, '), el('span', 'pii', ($('player-name').textContent || '').replace('Sin sesión', 'jugador')));
  const last = packs.slice().sort((x, y) => String(y.lastPlayedAt || y.installedAt || '').localeCompare(String(x.lastPlayedAt || x.installedAt || '')))[0];
  lpPackId = last ? last.id : null;
  $('lp-play').disabled = !last;
  $('lp-play-sub').textContent = last ? `${last.title} · ${last.mcVersion} · ${LOADER_NAMES[last.loader && last.loader.type] || 'Vanilla'}` : 'Instala o crea un modpack para jugar';
  // El arte es el del modpack reciente; el del evento solo se usa si todavía no hay ningún modpack.
  const img = $('lp-img');
  const artBox = $('lp-pack-art');
  artBox.replaceChildren();
  const hero = $('lp-hero');
  hero.classList.toggle('has-pack', !!last);
  const evArt = eventInfo.image || eventInfo.logo;
  if (last) {
    $('lp-kicker').textContent = last.lastPlayedAt ? `Última partida · ${ago(last.lastPlayedAt)}` : 'Listo para jugar';
    $('lp-pack-title').textContent = last.title;
    if (last.icon) { const ic = el('img'); ic.alt = ''; ic.src = last.icon; artBox.append(ic); hero.style.setProperty('--lp-bg', `url(${JSON.stringify(last.icon)})`); }
    else { artBox.textContent = last.emoji || last.title.slice(0, 1).toUpperCase(); hero.style.removeProperty('--lp-bg'); }
    img.hidden = true;
  } else {
    $('lp-kicker').textContent = 'Bienvenido';
    $('lp-pack-title').textContent = 'Crea o instala tu primer modpack';
    artBox.textContent = '🎮';
    img.hidden = !evArt;
    if (evArt) { img.src = evArt; hero.style.setProperty('--lp-bg', `url(${JSON.stringify(evArt)})`); }
  }
  const chips = $('lp-chips');
  chips.replaceChildren();
  if (last) {
    chips.append(el('span', 'chip', `Minecraft ${last.mcVersion}`), el('span', 'chip', LOADER_NAMES[last.loader && last.loader.type] || 'Vanilla'));
    if (last.preset === 'nova') chips.append(el('span', 'chip', '⚡ Nova'));
  }
  $('lp-event').textContent = eventActive ? 'Evento activo →' : 'Próximo evento →';
  $('lp-event').classList.toggle('live', !!eventActive);
}
$('lp-play').addEventListener('click', () => { if (lpPackId) playPack(lpPackId); });
$('lp-event').addEventListener('click', () => goTo('event'));

async function renderContinue() {
  const box = $('continue-list');
  if (!box) return;
  let packs = [];
  try {
    packs = await window.api.modpackInstalled();
  } catch {}
  box.replaceChildren();
  // El evento es una tarjeta aparte, marcada, que lleva a su pestaña (no se mezcla con los modpacks).
  const ev = el('button', 'continue-card event');
  ev.type = 'button';
  const evIcon = el('img', 'np-icon');
  evIcon.alt = '';
  evIcon.src = eventInfo.logo || 'images/logo.png';
  const evBody = el('div', 'mod-body');
  evBody.append(el('span', 'tag', 'Evento'), el('strong', '', eventInfo.name), el('span', 'muted', eventActive ? 'Disponible para jugar' : 'Próximamente'));
  const evGo = el('span', 'cont-when', eventActive ? 'Ver evento →' : 'Ver detalles →');
  ev.append(evIcon, evBody, evGo);
  ev.addEventListener('click', () => goTo('event'));
  if (eventActive) box.append(ev); // con evento activo va arriba; si no, después de tus modpacks

  renderRecent(packs);
  renderLaunchpad(packs);
  packs
    .slice()
    .sort((x, y) => String(y.lastPlayedAt || y.installedAt || '').localeCompare(String(x.lastPlayedAt || x.installedAt || '')))
    .slice(0, 5)
    .forEach((p) => {
      const card = el('div', 'continue-card');
      card.append(packIcon(p, 'np-icon'));
      const body = el('div', 'mod-body');
      const cs = el('span', 'srv-pill');
      cs.hidden = true;
      body.append(el('strong', '', p.title), el('span', 'muted', `Minecraft ${p.mcVersion} · ${LOADER_NAMES[p.loader && p.loader.type] || 'Vanilla'}`), cs);
      fillServerPill(cs, p.id);
      const when = el('span', 'cont-when', ago(p.lastPlayedAt));
      const play = el('button', 'primary cont-play', '▶ Jugar');
      play.type = 'button';
      play.addEventListener('click', () => playPack(p.id));
      const more = el('button', 'cont-more', '⋮');
      more.type = 'button';
      more.setAttribute('aria-label', `Abrir ${p.title}`);
      more.title = 'Abrir la instancia';
      more.addEventListener('click', () => { goTo('modpacks'); openDetail(p); });
      card.append(body, when, play, more);
      box.append(card);
    });
  if (!eventActive) box.append(ev);
  if (!packs.length) {
    const hint = el('div', 'continue-card empty');
    hint.append(el('span', 'muted', 'Aún no tienes modpacks. Instala uno en la pestaña Modpacks y aparecerá aquí.'));
    const go = el('button', '', 'Buscar modpacks');
    go.type = 'button';
    go.addEventListener('click', () => goTo('modpacks'));
    hint.append(go);
    box.append(hint);
  }
}

/* ---------- cuenta atrás y enlaces ---------- */
let countdownTimer = 0;
function startCountdown(iso, state) {
  clearInterval(countdownTimer);
  const box = $('stat-next');
  const label = $('stat-next-label');
  // Un evento finalizado no cuenta hacia atrás aunque conserve la fecha.
  if (state === 'ended') {
    box.textContent = 'Finalizado';
    label.textContent = 'Estado del evento';
    return;
  }
  const target = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(target) || target <= Date.now()) {
    box.textContent = Number.isFinite(target) ? '¡Ya empezó!' : 'Por anunciar';
    label.textContent = 'Próximo evento';
    return;
  }
  label.textContent = 'Empieza en';
  const tick = () => {
    if (document.hidden) return; // no gasta nada si la ventana no se ve
    const left = Math.max(0, target - Date.now());
    if (left === 0) {
      clearInterval(countdownTimer);
      box.textContent = '¡Ya empezó!';
      label.textContent = 'Próximo evento';
      return;
    }
    const d = Math.floor(left / 86400000);
    const h = String(Math.floor(left / 3600000) % 24).padStart(2, '0');
    const mi = String(Math.floor(left / 60000) % 60).padStart(2, '0');
    const se = String(Math.floor(left / 1000) % 60).padStart(2, '0');
    box.textContent = `${d} d ${h}:${mi}:${se}`;
  };
  tick();
  countdownTimer = setInterval(tick, 1000);
}

let lastEventLinks = [];
window.refreshLinks = () => renderLinks(window.withRemoteLinks ? window.withRemoteLinks(lastEventLinks) : lastEventLinks);
function renderLinks(links) {
  const card = $('links-card');
  const box = $('links');
  box.replaceChildren();
  const valid = (Array.isArray(links) ? links : []).filter((l) => l && l.name && /^https:\/\//i.test(String(l.url || ''))).slice(0, 8);
  card.hidden = valid.length === 0;
  valid.forEach((l) => {
    const b = el('button', 'link-tile');
    b.type = 'button';
    b.dataset.tilt = '';
    const host = (() => { try { return new URL(l.url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
    b.append(linkIcon(l), el('span', 'link-name', String(l.name).slice(0, 30)), el('span', 'link-host muted', host));
    b.addEventListener('click', () => window.api.openLink(l.url).catch(() => {}));
    box.append(b);
  });
}

function formatPlaytime(seconds) {
  const mins = Math.floor((seconds || 0) / 60);
  if (mins < 1) return 'Aún no has jugado';
  const h = Math.floor(mins / 60);
  return h ? `Has jugado ${h} h ${mins % 60} min` : `Has jugado ${mins} min`;
}
async function refreshPlaytime() {
  try {
    const secs = (await window.api.getSettings()).playSeconds;
    $('playtime').textContent = formatPlaytime(secs);
    const mins = Math.floor((secs || 0) / 60);
    $('stat-play').textContent = mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${mins % 60} min`;
  } catch {}
}

async function renderNews() {
  const box = $('news-list');
  if (!box.children.length) box.replaceChildren(el('div', 'skeleton'), el('div', 'skeleton'));
  try {
    const news = await window.api.getData('news');
    box.replaceChildren();
    if (!news.length) box.append(el('p', 'muted', 'Todavía no hay novedades.'));
    news.forEach((n) => {
      const item = el('article', 'news-item news-card');
      const time = el('time', '', n.date);
      const src = imageUrl(n.image);
      if (src) { const im = el('img', 'news-img'); im.alt = ''; im.loading = 'lazy'; im.src = src; item.append(im); }
      item.append(el('h3', '', n.title), time, el('p', '', n.text));
      if (n.links && n.links.length) item.append(linkChips(n.links));
      box.append(item);
    });
  } catch {
    box.replaceChildren();
    box.append(el('p', 'muted', 'No se pudieron cargar las novedades. Revisa tu conexión.'));
  }
}

if (/Windows/i.test(navigator.userAgent)) document.documentElement.classList.add('win');

/* --- botón ✕ en todos los diálogos grandes (el contenido puede ser más alto que la ventana) --- */
document.querySelectorAll('dialog.event-modal').forEach((dlg) => {
  const x = el('button', 'modal-x', '✕');
  x.type = 'button';
  x.setAttribute('aria-label', 'Cerrar');
  x.addEventListener('click', () => dlg.close());
  dlg.prepend(x);
});

/* --- confirmación con la estética del launcher (reemplaza al confirm() de Windows) --- */
function askConfirm(message, okLabel, cancelLabel) {
  return new Promise((resolve) => {
    const dlg = el('dialog', 'event-modal confirm-modal');
    dlg.setAttribute('aria-label', 'Confirmar');
    const body = el('div', 'event-modal-body');
    const msg = el('p', 'confirm-msg', String(message));
    const actions = el('div', 'mp-actions');
    const no = el('button', '', cancelLabel || 'Cancelar'); no.type = 'button';
    const yes = el('button', 'primary', okLabel || 'Aceptar'); yes.type = 'button';
    actions.append(no, yes);
    body.append(msg, actions);
    dlg.append(body);
    let done = false;
    const finish = (v) => { if (done) return; done = true; resolve(v); try { dlg.close(); } catch {} dlg.remove(); };
    yes.addEventListener('click', () => finish(true));
    no.addEventListener('click', () => finish(false));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(false); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) finish(false); });
    document.body.append(dlg);
    dlg.showModal();
    yes.focus();
  });
}

const winnersOf = (ev) => (Array.isArray(ev.winners) ? ev.winners : ev.winner ? [ev.winner] : []).slice(0, 12);
let winViewers = [];
let winEnv = null;
// Fondo propio, "Comisionado por" (primero), y botones de tráiler / tweet / póster.
function paintEventExtras(ev) {
  const modal = $('event-modal');
  const bg = imageUrl(ev.background);
  modal.classList.toggle('has-bg', !!bg);
  modal.style.setProperty('--ev-bg', bg ? `url("${String(bg).replace(/"/g, '%22')}")` : 'none');
  const com = $('event-modal-commissioner');
  com.hidden = !ev.commissioner;
  com.replaceChildren();
  com.onclick = null;
  if (ev.commissioner) {
    const ic = window.brandIcon && ev.commissioner.url ? window.brandIcon({ name: '', url: ev.commissioner.url }) : null;
    const left = el('span', 'com-ico');
    if (ic) left.append(ic); else left.textContent = '🎬';
    const txt = el('span', 'com-text');
    txt.append(el('small', 'muted', 'Comisionado por'), el('b', '', ev.commissioner.name));
    com.append(left, txt);
    com.disabled = !ev.commissioner.url;
    if (ev.commissioner.url) com.onclick = () => window.api.openLink(ev.commissioner.url).catch(() => {});
  }
  const posts = $('event-modal-posts');
  posts.replaceChildren();
  if (ev.posts && ev.posts.length) posts.append(linkChips(ev.posts));
}

function paintWinners(ev) {
  const box = $('event-modal-winners');
  winViewers.forEach((v) => v.destroy());
  winViewers = [];
  box.replaceChildren();
  const list = winnersOf(ev);
  box.hidden = !list.length;
  if (!list.length) return;
  box.append(el('h4', 'winners-title', list.length === 1 ? '🏆 Ganador' : `🏆 Ganadores (${list.length})`));
  // Solo la cabeza de cada jugador, en una fila horizontal (si tiene skin subida por el admin, se usa esa).
  const extra = [...(ev.roster || []), ...(ev.collabs || [])];
  const row = el('div', 'winners-heads');
  list.forEach((nick) => {
    const known = extra.find((p) => p.nick.toLowerCase() === nick.toLowerCase());
    const card = el('div', 'winner-head');
    card.append(personFace({ nick, ...(known && known.skin ? { skin: known.skin, slim: known.slim } : {}), forceCanvas: true }), el('div', 'nick', nick));
    row.append(card);
  });
  box.append(row);
}

// Participantes y colaboradores con nombre: tarjetas con skin, rol y enlaces.
function paintPeople(ev) {
  const box = $('event-modal-people');
  box.replaceChildren();
  const groups = [['👥 Participantes', ev.roster], ['🤝 Colaboraron con Nova PX', ev.collabs]];
  let any = false;
  groups.forEach(([title, list]) => {
    if (!list || !list.length) return;
    any = true;
    box.append(el('h4', 'winners-title', `${title} (${list.length})`));
    const row = el('div', 'people-row compact');
    list.forEach((p) => {
      const c = el('div', 'person');
      c.append(personFace(p), el('div', 'nick', p.nick));
      if (p.role) c.append(el('div', 'role', p.role));
      if (p.links && p.links.length) c.append(linkChips(p.links));
      row.append(c);
    });
    box.append(row);
  });
  box.hidden = !any;
}

async function renderEvents() {
  const list = $('events-list');
  list.replaceChildren();
  try {
    const events = (await window.api.getData('events')).sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
    const modal = $('event-modal');
    const facts = (ev, withWinners) => {
      const box = el('div', 'facts');
      if (ev.participants) box.append(el('span', 'fact', `${ev.participants} participantes`));
      const w = withWinners ? winnersOf(ev) : [];
      if (w.length === 1) box.append(el('span', 'fact', `🏆 ${w[0]}`));
      else if (w.length > 1) box.append(el('span', 'fact', `🏆 ${w.length} ganadores`));
      return box;
    };
    const open = (ev) => {
      const src = imageUrl(ev.image);
      $('event-modal-img').hidden = !src;
      if (src) $('event-modal-img').src = src;
      $('event-modal-name').textContent = ev.name;
      $('event-modal-date').textContent = ev.date || '';
      $('event-modal-desc').textContent = ev.description || '';
      $('event-modal-facts').replaceChildren(...facts(ev, true).childNodes);
      paintEventExtras(ev);
      paintWinners(ev);
      paintPeople(ev);
      if (!modal.open) modal.showModal();
    };
    if (!modal.dataset.bound) {
      modal.dataset.bound = '1';
      $('event-modal-close').addEventListener('click', () => modal.close());
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });
      modal.addEventListener('close', () => { winViewers.forEach((v) => v.destroy()); winViewers = []; });
    }
    const cards = events.map((ev) => {
      const card = el('button', 'event-card');
      card.type = 'button';
      card.dataset.tilt = '';
      const src = imageUrl(ev.image);
      if (src) {
        const img = el('img', 'event-card-img');
        img.alt = '';
        img.loading = 'lazy';
        img.src = src;
        card.append(img);
      }
      const body = el('div', 'event-card-body');
      body.append(el('h3', '', ev.name));
      if (ev.date) body.append(el('span', 'muted', ev.date));
      body.append(facts(ev));
      card.append(body);
      card.addEventListener('click', () => open(ev));
      return { ev, card };
    });
    list.append(...cards.map((c) => c.card));
    const count = $('events-count');
    const filter = () => {
      const q = $('events-search').value.trim().toLowerCase();
      let n = 0;
      cards.forEach(({ ev, card }) => {
        const show = !q || ev.name.toLowerCase().includes(q);
        card.hidden = !show;
        if (show) n++;
      });
      count.textContent = events.length ? `${n} de ${events.length} eventos` : '';
    };
    $('events-search').oninput = filter;
    filter();
    if (!events.length) list.append(el('p', 'muted', 'Aún no hay eventos en el historial.'));
  } catch {
    list.append(el('p', 'muted', 'No se pudo cargar el historial. Revisa tu conexión.'));
  }
}

/* ---------- mods del evento (nombres e iconos de Modrinth) ---------- */
let modsSeq = 0;
async function renderMods() {
  const seq = ++modsSeq;
  const list = $('mods-list');
  const note = $('mods-note');
  note.textContent = 'Cargando mods…';
  list.replaceChildren();
  try {
    const r = await window.api.modsList();
    if (seq !== modsSeq) return;
    if (r.hidden) {
      note.textContent = `${r.eventName} mantiene su lista de mods privada. Tienes ${r.count} mods instalados.`;
      return;
    }
    if (!r.count) {
      note.textContent = 'Todavía no hay mods instalados. Se descargan la primera vez que pulses Jugar.';
      return;
    }
    const cards = r.mods.map((m) => {
      const row = el(m.url ? 'button' : 'div', 'mod-card');
      if (m.url) {
        row.type = 'button';
        row.addEventListener('click', () => window.api.openLink(m.url));
      }
      if (m.icon) {
        const img = el('img', 'mod-icon');
        img.alt = '';
        img.loading = 'lazy';
        img.src = m.icon;
        row.append(img);
      } else {
        row.append(el('div', 'mod-icon mod-icon-empty', m.name.slice(0, 1).toUpperCase()));
      }
      const body = el('div', 'mod-body');
      body.append(el('strong', '', m.name));
      body.append(el('span', 'muted', m.summary || m.file));
      row.append(body);
      if (m.version) row.append(el('span', 'fact', m.version));
      return { m, row };
    });
    list.append(...cards.map((c) => c.row));
    const count = () => {
      const q = $('mods-search').value.trim().toLowerCase();
      let n = 0;
      cards.forEach(({ m, row }) => {
        const show = !q || m.name.toLowerCase().includes(q) || m.file.toLowerCase().includes(q);
        row.hidden = !show;
        if (show) n++;
      });
      note.textContent = `${n} de ${r.count} mods${r.offline ? ' · sin conexión: nombres e iconos pueden faltar' : ''}`;
    };
    $('mods-search').oninput = count;
    count();
  } catch (err) {
    note.textContent = cleanError(err);
  }
}

/* ---------- modpacks: biblioteca, explorar e instancia ---------- */
const mp = { view: 'library', provider: 'modrinth', query: '', offset: 0, total: 0, enabled: { modrinth: true }, installed: [], current: null, seq: 0, busy: false, pack: null, filter: 'all', items: [], addType: 'mod', addSeq: 0 };
const compact = new Intl.NumberFormat('es', { notation: 'compact' });
const LOADER_NAMES = { fabric: 'Fabric', forge: 'Forge', vanilla: 'Vanilla' };
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

// Icono de una instancia: imagen del modpack, emoji elegido por el jugador o la inicial del nombre.
function packIcon(p, cls = 'mod-icon') {
  if (!p.icon && p.emoji) return el('div', `${cls} mod-icon-empty`, p.emoji);
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
  card.addEventListener('click', open);
  card.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === card) open(); });
  return card;
}

async function renderLibrary() {
  const host = $('mp-library');
  await loadInstalled();
  const q = $('mp-lib-search').value.trim().toLowerCase();
  const f = libView.filter;
  let list = mp.installed.filter((p) => (!q || p.title.toLowerCase().includes(q)) && (f === 'all' || (f === 'custom' ? p.provider === 'custom' : (p.loader && p.loader.type) === f)));
  const byName = (a, b) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' });
  const sorters = {
    recent: (a, b) => String(b.lastPlayedAt || '').localeCompare(String(a.lastPlayedAt || '')) || byName(a, b),
    name: byName,
    mc: (a, b) => String(b.mcVersion).localeCompare(String(a.mcVersion), undefined, { numeric: true }) || byName(a, b)
  };
  list = list.sort(sorters[libView.sort]);
  host.replaceChildren();
  $('mp-import-hint').hidden = mp.installed.length > 0 && !$('mp-import-hint').classList.contains('over');
  $('mp-lib-note').textContent = mp.installed.length
    ? `${list.length} de ${mp.installed.length} modpack${mp.installed.length === 1 ? '' : 's'}`
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
    items.forEach((p) => grid.append(packCard(p)));
    host.append(grid);
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
  launchTarget = { kind: 'pack', title: p.title || 'Modpack', icon: p.icon || '' };
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
  ['content', 'worlds', 'shots', 'logs', 'settings'].forEach((t) => ($(`mp-tab-${t}`).hidden = t !== tab));
  if (tab === 'content') renderContent();
  if (tab === 'worlds') renderWorlds();
  if (tab === 'shots') renderShots();
  if (tab === 'logs') renderPackLog();
  if (tab === 'settings') renderPackSettings();
}
document.querySelectorAll('[data-mp-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.mpTab)));

function openDetailHeader(p) {
  const icon = $('mp-detail-icon');
  icon.hidden = !p.icon;
  if (p.icon) icon.src = p.icon;
  $('mp-detail-title').textContent = `${!p.icon && p.emoji ? p.emoji + ' ' : ''}${p.title}`;
  $('mp-detail-meta').textContent = packMeta(p);
}

function openDetail(p) {
  mp.pack = p;
  mp.filter = 'all';
  $('mp-content-search').value = '';
  document.querySelectorAll('[data-mp-filter]').forEach((b) => b.classList.toggle('active', b.dataset.mpFilter === 'all'));
  openDetailHeader(p);
  showView('detail');
  setTab('content');
}

$('mp-detail-play').addEventListener('click', () => mp.pack && playPack(mp.pack.id));
$('mp-detail-folder').addEventListener('click', () => mp.pack && window.api.modpackFolder(mp.pack.id).catch((e) => toast(cleanError(e), 'error')));
$('mp-detail-delete').addEventListener('click', async () => {
  const p = mp.pack;
  if (!p || !await askConfirm(`¿Eliminar "${p.title}"? Se borrarán sus mods, mundos y ajustes.`)) return;
  try {
    await window.api.modpackRemove(p.id);
    toast('Modpack eliminado');
    mp.pack = null;
    showView('library');
    renderLibrary();
  } catch (e) {
    toast(cleanError(e), 'error');
  }
});

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
    paintContent(r.offline);
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
  if (!shown.length && mp.items.length) {
    const EMPTY = { mod: 'No tienes ningún mod instalado. Explora contenido para buscar uno.', shader: 'No tienes ningún shader instalado. Explora contenido para buscar uno.', resourcepack: 'No tienes ninguna textura instalada. Explora contenido para buscar una.' };
    list.append(el('p', 'muted empty-note', q ? 'Nada coincide con tu búsqueda.' : EMPTY[mp.filter] || 'No hay nada para mostrar.'));
  }
  shown.forEach((it) => {
    const row = el('div', `mod-card${it.enabled ? '' : ' mod-off'}`);
    row.append(iconEl(it.icon, it.name));
    const body = el('div', 'mod-body');
    body.append(el('strong', '', it.name), el('span', 'muted', `${TYPE_NAMES[it.type]}${it.version ? ' · ' + it.version : ''} · ${it.file.replace(/\.disabled$/i, '')} · ${fmtSize(it.size)}`));
    row.append(body);
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
    list.append(row);
  });
}

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

async function renderWorlds() {
  const list = $('mp-worlds-list');
  list.replaceChildren();
  $('mp-worlds-note').textContent = 'Cargando…';
  try {
    const worlds = await window.api.instanceWorlds(mp.pack.id);
    $('mp-worlds-note').textContent = worlds.length ? `${worlds.length} mundo${worlds.length === 1 ? '' : 's'}` : 'Todavía no hay mundos. Se crean la primera vez que juegues.';
    worlds.forEach((w) => {
      const row = el('div', 'mod-card');
      const body = el('div', 'mod-body');
      body.append(el('strong', '', w.name), el('span', 'muted', `Última vez: ${new Date(w.mtime).toLocaleString('es')}`));
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
      row.append(el('div', 'mod-icon mod-icon-empty', '🌍'), body, bk);
      list.append(row);
    });
    renderBackups();
  } catch (e) {
    $('mp-worlds-note').textContent = cleanError(e);
  }
}

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
  nova: { icon: '⚡', name: 'Nova', tag: 'Recomendado', desc: 'Fabric + Sodium, Lithium, Iris y Nova Client. Máximo rendimiento.' },
  fabric: { icon: '🧵', name: 'Fabric', tag: '', desc: 'Ligero y rápido. Mods modernos (desde 1.14).' },
  forge: { icon: '🔨', name: 'Forge', tag: '', desc: 'El clásico: el más compatible con modpacks antiguos.' },
  optifine: { icon: '🔭', name: 'OptiFine', tag: 'Con tu .jar', desc: 'Forge + OptiFine oficial (lo descargas tú de optifine.net).' },
  vanilla: { icon: '🧱', name: 'Vanilla', tag: '', desc: 'Minecraft puro, sin mods.' }
};
const QUICK_EMOJIS = ['🌲', '⚔️', '⛏️', '🏰', '🚀', '🔥', '💎', '🐉', '🎮', '🌙'];
// Versión como lista de números para comparar ("1.20.1" → [1,20,1]); los snapshots (24w14a) no se comparan.
const verParts = (v) => { const m = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(String(v || '')); return m ? [+m[1], +m[2], +(m[3] || 0)] : null; };
const verAtLeast = (v, min) => { const a = verParts(v); if (!a) return true; for (let i = 0; i < 3; i++) { if (a[i] !== (min[i] || 0)) return a[i] > (min[i] || 0); } return true; };
const javaFor = (v) => { const a = verParts(v); if (!a) return null; if (a[0] >= 26) return 25; if (verAtLeast(v, [1, 20, 5])) return 21; if (verAtLeast(v, [1, 18, 0])) return 17; if (verAtLeast(v, [1, 17, 0])) return 16; return 8; };
const loaderOk = (loader, v) => (loader === 'fabric' || loader === 'nova') ? verAtLeast(v, [1, 14, 0]) : true;

function paintWizard() {
  const ver = $('mc-version').value;
  let loader = $('mc-loader').value;
  if (!loaderOk(loader, ver)) { loader = 'forge'; $('mc-loader').value = loader; }
  // tarjetas de tipo de perfil
  const box = $('mcw-loaders');
  box.replaceChildren();
  Object.entries(LOADER_INFO).forEach(([id, info]) => {
    const ok = loaderOk(id, ver);
    const c = el('button', 'mcw-loader');
    c.type = 'button'; c.disabled = !ok;
    c.setAttribute('role', 'radio'); c.setAttribute('aria-checked', String(loader === id));
    c.classList.toggle('active', loader === id);
    const top = el('div', 'mcw-loader-top');
    top.append(el('span', 'mcw-loader-ico', info.icon), el('b', '', info.name));
    if (info.tag) top.append(el('span', 'mcw-tag', info.tag));
    c.append(top, el('small', '', ok ? info.desc : `No disponible en Minecraft ${ver} (necesita 1.14 o más).`));
    c.addEventListener('click', () => { $('mc-loader').value = id; paintWizard(); });
    box.append(c);
  });
  // versiones populares + lista completa filtrada
  paintPopularVersions();
  const q = $('mcw-search').value.trim().toLowerCase();
  const list = $('mcw-list');
  list.replaceChildren();
  const shown = (mcList || []).filter((v) => !q || v.toLowerCase().includes(q));
  shown.slice(0, 400).forEach((v) => {
    const b = el('button', 'ver-chip', v);
    b.type = 'button'; b.setAttribute('role', 'option');
    b.classList.toggle('active', ver === v);
    b.addEventListener('click', () => { $('mc-version').value = v; paintWizard(); });
    list.append(b);
  });
  if (!shown.length) list.append(el('p', 'muted', q ? `Ninguna versión coincide con "${q}".` : 'No se pudo cargar la lista de versiones.'));
  const act = list.querySelector('.active'); if (act && !q) act.scrollIntoView({ block: 'nearest' });
  // resumen
  const info = LOADER_INFO[loader];
  const java = javaFor(ver);
  const sum = $('mcw-summary');
  sum.replaceChildren();
  const row = el('div', 'mcw-sum-row');
  row.append(el('span', 'chip', `Minecraft ${ver}`), el('span', 'chip', `${info.icon} ${info.name}`));
  if (java) row.append(el('span', 'chip', `Java ${java}`));
  sum.append(row);
  const notes = [];
  if (loader === 'nova') notes.push(NOVA_CLIENT_MC.includes(ver) ? 'Incluye Nova Client (menú con Shift derecho).' : `Nova Client todavía no existe para ${ver}; se instalan solo los mods de rendimiento.`);
  if (loader === 'optifine') notes.push('Después de crear la instancia, añade el .jar de OptiFine en Mods.');
  if (java) notes.push(`El launcher instala Java ${java} solo si hace falta.`);
  sum.append(el('small', 'muted', notes.join(' ')));
  // cabecera
  $('mcw-icon').textContent = $('mc-emoji').value.trim() || info.icon;
  $('mcw-preview').textContent = `${$('mc-name').value.trim() || 'Mi instancia'} · Minecraft ${ver} · ${info.name}`;
  $('mc-create').disabled = !(mcList || []).length;
}
const NOVA_CLIENT_MC = ['1.21.1']; // versiones para las que ya hay Nova Client (releases de javierroman94/Nova-Client)

$('mp-go-create').addEventListener('click', async () => {
  $('mc-name').value = '';
  $('mc-emoji').value = '';
  $('mcw-search').value = '';
  $('mc-loader').value = 'nova';
  $('mc-status').textContent = 'Cargando versiones de Minecraft…';
  $('mc-create').disabled = true;
  const eb = $('mcw-emojis');
  eb.replaceChildren();
  QUICK_EMOJIS.forEach((e) => {
    const b = el('button', 'mcw-emoji', e); b.type = 'button';
    b.addEventListener('click', () => { $('mc-emoji').value = e; paintWizard(); });
    eb.append(b);
  });
  $('mp-create-modal').showModal();
  await loadMcVersions($('mc-version'));
  if (mcList.length) $('mc-version').value = mcList.includes('1.21.1') ? '1.21.1' : mcList[0]; // 1.21.1: ya tiene Nova Client
  paintWizard();
  $('mc-status').textContent = mcList.length ? '' : 'No se pudo cargar la lista de versiones.';
  $('mc-name').focus();
});
/* versiones populares en cuadrícula */
function paintPopularVersions() {
  const box = $('mc-popular');
  box.replaceChildren();
  const pops = ['1.21.4', '1.21.1', '1.20.1', '1.19.2', '1.18.2', '1.16.5', '1.12.2', '1.8.9'].filter((v) => mcList && mcList.includes(v));
  const latest = mcList && mcList[0];
  [latest, ...pops].filter((v, i, a) => v && a.indexOf(v) === i).forEach((v) => {
    const b = el('button', 'ver-chip', v);
    b.type = 'button';
    b.classList.toggle('active', $('mc-version').value === v);
    b.addEventListener('click', () => { $('mc-version').value = v; paintWizard(); });
    box.append(b);
  });
}
$('mc-snap').addEventListener('change', async () => { const keep = $('mc-version').value; await loadMcVersions($('mc-version')); if (mcList.includes(keep)) $('mc-version').value = keep; paintWizard(); });
$('mcw-search').addEventListener('input', paintWizard);
$('mc-name').addEventListener('input', paintWizard);
$('mc-emoji').addEventListener('input', paintWizard);

$('mc-cancel').addEventListener('click', () => $('mp-create-modal').close());
$('mp-create-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('mc-create').disabled = true;
  try {
    const loader = $('mc-loader').value;
    const name = $('mc-name').value.trim() || `${LOADER_INFO[loader].name} ${$('mc-version').value}`;
    $('mc-status').textContent = loader === 'nova' ? 'Instalando mods de rendimiento… puede tardar un poco.' : 'Creando…';
    const entry = await window.api.modpackCreate({ name, icon: $('mc-emoji').value, mcVersion: $('mc-version').value, loader });
    $('mp-create-modal').close();
    toast(`Instancia "${entry.title}" creada${entry.novaSkipped && entry.novaSkipped.length ? ` (sin ${entry.novaSkipped.length} mod(s) que no existen para esa versión)` : ''}`);
    if (entry.preset === 'nova') toast(entry.novaClient ? 'Nova Client instalado: en el juego pulsa Shift derecho para abrir su menú.' : `Nova Client todavía no tiene versión para Minecraft ${entry.mcVersion} (por ahora solo 1.21.1).`);
    if (entry.preset === 'optifine') toast('Ahora descarga OptiFine en optifine.net y añade el .jar en Mods.');
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
  $('ps-emoji').value = p.emoji || '';
  $('ps-notes').value = p.notes || '';
  $('ps-ram').value = s.ramGb || '';
  $('ps-args').value = s.jvmArgs || '';
  $('ps-java').value = s.javaPath || '';
  $('ps-w').value = s.width || '';
  $('ps-h').value = s.height || '';
  $('ps-full').checked = !!s.fullscreen;
  $('ps-status').textContent = '';
  $('ps-version-box').hidden = !own;
  $('ps-change-version').hidden = p.provider !== 'modrinth';
  $('ps-version-note').textContent = own
    ? 'Cambiar la versión o el loader no borra tus mods: revisa que sigan siendo compatibles.'
    : `Modpack de ${p.provider === 'modrinth' ? 'Modrinth' : 'otro origen'}: su versión de Minecraft y su loader los define el autor.`;
  if (own) {
    await loadMcVersions($('ps-mc'));
    if (![...$('ps-mc').options].some((o) => o.value === p.mcVersion)) { const o = el('option', '', p.mcVersion); o.value = p.mcVersion; $('ps-mc').prepend(o); }
    $('ps-mc').value = p.mcVersion;
    $('ps-loader').value = (p.loader && p.loader.type) || 'vanilla';
  }
}

$('ps-save').addEventListener('click', async () => {
  const p = mp.pack;
  const num = (id) => ($(id).value ? Number($(id).value) : undefined);
  const changes = {
    title: $('ps-title').value, emoji: $('ps-emoji').value, notes: $('ps-notes').value,
    settings: { ramGb: num('ps-ram'), jvmArgs: $('ps-args').value, javaPath: $('ps-java').value, width: num('ps-w'), height: num('ps-h'), ...($('ps-full').checked ? { fullscreen: true } : {}) }
  };
  if (p.provider === 'custom') { changes.mcVersion = $('ps-mc').value; changes.loader = $('ps-loader').value; }
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
    const e = await window.api.modpackPickIcon({ id: mp.pack.id });
    if (!e) return;
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
$('mp-check-updates').addEventListener('click', async () => {
  const btn = $('mp-check-updates');
  const note = $('mp-content-note');
  btn.disabled = true;
  try {
    note.textContent = 'Buscando actualizaciones en Modrinth…';
    const ups = await window.api.instanceUpdatesCheck(mp.pack.id);
    if (!ups.length) { note.textContent = 'Todos tus mods están al día.'; return; }
    if (!await askConfirm(`Hay ${ups.length} mod${ups.length === 1 ? '' : 's'} para actualizar:\n\n${ups.slice(0, 15).map((u) => `• ${u.file.replace(/\.disabled$/i, '')} → ${u.newFile}`).join('\n')}${ups.length > 15 ? '\n…' : ''}\n\n¿Actualizar ahora?`)) { note.textContent = `${ups.length} actualizaciones disponibles.`; return; }
    const r = await window.api.instanceUpdatesApply(mp.pack.id);
    toast(`${r.updated} mod${r.updated === 1 ? '' : 's'} actualizado${r.updated === 1 ? '' : 's'}`);
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
      const ok = v.supported && v.downloadUrl;
      const label = `${v.name || v.number}${v.mcVersions[0] ? ' · MC ' + v.mcVersions[0] : ''}${v.loaders.length ? ' · ' + v.loaders.map((l) => LOADER_NAMES[l] || l).join('/') : ''}${!v.supported ? ' (no compatible)' : !v.downloadUrl ? ' (descarga bloqueada)' : ''}`;
      const o = el('option', '', label);
      o.value = v.id;
      o.disabled = !ok;
      sel.append(o);
      if (ok && first < 0) first = i;
    });
    if (first >= 0) {
      sel.selectedIndex = first;
      $('mp-install').disabled = false;
      $('mp-version-info').textContent = 'Se instala en su propia carpeta, sin tocar tu evento ni tus otros modpacks.';
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
function busyShow(title, d) {
  const card = $('busy-card');
  if (title) $('busy-title').textContent = title;
  $('busy-text').textContent = (d && d.text) || '';
  const bar = $('busy-bar');
  if (d && d.total) { bar.max = d.total; bar.value = d.done; } else bar.removeAttribute('value');
  card.hidden = false;
  clearTimeout(busyTimer);
  busyTimer = setTimeout(busyHide, 90000);
}
function busyHide() { clearTimeout(busyTimer); $('busy-card').hidden = true; }
window.api.onModpackProgress((d) => {
  const text = d.text || '';
  if (text === 'Listo') busyHide(); else busyShow(null, d);
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

function openMember(m) {
  const img = $('mm-avatar');
  const src = imageUrl(m.avatar);
  img.hidden = !src;
  if (src) img.src = src;
  $('mm-name').textContent = m.name || m.nick;
  $('mm-role').textContent = `${m.name ? m.nick + ' · ' : ''}${m.role || ''}`;
  $('mm-bio').textContent = m.bio || '';
  $('mm-bio').hidden = !m.bio;
  const box = $('mm-links');
  box.replaceChildren();
  (m.links || []).forEach((l) => {
    const b = el('button', 'link-tile');
    b.type = 'button';
    const host = (() => { try { return new URL(l.url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
    b.append(linkIcon(l), el('span', 'link-name', l.name), el('span', 'link-host muted', host));
    b.addEventListener('click', () => window.api.openLink(l.url).catch(() => {}));
    box.append(b);
  });
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
    info.append(el('div', 'tribute-label', '🕊 Homenaje'), el('div', 'nick', m.nick), el('div', 'role', m.role || ''));
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
    team = await window.api.getData('team');
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

/* ---------- estado del servidor ---------- */
async function refreshServer() {
  if (document.hidden) return;
  const dot = $('server-dot');
  const detail = $('server-detail');
  const s = await window.api.serverStatus();
  dot.className = 'dot';
  const topDot = $('top-dot');
  const topText = $('top-server-text');
  topDot.className = 'dot';
  if (!s.configured) {
    topText.textContent = 'Sin servidor';
    $('stat-players').textContent = '–';
  } else if (s.unknown) {
    topText.textContent = 'Sin datos del servidor';
    $('stat-players').textContent = '–';
  } else if (s.online) {
    topDot.classList.add('on');
    topText.textContent = s.players ? `${s.players.online} / ${s.players.max} en línea` : 'Servidor en línea';
    if (s.players) countUp($('stat-players'), s.players.online);
    else $('stat-players').textContent = 'En línea';
  } else {
    topDot.classList.add('off');
    topText.textContent = 'Servidor desconectado';
    $('stat-players').textContent = '0';
  }
  if (!s.configured) {
    detail.textContent = 'Aún no hay servidor configurado.';
  } else if (s.unknown) {
    detail.textContent = 'No se pudo consultar el estado ahora mismo.';
  } else if (s.online) {
    dot.classList.add('on');
    const players = s.players ? `${s.players.online} de ${s.players.max} jugadores conectados` : 'En línea';
    detail.textContent = players;
  } else {
    dot.classList.add('off');
    detail.textContent = 'El servidor está desconectado.';
  }
}

/* ---------- sesión ---------- */
function showMsg(text, isError = false) {
  const m = $('account-msg');
  m.textContent = maskNick(text);
  m.className = isError ? 'msg error' : 'msg';
}

/* ---------- modo streamer y datos de la cuenta ---------- */
let streamerOn = false;
function maskNick(text) {
  const t = String(text == null ? '' : text);
  return streamerOn && currentUser && currentUser.name ? t.split(currentUser.name).join('••••') : t;
}
function applyStreamer(v) {
  streamerOn = !!(v && v.on);
  document.documentElement.classList.toggle('streamer', streamerOn);
  const st = $('streamer-state');
  if (st) st.textContent = streamerOn ? (v.detected ? 'Activo: directo detectado' : 'Activo') : 'Inactivo';
  logRender();
  renderAccountRows();
}
function renderAccountRows() {
  const info = currentUser;
  $('ac-name').textContent = info ? info.name : 'Sin sesión';
  $('ac-mode').textContent = info ? (info.mode === 'premium' ? 'Premium (Microsoft)' : 'No premium (nick local)') : '–';
  let sess = '–';
  if (info && info.mode === 'premium') {
    if (info.expiresAt) {
      const days = Math.max(0, Math.ceil((info.expiresAt - Date.now()) / 86400000));
      sess = days <= 1 ? 'Caduca hoy o mañana' : `Caduca en ${days} días`;
    } else sess = 'Activa';
  } else if (info) sess = 'No caduca';
  $('ac-session').textContent = sess;
  $('ac-logout').disabled = !info;
  if ($('set-prof-name')) {
    $('set-prof-name').textContent = info ? info.name : 'Sin sesión';
    $('set-prof-mode').textContent = info ? (info.mode === 'premium' ? 'Cuenta premium' : 'Cuenta no premium') : 'Inicia sesión desde Mi cuenta';
    const av = $('set-prof-avatar');
    av.hidden = !info;
    if (info) av.src = skinHead(info.name);
  }
}
$('ac-switch').addEventListener('click', () => $('player-action').click());
$('ac-logout').addEventListener('click', () => $('logout-btn').click());
$('streamer-mode').addEventListener('change', async () => {
  try { await window.api.saveSettings({ streamer: $('streamer-mode').value }); applyStreamer(await window.api.streamerGet()); } catch {}
});
$('intro-on').addEventListener('change', () => { window.api.saveSettings({ intro: $('intro-on').checked }).catch(() => {}); });
async function initStreamer(settings) {
  try { $('intro-on').checked = !settings || settings.intro !== false; } catch {}
  try { $('streamer-mode').value = (settings && settings.streamer) || 'auto'; } catch {}
  try { window.api.onStreamerChanged(applyStreamer); applyStreamer(await window.api.streamerGet()); } catch {}
}

// Cuenta no premium con skin local: la cabeza del chip sale de esa skin en vez de Steve.
async function paintLocalHead(imgEl) {
  try {
    const l = await window.api.skinsLocalGet();
    if (!l) return;
    const im = await loadImageUrl(l.dataUrl);
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    x.drawImage(im, 8, 8, 8, 8, 0, 0, 64, 64);
    x.drawImage(im, 40, 8, 8, 8, 0, 0, 64, 64);
    imgEl.src = c.toDataURL();
  } catch {}
}
window.addEventListener('nova-skin-changed', () => { if (currentUser && currentUser.mode !== 'premium') paintLocalHead($('chip-avatar')); });

function setSession(info) {
  currentUser = info;
  renderAccountRows();
  if (window.NovaSkins) window.NovaSkins.setUser(info);
  loggedIn = !!info;
  setTimeout(() => { try { refreshAdmin(); } catch {} }, 0);
  const chipAvatar = $('chip-avatar');
  const bust = $('player-bust');
  if (info) {
    const label = info.mode === 'premium' ? 'Cuenta premium' : 'Cuenta no premium';
    $('chip-name').textContent = info.name;
    $('chip-mode').textContent = label;
    chipAvatar.src = skinHead(info.name);
    chipAvatar.hidden = false;
    if (info.mode !== 'premium') paintLocalHead(chipAvatar);
    bust.src = skinBust(info.name);
    loadHomeSkin(info.name);
    $('player-name').textContent = info.name;
    $('player-mode').textContent = label;
    $('player-action').textContent = 'Cambiar de cuenta';
    $('logout-btn').hidden = false;
    showMsg(`Sesión iniciada como ${info.name}.`);
  } else {
    $('chip-name').textContent = 'Iniciar sesión';
    $('chip-mode').textContent = '';
    chipAvatar.hidden = true;
    bust.src = skinBust('Steve');
    loadHomeSkin(null);
    $('player-name').textContent = 'Sin sesión';
    $('player-mode').textContent = 'Elige cómo quieres entrar';
    $('player-action').textContent = 'Iniciar sesión';
    $('logout-btn').hidden = true;
    showMsg('');
  }
}

$('player-action').addEventListener('click', () => goTo('account'));

$('login-offline').addEventListener('click', async () => {
  try {
    const nick = $('offline-nick').value;
    const info = await window.api.loginOffline(nick);
    await window.api.saveSettings({ lastNick: nick.trim() });
    setSession(info);
    goTo('home');
  } catch (err) {
    showMsg(cleanError(err), true);
  }
});

$('login-ms').addEventListener('click', async () => {
  const btn = $('login-ms');
  btn.disabled = true;
  showMsg('Se abrirá la ventana de Microsoft para iniciar sesión.');
  try {
    setSession(await window.api.loginMicrosoft());
    goTo('home');
  } catch (err) {
    showMsg(cleanError(err) || 'No se completó el inicio de sesión. Inténtalo de nuevo.', true);
  } finally {
    btn.disabled = false;
  }
});

$('logout-btn').addEventListener('click', async () => {
  await window.api.logout();
  setSession(null);
});

/* ---------- jugar ---------- */
let playing = false;
function setPlaying(value) {
  playing = value;
  $('play-btn').disabled = value || !eventActive;
  const other = value && launchTarget && launchTarget.kind === 'pack';
  $('play-label').textContent = value ? (other ? 'Jugando otro modpack' : 'Iniciando…') : eventActive ? 'Jugar' : eventState === 'ended' ? 'Finalizado' : 'Próximamente';
  if (!value && !eventActive) $('status').textContent = eventState === 'ended' ? 'Este evento ya finalizó' : 'Todavía no hay un evento activo';
  const runName = launchTarget && launchTarget.title ? launchTarget.title : eventInfo.name;
  $('run-text').textContent = value ? `Jugando: ${runName}` : 'Sin partidas en curso';
  $('run-dot').classList.toggle('on', value);
  if (!value) launchTarget = null;
  nowPlayingSet(value);
}

/* ---------- contraseña de instalación ---------- */
function askPassword(wrong) {
  return new Promise((resolve) => {
    const modal = $('pw-modal');
    const input = $('pw-input');
    input.value = '';
    $('pw-msg').textContent = wrong ? 'La contraseña no es correcta. Inténtalo otra vez.' : '';
    modal.hidden = false;
    input.focus();
    const done = (value) => {
      modal.hidden = true;
      $('pw-form').removeEventListener('submit', onSubmit);
      $('pw-cancel').removeEventListener('click', onCancel);
      input.value = '';
      resolve(value);
    };
    const onSubmit = (e) => {
      e.preventDefault();
      if (input.value) done(input.value);
    };
    const onCancel = () => done(null);
    $('pw-form').addEventListener('submit', onSubmit);
    $('pw-cancel').addEventListener('click', onCancel);
  });
}

function showCrash(list) {
  const box = $('crash');
  box.replaceChildren();
  if (!list || !list.length) {
    box.hidden = true;
    return;
  }
  list.forEach((c) => {
    box.append(el('strong', '', c.title), el('p', '', c.advice));
  });
  const more = el('button', '', 'Ver consola');
  more.type = 'button';
  more.addEventListener('click', () => goTo('console'));
  box.append(more);
  box.hidden = false;
}

async function startGame() {
  let password = '';
  let wrong = false;
  for (;;) {
    try {
      await window.api.launch({ password });
      return;
    } catch (err) {
      const text = cleanError(err);
      if (/NEEDS_PASSWORD|WRONG_PASSWORD/.test(text)) {
        wrong = /WRONG_PASSWORD/.test(text);
        $('status').textContent = 'Esperando la contraseña de instalación…';
        const typed = await askPassword(wrong);
        if (typed === null) throw new Error('Instalación cancelada.');
        password = typed;
        continue;
      }
      throw err;
    }
  }
}

$('play-btn').addEventListener('click', async () => {
  if (!loggedIn) {
    goTo('account');
    showMsg('Inicia sesión como premium o no premium para jugar.', true);
    return;
  }
  launchTarget = { kind: 'event', title: eventInfo.name, icon: eventInfo.logo };
  setPlaying(true);
  showCrash(null);
  $('status').textContent = 'Preparando…';
  $('np-status').textContent = 'Preparando…';
  try {
    await startGame();
  } catch (err) {
    $('status').textContent = `No se pudo iniciar: ${cleanError(err)}`;
    $('progress').hidden = true;
    setPlaying(false);
    toast(`No se pudo iniciar: ${cleanError(err)}`, 'error');
  }
});

window.api.onStatus((d) => {
  $('np-status').textContent = d.text;
  if (!launchTarget || launchTarget.kind === 'event') $('status').textContent = d.text;
});

window.api.onProgress((d) => {
  if (!d.total) return;
  const text = d.type === 'java' ? `Instalando Java… ${Math.round(d.task)}%` : `Descargando archivos del juego (${d.task} de ${d.total})`;
  const npBar = $('np-progress');
  npBar.hidden = false;
  npBar.max = d.total;
  npBar.value = d.task;
  $('np-status').textContent = text;
  if (!launchTarget || launchTarget.kind === 'event') {
    const bar = $('progress');
    bar.hidden = false;
    bar.max = d.total;
    bar.value = d.task;
    $('status').textContent = text;
  }
});

window.api.onClose((d) => {
  $('progress').hidden = true;
  $('np-progress').hidden = true;
  const wasPack = launchTarget && launchTarget.kind === 'pack';
  if (!wasPack) $('status').textContent =
    d.code === 0 ? 'Minecraft se cerró' : `Minecraft se cerró con el código ${d.code}. Revisa la consola.`;
  else $('status').textContent = eventActive ? 'Listo para jugar' : eventState === 'ended' ? 'Este evento ya finalizó' : 'Todavía no hay un evento activo';
  if (d.code !== 0) toast(`Minecraft se cerró con el código ${d.code}. Revisa Inicio o la Consola.`, 'error');
  setPlaying(false);
  renderContinue();
  showCrash(d.code === 0 ? null : d.crash);
  refreshPlaytime();
});

/* ---------- consola ---------- */
const logLines = [];
const MAX_LOG_LINES = 2000;
const logBox = $('log');
let logFilter = 'all';

function logLevel(line) {
  if (/\b(ERROR|FATAL|SEVERE)\b|Exception|Caused by|\bat [\w.$]+\(/.test(line)) return 'error';
  if (/\bWARN(ING)?\b/.test(line)) return 'warn';
  return 'info';
}

function logVisible(line) {
  const q = $('log-search').value.trim().toLowerCase();
  if (q && !line.toLowerCase().includes(q)) return false;
  const lv = logLevel(line);
  if (logFilter === 'error') return lv === 'error';
  if (logFilter === 'warn') return lv !== 'info';
  return true;
}

function logRow(line) {
  const row = el('div', `log-line log-${logLevel(line)}`, maskNick(line));
  return row;
}

function logCount() {
  const n = logBox.querySelectorAll('.log-line').length;
  $('log-count').textContent = logLines.length ? `${n} de ${logLines.length} líneas` : '';
}

function logFollow() {
  if ($('log-follow').checked) logBox.scrollTop = logBox.scrollHeight;
}

function logRender() {
  logBox.replaceChildren();
  if (!logLines.length) {
    logBox.append(el('p', 'log-empty', 'Aquí aparecerá el registro cuando inicies el juego.'));
  } else {
    const frag = document.createDocumentFragment();
    logLines.filter(logVisible).forEach((l) => frag.append(logRow(l)));
    if (!frag.childNodes.length) frag.append(el('p', 'log-empty', 'Ninguna línea coincide con el filtro.'));
    logBox.append(frag);
  }
  logCount();
  logFollow();
}

function logAdd(line) {
  logLines.push(line);
  if (logLines.length > MAX_LOG_LINES) logLines.shift();
  if (logLines.length === 1 || logBox.querySelector('.log-empty')) return logRender();
  if (logVisible(line)) {
    logBox.append(logRow(line));
    while (logBox.childNodes.length > MAX_LOG_LINES) logBox.removeChild(logBox.firstChild);
  }
  logCount();
  logFollow();
}

window.api.onLog((d) => logAdd(`[${d.source}] ${d.line}`));

document.querySelectorAll('[data-log-filter]').forEach((b) =>
  b.addEventListener('click', () => {
    logFilter = b.dataset.logFilter;
    document.querySelectorAll('[data-log-filter]').forEach((x) => x.classList.toggle('active', x === b));
    logRender();
  })
);
$('log-search').addEventListener('input', logRender);

$('log-clear').addEventListener('click', () => {
  logLines.length = 0;
  logRender();
});

$('log-copy').addEventListener('click', async () => {
  const btn = $('log-copy');
  try {
    await navigator.clipboard.writeText(logLines.join('\n'));
    btn.textContent = 'Copiado';
  } catch {
    btn.textContent = 'No se pudo copiar';
  }
  setTimeout(() => (btn.textContent = 'Copiar'), 1500);
});

$('log-save').addEventListener('click', () => {
  if (!logLines.length) return toast('No hay registro para guardar todavía.', 'error');
  const url = URL.createObjectURL(new Blob([logLines.join('\n')], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `novapx-registro-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Registro guardado en Descargas.');
});

/* ---------- ajustes ---------- */
function readSettingsForm() {
  return {
    ramGb: Number($('ram').value),
    javaPath: $('java-path').value,
    jvmArgs: $('jvm-args').value,
    width: Number($('res-w').value),
    height: Number($('res-h').value),
    fullscreen: $('fullscreen').checked,
    joinServer: $('join-server').checked,
    autoJava: $('auto-java').checked,
    discordRpc: $('discord-rpc').checked,
    notifyEvents: $('notify-events').checked,
    shareUsage: $('share-usage').checked,
    gameBehavior: $('behavior').value
  };
}

function fillSettingsForm(s) {
  $('ram').value = s.ramGb;
  $('ram-out').textContent = `${s.ramGb} GB`;
  $('java-path').value = s.javaPath;
  $('jvm-args').value = s.jvmArgs;
  $('res-w').value = s.width;
  $('res-h').value = s.height;
  $('fullscreen').checked = s.fullscreen;
  $('join-server').checked = s.joinServer;
  $('auto-java').checked = s.autoJava;
  $('discord-rpc').checked = s.discordRpc;
  $('notify-events').checked = s.notifyEvents;
  $('share-usage').checked = s.shareUsage !== false;
  $('behavior').value = s.gameBehavior;
  $('res-w').disabled = $('res-h').disabled = s.fullscreen;
}

$('ram').addEventListener('input', () => {
  $('ram-out').textContent = `${$('ram').value} GB`;
});

$('fullscreen').addEventListener('change', () => {
  $('res-w').disabled = $('res-h').disabled = $('fullscreen').checked;
});

$('java-browse').addEventListener('click', async () => {
  const p = await window.api.browseJava();
  if (p) $('java-path').value = p;
});

$('open-folder').addEventListener('click', async () => {
  try {
    await window.api.openGameFolder();
  } catch (err) {
    $('settings-msg').textContent = cleanError(err);
    $('settings-msg').className = 'msg error';
  }
});

$('repair-install').addEventListener('click', async () => {
  const btn = $('repair-install');
  btn.disabled = true;
  try {
    await window.api.repairInstall();
    toast('Listo. Los mods se volverán a descargar la próxima vez que pulses Jugar.');
  } catch (err) {
    toast(cleanError(err), 'error');
  } finally {
    btn.disabled = false;
  }
});

$('save-settings').addEventListener('click', async () => {
  const msg = $('settings-msg');
  try {
    const saved = await window.api.saveSettings(readSettingsForm());
    fillSettingsForm(saved);
    msg.textContent = 'Ajustes guardados.';
    msg.className = 'msg';
    toast('Ajustes guardados');
  } catch (err) {
    msg.textContent = `No se pudieron guardar los ajustes: ${cleanError(err)}`;
    msg.className = 'msg error';
  }
  setTimeout(() => (msg.textContent = ''), 3000);
});

/* ---------- actualizaciones del programa ---------- */
const UPDATE_ERRORS = {
  offline: 'No hay conexión con internet. Revisa tu red e inténtalo de nuevo.',
  ratelimit: 'GitHub recibió demasiadas consultas desde tu red. Espera unos minutos y vuelve a intentarlo.',
  notfound: 'Todavía no hay una versión publicada para actualizar.',
  denied: 'GitHub no permitió la consulta. Inténtalo más tarde.',
  server: 'El servidor de actualizaciones tiene problemas ahora mismo. Inténtalo más tarde.',
  tls: 'No se pudo verificar la conexión segura. Revisa la fecha y hora de tu equipo y tu antivirus.',
  other: 'No se pudo buscar actualizaciones por un error inesperado. Si se repite, copia el registro de la Consola.'
};

function renderUpdate(s) {
  const banner = $('update-banner');
  const text = $('update-text');
  const install = $('update-install');
  const line = $('update-line');
  install.hidden = true;

  if (s.state === 'downloading') {
    banner.hidden = false;
    text.textContent = `Descargando la versión ${s.version || 'nueva'}… ${s.percent || 0}%`;
    line.textContent = `Descargando la versión ${s.version || 'nueva'} (${s.percent || 0}%).`;
  } else if (s.state === 'ready') {
    banner.hidden = false;
    install.hidden = false;
    text.textContent = `La versión ${s.version} está lista. Reinicia el launcher para instalarla.`;
    if (!window.__readyToast) {
      window.__readyToast = true;
      toast(`Nueva versión ${s.version} lista para instalar`);
    }
    line.textContent = `La versión ${s.version} está lista para instalar.`;
  } else {
    banner.hidden = true;
    line.textContent = {
      checking: 'Buscando actualizaciones…',
      none: 'Tienes la última versión.',
      dev: 'Las actualizaciones automáticas solo funcionan en la versión instalada.',
      error: UPDATE_ERRORS[s.reason] || UPDATE_ERRORS.other,
      idle: ''
    }[s.state] || '';
  }
}

window.api.onUpdate(renderUpdate);

$('update-install').addEventListener('click', async () => {
  try {
    await window.api.installUpdate();
  } catch (err) {
    $('update-text').textContent = cleanError(err);
  }
});

$('update-check').addEventListener('click', async () => {
  const btn = $('update-check');
  btn.disabled = true;
  try {
    renderUpdate(await window.api.checkUpdates());
  } finally {
    btn.disabled = false;
  }
});

/* ---------- idioma ---------- */
// Nombre del idioma en su propio idioma (no se traduce: cada jugador lo reconoce en el suyo).
const LANG_NATIVE = { es: 'Español', en: 'English', pt: 'Português', fr: 'Français', de: 'Deutsch', it: 'Italiano', ru: 'Русский', ja: '日本語', ko: '한국어', zh: '中文', tr: 'Türkçe', ca: 'Català' };
async function initLanguage(saved) {
  const sel = $('lang-select');
  const grid = $('lang-grid');
  let list = [];
  try { list = await window.api.langList(); } catch {}
  if (!Array.isArray(list)) list = [];
  sel.replaceChildren();
  const add = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.append(o); };
  add('auto', 'Automático (idioma del sistema)');
  add('es', 'Español');
  list.filter((l) => l.code !== 'es').forEach((l) => add(l.code, LANG_NATIVE[l.code] || l.name));
  sel.value = [...sel.options].some((o) => o.value === saved) ? saved : 'auto';

  // Tarjetas con bandera: una por idioma, más «Automático».
  const cards = [];
  const card = (code, title, sub, flagCode) => {
    const b = el('button', 'lang-card');
    b.type = 'button';
    b.dataset.code = code;
    b.setAttribute('role', 'radio');
    const txt = el('span', 'lang-txt');
    const t = el('strong', 'lang-name'); t.textContent = title; t.translate = false;
    txt.append(t);
    if (sub) txt.append(el('small', 'muted', sub));
    b.append(window.NovaFlags.node(flagCode), txt, el('span', 'lang-check'));
    b.addEventListener('click', () => { if (sel.value !== code) { sel.value = code; sel.dispatchEvent(new Event('change')); } });
    cards.push(b);
    grid.append(b);
  };
  grid.replaceChildren();
  card('auto', 'Automático', 'Idioma del sistema', 'globe');
  [...sel.options].filter((o) => o.value !== 'auto').forEach((o) => {
    const l = list.find((x) => x.code === o.value);
    card(o.value, o.textContent, l && l.author && !l.builtin ? l.author : '', o.value);
  });
  const paint = () => cards.forEach((c) => { const on = c.dataset.code === sel.value; c.classList.toggle('active', on); c.setAttribute('aria-checked', on ? 'true' : 'false'); });
  paint();

  await NovaI18n.setLanguage(await NovaI18n.resolve(sel.value));
  sel.addEventListener('change', async () => {
    paint();
    await NovaI18n.setLanguage(await NovaI18n.resolve(sel.value));
    window.api.saveSettings({ lang: sel.value });
    window.dispatchEvent(new CustomEvent('nova-lang', { detail: sel.value }));
  });
  $('lang-folder').addEventListener('click', () => window.api.langOpenFolder());
  window.dispatchEvent(new CustomEvent('nova-lang', { detail: sel.value }));
}

/* ---------- asistente de primer uso ---------- */
const wz = { step: 0, rec: 4 };
function wzShow(n) {
  wz.step = n;
  document.querySelectorAll('#welcome-modal [data-wz]').forEach((s) => (s.hidden = Number(s.dataset.wz) !== n));
  [...$('wz-dots').children].forEach((d, i) => d.classList.toggle('on', i <= n));
  $('wz-back').hidden = n === 0;
  $('wz-skip').hidden = n === 3;
  $('wz-next').textContent = n === 0 ? 'Empezar' : n === 3 ? 'Ir al inicio' : 'Siguiente';
}
async function wzFinish() {
  try { await window.api.saveSettings({ welcomed: true }); } catch {}
  if ($('welcome-modal').open) $('welcome-modal').close();
  goTo('home');
}
function maybeWelcome(settings, sys) {
  if (settings.welcomed) return;
  const max = Math.min(16, sys.totalRamGb);
  wz.rec = Math.max(2, Math.min(6, Math.floor(sys.totalRamGb / 2), max));
  $('wz-ram').max = String(max);
  $('wz-ram').value = String(wz.rec);
  $('wz-ram-out').textContent = `${wz.rec} GB`;
  $('wz-ram-hint').textContent = `Tu equipo tiene ${sys.totalRamGb} GB en total. Te recomendamos ${wz.rec} GB.`;
  wzShow(0);
  $('welcome-modal').showModal();
}
$('wz-ram').addEventListener('input', () => {
  $('wz-ram-out').textContent = `${$('wz-ram').value} GB`;
  $('wz-ram-rec').hidden = Number($('wz-ram').value) !== wz.rec;
});
$('wz-next').addEventListener('click', async () => {
  if (wz.step === 2) {
    try { await window.api.saveSettings({ ramGb: Number($('wz-ram').value) }); $('ram').value = $('wz-ram').value; $('ram-out').textContent = `${$('wz-ram').value} GB`; } catch {}
  }
  if (wz.step === 3) return wzFinish();
  wzShow(wz.step + 1);
});
$('wz-back').addEventListener('click', () => wzShow(Math.max(0, wz.step - 1)));
$('wz-skip').addEventListener('click', wzFinish);
$('welcome-modal').addEventListener('cancel', (e) => { e.preventDefault(); wzFinish(); });
$('wz-ms').addEventListener('click', async () => {
  $('wz-ms').disabled = true;
  $('wz-msg').textContent = 'Se abrirá la ventana de Microsoft…';
  try {
    const info = await window.api.loginMicrosoft();
    setSession(info);
    $('wz-msg').textContent = `Sesión iniciada como ${info.name}.`;
    wzShow(2);
  } catch (e) {
    $('wz-msg').textContent = cleanError(e) || 'No se completó el inicio de sesión. Puedes intentarlo de nuevo o jugar sin cuenta.';
  }
  $('wz-ms').disabled = false;
});
$('wz-offline').addEventListener('click', async () => {
  try {
    const nick = $('wz-nick').value;
    const info = await window.api.loginOffline(nick);
    await window.api.saveSettings({ lastNick: nick.trim() });
    setSession(info);
    $('wz-msg').textContent = `Listo, jugarás como ${info.name}.`;
    wzShow(2);
  } catch (e) {
    $('wz-msg').textContent = cleanError(e);
  }
});

/* ---------- arranque ---------- */
(async function init() {
  const [cfg, settings, sys] = await Promise.all([
    window.api.getConfig(),
    window.api.getSettings(),
    window.api.systemInfo()
  ]);

  // "Nova PX - Event Launcher" se muestra en dos líneas: nombre y subtítulo.
  const [brandName, ...brandRest] = cfg.launcherName.split(' - ');
  $('brand-name').textContent = brandName;
  $('brand-sub').textContent = brandRest.join(' - ');
  document.title = cfg.launcherName;
  $('hero-title').textContent = cfg.launcherName;
  remoteBase = cfg.remoteBase || '';
  $('app-version').textContent = `Versión ${cfg.version}`;
  $('side-version').textContent = `v${cfg.version}`;
  window.api.getUpdateState().then(renderUpdate);
  moveIndicator();

  const maxRam = Math.min(16, sys.totalRamGb);
  $('ram').max = String(maxRam);
  $('ram-hint').textContent = `Tu equipo tiene ${sys.totalRamGb} GB en total. Deja al menos 2 GB libres para el sistema.`;
  $('game-dir').textContent = sys.gameDir;
  fillSettingsForm({ ...settings, ramGb: Math.min(settings.ramGb, maxRam) });
  setTimeout(() => maybeWelcome(settings, sys), 1200);
  $('offline-nick').value = settings.lastNick || '';

  window.NovaTheme.init(settings);
  await initRemote();
  initStreamer(settings);
  initLanguage(settings.lang || 'auto');
  refreshPlaytime();

  renderHero();
  renderNews();
  renderEvents();
  renderTeam();
  refreshServer();

  // Recupera la sesión guardada (o, si la ventana se cerró mientras jugabas, la sesión, el estado y la consola).
  $('chip-name').textContent = 'Conectando…';
  const st = await window.api.appState();
  if (st.session) setSession(st.session);
  else {
    setSession(null);
    window.api.authExpiredNotice().then((v) => { if (v) toast('Tu sesión premium caducó (30 días). Inicia sesión con Microsoft otra vez.'); }).catch(() => {});
  }
  if (st.playing) {
    if (st.target) launchTarget = { kind: st.target.kind, title: st.target.title, icon: st.target.icon || '' };
    setPlaying(true);
    $('np-status').textContent = 'Minecraft en ejecución';
    if (!launchTarget || launchTarget.kind === 'event') $('status').textContent = 'Minecraft en ejecución';
  }
  if (st.log && st.log.length) {
    st.log.forEach((l) => logLines.push(l));
    logRender();
  }
  setInterval(refreshServer, 60000);
  // El contenido publicado (equipo, noticias, eventos, evento) se actualiza solo mientras el launcher está abierto.
  let lastContent = Date.now();
  window.refreshContent = async () => { lastContent = Date.now(); await Promise.all([renderHero(), renderNews(), renderEvents(), renderTeam()]); };
  setInterval(() => { if (!document.hidden) window.refreshContent(); }, 3 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastContent > 60 * 1000) window.refreshContent(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshServer(); });
  window.__novaReady = true;
  window.dispatchEvent(new Event('nova-ready'));
})();


/* ---------- modo administrador ---------- */
let isAdmin = false;
let adminProgress = null;
function setAdminUi(on, repo, err, eligible) {
  isAdmin = on;
  $('adm-fieldset').hidden = !eligible;
  $('nav-admin').hidden = !on;
  $('adm-login-box').hidden = on;
  $('adm-logout-box').hidden = !on;
  $('adm-state').textContent = on ? `Activo: puedes publicar en ${repo}.` : err ? `Desactivado (${err})` : 'Desactivado.';
  moveIndicator();
}
function refreshAdmin() {
  window.api.adminStatus().then((r) => {
    setAdminUi(r.admin, r.repo, r.error, r.eligible);
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
    toast('Modo administrador activado');
  } catch (e) {
    $('adm-state').textContent = cleanError(e);
  }
  $('adm-login').disabled = false;
});
$('adm-logout').addEventListener('click', async () => {
  await window.api.adminLogout();
  setAdminUi(false, undefined, undefined, true);
  if ($('page-admin').classList.contains('active')) goTo('settings');
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
  })
);

function chip(text, cls) { return el('span', `ad-chip${cls ? ' ' + cls : ''}`, text); }

function sponsorsEditor() {
  const box = $('ad-sponsors');
  const list = adm.sponsors;
  const roles = ['Servidor hospedado por', 'Evento creado por', 'Patrocina', 'Colabora'];
  const paint = () => {
    box.replaceChildren();
    list.forEach((x, i) => {
      const row = el('div', 'person-row');
      const head = el('div', 'person-head');
      const r = el('input'); r.type = 'text'; r.maxLength = 60; r.placeholder = 'Rol (Servidor hospedado por…)'; r.value = x.role || ''; r.setAttribute('list', 'ad-sponsor-roles');
      r.addEventListener('input', () => { x.role = r.value; });
      const n = el('input'); n.type = 'text'; n.maxLength = 60; n.placeholder = 'Nombre (HoliHosting…)'; n.value = x.name || '';
      n.addEventListener('input', () => { x.name = n.value; });
      const u = el('input'); u.type = 'url'; u.maxLength = 300; u.placeholder = 'https://… (opcional)'; u.value = x.url || '';
      u.addEventListener('input', () => { x.url = u.value; });
      const t = el('input'); t.type = 'text'; t.maxLength = 160; t.placeholder = 'Texto corto (opcional)'; t.value = x.text || '';
      t.addEventListener('input', () => { x.text = t.value; });
      const lg = el('button', '', x.logo ? 'Cambiar logo' : 'Logo…'); lg.type = 'button';
      lg.addEventListener('click', async () => {
        try { const a = await window.api.adminPickImage(`sponsor-${x.name || 'logo'}`); if (a) { x.logo = a.path; lg.textContent = 'Cambiar logo'; } } catch (e) { toast(cleanError(e), 'error'); }
      });
      const q = el('button', '', 'Quitar'); q.type = 'button';
      q.addEventListener('click', () => { list.splice(i, 1); paint(); });
      head.append(r, n, u, t, lg, q);
      row.append(head);
      box.append(row);
    });
    if (list.length < 8) {
      const add = el('button', '', '+ Patrocinador o crédito'); add.type = 'button';
      add.addEventListener('click', () => { list.push({ role: roles[Math.min(list.length, roles.length - 1)], name: '', url: '', text: '' }); paint(); });
      box.append(add);
    }
    if (!$('ad-sponsor-roles')) {
      const dl = el('datalist'); dl.id = 'ad-sponsor-roles';
      roles.forEach((v) => { const o = el('option'); o.value = v; dl.append(o); });
      box.append(dl);
    }
  };
  paint();
}

function paintArtState() {
  $('ad-art-state').textContent = `${adm.evImage ? 'Con banner' : 'Sin banner'} · ${adm.evLogo ? 'con logo' : 'sin logo'}`;
}
async function pickEventArt(kind) {
  $('ad-status').textContent = 'Eligiendo imagen…';
  try {
    const r = await window.api.adminPickImage(`${kind}-${$('ad-name').value || 'evento'}`);
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
    $('ad-state').value = ev.status || (ev.active ? 'active' : 'soon');
    $('ad-state-quick').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x.dataset.st === $('ad-state').value));
    adm.evImage = ev.image || '';
    adm.evLogo = ev.logo || '';
    adm.sponsors = (m.sponsors || []).map((x) => ({ ...x }));
    sponsorsEditor();
    paintArtState();
    $('ad-name').value = ev.name || '';
    $('ad-tag').value = ev.tagline || '';
    $('ad-lock').checked = (adm.manifest || {}).lockPack !== false;
    $('ad-start').value = ev.startsAt ? toLocalInput(ev.startsAt) : '';
    $('ad-new').checked = false;
    adm.team = d.team;
    adm.news = d.news;
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
  $('ad-publish').disabled = !ready;
  $('ad-pass').closest('.field').hidden = !hasPack;
}
['ad-name', 'ad-pass'].forEach((id) => $(id).addEventListener('input', paintChecklist));
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

$('ad-state-quick').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-st]');
  if (!b) return;
  const btns = [...$('ad-state-quick').querySelectorAll('button')];
  btns.forEach((x) => { x.disabled = true; });
  try {
    await window.api.adminSetEventState(b.dataset.st);
    toast(`Estado del evento: ${b.textContent}`, 'success');
    const evn = (adm.manifest && adm.manifest.event) || {};
    await autoDiscord('event', { title: `${evn.name || 'Evento'}: ${b.textContent}`, text: evn.tagline || '', image: imageUrl(evn.image) });
    await loadAdmin();
    await renderHero();
  } catch (err) {
    toast(cleanError(err), 'error');
  } finally {
    btns.forEach((x) => { x.disabled = false; });
  }
});
$('ad-finish').addEventListener('click', () => { $('ad-state').value = 'ended'; $('ad-publish').click(); });
$('ad-publish').addEventListener('click', async () => {
  const id = $('ad-pack').value;
  const name = $('ad-name').value.trim();
  const state = $('ad-state').value;
  const active = state === 'active';
  const msg = `¿Publicar "${name}"?\n\n${active ? 'El evento queda ACTIVO: los jugadores podrán entrar.' : state === 'ended' ? 'El evento queda FINALIZADO.' : 'El evento queda como próximamente.'}${id && adm.summary ? `\nSe publican ${adm.summary.mods} mods cifrados.` : ''}`;
  if (!await askConfirm(msg)) return;
  const btn = $('ad-publish');
  btn.disabled = true;
  const bar = $('ad-progress');
  bar.hidden = false;
  bar.removeAttribute('value');
  adminProgress = (d) => { if (d.total) { bar.max = d.total; bar.value = d.done; } $('ad-status').textContent = d.text || ''; };
  try {
    const start = $('ad-start').value;
    const r = await window.api.adminPublishEvent({
      id: id || undefined, password: $('ad-pass').value,
      form: {
        status: state, active, sponsors: adm.sponsors || [], image: adm.evImage || '', logo: adm.evLogo || '', name, tagline: $('ad-tag').value, startsAt: start ? new Date(start).toISOString() : '', newEvent: $('ad-new').checked, lockPack: $('ad-lock').checked
      }
    });
    $('ad-status').textContent = r.mods
      ? `Publicado: "${r.name}" con ${r.mods} mods cifrados. ${r.sameSalt ? 'Quien ya instaló no tendrá que escribir la contraseña.' : 'Contraseña nueva: los jugadores la escribirán una vez.'} Los jugadores lo ven en unos minutos.`
      : `Publicado: "${r.name}". Los jugadores lo ven en unos minutos.`;
    $('ad-pass').value = '';
    $('ad-new').checked = false;
    toast('Evento publicado');
    await autoDiscord('event', { title: `${r.name}: evento publicado`, text: $('ad-tag').value, image: imageUrl(adm.evImage) });
    loadAdmin();
    window.refreshContent && window.refreshContent();
  } catch (e) {
    $('ad-status').textContent = cleanError(e);
  }
  adminProgress = null;
  bar.hidden = true;
  paintChecklist();
});

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
function paintAdminEvents() {
  const box = $('ad-events');
  box.replaceChildren();
  (adm.events || []).forEach((ev, idx) => {
    const row = el('div', 'mod-card');
    const src = imageUrl(ev.image);
    if (src) { const img = el('img', 'mod-icon'); img.alt = ''; img.src = src; row.append(img); } else row.append(el('div', 'mod-icon mod-icon-empty', '🏆'));
    const body = el('div', 'mod-body');
    const w = ev.winners || (ev.winner ? [ev.winner] : []);
    body.append(el('strong', '', ev.name), el('span', 'muted', `${ev.date || 'Sin fecha'}${w.length ? ' · 🏆 ' + w.join(', ') : ''}`));
    const edit = el('button', '', 'Editar');
    edit.type = 'button';
    edit.addEventListener('click', () => openAdminEvent(idx));
    row.append(body, edit);
    box.append(row);
  });
  if (!(adm.events || []).length) box.append(el('p', 'muted', 'Todavía no hay eventos en el historial.'));
  if (window.makeSortable) window.makeSortable(box, adm.events, paintAdminEvents, () => saveAdminEvents(adm.events));
}
function paintAdeWinners() {
  const box = $('ade-winners');
  box.replaceChildren();
  ade.draft.winners.forEach((n, i) => {
    const chip = el('div', 'ade-winner');
    const img = el('img');
    img.alt = '';
    img.src = skinBust(n);
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
function peopleEditor(box, list, withRole, addLabel) {
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
    const add = el('button', '', addLabel); add.type = 'button';
    add.addEventListener('click', () => { list.push({ nick: '', links: [] }); paint(); });
    box.append(add);
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
  peopleEditor($('ade-roster'), ade.draft.roster, false, '+ Participante');
  peopleEditor($('ade-collabs'), ade.draft.collabs, true, '+ Colaborador');
  ade.preview = '';
  ade.posts = { links: (base.posts || []).map((l) => ({ ...l })) };
  $('ade-posts').replaceChildren(linksEditor(ade.posts));
  $('ade-com-name').value = (base.commissioner && base.commissioner.name) || '';
  $('ade-com-url').value = (base.commissioner && base.commissioner.url) || '';
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
    const r = await window.api.adminPickImage($('ade-name').value);
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
    const r = await window.api.adminPickImage(`fondo-${$('ade-name').value}`);
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
  if (comName) ev.commissioner = { name: comName, url: $('ade-com-url').value.trim() }; else delete ev.commissioner;
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
  (adm.owners || []).forEach((o) => {
    const row = el('div', 'mod-card');
    row.append(el('strong', '', o), el('span', 'muted', 'Dueño (siempre tiene acceso)'));
    box.append(row);
  });
  (adm.admins || []).forEach((a, idx) => {
    const row = el('div', 'mod-card');
    const del = el('button', '', 'Quitar permiso');
    del.type = 'button';
    del.addEventListener('click', async () => {
      try {
        adm.admins = await window.api.adminSaveAdmins(adm.admins.filter((_, i) => i !== idx));
        paintPerms();
      } catch (e) { $('ad-perm-status').textContent = cleanError(e); }
    });
    row.append(el('strong', '', a.nick), el('span', 'muted', 'Puede ver el panel'), del);
    box.append(row);
  });
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
function paintTeam() {
  const box = $('ad-team');
  box.replaceChildren();
  adm.team.forEach((m, idx) => {
    const row = el('div', 'tm-card');
    const f = rowInputs(m, [['nick', 'Nick de Minecraft', 16], ['role', 'Rol (ej. Lead Systems Architect)', 80]]);
    const bust = el('img', 'tm-av'); bust.alt = '';
    const paintBust = () => { bust.src = /^[A-Za-z0-9_]{1,16}$/.test(m.nick || '') ? skinBust(m.nick) : 'images/logo.png'; };
    paintBust();
    f.nick.addEventListener('change', paintBust);
    const star = el('input');
    star.type = 'checkbox'; star.checked = !!m.featured; star.title = 'Destacado';
    star.setAttribute('aria-label', 'Destacado');
    star.addEventListener('change', () => { m.featured = star.checked; });
    const del = el('button', '', 'Quitar');
    del.type = 'button';
    del.addEventListener('click', () => { adm.team.splice(idx, 1); paintTeam(); });
    const tr = el('input');
    tr.type = 'checkbox'; tr.checked = !!m.tribute; tr.title = 'Homenaje';
    tr.setAttribute('aria-label', 'Homenaje');
    const trLab = el('label', 'tribute-toggle');
    trLab.append(tr, el('span', '', '🕊'));
    trLab.title = 'Homenaje: tarjeta especial arriba del todo';
    tr.addEventListener('change', () => { m.tribute = tr.checked; paintTeam(); });
    const starLab = el('label', 'tribute-toggle');
    starLab.append(star, el('span', 'muted', 'Destacado'));
    trLab.append(el('span', 'muted', 'Homenaje'));
    del.className = 'danger';
    const fields = el('div', 'tm-fields'); fields.append(f.nick, f.role);
    const toggles = el('div', 'tm-toggles'); toggles.append(starLab, trLab);
    const mainCol = el('div', 'tm-main'); mainCol.append(fields, toggles);
    row.append(bust, mainCol, del);
    const lk = el('details', 'team-links');
    lk.append(el('summary', '', `Perfil, skin y enlaces (${(m.links || []).length})`));
    const pf = rowInputs(m, [['name', 'Nombre real', 40], ['bio', 'Presentación corta', 300]]);
    const av = el('div', 'links-row');
    const avPick = el('button', '', m.avatar ? 'Cambiar foto' : 'Subir foto'); avPick.type = 'button';
    avPick.addEventListener('click', async () => {
      try { const r = await window.api.adminPickImage(m.nick || 'perfil'); if (r) { m.avatar = r.path; avPick.textContent = 'Cambiar foto'; } } catch (e) { $('ad-team-status').textContent = cleanError(e); }
    });
    const avClear = el('button', '', 'Quitar foto'); avClear.type = 'button';
    avClear.addEventListener('click', () => { delete m.avatar; avPick.textContent = 'Subir foto'; });
    av.append(avPick, avClear);
    lk.append(pf.name, pf.bio, av, skinEditor(m), linksEditor(m));
    row.append(lk);
    if (m.tribute) {
      row.classList.add('has-tribute');
      const sub = el('div', 'team-tribute-fields');
      const yrs = el('input'); yrs.type = 'text'; yrs.maxLength = 30; yrs.placeholder = 'Años (ej. 1994 – 2024)'; yrs.value = m.years || '';
      yrs.addEventListener('input', () => { m.years = yrs.value; });
      const txt = el('input'); txt.type = 'text'; txt.maxLength = 300; txt.placeholder = 'Mensaje de homenaje'; txt.value = m.tributeText || '';
      txt.addEventListener('input', () => { m.tributeText = txt.value; });
      sub.append(yrs, txt);
      row.append(sub);
    }
    box.append(row);
  });
  if (window.makeSortable) window.makeSortable(box, adm.team, paintTeam);
}
function paintNews() {
  const box = $('ad-news');
  box.replaceChildren();
  adm.news.forEach((n, idx) => {
    const row = el('div', 'mod-card');
    const f = rowInputs(n, [['title', 'Título', 100], ['date', 'AAAA-MM-DD', 10], ['text', 'Texto', 600]]);
    const del = el('button', '', 'Quitar');
    del.type = 'button';
    del.addEventListener('click', () => { adm.news.splice(idx, 1); paintNews(); });
    row.append(f.title, f.date, f.text, del);
    const more = el('details', 'team-links');
    more.append(el('summary', '', `Imagen y enlaces (${(n.links || []).length}${n.image ? ' · con imagen' : ''})`));
    const imgRow = el('div', 'links-row');
    const pick = el('button', '', n.image ? 'Cambiar imagen' : 'Subir imagen'); pick.type = 'button';
    pick.addEventListener('click', async () => {
      try { const r = await window.api.adminPickImage(n.title || 'noticia'); if (r) { n.image = r.path; pick.textContent = 'Cambiar imagen'; } } catch (e) { $('ad-news-status').textContent = cleanError(e); }
    });
    const clr = el('button', '', 'Quitar imagen'); clr.type = 'button';
    clr.addEventListener('click', () => { delete n.image; pick.textContent = 'Subir imagen'; });
    imgRow.append(pick, clr);
    more.append(imgRow, linksEditor(n));
    row.append(more);
    box.append(row);
  });
  if (window.makeSortable) window.makeSortable(box, adm.news, paintNews);
}
$('ad-team-add').addEventListener('click', () => { adm.team.push({ nick: '', role: '' }); paintTeam(); });
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


/* ---------- Ajustes con menú lateral (secciones) ---------- */
(function settingsLayout() {
  const root = document.querySelector('#page-settings .settings');
  if (!root) return;
  const GROUPS = [
    ['Cuenta', ['Mi cuenta', 'Privacidad', 'Modo administrador']],
    ['Visualización', ['Apariencia', 'Idioma']],
    ['Juego', ['Memoria y Java', 'Ventana del juego', 'Al jugar']],
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
    'Archivos del juego': 'Carpeta de datos y reparación'
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
    const dirty = el('span', 'set-dirty', 'Cambios sin guardar'); dirty.hidden = true;
    saveRow.prepend(dirty);
    const on = (e) => { if (e.target.closest('.set-nav') || e.target.id === 'lang-select') return; dirty.hidden = false; };
    root.addEventListener('input', on); root.addEventListener('change', on);
    $$('save-settings')?.addEventListener('click', () => { dirty.hidden = true; });
  }
})();


/* --- Nuevo perfil (asistente) --- */
$('mp-new-profile').addEventListener('click', () => { $('np-search').value = ''; $('np-modal').showModal(); });
$('np-close').addEventListener('click', () => $('np-modal').close());
$('np-modal').addEventListener('click', (e) => { if (e.target === $('np-modal')) $('np-modal').close(); });
$('np-wizard').addEventListener('click', () => { $('np-modal').close(); $('mp-go-create').click(); });
$('np-install').addEventListener('click', () => { $('np-modal').close(); $('mp-go-discover').click(); });
$('np-file').addEventListener('click', () => { $('np-modal').close(); doImport({ kind: 'file' }); });
$('np-other').addEventListener('click', () => { $('np-modal').close(); doImport({ kind: 'folder' }); });
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


/* --- Amigos y estado en línea --- */
async function renderFriends() {
  const list = $('friends-list');
  try {
    const r = await window.api.friendsList();
    if (!r.enabled) { $('friends-card').hidden = true; return; }
    list.replaceChildren();
    const online = r.friends.filter((f) => f.online).length;
    $('friends-count').textContent = `(${online} en línea)`;
    $('friends-note').textContent = r.friends.length ? (r.reachable ? '' : 'No se pudo consultar el estado ahora.') : 'Añade el nick de un amigo para ver cuándo está en línea.';
    r.friends.forEach((f) => {
      const li = el('li', 'friend');
      const dot = el('span', 'live-dot');
      dot.classList.toggle('off', !f.online);
      const name = el('span', 'friend-name pii', f.nick);
      const st = el('span', 'muted friend-st', f.playing ? 'Jugando' : f.online ? 'En línea' : 'Desconectado');
      const rm = el('button', 'ghost friend-rm', '✕');
      rm.type = 'button';
      rm.setAttribute('aria-label', `Quitar a ${f.nick}`);
      rm.addEventListener('click', async () => { await window.api.friendsRemove(f.nick); renderFriends(); });
      li.append(dot, name, st, rm);
      list.append(li);
    });
  } catch { $('friends-note').textContent = 'No se pudo cargar la lista de amigos.'; }
}
$('friends-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const n = $('friends-input').value.trim();
  if (!n) return;
  try { await window.api.friendsAdd(n); $('friends-input').value = ''; await renderFriends(); }
  catch (err) { $('friends-note').textContent = cleanError(err); }
});
renderFriends();
setInterval(() => { if (!document.hidden) renderFriends(); }, 60 * 1000);


/* --- Explorar mods, texturas y shaders (como la app de Modrinth) --- */
const D_NAMES = { mod: 'mods', resourcepack: 'texturas', shader: 'shaders' };
document.querySelectorAll('#mp-d-types button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('#mp-d-types button').forEach((x) => x.classList.toggle('active', x === b));
  mp.dType = b.dataset.dt;
  const isPack = mp.dType === 'modpack';
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
