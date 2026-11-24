/* Interfaz del launcher — Estado del servidor, sesión, modo streamer, varias cuentas y botón de jugar. (parte de lo que antes era app.js; se carga en este orden desde index.html). */

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
    topText.textContent = `${s.players ? `${s.players.online} / ${s.players.max} en línea` : 'Servidor en línea'}${s.ms ? ` · ${s.ms} ms` : ''}`;
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
$('intro-sound').addEventListener('change', () => { window.api.saveSettings({ introSound: $('intro-sound').checked }).catch(() => {}); });
async function initStreamer(settings) {
  try { $('intro-on').checked = !settings || settings.intro !== false; $('intro-sound').checked = !settings || settings.introSound !== false; } catch {}
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

// Sin sesión no se ve el launcher: solo la pantalla para iniciar sesión o registrarse. Al entrar, se muestra el inicio.
function applyAuthGate(info) {
  const was = document.body.classList.contains('auth-gate');
  document.body.classList.toggle('auth-gate', !info);
  if (!info) { navHist.skip = true; goTo('account'); }
  else if (was) { goTo('home'); }
}
function setSession(info) {
  currentUser = info;
  applyAuthGate(info);
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
