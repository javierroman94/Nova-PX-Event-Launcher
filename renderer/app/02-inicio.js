/* Interfaz del launcher — Pantalla de inicio: hero, jugando ahora, continuar, cuenta atrás y enlaces. (parte de lo que antes era app.js; se carga en este orden desde index.html). */

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
    else if (x.nick || x.skin) { const hw = el('span', 'sponsor-logo sponsor-head'); hw.append(head3d({ nick: x.nick || String(x.name || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 16), ...(x.skin ? { skin: x.skin, slim: x.slim } : {}) }, 40)); c.append(hw); }
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
  if (!sponsors.length && eventState !== 'ended') {
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
    let evState = (m.event && m.event.status) || (m.event && m.event.active === false ? 'soon' : 'active');
    // Un evento programado se abre solo a la hora de inicio (misma regla que lib/evento-estado.js).
    if (evState === 'soon' && m.event && m.event.autoStart === true && Date.parse(m.event.startsAt || '') <= Date.now()) evState = 'active';
    eventState = evState;
    eventActive = evState === 'active';
    const heroBox = document.querySelector('.hero');
    heroBox.classList.toggle('soon', !eventActive);
    heroBox.classList.toggle('ended', evState === 'ended');
    $('hero-badge-text').textContent = evState === 'ended' ? 'Evento finalizado' : eventActive ? 'Evento actual' : 'Próximamente';
    $('soon-art').hidden = eventActive || (!(evState === 'ended') && !!(m.event && (m.event.logo || m.event.image)));
    setPlaying(playing);
    if (m.event && m.event.name) $('hero-title').textContent = m.event.name;
    eventInfo = { name: (m.event && m.event.name) || 'Evento', image: imageUrl(m.event && m.event.image), logo: imageUrl(m.event && m.event.logo), mc: m.minecraftVersion, loader: String((m.loader && m.loader.type) || 'vanilla') };
    const ended = evState === 'ended'; // un evento finalizado deja de mostrarse (queda en el Historial)
    if (ended) eventInfo = { ...eventInfo, name: 'Sin evento activo', image: '', logo: '' };
    renderContinue();
    if (ended) $('hero-title').textContent = 'Sin evento activo';
    $('hero-tagline').textContent = ended ? 'El último evento ya terminó. Mira cómo fue en el Historial y espera el próximo.' : (m.event && m.event.tagline) || '';
    // Logo del evento (PNG con fondo transparente) a la derecha de la portada.
    const art = $('hero-art');
    const artUrl = ended ? '' : imageUrl(m.event && m.event.logo);
    art.hidden = !artUrl;
    if (artUrl) art.src = artUrl;
    const heroImg = ended ? '' : imageUrl(m.event && m.event.image);
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
    paintSponsors(ended ? [] : m.sponsors);
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
  const P = window.NovaLaunchPanel;
  if (!on) { if (P) P.close(); return; }
  const t = launchTarget || { kind: 'event', title: eventInfo.name, icon: '' };
  $('np-title').textContent = t.title;
  $('np-icon').src = t.icon || 'images/logo.png';
  // Todos los perfiles (y el evento) abren el panel de juego con la consola; la pantalla de carga es solo de Nova Client.
  if (P && !P.isOpen()) { if (logLines.some((l) => l.startsWith('[minecraft]'))) P.resume(t, true); else P.open(t); }
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
// Color principal de una imagen (da más peso a los colores vivos). Devuelve '' si no se puede leer.
const tintCache = new Map();
function iconTint(url) {
  if (tintCache.has(url)) return Promise.resolve(tintCache.get(url));
  return new Promise((resolve) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => {
      let out = '';
      try {
        const c = document.createElement('canvas'); c.width = c.height = 16;
        const x = c.getContext('2d'); x.drawImage(im, 0, 0, 16, 16);
        const d = x.getImageData(0, 0, 16, 16).data;
        let r = 0, g = 0, b = 0, w = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 128) continue;
          const wt = 1 + (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2])) / 32;
          r += d[i] * wt; g += d[i + 1] * wt; b += d[i + 2] * wt; w += wt;
        }
        if (w) out = `rgb(${Math.round(r / w)}, ${Math.round(g / w)}, ${Math.round(b / w)})`;
      } catch { out = ''; }
      tintCache.set(url, out);
      resolve(out);
    };
    im.onerror = () => { tintCache.set(url, ''); resolve(''); };
    im.src = url;
  });
}
let lpPackId = null;
function renderLaunchpad(packs) {
  renderCover();
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
  if (last) {
    $('lp-kicker').textContent = last.lastPlayedAt ? `Última partida · ${ago(last.lastPlayedAt)}` : 'Listo para jugar';
    $('lp-pack-title').textContent = last.title;
    // El fondo ya no es el icono ampliado y borroso: es un degradado limpio con el color principal del icono.
    hero.style.removeProperty('--lp-bg');
    hero.style.removeProperty('--lp-tint');
    const lastCover = packCover(last);
    if (lastCover) {
      const ic = el('img'); ic.alt = ''; ic.src = lastCover; artBox.append(ic);
      const want = lastCover;
      iconTint(want).then((c) => { if (c && hero.classList.contains('has-pack') && ic.src === want) hero.style.setProperty('--lp-tint', c); });
    } else artBox.textContent = last.emoji || last.title.slice(0, 1).toUpperCase();
    img.hidden = true;
  } else {
    // La imagen del evento ya va en la portada de arriba; aquí no se repite.
    $('lp-kicker').textContent = 'Bienvenido';
    $('lp-pack-title').textContent = 'Crea o instala tu primer modpack';
    artBox.textContent = '🎮';
    img.hidden = true;
    hero.style.removeProperty('--lp-bg');
  }
  const chips = $('lp-chips');
  chips.replaceChildren();
  if (last) {
    chips.append(el('span', 'chip', `Minecraft ${last.mcVersion}`), el('span', 'chip', LOADER_NAMES[last.loader && last.loader.type] || 'Vanilla'));
    if (last.preset === 'nova') chips.append(el('span', 'chip', '⚡ Nova'));
  }
}

