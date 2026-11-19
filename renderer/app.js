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
  // Al abrir el Equipo se vuelve a pedir lo publicado, para ver al momento lo que cambió otra persona del equipo.
  if (tab === 'team' && window.refreshContent && Date.now() - (window.__teamAt || 0) > 15000) { window.__teamAt = Date.now(); window.refreshContent(); }
  const [title, sub] = PAGE_TITLES[tab] || ['', ''];
  $('top-title').textContent = title;
  $('top-sub').textContent = sub;
  moveIndicator();
  if (tab === 'skins' && window.NovaSkins) window.NovaSkins.show();
  $('top-server').hidden = !(tab === 'event' || tab === 'mods');
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

// Hosting, patrocinadores y créditos del evento (Evento).
const SP_ROLE = { host: 'Servidor hospedado por', sponsor: 'Evento patrocinado por', credit: 'Evento creado por' };
function spKind(x) {
  if (['host', 'sponsor', 'credit'].includes(x && x.kind)) return x.kind;
  const r = String((x && x.role) || '').toLowerCase();
  return /hospedad|hosting|servidor/.test(r) ? 'host' : /patrocin|presenta/.test(r) ? 'sponsor' : 'credit';
}
function paintSponsors(list) {
  const box = $('sponsors-list');
  box.replaceChildren();
  const items = Array.isArray(list) ? list : [];
  const open = (url) => window.api.openLink(url).catch(() => {});
  const make = (x, cls, label) => {
    const c = el(x.url ? 'button' : 'div', cls);
    if (x.url) { c.type = 'button'; c.addEventListener('click', () => open(x.url)); }
    const logo = imageUrl(x.logo);
    if (logo) { const im = el('img', 'sponsor-logo'); im.alt = ''; im.src = logo; c.append(im); }
    else c.append(el('span', 'sponsor-logo sponsor-initial', (x.name || '?').trim().charAt(0).toUpperCase()));
    const t = el('div', 'sponsor-text');
    t.append(el('span', 'sponsor-role', x.role || label), el('strong', '', x.name));
    if (x.text) t.append(el('span', 'sponsor-desc', x.text));
    c.append(t);
    if (x.url) c.append(el('span', 'sponsor-go', 'Visitar →'));
    return c;
  };
  const hosts = items.filter((x) => spKind(x) === 'host');
  const sponsors = items.filter((x) => spKind(x) === 'sponsor');
  const credits = items.filter((x) => spKind(x) === 'credit');
  if (hosts.length) {
    const g = el('div', 'sp-group');
    g.append(el('h3', 'sponsors-title', 'Hosting oficial'));
    const row = el('div', 'sp-hosts');
    hosts.forEach((x) => row.append(make(x, 'sponsor sponsor-host', SP_ROLE.host)));
    g.append(row); box.append(g);
  }
  if (sponsors.length) {
    const g = el('div', 'sp-group');
    g.append(el('h3', 'sponsors-title', 'Patrocinadores del evento'));
    const row = el('div', 'sponsors-list');
    sponsors.forEach((x) => row.append(make(x, 'sponsor sponsor-paid', SP_ROLE.sponsor)));
    g.append(row); box.append(g);
  }
  if (credits.length) {
    const g = el('div', 'sp-group');
    g.append(el('h3', 'sponsors-title', 'Créditos'));
    const row = el('div', 'sp-credits');
    credits.forEach((x) => row.append(make(x, 'sponsor sponsor-credit', SP_ROLE.credit)));
    g.append(row); box.append(g);
  }
  if (!sponsors.length) {
    const g = el('div', 'sp-group');
    const c = el('div', 'sponsor sponsor-empty');
    c.append(el('span', 'sponsor-role', 'Tu marca aquí'), el('strong', '', 'Patrocina un evento de Nova PX'), el('span', 'muted', 'Haz que miles de jugadores conozcan tu marca. Habla con el equipo de Nova PX.'));
    g.append(c); box.append(g);
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

/* ---------- PUBLICIDAD ---------- */
const adToday = () => new Date().toISOString().slice(0, 10);
const adActive = (a, where) => a.enabled !== false && (a.where === 'both' || a.where === where) && (!a.from || a.from <= adToday()) && (!a.to || a.to >= adToday()) && (a.image || a.text);
const adRot = {};
function paintAdSlot(slot, list, where) {
  const box = $(`ad-slot-${where}`);
  if (!box) return;
  const ads = list.filter((a) => adActive(a, where));
  clearInterval(adRot[where]);
  if (!ads.length) { box.hidden = true; box.replaceChildren(); return; }
  let i = Math.floor(Math.random() * ads.length);
  const show = () => {
    const a = ads[i % ads.length];
    box.replaceChildren();
    const card = el(a.url ? 'button' : 'div', 'ad-card-banner'); if (a.url) card.type = 'button';
    const u = a.image && imageUrl(a.image);
    if (u) { const im = el('img', 'adb-img'); im.alt = a.name; im.src = u; card.append(im); }
    const body = el('div', 'adb-body');
    body.append(el('span', 'adb-tag', 'Publicidad'), el('strong', '', a.name));
    if (a.text) body.append(el('span', 'muted', a.text));
    card.append(body);
    if (a.url) { card.append(el('span', 'adb-go', 'Visitar ↗')); card.addEventListener('click', () => { window.api.adsTrack(a.id, 'c').catch(() => {}); window.api.openLink(a.url).catch(() => {}); }); }
    box.append(card);
    box.hidden = false;
    window.api.adsTrack(a.id, 'v').catch(() => {});
    i++;
  };
  show();
  if (ads.length > 1) adRot[where] = setInterval(show, 25000);
}
async function renderAds() {
  try {
    const list = await window.api.getData('ads');
    const arr = Array.isArray(list) ? list : [];
    paintAdSlot(null, arr, 'home');
    paintAdSlot(null, arr, 'event');
  } catch { /* sin anuncios */ }
}

const AD_WHERE_LABELS = { both: 'Inicio y Evento', home: 'Solo Inicio', event: 'Solo Evento' };
function paintAds() {
  const box = $('ad-ads');
  if (!box) return;
  box.replaceChildren();
  const list = adm.ads || (adm.ads = []);
  const cnt = $('ad-ads-count'); if (cnt) cnt.textContent = `${list.length} ${list.length === 1 ? 'anuncio' : 'anuncios'}`;
  list.forEach((a, idx) => {
    const row = el('div', 'mod-card news-edit ad-edit');
    const media = el('div', 'ne-media');
    const showImg = () => { media.replaceChildren(); const u = a.image && imageUrl(a.image); if (u) { const im = el('img'); im.alt = ''; im.src = u; media.append(im); } else media.append(el('span', 'ne-ph', '🖼\nSin imagen')); };
    showImg();
    const pick = el('button', 'ne-pick', a.image ? 'Cambiar imagen' : '+ Imagen'); pick.type = 'button';
    pick.addEventListener('click', async () => { try { const r = await window.api.adminPickImage(a.name || 'anuncio'); if (r) { a.image = r.path; pick.textContent = 'Cambiar imagen'; showImg(); } } catch (e) { $('ad-ads-status').textContent = cleanError(e); } });
    const left = el('div', 'ne-left'); left.append(media, pick);
    const f = el('div', 'ne-fields');
    const inp = (ph, key, max, type) => { const i = el('input'); i.type = type || 'text'; i.placeholder = ph; i.maxLength = max || 120; i.value = a[key] || ''; i.addEventListener('input', () => { a[key] = i.value; }); return i; };
    const where = el('select'); Object.entries(AD_WHERE_LABELS).forEach(([k, v]) => { const o = el('option', '', v); o.value = k; where.append(o); }); where.value = a.where || 'both'; where.addEventListener('change', () => { a.where = where.value; });
    const dates = el('div', 'ad-dates'); dates.append(el('label', 'muted', 'Desde'), inp('', 'from', 10, 'date'), el('label', 'muted', 'Hasta'), inp('', 'to', 10, 'date'));
    const on = el('label', 'ad-on'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = a.enabled !== false; cb.addEventListener('change', () => { a.enabled = cb.checked; }); on.append(cb, document.createTextNode(' Activo'));
    const stats = el('span', 'ad-chip ad-stat-chip', 'Sin datos'); stats.dataset.adId = a.id || '';
    const del = el('button', 'ghost danger', 'Quitar'); del.type = 'button';
    del.addEventListener('click', async () => { if (!await askConfirm(`¿Quitar el anuncio "${a.name || 'sin nombre'}"?`)) return; list.splice(idx, 1); paintAds(); });
    const foot = el('div', 'ad-foot'); foot.append(on, where, stats, del);
    f.append(inp('Anunciante (ej. Holi Hosting)', 'name', 60), inp('Enlace https://…', 'url', 300), inp('Texto corto (opcional)', 'text', 120), dates, foot);
    row.append(left, f);
    box.append(row);
  });
  if (!list.length) box.append(el('p', 'muted ne-empty', 'Todavía no hay anuncios. Pulsa «+ Anuncio» cuando tengas un anunciante.'));
  if (adm.adStats) fillAdStats();
}
window.paintAds = paintAds;
function fillAdStats() {
  document.querySelectorAll('.ad-stat-chip').forEach((c) => {
    const s = adm.adStats[c.dataset.adId];
    c.textContent = s ? `${s.v} vistas · ${s.c} clics · ${s.v ? Math.round((s.c / s.v) * 1000) / 10 : 0}%` : 'Sin datos aún (guarda y espera)';
  });
}
$('ad-ads-add').addEventListener('click', () => { (adm.ads || (adm.ads = [])).unshift({ id: '', name: '', where: 'both', from: '', to: '', enabled: true }); paintAds(); });
$('ad-ads-stats').addEventListener('click', async () => {
  const st = $('ad-ads-status');
  try { adm.adStats = await window.api.adminAdsStats(); fillAdStats(); st.textContent = 'Números actualizados.'; } catch (e) { st.textContent = cleanError(e); }
});
$('ad-ads-save').addEventListener('click', async () => {
  const st = $('ad-ads-status'); st.textContent = 'Guardando…';
  try {
    adm.ads = await window.api.adminSaveAds(adm.ads || []);
    paintAds(); st.textContent = 'Publicidad guardada. Los jugadores la ven en unos minutos.';
    if (window.refreshContent) window.refreshContent();
  } catch (e) { st.textContent = cleanError(e); }
});

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
    if (ev.commissioner.nick) com.append(head3d({ nick: ev.commissioner.nick }, 46));
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
    card.append(head3d({ nick, ...(known && known.skin ? { skin: known.skin, slim: known.slim } : {}) }, 44), el('div', 'nick', nick));
    row.append(card);
  });
  box.append(row);
}

