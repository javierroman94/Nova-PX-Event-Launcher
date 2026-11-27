/*
 * Amigos 2.0 (proceso principal): conexión en tiempo real con el Worker, avisos del sistema, estados,
 * ausente automático, bloquear/silenciar, invitaciones a jugar, party y verificación del nick premium.
 * El token de Minecraft solo se usa para avisar a Mojang (servidores de sesión oficiales); nunca va al Worker.
 */
'use strict';

const WebSocket = require('ws');

const NICK = /^[A-Za-z0-9_]{3,16}$/;
const STATUSES = ['online', 'away', 'dnd', 'invisible'];

module.exports = function (ctx) {
  const {
    ipcMain, Notification, powerMonitor, USAGE_URL, getSession, getPresenceToken, presenceCall, readSettings, writeSettings,
    send, getMainWindow, showWindow, getLaunching, freshPremium, getExtras, loadData, readModpacks, packs, serversLib, pushLog
  } = ctx;

  let ws = null;
  let wsNick = '';
  let retry = 0;
  let reconnectTimer = null;
  let pingTimer = null;
  let myStatus = 'online';
  let autoAway = false;
  let verifiedNick = '';
  let verifyTried = '';

  const enabled = () => {
    const s = getSession();
    return !!(USAGE_URL && s && NICK.test(s.name || '') && readSettings().shareUsage !== false);
  };
  const muted = (nick) => (readSettings().mutedFriends || []).some((n) => n.toLowerCase() === String(nick).toLowerCase());

  /* ---------- verificación del nick premium ---------- */
  async function post(op, body) {
    try {
      const r = await fetch(`${USAGE_URL}/presence/${op}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
      let data = {};
      try { data = await r.json(); } catch {}
      return { ok: r.ok, status: r.status, data };
    } catch { return { ok: false, status: 0, data: {} }; }
  }
  async function verifyNick() {
    const s = getSession();
    if (!s || s.mode !== 'premium' || !s.auth || !NICK.test(s.name || '')) return false;
    if (verifiedNick === s.name) return true;
    try { await freshPremium(); } catch { return false; }
    const token = getPresenceToken();
    if (!token) return false; // sin llavero seguro no hay token de presencia
    const ch = await post('challenge', { nick: s.name, token });
    const serverId = ch.ok && /^[0-9a-f]{20,40}$/.test(String(ch.data.serverId || '')) ? ch.data.serverId : '';
    if (!serverId) return false;
    try {
      // Igual que al entrar a un servidor premium: Mojang anota que esta cuenta "entró" con ese código.
      const j = await fetch('https://sessionserver.mojang.com/session/minecraft/join', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000),
        body: JSON.stringify({ accessToken: s.auth.access_token, selectedProfile: String(s.auth.uuid || '').replace(/-/g, ''), serverId })
      });
      if (j.status !== 204 && !j.ok) return false;
    } catch { return false; }
    const v = await post('verify', { nick: s.name, token });
    if (v.ok && v.data.verified) {
      verifiedNick = s.name;
      pushLog('launcher', '[Nova] Tu nick quedó verificado con tu cuenta premium.');
      return true;
    }
    return false;
  }
  // Llamada al Worker que, si el nick está ocupado por otra instalación y la cuenta es premium, lo recupera y reintenta.
  async function call(op, body, ms) {
    let r = await presenceCall(op, body, ms);
    if (!r.ok && (r.error === 'auth' || r.error === 'verified_owner')) {
      const s = getSession();
      if (s && s.mode === 'premium' && verifyTried !== `${s.name}|${op}`) {
        verifyTried = `${s.name}|${op}`;
        if (await verifyNick()) r = await presenceCall(op, body, ms);
      }
    }
    return r;
  }
  // Después de un sync correcto: si es premium y aún no está verificado, se verifica en segundo plano (una vez por sesión).
  function afterSync(data) {
    const s = getSession();
    if (!data || !data.me || !s) return;
    myStatus = STATUSES.includes(data.me.status) ? data.me.status : 'online';
    if (data.me.verified) verifiedNick = s.name;
    else if (s.mode === 'premium' && verifyTried !== `${s.name}|bg`) { verifyTried = `${s.name}|bg`; verifyNick().catch(() => {}); }
  }

  /* ---------- tiempo real ---------- */
  function notify(title, body, open) {
    const st = readSettings();
    if (st.notifyFriends === false || myStatus === 'dnd' || !Notification || !Notification.isSupported()) return;
    const win = getMainWindow();
    if (win && !win.isDestroyed() && win.isVisible() && win.isFocused()) return; // con el launcher delante basta el aviso interno
    try {
      const n = new Notification({ title, body, silent: false });
      n.on('click', () => { showWindow(); send('friends:open', open || {}); });
      n.show();
    } catch {}
  }
  function handle(evt) {
    if (!evt || typeof evt !== 'object' || typeof evt.t !== 'string') return;
    const from = NICK.test(String(evt.from || '')) ? evt.from : '';
    const nick = NICK.test(String(evt.nick || '')) ? evt.nick : '';
    send('friends:event', { t: evt.t, from, nick, on: evt.on === true, party: evt.party === true });
    if (evt.t === 'msg' && from && !muted(from)) notify(from, 'Te envió un mensaje', { chat: from });
    if (evt.t === 'req' && from) notify('Solicitud de amistad', `${from} quiere ser tu amigo`, {});
    if (evt.t === 'invite' && from && !muted(from)) notify(evt.party ? 'Tu party va a jugar' : 'Invitación a jugar', `${from} te invita a jugar`, {});
    if (evt.t === 'party_inv' && from && !muted(from)) notify('Invitación a una party', `${from} te invitó a su party`, {});
    if (evt.t === 'presence' && nick && evt.on && readSettings().notifyFriendsOnline && !muted(nick)) notify(nick, 'Se conectó', {});
  }
  function stop() {
    clearTimeout(reconnectTimer); reconnectTimer = null;
    clearInterval(pingTimer); pingTimer = null;
    if (ws) { try { ws.removeAllListeners(); ws.on('error', () => {}); ws.terminate(); } catch {} }
    ws = null; wsNick = '';
  }
  function schedule() {
    clearTimeout(reconnectTimer);
    const wait = Math.min(60000, 2000 * 2 ** Math.min(retry, 5)) + Math.floor(Math.random() * 1500);
    retry++;
    reconnectTimer = setTimeout(connect, wait);
    if (reconnectTimer.unref) reconnectTimer.unref();
  }
  function connect() {
    if (!enabled() || !getPresenceToken()) { stop(); return; }
    const s = getSession();
    if (ws && wsNick === s.name) return;
    stop();
    wsNick = s.name;
    let sock;
    try {
      sock = new WebSocket(`${USAGE_URL.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')}/presence/ws?nick=${encodeURIComponent(s.name)}`, { handshakeTimeout: 10000, maxPayload: 16 * 1024 });
    } catch { schedule(); return; }
    ws = sock;
    sock.on('open', () => {
      retry = 0;
      sock.send(JSON.stringify({ op: 'auth', token: getPresenceToken() }));
      pingTimer = setInterval(() => { try { sock.send('{"op":"ping"}'); } catch {} }, 45000);
      if (pingTimer.unref) pingTimer.unref();
    });
    sock.on('message', (data) => {
      let evt;
      try { evt = JSON.parse(String(data)); } catch { return; }
      if (evt && evt.t === 'hello') send('friends:event', { t: 'presence' });
      else if (evt && evt.t !== 'pong') handle(evt);
    });
    sock.on('close', (code) => {
      clearInterval(pingTimer); pingTimer = null;
      if (ws !== sock) return;
      ws = null; wsNick = '';
      // El nick lo tiene otra instalación: si la cuenta es premium se intenta recuperarlo antes de reconectar.
      if (code === 4001) { const se = getSession(); if (se && se.mode === 'premium') verifyNick().catch(() => {}); retry = Math.max(retry, 3); }
      schedule();
    });
    sock.on('error', () => {});
  }
  // Revisa cada 20 s si hay que conectar, cambiar de nick o desconectar (sesión cerrada o «compartir uso» apagado).
  const watch = setInterval(() => {
    const s = getSession();
    if (!enabled()) { if (ws) stop(); return; }
    if (!ws && !reconnectTimer) connect();
    else if (ws && s && wsNick !== s.name) { stop(); connect(); }
  }, 20000);
  if (watch.unref) watch.unref();
  setTimeout(connect, 6000).unref();

  /* ---------- ausente automático (10 min sin tocar la PC) ---------- */
  const idle = setInterval(async () => {
    if (!enabled() || !powerMonitor) return;
    let secs = 0;
    try { secs = powerMonitor.getSystemIdleTime(); } catch { return; }
    if (myStatus === 'online' && secs > 600 && !getLaunching()) {
      const r = await call('status', { status: 'away', smsg: '' });
      if (r.ok) { myStatus = 'away'; autoAway = true; send('friends:event', { t: 'presence' }); }
    } else if (autoAway && myStatus === 'away' && secs < 60) {
      const r = await call('status', { status: 'online', smsg: '' });
      if (r.ok) { myStatus = 'online'; autoAway = false; send('friends:event', { t: 'presence' }); }
    }
  }, 60000);
  if (idle.unref) idle.unref();

  /* ---------- invitaciones ---------- */
  const shareCache = new Map(); // id del perfil -> { code, at } (no crear un código nuevo en cada invitación)
  async function buildInvite(what) {
    const w = what && typeof what === 'object' ? what : {};
    if (w.kind === 'event') {
      let name = 'Evento';
      try { const m = await loadData('manifest'); name = (m.event && m.event.name) || name; } catch {}
      return { k: 'event', t: String(name).slice(0, 60) };
    }
    if (w.kind !== 'pack') throw new Error('Elige a qué quieres invitar.');
    const entry = readModpacks().find((x) => x.id === String(w.id || ''));
    if (!entry || entry.protected) throw new Error('Ese perfil ya no existe.');
    let hit = shareCache.get(entry.id);
    if (!hit || Date.now() - hit.at > 20 * 60 * 60 * 1000) {
      const r = await getExtras().createShareCode(entry.id);
      hit = { code: String(r.code).replace(/^NPX-/, ''), at: Date.now() };
      shareCache.set(entry.id, hit);
    }
    const inv = { k: 'pack', t: String(entry.title || 'Perfil').slice(0, 60), c: hit.code, mc: entry.mcVersion };
    // Si es un perfil propio con servidores guardados, el amigo entra directo al primero.
    if (packs.isOwnPack(entry)) {
      const srv = serversLib.findPackServer(ctx.instanceDir(ctx.GAME_DIR, { event: { id: entry.id } }));
      if (srv) inv.s = srv.port === 25565 ? srv.host : `${srv.host}:${srv.port}`;
    }
    return inv;
  }
  const fail = (r) => { throw new Error(ctx.friendError(r.error)); };
  const nickOf = (n) => { const s = String(n || '').trim(); if (!NICK.test(s)) throw new Error(ctx.friendError('bad_nick')); return s; };

  ipcMain.handle('friends:status', async (_e, status, smsg) => {
    const st = STATUSES.includes(status) ? status : 'online';
    const r = await call('status', { status: st, smsg: String(smsg || '').slice(0, 60) });
    if (!r.ok) fail(r);
    myStatus = st; autoAway = false;
    return true;
  });
  for (const [ch, op] of [['friends:block', 'block'], ['friends:unblock', 'unblock']]) {
    ipcMain.handle(ch, async (_e, nick) => { const r = await call(op, { to: nickOf(nick) }); if (!r.ok) fail(r); return true; });
  }
  ipcMain.handle('friends:mute', (_e, nick, on) => {
    const n = nickOf(nick);
    const st = readSettings();
    const list = (st.mutedFriends || []).filter((x) => x.toLowerCase() !== n.toLowerCase());
    if (on) list.push(n);
    writeSettings({ ...st, mutedFriends: list.slice(-200) });
    return list;
  });
  ipcMain.handle('friends:invite', async (_e, nick, what) => {
    const to = nickOf(nick);
    const inv = await buildInvite(what);
    const r = await call('invite', { to, inv });
    if (!r.ok) fail(r);
    return true;
  });
  ipcMain.handle('friends:dismiss', async (_e, id) => {
    const r = await call('dismiss', { id: String(id || '').slice(0, 40) });
    if (!r.ok) fail(r);
    return true;
  });
  // Aceptar una invitación: el evento se juega tal cual; un perfil se importa con su código (si no lo tienes ya).
  ipcMain.handle('friends:join', async (_e, inv) => {
    const v = inv && typeof inv === 'object' ? inv : {};
    if (v.k === 'event') return { event: true };
    const code = String(v.c || '').toUpperCase();
    if (!/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{7}$/.test(code)) throw new Error('Esa invitación no es válida.');
    let entry = readModpacks().find((x) => x.shareCode === code);
    if (!entry) entry = (await getExtras().importShareCode(code)).entry;
    const host = serversLib.parseAddress(String(v.s || '')) ? String(v.s) : '';
    return { packId: entry.id, joinHost: host };
  });
  ipcMain.handle('friends:party', async (_e, action, arg) => {
    const a = ['create', 'leave', 'join', 'invite', 'kick', 'start'].includes(action) ? action : '';
    if (!a) throw new Error('Acción no válida.');
    const body = { a };
    if (a === 'invite' || a === 'kick') body.to = nickOf(arg);
    if (a === 'join') body.id = String(arg || '').slice(0, 40);
    if (a === 'start') body.inv = await buildInvite(arg);
    const r = await call('party', body);
    if (!r.ok) fail(r);
    return true;
  });
  ipcMain.handle('chat:typing', (_e, to) => {
    if (ws && ws.readyState === WebSocket.OPEN && NICK.test(String(to || ''))) { try { ws.send(JSON.stringify({ op: 'typing', to: String(to) })); } catch {} }
    return true;
  });
  ipcMain.handle('friends:verify', async () => verifyNick());

  return { call, afterSync, connect, stop, status: () => myStatus, verifiedFor: (n) => verifiedNick === n };
};