// Portada de Inicio: siempre arriba y a todo el ancho; con la imagen del evento o, si no hay, el logo de NovaPX.
function renderCover() {
  const w = $('hc-welcome');
  const nick = ($('player-name').textContent || '').replace('Sin sesión', '').trim();
  w.replaceChildren(document.createTextNode(nick ? 'Bienvenido, ' : 'Bienvenido'));
  if (nick) w.append(el('span', 'pii', nick));
  const art = eventInfo.image || eventInfo.logo || '';
  const img = $('hc-img');
  const cover = $('home-cover');
  cover.classList.toggle('has-img', !!art);
  if (art) { if (img.getAttribute('src') !== art) img.src = art; img.hidden = false; } else { img.hidden = true; img.removeAttribute('src'); }
  $('hc-logo').hidden = !!art;
  $('lp-event').textContent = eventActive ? 'Evento activo →' : 'Próximo evento →';
  $('lp-event').classList.toggle('live', !!eventActive);
}
$('hc-img').addEventListener('error', () => { $('hc-img').hidden = true; $('home-cover').classList.remove('has-img'); $('hc-logo').hidden = false; });
// La portada ocupa el alto visible del área principal; al bajar se va con el resto.
(() => {
  const main = document.querySelector('main');
  if (!main) return;
  const fit = () => document.documentElement.style.setProperty('--main-h', `${main.clientHeight}px`);
  fit();
  try { new ResizeObserver(fit).observe(main); } catch { window.addEventListener('resize', fit); }
})();
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
  evIcon.src = eventInfo.image || eventInfo.logo || 'images/logo.png';
  if (eventInfo.image) evIcon.classList.add('is-art');
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
  if (!eventActive && eventState !== 'ended') box.append(ev);
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
  const panel = $('soon-panel');
  const heroEl = document.querySelector('.hero');
  const showPanel = (on) => { if (panel) panel.hidden = !on; if (heroEl) heroEl.classList.toggle('has-soon-panel', !!on); };
  const isSoon = state !== 'ended' && state !== 'active';
  showPanel(isSoon);
  if (isSoon && panel) {
    const t0 = iso ? Date.parse(iso) : NaN;
    $('soon-when').textContent = Number.isFinite(t0)
      ? `Empieza el ${new Date(t0).toLocaleString('es', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`
      : 'Fecha por anunciar';
    panel.classList.toggle('no-date', !Number.isFinite(t0));
  }
  const paintClock = (left) => {
    if (!isSoon) return;
    $('sc-d').textContent = String(Math.floor(left / 86400000));
    $('sc-h').textContent = String(Math.floor(left / 3600000) % 24).padStart(2, '0');
    $('sc-m').textContent = String(Math.floor(left / 60000) % 60).padStart(2, '0');
    $('sc-s').textContent = String(Math.floor(left / 1000) % 60).padStart(2, '0');
  };
  // Un evento finalizado no cuenta hacia atrás aunque conserve la fecha.
  if (state === 'ended') {
    box.textContent = 'Finalizado';
    label.textContent = 'Estado del evento';
    return;
  }
  const target = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(target) || target <= Date.now()) {
    if (Number.isFinite(target)) showPanel(false);
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
      renderHero(); // si estaba programado, se abre solo
      return;
    }
    const d = Math.floor(left / 86400000);
    const h = String(Math.floor(left / 3600000) % 24).padStart(2, '0');
    const mi = String(Math.floor(left / 60000) % 60).padStart(2, '0');
    const se = String(Math.floor(left / 1000) % 60).padStart(2, '0');
    box.textContent = `${d} d ${h}:${mi}:${se}`;
    paintClock(left);
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
    // En Comunidad (Inicio) solo va el título, sin el subtítulo del dominio; queda centrado junto al icono.
    b.classList.add('no-sub');
    if (host) b.title = host;
    b.append(linkIcon(l), el('span', 'link-name', String(l.name).slice(0, 30)));
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