// Participantes y colaboradores con nombre: tarjetas con skin, rol y enlaces.
function paintPeople(ev) {
  const box = $('event-modal-people');
  box.replaceChildren();
  // Si los participantes traen "rol" distinto (p. ej. cada nación), se separan en grupos con su propio título.
  const split = (list) => {
    const roles = [...new Set((list || []).map((p) => p.role || ''))];
    if (roles.length < 2 || roles.length > 12 || roles.includes('')) return [['', list]];
    return roles.map((r) => [r, list.filter((p) => (p.role || '') === r)]);
  };
  const groups = [['👥 Participantes', ev.roster], ['🤝 Colaboraron con Nova PX', ev.collabs]];
  let any = false;
  groups.forEach(([title, list]) => {
    if (!list || !list.length) return;
    any = true;
    box.append(el('h4', 'winners-title', `${title} (${list.length})`));
    const parts = title.startsWith('👥') ? split(list) : [['', list]];
    parts.forEach(([sub, items]) => {
      if (sub) box.append(el('h5', 'people-sub', `${sub} · ${items.length}`));
      const row = el('div', 'people-row compact' + (sub ? ' grouped' : ''));
      items.forEach((p) => {
        const c = el('div', 'person');
        c.append(head3d({ nick: p.nick, ...(p.skin ? { skin: p.skin, slim: p.slim } : {}) }, 44), el('div', 'nick', p.nick));
        if (p.role && !sub) c.append(el('div', 'role', p.role));
        if (p.links && p.links.length) c.append(linkChips(p.links));
        row.append(c);
      });
      box.append(row);
    });
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
      $('event-modal-media').hidden = !src;
      if (src) { $('event-modal-img').src = src; $('event-modal-media').style.setProperty('--ev-img', `url("${src.replace(/"/g, '%22')}")`); }
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
    const yearOf = (ev) => (/^\d{4}/.test(ev.date || '') ? ev.date.slice(0, 4) : '');
    // Imagen que rellena su marco: la imagen entera encima y, detrás, la misma desenfocada (sin barras negras).
    const media = (ev, cls) => {
      const m = el('div', `ev-media ${cls || ''}`);
      const src = imageUrl(ev.image);
      if (src) {
        m.style.setProperty('--ev-img', `url("${src.replace(/"/g, '%22')}")`);
        const img = el('img', 'ev-img'); img.alt = ''; img.loading = 'lazy'; img.src = src;
        m.append(img);
      } else {
        m.classList.add('no-img');
        m.append(el('span', 'ev-initial', (ev.name || '?').trim().slice(0, 2).toUpperCase()));
      }
      return m;
    };
    const mkCard = (ev) => {
      const card = el('button', 'ev-card');
      card.type = 'button';
      card.dataset.tilt = '';
      const m = media(ev);
      const y = yearOf(ev);
      if (y) m.append(el('span', 'ev-year', y));
      const w = winnersOf(ev);
      if (w.length) m.append(el('span', 'ev-trophy', w.length === 1 ? `🏆 ${w[0]}` : `🏆 ${w.length}`));
      const body = el('div', 'ev-body');
      body.append(el('h3', '', ev.name));
      const meta = el('div', 'ev-meta');
      if (ev.date) meta.append(el('span', 'ev-date', ev.date));
      if (ev.participants) meta.append(el('span', 'ev-part', `👥 ${ev.participants}`));
      body.append(meta, el('span', 'ev-more', 'Ver detalles →'));
      card.append(m, body);
      card.addEventListener('click', () => open(ev));
      return card;
    };
    const cards = events.map((ev) => ({ ev, card: mkCard(ev) }));
    list.append(...cards.map((c) => c.card));

    // Resumen y evento más reciente
    const stats = $('events-stats');
    const totalPart = events.reduce((n, e) => n + (Number(e.participants) || 0), 0);
    const champs = new Set(events.flatMap((e) => winnersOf(e).map((n) => String(n).toLowerCase())));
    stats.replaceChildren();
    if (events.length) {
      [[events.length, 'eventos'], [totalPart, 'participaciones'], [champs.size, 'ganadores']].forEach(([n, l]) => {
        const t = el('div', 'ev-stat'); t.append(el('b', '', String(n)), el('span', 'muted', l)); stats.append(t);
      });
    }
    const heroBox = $('events-hero');
    heroBox.replaceChildren();
    const latest = events[0];
    if (latest) {
      const h = el('button', 'ev-hero'); h.type = 'button';
      const m = media(latest, 'ev-hero-media');
      const txt = el('div', 'ev-hero-txt');
      txt.append(el('span', 'ev-hero-kicker', 'Último evento'), el('h3', '', latest.name));
      const meta = el('div', 'ev-meta'); if (latest.date) meta.append(el('span', 'ev-date', latest.date)); if (latest.participants) meta.append(el('span', 'ev-part', `👥 ${latest.participants} participantes`)); const hw = winnersOf(latest); if (hw.length) meta.append(el('span', 'ev-part', `🏆 ${hw.slice(0, 3).join(', ')}`));
      txt.append(meta);
      if (latest.description) txt.append(el('p', 'ev-hero-desc', latest.description.length > 170 ? latest.description.slice(0, 167) + '…' : latest.description));
      txt.append(el('span', 'ev-hero-cta', 'Ver detalles →'));
      h.append(m, txt);
      h.addEventListener('click', () => open(latest));
      heroBox.append(h);
    }

    // Filtros: por año y por nombre
    const years = [...new Set(events.map(yearOf).filter(Boolean))].sort().reverse();
    let year = 'all';
    const yBox = $('events-years');
    yBox.replaceChildren();
    const chips = [];
    ['all', ...years].forEach((y) => {
      const c = el('button', 'ev-year-chip', y === 'all' ? 'Todos' : y); c.type = 'button';
      c.addEventListener('click', () => { year = y; chips.forEach((x) => x.b.classList.toggle('active', x.y === y)); filter(); });
      chips.push({ y, b: c }); yBox.append(c);
    });
    chips[0].b.classList.add('active');
    const count = $('events-count');
    const filter = () => {
      const q = $('events-search').value.trim().toLowerCase();
      let n = 0;
      cards.forEach(({ ev, card }) => {
        const show = (!q || ev.name.toLowerCase().includes(q)) && (year === 'all' || yearOf(ev) === year);
        card.hidden = !show;
        if (show) n++;
      });
      heroBox.hidden = !!q || year !== 'all';
      if (!heroBox.hidden && cards[0]) { cards[0].card.hidden = true; n--; }
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
  const head = $('mp-view-detail').querySelector('.mp-detail-head');
  if (p.icon) head.style.setProperty('--mp-img', `url("${String(p.icon).replace(/"/g, '%22')}")`); else head.style.removeProperty('--mp-img');
  head.classList.toggle('has-img', !!p.icon);
  paintPackChips(p);
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
    paintPackChips(p);
    paintContent(r.offline);
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
  if (!shown.length && mp.items.length) {
    const EMPTY = { mod: 'No tienes ningún mod instalado. Explora contenido para buscar uno.', shader: 'No tienes ningún shader instalado. Explora contenido para buscar uno.', resourcepack: 'No tienes ninguna textura instalada. Explora contenido para buscar una.' };
    list.append(el('p', 'muted empty-note', q ? 'Nada coincide con tu búsqueda.' : EMPTY[mp.filter] || 'No hay nada para mostrar.'));
  }
  shown.forEach((it) => {
    const row = el('div', `mod-card${it.enabled ? '' : ' mod-off'}`);
    row.append(iconEl(it.icon, it.name));
    const body = el('div', 'mod-body');
    const top = el('div', 'mod-top');
    top.append(el('strong', '', it.name), el('span', `type-chip t-${it.type}`, TYPE_NAMES[it.type]));
    if (!it.enabled) top.append(el('span', 'type-chip t-off', 'Desactivado'));
    body.append(top, el('span', 'muted', `${it.version ? it.version + ' · ' : ''}${it.file.replace(/\.disabled$/i, '')} · ${fmtSize(it.size)}`));
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
    ctx(row, () => [
      { title: it.name },
      { icon: it.enabled ? '⏸' : '▶', label: it.enabled ? 'Desactivar' : 'Activar', onClick: () => sw.click() },
      { icon: '📋', label: 'Copiar nombre', onClick: () => copyText(it.name, 'Nombre copiado') },
      { icon: '📋', label: 'Copiar nombre del archivo', onClick: () => copyText(it.file.replace(/\.disabled$/i, ''), 'Archivo copiado') },
      'sep',
      { icon: '🗑', label: 'Quitar del modpack…', danger: true, onClick: () => del.click() }
    ]);
    list.append(row);
  });
}
async function bulkToggle(enable) {
  const targets = mp.items.filter((it) => (mp.filter === 'all' || it.type === mp.filter) && it.enabled !== enable);
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
      ctx(row, () => [
        { title: w.name },
        { icon: '💾', label: 'Respaldar este mundo', onClick: () => bk.click() },
        { icon: '📋', label: 'Copiar nombre', onClick: () => copyText(w.name, 'Nombre copiado') },
        { icon: '🗂', label: 'Abrir carpeta del modpack', onClick: () => window.api.modpackFolder(mp.pack.id).catch((e) => toast(cleanError(e), 'error')) },
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
  $('ps-account').value = '';
  paintPackAccounts();
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
    settings: { account: $('ps-account').value, ramGb: num('ps-ram'), jvmArgs: $('ps-args').value, javaPath: $('ps-java').value, width: num('ps-w'), height: num('ps-h'), ...($('ps-full').checked ? { fullscreen: true } : {}) }
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

/* ---------- varias cuentas ---------- */
let savedAccounts = [];
async function paintAccounts() {
  try { savedAccounts = await window.api.accountsList(); } catch { savedAccounts = []; }
  if (!Array.isArray(savedAccounts)) savedAccounts = [];
  const box = $('acc-list');
  if (!box) return;
  box.replaceChildren();
  $('acc-saved').hidden = !savedAccounts.length;
  savedAccounts.forEach((a) => {
    const row = el('div', `acc-row${a.active ? ' on' : ''}`);
    const av = el('img'); av.alt = ''; av.src = skinHead(a.name);
    const txt = el('div', 'acc-txt'); const nm = el('strong', 'pii', a.name); txt.append(nm, el('span', '', a.mode === 'premium' ? 'Premium (Microsoft)' : 'Sin conexión (nick local)'));
    row.append(av, txt);
    if (a.active) row.append(el('span', 'ad-chip', 'Activa'));
    else {
      const use = el('button', 'primary', 'Usar'); use.type = 'button';
      use.addEventListener('click', async () => {
        use.disabled = true;
        try { setSession(await window.api.accountSwitch(a.id)); toast(`Ahora juegas como ${a.name}`, 'success'); }
        catch (e) { toast(cleanError(e), 'error'); use.disabled = false; }
      });
      row.append(use);
    }
    const rm = el('button', 'ghost', 'Quitar'); rm.type = 'button';
    rm.addEventListener('click', async () => {
      if (!await askConfirm(`¿Quitar la cuenta ${a.name} de este launcher? Tendrás que iniciar sesión otra vez para volver a usarla.`)) return;
      try {
        const left = await window.api.accountForget(a.id);
        if (a.active) setSession(null); else paintAccounts();
        savedAccounts = left;
      } catch (e) { toast(cleanError(e), 'error'); }
    });
    row.append(rm);
    box.append(row);
  });
  paintPackAccounts();
}
function paintPackAccounts() {
  const sel = $('ps-account');
  if (!sel) return;
  const cur = sel.value || (mp.pack && mp.pack.settings && mp.pack.settings.account) || '';
  sel.replaceChildren();
  const none = el('option', '', 'La que esté activa'); none.value = ''; sel.append(none);
  savedAccounts.forEach((a) => { const o = el('option', '', `${a.name} (${a.mode === 'premium' ? 'premium' : 'sin conexión'})`); o.value = a.id; sel.append(o); });
  sel.value = savedAccounts.some((a) => a.id === cur) ? cur : '';
}
window.api.onAuthChanged && window.api.onAuthChanged((info) => setSession(info));

function setSession(info) {
  currentUser = info;
  if (info && window.NovaMascot) window.NovaMascot.notify('session', { name: info.name });
  syncSecretThemes(info);
  paintAccounts();
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

$('logout-btn').textContent = 'Cerrar sesión y quitar esta cuenta';
$('logout-btn').addEventListener('click', async () => {
  await window.api.logout();
  setSession(null);
});

/* ---------- jugar ---------- */
let playing = false;
function setPlaying(value) {
  if (value && !playing && window.NovaMascot) window.NovaMascot.notify('game-start');
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

let dlTimer = 0;
function topDownload(pct) {
  const b = $('top-dl'), t = $('top-dl-text');
  if (!b) return;
  b.classList.add('busy'); t.hidden = false; t.textContent = `${pct}%`;
  b.style.setProperty('--p', `${pct}%`);
  clearTimeout(dlTimer);
  dlTimer = setTimeout(() => { b.classList.remove('busy'); t.hidden = true; }, 5000);
}
$('top-dl').addEventListener('click', () => { const t = document.querySelector('[data-tab=modpacks]'); if (t) t.click(); });
window.api.onProgress((d) => {
  if (!d.total) return;
  topDownload(Math.min(100, Math.round(d.type === 'java' ? d.task : (d.task / d.total) * 100)));
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
  if (window.NovaMascot) window.NovaMascot.notify('game-end', { code: d.code });
  renderContinue();
  showCrash(d.code === 0 ? null : d.crash);
  refreshPlaytime();
});

/* ---------- consola ---------- */
const logLines = [];
const MAX_LOG_LINES = 2000;
const logBox = $('log');
let logFilter = 'all';
if (window.NovaMascot && window.NovaMascot.setLogProvider) window.NovaMascot.setLogProvider(() => logLines.slice(-80));

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
    window.dispatchEvent(new Event('settings-saved'));
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
  const track = $('update-track'), fill = $('update-fill'), pct = $('update-pct');
  track.hidden = true; pct.hidden = true; banner.classList.remove('ready');

  if (s.state === 'downloading') {
    banner.hidden = false;
    $('update-ico').textContent = '⬇';
    $('update-title').textContent = `Descargando la versión ${s.version || 'nueva'}`;
    text.textContent = 'Se instalará al reiniciar el launcher. Puedes seguir usándolo.';
    const n = Math.max(0, Math.min(100, Math.round(s.percent || 0)));
    track.hidden = false; pct.hidden = false; fill.style.width = `${n}%`; pct.textContent = `${n}%`;
    line.textContent = `Descargando la versión ${s.version || 'nueva'} (${s.percent || 0}%).`;
  } else if (s.state === 'ready') {
    banner.hidden = false;
    install.hidden = false;
    banner.classList.add('ready');
    $('update-ico').textContent = '✨';
    $('update-title').textContent = `La versión ${s.version} está lista`;
    text.textContent = 'Reinicia el launcher para instalarla. Tus ajustes y modpacks no cambian.';
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
  renderAds();
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
  window.refreshContent = async () => { lastContent = Date.now(); await Promise.all([renderHero(), renderNews(), renderAds(), renderEvents(), renderTeam()]); };
  setInterval(() => { if (!document.hidden) window.refreshContent(); }, 3 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastContent > 60 * 1000) window.refreshContent(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshServer(); });
  window.__novaReady = true;
  window.dispatchEvent(new Event('nova-ready'));
})();


/* Tema secreto de LaosOneView: lo ve su cuenta premium (se comprueba el UUID, no el nick) y los administradores. */
const LAOS_UUID = '91578310ebad4567a6f4750bc0b947c7';
function syncSecretThemes(info = currentUser) {
  try {
    const isLaos = !!info && info.mode === 'premium' && String(info.uuid || '').replace(/-/g, '').toLowerCase() === LAOS_UUID;
    if (window.NovaTheme && window.NovaTheme.secret) window.NovaTheme.secret('laos', isLaos || isAdmin, !(isLaos || isAdmin) && !!info);
    if (isLaos && !localStorage.getItem('px.secret.laos')) {
      localStorage.setItem('px.secret.laos', '1');
      toast('✦ Tema secreto desbloqueado: Laos Edición. Está en Ajustes → Apariencia.', 'success');
    }
  } catch {}
}

/* ---------- modo administrador ---------- */
let isAdmin = false;
let adminProgress = null;
function setAdminUi(on, repo, err, eligible) {
  isAdmin = on;
  syncSecretThemes();
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
          try { const a = await window.api.adminPickImage(`sponsor-${x.name || 'logo'}`); if (a) { x.logo = a.path; showLogo(); } } catch (e) { toast(cleanError(e), 'error'); }
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
  // Alta de participantes en pausa (sin lista oficial de eventos pasados). Los ya guardados se conservan; se reactiva con localStorage px.admin.roster = 1.
  const rosterOn = (() => { try { return localStorage.getItem('px.admin.roster') === '1'; } catch { return false; } })();
  $('ade-roster-title').hidden = $('ade-roster').hidden = !rosterOn;
  if (rosterOn) peopleEditor($('ade-roster'), ade.draft.roster, false, '+ Participante');
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
    [[owners.length, 'Dueños'], [admins.length, 'Administradores'], [owners.length + admins.length, 'Con acceso al panel']].forEach(([n, l]) => {
      const t = el('div', 'ad-stat'); t.append(el('strong', '', String(n)), el('span', 'muted', l)); stats.append(t);
    });
  }
  owners.forEach((o) => {
    const c = el('div', 'perm-card owner');
    c.append(head3d({ nick: o }, 46));
    const b = el('div', 'perm-body'); b.append(el('strong', '', o), el('span', 'perm-role owner', '👑 Dueño'), el('small', 'muted', 'Siempre tiene acceso'));
    c.append(b); box.append(c);
  });
  admins.forEach((a, idx) => {
    const c = el('div', 'perm-card');
    c.append(head3d({ nick: a.nick }, 46));
    const b = el('div', 'perm-body'); b.append(el('strong', '', a.nick), el('span', 'perm-role', '🛡 Administrador'), el('small', 'muted', 'Puede ver el panel'));
    const del = el('button', 'perm-del ghost', 'Quitar');
    del.type = 'button'; del.title = 'Quitar permiso';
    del.addEventListener('click', async () => {
      if (!await askConfirm(`¿Quitar el permiso a ${a.nick}?`)) return;
      try {
        adm.admins = await window.api.adminSaveAdmins(adm.admins.filter((_, i) => i !== idx));
        paintPerms();
      } catch (e) { $('ad-perm-status').textContent = cleanError(e); }
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
        const r = await window.api.adminPickImage(m.nick || 'perfil');
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
      try { const r = await window.api.adminPickImage(n.title || 'noticia'); if (r) { n.image = r.path; pick.textContent = 'Cambiar imagen'; showImg(); prev(); } } catch (e) { $('ad-news-status').textContent = cleanError(e); }
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
async function openLauncherImport() {
  lmSel.clear();
  const list = $('lm-list');
  list.replaceChildren(el('p', 'muted lm-empty', 'Buscando instancias…'));
  $('lm-modal').showModal();
  lmCount();
  let found = [];
  try { found = await window.api.launchersScan(); } catch (e) { toast(cleanError(e), 'error'); }
  list.replaceChildren();
  if (!found.length) {
    const box = el('div', 'lm-empty');
    box.append(el('strong', '', 'No encontré instancias en las carpetas habituales'), el('p', 'muted', 'Si las guardas en otro sitio, usa «Elegir carpeta a mano» y selecciona la carpeta de la instancia.'));
    list.append(box); lmCount(); return;
  }
  const groups = new Map();
  found.forEach((x) => { if (!groups.has(x.launcher)) groups.set(x.launcher, []); groups.get(x.launcher).push(x); });
  groups.forEach((items, name) => {
    const g = el('section', 'lm-group');
    const h = el('h4', '', ''); h.append(el('span', 'lm-gico', LM_ICONS[name] || '📁'), document.createTextNode(` ${name} `), el('small', 'muted', `${items.length}`));
    g.append(h);
    items.forEach((x) => {
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
  });
  lmCount();
}
$('lm-close').addEventListener('click', () => $('lm-modal').close());
$('lm-modal').addEventListener('click', (e) => { if (e.target === $('lm-modal')) $('lm-modal').close(); });
$('lm-manual').addEventListener('click', () => { $('lm-modal').close(); doImport({ kind: 'folder' }); });
$('lm-all').addEventListener('change', (e) => {
  document.querySelectorAll('#lm-list .lm-item:not(.off) input').forEach((cb) => { cb.checked = e.target.checked; cb.dispatchEvent(new Event('change')); });
});
$('lm-go').addEventListener('click', async () => {
  if (importing || !lmSel.size) return;
  importing = true;
  const dirs = [...lmSel];
  $('lm-modal').close();
  try {
    busyShow('Importando instancias', { text: 'Copiando archivos…' });
    const r = await window.api.launchersImport(dirs);
    if (r.ok.length) toast(`${r.ok.length} ${r.ok.length === 1 ? 'instancia importada' : 'instancias importadas'}`);
    r.failed.forEach((f) => toast(`${f.name}: ${f.error}`, 'error'));
    await loadInstalled();
  } catch (e) { toast(cleanError(e), 'error'); renderLibrary(); } finally { busyHide(); importing = false; }
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
      const chat = el('button', 'ghost friend-chat', '💬');
      chat.type = 'button';
      chat.title = `Chatear con ${f.nick}`;
      if (f.unread) chat.append(el('span', 'friend-badge', String(Math.min(f.unread, 9))));
      chat.addEventListener('click', () => openChat(f));
      const rm = el('button', 'ghost friend-rm', '✕');
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
    $('chat-status').textContent = r.playing ? 'Jugando' : r.online ? 'En línea' : 'Desconectado';
  } catch (e) { $('chat-status').textContent = cleanError(e); }
}
function openChat(f) {
  chatWith = f.nick;
  chatSince = 0;
  $('chat-name').textContent = f.nick;
  $('chat-status').textContent = f.playing ? 'Jugando' : f.online ? 'En línea' : 'Desconectado';
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
  const tabIcons = { event: '🎮', team: '👥', events: '🏆', news: '📰', users: '📊', look: '🎨', config: '⚙️', reco: '⭐', control: '🛰️', status: '🩺', perms: '🔑' };
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
