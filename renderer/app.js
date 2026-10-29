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
// Dura unos 4 segundos (lo que tarda la barra de carga). Se puede saltar con clic o cualquier tecla.
(function splash() {
  const s = document.getElementById('splash');
  if (!s) return;
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    s.classList.add('hide');
    setTimeout(() => s.remove(), 700);
  }
  setTimeout(close, 3900);
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
  home: ['Inicio', 'Todo listo para tu próximo evento'],
  events: ['Eventos', 'El historial de los eventos del equipo'],
  team: ['Equipo', 'Las personas que hacen posible cada evento'],
  skins: ['Skins y capas', 'Cambia tu aspecto en Minecraft'],
  settings: ['Ajustes', 'Memoria, Java, apariencia y más'],
  console: ['Consola', 'El registro del juego, para resolver problemas'],
  account: ['Cuenta', 'Inicia sesión como premium o no premium']
};

/* ---------- avisos emergentes ---------- */
function toast(text, kind) {
  const box = $('toasts');
  const t = el('div', kind === 'error' ? 'toast error' : 'toast', text);
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

function goTo(tab) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  $(`page-${tab}`).classList.add('active');
  const [title, sub] = PAGE_TITLES[tab] || ['', ''];
  $('top-title').textContent = title;
  $('top-sub').textContent = sub;
  moveIndicator();
  if (tab === 'skins' && window.NovaSkins) window.NovaSkins.show();
}
document.querySelectorAll('[data-tab]').forEach((btn) => btn.addEventListener('click', () => goTo(btn.dataset.tab)));

/* ---------- inicio: hero ---------- */
let eventActive = true;

async function renderHero() {
  try {
    const m = await window.api.getData('manifest');
    eventActive = !(m.event && m.event.active === false);
    const heroBox = document.querySelector('.hero');
    heroBox.classList.toggle('soon', !eventActive);
    $('hero-badge-text').textContent = eventActive ? 'Evento actual' : 'Próximamente';
    $('soon-art').hidden = eventActive;
    setPlaying(playing);
    if (m.event && m.event.name) $('hero-title').textContent = m.event.name;
    $('hero-tagline').textContent = (m.event && m.event.tagline) || '';
    // Logo del evento (PNG con fondo transparente) a la derecha de la portada.
    const art = $('hero-art');
    const artUrl = imageUrl(m.event && m.event.logo);
    art.hidden = !artUrl;
    if (artUrl) art.src = artUrl;
    const heroImg = imageUrl(m.event && m.event.image);
    const hero = document.querySelector('.hero');
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
    startCountdown(m.event && m.event.startsAt);
    renderLinks(m.links);
  } catch {
    $('hero-tagline').textContent = 'No se pudo leer la configuración del evento.';
  }
}

