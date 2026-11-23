/* Arranque: se ejecuta cuando ya se cargaron todas las partes de la interfaz (antes estaba en medio de app.js). */

(async function paintStorage() {
  const box = $('storage-list');
  if (!box) return;
  try {
    const rows = await window.api.systemStorage();
    const max = Math.max(1, ...rows.map((r) => r.bytes));
    const fmt = (b) => (b >= 1073741824 ? `${(b / 1073741824).toFixed(1)} GB` : `${Math.max(1, Math.round(b / 1048576))} MB`);
    box.replaceChildren(...rows.map((r) => { const d = el('div', 'st-row'); const bar = el('i'); bar.style.width = `${Math.max(3, Math.round(r.bytes / max * 100))}%`; d.append(el('span', '', r.name), el('small', 'muted', fmt(r.bytes)), bar); return d; }));
  } catch {}
})();

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
  $('ram-hint').textContent = `Tu equipo tiene ${sys.totalRamGb} GB en total y ahora tienes ${sys.freeRamGb} GB libres. Deja al menos 2 GB para el sistema.`;
  { const rr = $('ram').closest('.range-row'); if (rr && !rr.nextElementSibling?.classList.contains('range-ends')) { const ends = el('div', 'range-ends muted'); ends.append(el('span', '', '1 GB'), el('span', '', `${maxRam} GB`)); rr.after(ends); } }
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
  // Un administrador acaba de publicar: se recarga al instante (sin esperar al reloj de 3 minutos).
  if (window.api.onContentChanged) window.api.onContentChanged(() => { window.refreshContent(); toast('Se actualizó el contenido del evento.', 'info'); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastContent > 60 * 1000) window.refreshContent(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshServer(); });
  window.__novaReady = true;
  window.dispatchEvent(new Event('nova-ready'));
})();
