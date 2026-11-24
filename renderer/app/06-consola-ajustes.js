/* Interfaz del launcher — Contraseña de instalación, consola, ajustes, actualizaciones del programa e idioma. (parte de lo que antes era app.js; se carga en este orden desde index.html). */

/* ---------- contraseña de instalación ---------- */
function askPassword(wrong) {
  return new Promise((resolve) => {
    const modal = $('pw-modal');
    const input = $('pw-input');
    input.value = '';
    input.type = 'password';
    $('pw-eye').textContent = 'Ver';
    $('pw-forgot-text').hidden = true;
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
    $('pw-eye').onclick = () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      $('pw-eye').textContent = show ? 'Ocultar' : 'Ver';
      $('pw-eye').setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
      input.focus();
    };
    $('pw-forgot').onclick = () => { $('pw-forgot-text').hidden = !$('pw-forgot-text').hidden; };
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

async function startGame(preset = '') {
  let password = preset;
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
  // La contraseña del evento se pide ANTES de la pantalla de carga.
  let firstPassword = '';
  try {
    if (await window.api.eventNeedsPassword()) {
      let wrong = false;
      for (;;) {
        const typed = await askPassword(wrong);
        if (typed === null) return;
        if (await window.api.eventCheckPassword(typed)) { firstPassword = typed; break; }
        wrong = true;
      }
    }
  } catch {}
  setPlaying(true);
  showCrash(null);
  $('status').textContent = 'Preparando…';
  $('np-status').textContent = 'Preparando…';
  try {
    await startGame(firstPassword);
  } catch (err) {
    $('status').textContent = `No se pudo iniciar: ${cleanError(err)}`;
    $('progress').hidden = true;
    setPlaying(false);
    toast(`No se pudo iniciar: ${cleanError(err)}`, 'error');
  }
});

window.api.onStatus((d) => {
  $('np-status').textContent = d.text;
  if (window.NovaLaunchPanel) window.NovaLaunchPanel.status(d.text);
  if (!launchTarget || launchTarget.kind === 'event') $('status').textContent = d.text;
});

let dlTimer = 0;
function topDownload(pct, title, text) {
  if (window.Downloads) window.Downloads.progressAuto('game', title || 'Descargando archivos del juego', text || '', pct);
}
window.api.onProgress((d) => {
  if (!d.total) return;
  const text = d.type === 'java' ? `Instalando Java… ${Math.round(d.task)}%` : `Descargando archivos del juego (${d.task} de ${d.total})`;
  topDownload(Math.min(100, Math.round(d.type === 'java' ? d.task : (d.task / d.total) * 100)), d.type === 'java' ? 'Instalando Java' : 'Descargando archivos del juego', text);
  const npBar = $('np-progress');
  npBar.hidden = false;
  npBar.max = d.total;
  npBar.value = d.task;
  $('np-status').textContent = text;
  if (window.NovaLaunchPanel) window.NovaLaunchPanel.progress(d.task, d.total, text);
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
  if (window.NovaGameEvents && window.NovaGameEvents.feed) { try { window.NovaGameEvents.feed(line); } catch {} }
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

window.api.onLog((d) => { logAdd(`[${d.source}] ${d.line}`); if (window.NovaLaunchPanel) window.NovaLaunchPanel.log(d.line, d.source); });
window.__novaGameCtx = () => ({ target: launchTarget, packs: mp.installed, links: lastEventLinks, event: eventInfo });
window.goTo = goTo;
$('np').addEventListener('click', () => { if (window.NovaLaunchPanel && window.NovaLaunchPanel.isOpen()) window.NovaLaunchPanel.reopen(); });

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

// Reporte corto para pegar en el canal de comentarios (Discord/Trello): versión, sistema, cuenta, qué se jugó y el final del registro.
$('log-report').addEventListener('click', async () => {
  const btn = $('log-report');
  let ver = '?';
  try { ver = (await window.api.getConfig()).version || '?'; } catch {}
  const plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '?';
  const acct = currentUser ? (currentUser.mode === 'premium' ? 'premium (Microsoft)' : 'no premium (nick local)') : 'sin sesión';
  const target = launchTarget && launchTarget.title ? launchTarget.title : '(ninguno en curso)';
  const tail = logLines.slice(-40).map((l) => (l.length > 260 ? `${l.slice(0, 260)}… [recortado]` : l));
  const text = [
    '**Reporte de Nova PX Launcher**',
    `Versión: ${ver} · Sistema: ${plat}`,
    `Cuenta: ${acct}`,
    `Jugando/último: ${target}`,
    'Qué pasó: (escríbelo aquí)',
    '```',
    ...tail,
    '```'
  ].join('\n');
  try {
    await navigator.clipboard.writeText(maskNick(text));
    btn.textContent = 'Copiado ✓';
  } catch {
    btn.textContent = 'No se pudo copiar';
  }
  setTimeout(() => (btn.textContent = 'Copiar reporte'), 1800);
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
    autoBackup: $('auto-backup').checked,
    shareActivity: $('share-activity').checked,
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
  $('auto-backup').checked = s.autoBackup !== false;
  $('share-activity').checked = s.shareActivity !== false;
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

// Espacio que ocupa cada carpeta del juego.
$('sync-profiles').addEventListener('click', async () => {
  try { const r = await window.api.modpackSyncSettings(); $('sync-msg').textContent = r.changed ? `Listo: ${r.changed} perfil(es) ahora usan los ajustes de aquí.` : 'Todos tus perfiles ya usaban los ajustes de aquí.'; } catch (e) { $('sync-msg').textContent = cleanError(e); }
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
    // El avance va al botón de descargas de arriba (con su historial), no a una barra en medio de la pantalla.
    banner.hidden = true;
    const n = Math.max(0, Math.min(100, Math.round(s.percent || 0)));
    window.Downloads.progress('update', `Actualización ${s.version || 'nueva'} del launcher`, 'Se instalará al reiniciar. Puedes seguir usándolo.', n);
    line.textContent = `Descargando la versión ${s.version || 'nueva'} (${s.percent || 0}%).`;
  } else if (s.state === 'ready') {
    window.Downloads.done('update', true, `Versión ${s.version} lista para instalar`);
    banner.hidden = true; // sin franja verde: solo el botón discreto de arriba
    const tu = $('top-update');
    if (tu) { tu.hidden = false; $('top-update-text').textContent = `Actualizar a ${s.version}`; }
    const uc = $('update-check');
    if (uc) { uc.textContent = 'Reiniciar e instalar'; uc.dataset.ready = '1'; }
    if (!window.__readyToast) {
      window.__readyToast = true;
      toast(`Nueva versión ${s.version} lista para instalar`);
    }
    line.textContent = `La versión ${s.version} está lista para instalar.`;
  } else {
    banner.hidden = true;
    { const tu = $('top-update'); if (tu) tu.hidden = true; const uc = $('update-check'); if (uc) { uc.textContent = 'Buscar actualizaciones'; delete uc.dataset.ready; } }
    if (s.state === 'error') window.Downloads.done('update', false, 'No se pudo descargar la actualización');
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

$('top-update').addEventListener('click', async () => {
  try { await window.api.installUpdate(); } catch (err) { toast(cleanError(err)); }
});

$('update-check').addEventListener('click', async () => {
  const btn = $('update-check');
  if (btn.dataset.ready) { try { await window.api.installUpdate(); } catch (err) { toast(cleanError(err)); } return; }
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