/* ---------- cuenta atrás y enlaces ---------- */
let countdownTimer = 0;
function startCountdown(iso) {
  clearInterval(countdownTimer);
  const box = $('stat-next');
  const label = $('stat-next-label');
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

function renderLinks(links) {
  const card = $('links-card');
  const box = $('links');
  box.replaceChildren();
  const valid = (Array.isArray(links) ? links : []).filter((l) => l && l.name && /^https:\/\//i.test(String(l.url || ''))).slice(0, 8);
  card.hidden = valid.length === 0;
  valid.forEach((l) => {
    const b = el('button', '', String(l.name).slice(0, 30));
    b.type = 'button';
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
  box.replaceChildren(el('div', 'skeleton'), el('div', 'skeleton'));
  try {
    const news = await window.api.getData('news');
    box.replaceChildren();
    if (!news.length) box.append(el('p', 'muted', 'Todavía no hay novedades.'));
    news.forEach((n) => {
      const item = el('article', 'news-item');
      const time = el('time', '', n.date);
      item.append(el('h3', '', n.title), time, el('p', '', n.text));
      box.append(item);
    });
  } catch {
    box.replaceChildren();
    box.append(el('p', 'muted', 'No se pudieron cargar las novedades. Revisa tu conexión.'));
  }
}

async function renderEvents() {
  const list = $('events-list');
  list.replaceChildren();
  try {
    const events = (await window.api.getData('events')).sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
    const modal = $('event-modal');
    const facts = (ev) => {
      const box = el('div', 'facts');
      if (ev.participants) box.append(el('span', 'fact', `${ev.participants} participantes`));
      if (ev.winner) box.append(el('span', 'fact', `Ganó ${ev.winner}`));
      return box;
    };
    const open = (ev) => {
      const src = imageUrl(ev.image);
      $('event-modal-img').hidden = !src;
      if (src) $('event-modal-img').src = src;
      $('event-modal-name').textContent = ev.name;
      $('event-modal-date').textContent = ev.date || '';
      $('event-modal-desc').textContent = ev.description || '';
      $('event-modal-facts').replaceChildren(...facts(ev).childNodes);
      if (!modal.open) modal.showModal();
    };
    if (!modal.dataset.bound) {
      modal.dataset.bound = '1';
      $('event-modal-close').addEventListener('click', () => modal.close());
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });
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

// Todas las skins del equipo se dibujan con UN solo contexto WebGL compartido (ahorra memoria).
let teamEnv = null;
let teamViewers = [];
const TEAM_STATES = ['idle', 'wave', 'walk', 'jump', 'spin'];

window.addEventListener('nova-fx', (e) => teamViewers.forEach((v) => v.setAnimated(e.detail)));

function teamCard(m, index, featured) {
  const card = el('div', featured ? 'member featured' : 'member');
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
        const r = await window.api.skinTexture(m.nick);
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
  info.append(el('div', 'nick', m.nick), el('div', 'role', m.role || ''));
  card.append(stage, info);
  return card;
}

async function renderTeam() {
  const grid = $('team-grid');
  const top = $('team-featured');
  grid.replaceChildren();
  top.replaceChildren();
  teamViewers.forEach((v) => v.destroy());
  teamViewers = [];
  try {
    const team = await window.api.getData('team');
    let i = 0;
    team.forEach((m) => {
      const featured = !!m.featured;
      (featured ? top : grid).append(teamCard(m, i++, featured));
    });
  } catch {
    grid.append(el('p', 'muted', 'No se pudo cargar el equipo.'));
  }
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
    detail.textContent = `${s.host}: ${players}`;
  } else {
    dot.classList.add('off');
    detail.textContent = `${s.host} está desconectado.`;
  }
}

/* ---------- sesión ---------- */
function showMsg(text, isError = false) {
  const m = $('account-msg');
  m.textContent = text;
  m.className = isError ? 'msg error' : 'msg';
}

function setSession(info) {
  currentUser = info;
  if (window.NovaSkins) window.NovaSkins.setUser(info);
  loggedIn = !!info;
  const chipAvatar = $('chip-avatar');
  const bust = $('player-bust');
  if (info) {
    const label = info.mode === 'premium' ? 'Cuenta premium' : 'Cuenta no premium';
    $('chip-name').textContent = info.name;
    $('chip-mode').textContent = label;
    chipAvatar.src = skinHead(info.name);
    chipAvatar.hidden = false;
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
  $('play-label').textContent = value ? 'Iniciando…' : eventActive ? 'Jugar' : 'Próximamente';
  if (!value && !eventActive) $('status').textContent = 'Todavía no hay un evento activo';
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
  setPlaying(true);
  showCrash(null);
  $('status').textContent = 'Preparando…';
  try {
    await startGame();
  } catch (err) {
    $('status').textContent = `No se pudo iniciar: ${cleanError(err)}`;
    $('progress').hidden = true;
    setPlaying(false);
  }
});

window.api.onStatus((d) => {
  $('status').textContent = d.text;
});

window.api.onProgress((d) => {
  const bar = $('progress');
  if (d.total) {
    bar.hidden = false;
    bar.max = d.total;
    bar.value = d.task;
    $('status').textContent =
      d.type === 'java' ? `Instalando Java… ${Math.round(d.task)}%` : `Descargando archivos del juego (${d.task} de ${d.total})`;
  }
});

window.api.onClose((d) => {
  $('progress').hidden = true;
  $('status').textContent =
    d.code === 0 ? 'Minecraft se cerró' : `Minecraft se cerró con el código ${d.code}. Revisa la consola.`;
  setPlaying(false);
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
  const row = el('div', `log-line log-${logLevel(line)}`, line);
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
  $('offline-nick').value = settings.lastNick || '';

  window.NovaTheme.init(settings);
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
  else setSession(null);
  if (st.playing) {
    setPlaying(true);
    $('status').textContent = 'Minecraft en ejecución';
  }
  if (st.log && st.log.length) {
    st.log.forEach((l) => logLines.push(l));
    logRender();
  }
  setInterval(refreshServer, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshServer(); });
})();
