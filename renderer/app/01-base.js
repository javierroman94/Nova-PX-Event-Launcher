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
    setTimeout(() => { s.remove(); window.dispatchEvent(new Event('nova-splash-closed')); }, 600);
  }
  function tryClose() { if (ready && minDone) { clearInterval(tick); if (st) st.textContent = steps[steps.length - 1]; s.classList.add('ready'); setTimeout(close, 450); } }
  window.addEventListener('nova-ready', () => { ready = true; tryClose(); });
  setTimeout(() => { if (!s.classList.contains('has-video')) { minDone = true; tryClose(); } }, MIN); // con el video, espera a que termine
  setTimeout(close, 12500); // tope de seguridad (el video dura ~9 s)
  // Animación del logo NOVA PX (video con sonido). Si no se puede reproducir, queda la animación de siempre.
  const vid = document.getElementById('sp-video');
  // Temporal: la intro va sin audio (solo la animación). Poner en true para volver a permitir el sonido.
  const INTRO_AUDIO = false;
  function playIntro(sound) {
    if (!vid) return;
    sound = sound && INTRO_AUDIO;
    // Los botones de la ventana (minimizar, cerrar) toman el color blanco de la intro; al cerrarse vuelven al tema.
    setTimeout(() => { if (!closed && window.api.winOverlay) window.api.winOverlay({ color: '#fdfdfd', symbol: '#222222' }).catch(() => {}); }, 200);
    vid.muted = !sound;
    vid.addEventListener('playing', () => { s.classList.add('has-video'); }, { once: true });
    vid.addEventListener('ended', () => { minDone = true; tryClose(); }, { once: true });
    vid.addEventListener('error', () => { s.classList.remove('has-video', 'wants-video'); }, { once: true });
    setTimeout(() => { if (!s.classList.contains('has-video')) s.classList.remove('wants-video'); }, 3000); // si el video no arranca, vuelve la animación de siempre
    const p = vid.play();
    if (p && p.catch) p.catch(() => { vid.muted = true; vid.play().catch(() => { s.classList.remove('wants-video'); }); });
  }
  window.api.getSettings().then((st) => {
    const resumed = new URLSearchParams(location.search).get('resume') === '1';
    if ((st && st.intro === false) || resumed) { s.classList.remove('wants-video'); minDone = true; if (ready) close(); else window.addEventListener('nova-ready', close, { once: true }); return; }
    playIntro(!st || st.introSound !== false);
  }).catch(() => playIntro(true));
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
  whatsnew: ['Novedades y soporte', 'Lo nuevo de cada versión y cómo pedir ayuda'],
  versions: ['Versiones', 'Elige una versión de Minecraft y juega'],
  servers: ['Servidores de prueba', 'Crea, prueba y exporta tu servidor'],
  account: ['Cuenta', 'Inicia sesión como premium o no premium']
};

/* ---------- avisos emergentes ---------- */
function toast(text, kind) {
  const box = $('toasts');
  const t = el('div', kind === 'error' ? 'toast error' : 'toast', maskNick(text));
  box.append(t);
  try { if (window.NovaSound) window.NovaSound.event(kind === 'error' ? 'error' : kind === 'info' ? 'info' : 'ok'); } catch {}
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
// Ajustes es una ventana superpuesta: se abre encima de la pantalla actual y al cerrarla vuelves a ella.
let settingsReturnFocus = null;
function openSettings() {
  const o = $('page-settings');
  if (o.classList.contains('open')) return;
  settingsReturnFocus = document.activeElement;
  o.classList.add('open');
  document.querySelectorAll('.tab-btn[data-tab="settings"]').forEach((b) => b.classList.add('overlay-open'));
  $('so-close').focus();
}
function closeSettings() {
  const o = $('page-settings');
  if (!o.classList.contains('open')) return;
  o.classList.remove('open');
  document.querySelectorAll('.tab-btn[data-tab="settings"]').forEach((b) => b.classList.remove('overlay-open'));
  if (settingsReturnFocus && settingsReturnFocus.focus) { try { settingsReturnFocus.focus(); } catch {} }
  settingsReturnFocus = null;
}
document.addEventListener('click', (e) => { if (e.target.id === 'page-settings' || e.target.closest('#so-close')) closeSettings(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('page-settings').classList.contains('open') && !document.querySelector('dialog[open]')) { e.preventDefault(); closeSettings(); } });
function goTo(tab) {
  if (tab === 'settings') { openSettings(); return; }
  closeSettings();
  if (!navHist.skip && navHist.stack[navHist.i] !== tab) {
    navHist.stack = navHist.stack.slice(0, navHist.i + 1);
    navHist.stack.push(tab);
    navHist.i = navHist.stack.length - 1;
  }
  navHist.skip = false;
  setTimeout(navButtons, 0);
  const navTab = tab === 'mods' ? 'event' : tab; // los mods del evento cuelgan de la pestaña Evento
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === navTab));
  // Al entrar a Modpacks desde otra pestaña se ve la biblioteca (no la última instancia abierta).
  if (tab === 'modpacks' && !$('page-modpacks').classList.contains('active')) { mp.pack = null; showView('library'); }
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
  if (tab === 'whatsnew' && !isAdmin) { goTo('home'); return; } // Novedades: solo administradores por ahora
  if (tab === 'mods') renderMods();
  if (tab === 'modpacks') openModpacks();
  if (tab === 'admin') { loadAdmin(); if (window.adminEntered) window.adminEntered(); } else if (window.adminLeft) window.adminLeft();
  if (tab === 'home') renderContinue();
  if (tab === 'whatsnew' && window.whatsnewShow) window.whatsnewShow();
  if (tab === 'servers' && window.serversShow) window.serversShow();
  if (tab === 'versions' && window.versionsShow) window.versionsShow();
}
document.querySelectorAll('[data-tab]').forEach((btn) => btn.addEventListener('click', () => goTo(btn.dataset.tab)));
