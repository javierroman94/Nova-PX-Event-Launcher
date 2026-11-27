// Nova PX - contador de usuarios (Cloudflare Worker + KV).
// Guarda por instalación: nick (si inició sesión), si es premium, versión del launcher y sistema.
// No guarda IP ni nada más. Los registros inactivos se borran solos a los 180 días.
// Variables: KV "USERS" y secreto "ADMIN_KEY" (clave que solo conoce el administrador).
// Opcional: binding "LIMITER" (Rate Limiting de Cloudflare). Sin él se usa el límite en memoria de worker/limit.mjs.

import { createLimiter } from './limit.mjs';
import { createPack, getPack } from './pack.mjs';

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NICK = /^[A-Za-z0-9_]{0,16}$/;
const VERSION = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const OS = new Set(['win32', 'darwin', 'linux']);
const TTL = 60 * 60 * 24 * 180;
const WRITE_EVERY_MS = 6 * 60 * 60 * 1000; // el plan gratis de KV permite ~1000 escrituras al día

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

const limiter = createLimiter();
const ipOf = (request) => request.headers.get('CF-Connecting-IP') || 'local';
// ¿Esta IP todavía puede llamar a esta ruta? (máximo `max` por ventana)
async function allow(request, env, name, max, windowMs) {
  const key = `${name}:${ipOf(request)}`;
  if (env.LIMITER && typeof env.LIMITER.limit === 'function') {
    try { if (!(await env.LIMITER.limit({ key })).success) return false; } catch {}
  }
  return limiter.hit(key, max, windowMs);
}
const tooMany = () => new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '60', 'Cache-Control': 'no-store' } });

const digest = async (text) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
const ADMIN_FAILS = 8;
const ADMIN_WINDOW = 10 * 60 * 1000;

// Compara los hashes (no las claves): el tiempo no depende de la longitud ni de cuántos caracteres coinciden.
async function checkAdmin(request, env) {
  const key = env.ADMIN_KEY || '';
  if (!key || key.length < 16) return false;
  const got = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const [a, b] = await Promise.all([digest(key), digest(got)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Devuelve 'ok', 'no' (clave incorrecta) o 'bloqueada' (demasiados intentos fallidos desde esta IP).
async function adminStatus(request, env) {
  const fk = `admfail:${ipOf(request)}`;
  if (limiter.count(fk, ADMIN_WINDOW) >= ADMIN_FAILS) return 'bloqueada';
  if (await checkAdmin(request, env)) return 'ok';
  if (env.ADMIN_LIMITER && typeof env.ADMIN_LIMITER.limit === 'function') {
    try {
      if (!(await env.ADMIN_LIMITER.limit({ key: fk })).success) return 'bloqueada';
    } catch {
      return 'bloqueada';
    }
  }
  limiter.hit(fk, ADMIN_FAILS, ADMIN_WINDOW);
  return 'no';
}
const denied = (st) => (st === 'bloqueada' ? tooMany() : json({ error: 'unauthorized' }, 401));

// Anuncios válidos: los de data/ads.json del repositorio (caché de 5 min). Evita que cualquiera invente claves en KV.
const ADS_URL = 'https://raw.githubusercontent.com/javierroman94/Nova-PX-Event-Launcher/main/data/ads.json';
const ADS_ID = /^[a-z0-9-]{1,40}$/;
let adsCache = { at: 0, ids: null };
async function knownAdIds() {
  if (adsCache.ids && Date.now() - adsCache.at < 5 * 60 * 1000) return adsCache.ids;
  try {
    const r = await fetch(ADS_URL, { cf: { cacheTtl: 60 } });
    if (r.ok) {
      const list = await r.json();
      const ids = new Set((Array.isArray(list) ? list : []).map((x) => String((x && x.id) || '')).filter((id) => ADS_ID.test(id)));
      adsCache = { at: Date.now(), ids };
      return ids;
    }
  } catch {}
  return adsCache.ids; // null si nunca se pudo leer
}

async function handlePing(request, env) {
  const text = await request.text();
  if (text.length > 1024) return json({ error: 'too_big' }, 413);
  let b;
  try { b = JSON.parse(text); } catch { return json({ error: 'bad_json' }, 400); }
  if (!ID.test(String(b.id || '')) || !NICK.test(String(b.nick || '')) || !VERSION.test(String(b.version || '')) || !OS.has(String(b.os || ''))) {
    return json({ error: 'bad_data' }, 400);
  }
  const key = `u:${b.id}`;
  const now = Date.now();
  const old = await env.USERS.get(key, 'json');
  const next = {
    nick: String(b.nick), premium: !!b.premium && !!b.nick, version: b.version, os: b.os,
    first: old ? old.first : now, last: now, count: (old ? old.count : 0) + 1
  };
  const changed = !old || old.nick !== next.nick || old.version !== next.version || old.premium !== next.premium;
  if (changed || now - old.last > WRITE_EVERY_MS) await env.USERS.put(key, JSON.stringify(next), { expirationTtl: TTL });
  return json({ ok: true });
}

async function listUsers(env) {
  const users = [];
  let cursor;
  do {
    const page = await env.USERS.list({ prefix: 'u:', cursor, limit: 1000 });
    for (const k of page.keys) {
      const v = await env.USERS.get(k.name, 'json');
      if (v) users.push({ id: k.name.slice(2), ...v });
      if (users.length >= 2000) return users;
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return users;
}

// Cifras públicas (sin nombres): total de instalaciones y activas en 24 h / 7 días. Se guardan 10 min para no gastar lecturas.
async function stats(env) {
  const now = Date.now();
  const cached = await env.USERS.get('stats', 'json');
  if (cached && now - cached.at < 10 * 60 * 1000) return cached;
  const users = await listUsers(env);
  const out = { at: now, total: users.length, day: 0, week: 0 };
  for (const u of users) {
    if (now - u.last < 86400000) out.day++;
    if (now - u.last < 7 * 86400000) out.week++;
  }
  await env.USERS.put('stats', JSON.stringify(out), { expirationTtl: 3600 });
  return out;
}

// ---- Amigos, estado en línea y chat (Durable Object con almacenamiento propio: no gasta escrituras de KV) ----
// Cada instalación manda un token secreto; el primero que reclama un nick lo conserva (el token se guarda hasheado).
const ONLINE_MS = 150 * 1000;
const NICKRE = /^[A-Za-z0-9_]{3,16}$/;
const TOKRE = /^[A-Za-z0-9_-]{16,64}$/;
const MAX_FRIENDS = 50;
const MAX_MSGS = 200;
const MAX_BLOCKED = 200;
const MAX_INVITES = 10;
const MAX_PARTY = 8;
const INVITE_MS = 30 * 60 * 1000;
const STATUSES = new Set(['online', 'away', 'dnd', 'invisible']);
const OPS = new Set(['sync', 'leave', 'request', 'accept', 'remove', 'send', 'poll', 'status', 'block', 'unblock', 'invite', 'dismiss', 'party', 'challenge', 'verify']);
const cleanText = (v, max) => String(v || '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const randomId = () => [...crypto.getRandomValues(new Uint8Array(8))].map((x) => x.toString(16).padStart(2, '0')).join('');
// Invitación a jugar: evento o perfil (con su código para importarlo) y, opcional, el servidor donde entrar.
const SRV_RE = /^[A-Za-z0-9._-]{1,253}(:\d{1,5})?$/;
function cleanInvite(v) {
  if (!v || typeof v !== 'object') return null;
  const k = v.k === 'event' ? 'event' : v.k === 'pack' ? 'pack' : '';
  const t = cleanText(v.t, 60);
  if (!k || !t) return null;
  const out = { k, t };
  if (k === 'pack') {
    const c = String(v.c || '').toUpperCase();
    if (!/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{7}$/.test(c)) return null;
    out.c = c;
    const s = String(v.s || '');
    if (s && SRV_RE.test(s)) out.s = s;
    const mc = String(v.mc || '');
    if (/^[0-9A-Za-z.+_-]{2,24}$/.test(mc)) out.mc = mc;
  }
  return out;
}

async function sha256(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
const low = (n) => String(n).toLowerCase();
const pairKey = (a, b) => 'c:' + [low(a), low(b)].sort().join('|');
const has = (list, n) => list.some((x) => low(x) === low(n));
const without = (list, n) => list.filter((x) => low(x) !== low(n));
// Lo que un jugador decide mostrar a sus amigos: qué juega (texto corto) y sus horas jugadas. null = no mostrar nada.
function cleanAct(a) {
  if (a === null) return null;
  if (!a || typeof a !== 'object') return undefined;
  const g = String(a.g || '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 48);
  const h = Number.isInteger(a.h) && a.h >= 0 && a.h <= 1000000 ? a.h : null;
  return { g, h };
}

export class Presence {
  constructor(state, env) {
    this.state = state;
    this.st = state.storage;
    this.env = env || {};
    this.cache = new Map();
    this.rate = new Map();
    this.typing = new Map();
  }
  async user(nick) {
    const k = low(nick);
    if (!this.cache.has(k)) {
      if (this.cache.size > 3000) this.cache.clear();
      this.cache.set(k, (await this.st.get('u:' + k)) || { n: nick, f: [], i: [], o: [], seen: 0, playing: false, r: {} });
    }
    const u = this.cache.get(k);
    if (!Array.isArray(u.b)) u.b = [];
    if (!Array.isArray(u.inv)) u.inv = [];
    if (!Array.isArray(u.pi)) u.pi = [];
    return u;
  }
  async save(u) { this.cache.set(low(u.n), u); await this.st.put('u:' + low(u.n), u); }
  async auth(b) {
    const nick = String(b.nick || '');
    const tok = String(b.token || '');
    if (!NICKRE.test(nick) || !TOKRE.test(tok)) return null;
    const u = await this.user(nick);
    const h = await sha256(tok);
    if (!u.h) { u.h = h; u.n = nick; await this.save(u); return u; }
    return u.h === h ? u : null;
  }
  sockets(nick) {
    try { return typeof this.state.getWebSockets === 'function' ? this.state.getWebSockets(low(nick)) : []; } catch { return []; }
  }
  // Conectado = latido reciente o una conexión en tiempo real abierta.
  online(u, now) { return !!u && (now - (u.seen || 0) <= ONLINE_MS || this.sockets(u.n).some((w) => { try { return (w.deserializeAttachment() || {}).ok; } catch { return false; } })); }
  visible(u, now) { return this.online(u, now) && u.st !== 'invisible'; }
  // Aviso al instante (si la otra persona tiene el launcher abierto). Solo es una pista: el launcher vuelve a pedir los datos.
  push(nick, evt) {
    const data = JSON.stringify(evt);
    for (const w of this.sockets(nick)) { try { if ((w.deserializeAttachment() || {}).ok) w.send(data); } catch {} }
  }
  pushFriends(u, evt) { for (const n of u.f) this.push(n, evt); }
  limited(key, max, ms) {
    const now = Date.now();
    const arr = (this.rate.get(key) || []).filter((t) => now - t < ms);
    if (arr.length >= max) { this.rate.set(key, arr); return true; }
    arr.push(now);
    this.rate.set(key, arr);
    if (this.rate.size > 5000) this.rate.delete(this.rate.keys().next().value);
    return false;
  }
  friendView(me, o, now, unread) {
    const vis = this.visible(o, now);
    const a = o.a && typeof o.a === 'object' ? o.a : null;
    return {
      nick: o.n, online: vis, playing: vis && !!o.playing, seen: o.st === 'invisible' ? 0 : o.seen || 0, unread,
      status: vis ? o.st || 'online' : 'offline', smsg: vis ? o.sm || '' : '',
      game: vis && o.playing && a ? a.g || '' : '', hours: a && Number.isInteger(a.h) ? a.h : null,
      verified: !!o.v, read: (o.r || {})[low(me.n)] || 0
    };
  }
  liveInvites(u, now) { return u.inv.filter((x) => now - x.at < INVITE_MS); }
  async partyView(me, now) {
    if (!me.pt) return null;
    const p = await this.st.get('p:' + me.pt);
    if (!p || !has(p.m, me.n)) { me.pt = null; await this.save(me); return null; }
    const members = [];
    for (const n of p.m) { const o = await this.user(n); members.push({ nick: o.n, online: this.visible(o, now) || low(o.n) === low(me.n), playing: this.visible(o, now) && !!o.playing }); }
    return { id: p.id, leader: p.l, members, invited: p.inv || [] };
  }
  async leaveParty(me) {
    if (!me.pt) return;
    const p = await this.st.get('p:' + me.pt);
    me.pt = null;
    await this.save(me);
    if (!p) return;
    p.m = without(p.m, me.n);
    if (!p.m.length) { await this.st.delete('p:' + p.id); return; }
    if (low(p.l) === low(me.n)) p.l = p.m[0];
    await this.st.put('p:' + p.id, p);
    for (const n of p.m) this.push(n, { t: 'party' });
  }

  // Quién está en línea ahora (solo lo pide el administrador, ya autenticado en el Worker).
  async onlineList(now) {
    const rows = await this.st.list({ prefix: 'u:' });
    const online = [];
    for (const u of rows.values()) if (u && now - (u.seen || 0) <= ONLINE_MS) online.push({ nick: u.n, playing: !!u.playing });
    return online.slice(0, 500);
  }

  // ---- tiempo real (WebSocket con hibernación: no gasta mientras nadie habla) ----
  async openSocket(request, url) {
    if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'upgrade' }, 426);
    const nick = String(url.searchParams.get('nick') || '');
    if (!NICKRE.test(nick)) return json({ error: 'bad_nick' }, 400);
    const old = this.sockets(nick);
    for (const w of old.slice(0, Math.max(0, old.length - 3))) { try { w.close(4000, 'replaced'); } catch {} }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server, [low(nick)]);
    server.serializeAttachment({ nick, ok: false });
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(ws, msg) {
    if (typeof msg !== 'string' || msg.length > 1024) return;
    let m;
    try { m = JSON.parse(msg); } catch { return; }
    const att = ws.deserializeAttachment() || {};
    if (!att.ok) {
      const me = m && m.op === 'auth' ? await this.auth({ nick: att.nick, token: m.token }) : null;
      if (!me) { try { ws.close(4001, 'auth'); } catch {} return; }
      ws.serializeAttachment({ nick: me.n, ok: true });
      const wasOn = Date.now() - (me.seen || 0) <= ONLINE_MS;
      me.seen = Date.now();
      await this.save(me);
      ws.send(JSON.stringify({ t: 'hello' }));
      if (!wasOn && me.st !== 'invisible') this.pushFriends(me, { t: 'presence', nick: me.n, on: true });
      return;
    }
    if (m.op === 'ping') { ws.send('{"t":"pong"}'); return; }
    if (m.op === 'typing') {
      const to = String(m.to || '');
      const me = await this.user(att.nick);
      if (NICKRE.test(to) && has(me.f, to) && !this.limited('ty:' + low(me.n), 30, 60000)) this.push(to, { t: 'typing', from: me.n });
    }
  }
  async webSocketClose(ws) {
    let att = {};
    try { att = ws.deserializeAttachment() || {}; } catch {}
    if (!att.ok) return;
    const me = await this.user(att.nick);
    me.seen = Date.now() - ONLINE_MS + 20000; // se ve desconectado enseguida si no vuelve
    await this.save(me);
    if (me.st !== 'invisible') this.pushFriends(me, { t: 'presence', nick: me.n, on: false });
  }
  async webSocketError(ws) { return this.webSocketClose(ws); }

  // ---- verificación del nick con la cuenta premium (servidores de sesión de Mojang) ----
  // El token de Minecraft nunca llega aquí: el launcher avisa a Mojang con él y este Worker solo pregunta a Mojang si lo hizo.
  async challenge(b) {
    const nick = String(b.nick || '');
    const tok = String(b.token || '');
    if (!NICKRE.test(nick) || !TOKRE.test(tok)) return json({ error: 'bad_nick' }, 400);
    if (this.limited('ch:' + low(nick), 6, 10 * 60000)) return json({ error: 'slow' }, 429);
    const bytes = crypto.getRandomValues(new Uint8Array(15));
    const sid = [...bytes].map((x) => x.toString(16).padStart(2, '0')).join('');
    await this.st.put('ch:' + low(nick), { sid, at: Date.now(), th: await sha256(tok) });
    return json({ serverId: sid });
  }
  async verify(b, fetchImpl = fetch) {
    const nick = String(b.nick || '');
    const tok = String(b.token || '');
    if (!NICKRE.test(nick) || !TOKRE.test(tok)) return json({ error: 'bad_nick' }, 400);
    const ch = await this.st.get('ch:' + low(nick));
    await this.st.delete('ch:' + low(nick));
    if (!ch || Date.now() - ch.at > 3 * 60000 || ch.th !== (await sha256(tok))) return json({ error: 'no_challenge' }, 400);
    let prof = null;
    try {
      const r = await fetchImpl(`https://sessionserver.mojang.com/session/minecraft/hasJoined?username=${encodeURIComponent(nick)}&serverId=${ch.sid}`);
      if (r.status === 200) prof = await r.json();
    } catch {}
    if (!prof || low(prof.name) !== low(nick)) return json({ error: 'not_verified' }, 403);
    const u = await this.user(nick);
    u.n = prof.name; // mayúsculas reales del nick
    u.h = ch.th; // esta instalación pasa a ser la dueña del nick (si alguien lo había tomado antes, lo pierde)
    u.v = true;
    await this.save(u);
    return json({ ok: true, verified: true });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const op = url.pathname.slice(1);
    const now = Date.now();
    if (op === '__online') return json({ online: await this.onlineList(now) });
    if (op === 'ws') return this.openSocket(request, url);
    let b = {};
    try { b = JSON.parse(await request.text()); } catch { return json({ error: 'bad_json' }, 400); }
    if (!b || typeof b !== 'object') b = {};
    if (!OPS.has(op)) return json({ error: 'not_found' }, 404);
    if (op === 'challenge') return this.challenge(b);
    if (op === 'verify') return this.verify(b);
    const me = await this.auth(b);
    if (!me) return json({ error: NICKRE.test(String(b.nick || '')) && (await this.user(String(b.nick))).v ? 'verified_owner' : 'auth' }, 401);

    if (op === 'leave') { me.seen = 0; await this.save(me); if (me.st !== 'invisible') this.pushFriends(me, { t: 'presence', nick: me.n, on: false }); return json({ ok: true }); }

    if (op === 'sync') {
      const act = cleanAct(b.act);
      const actChanged = act !== undefined && JSON.stringify(act) !== JSON.stringify(me.a || null);
      if (actChanged) me.a = act;
      const wasOn = now - (me.seen || 0) <= ONLINE_MS;
      const playChanged = me.playing !== !!b.playing;
      if (now - (me.seen || 0) > 30000 || playChanged || actChanged) { me.seen = now; me.playing = !!b.playing; await this.save(me); }
      if ((!wasOn || playChanged || actChanged) && me.st !== 'invisible') this.pushFriends(me, { t: 'presence', nick: me.n });
      const friends = [];
      const keys = me.f.map((n) => pairKey(me.n, n));
      const chats = keys.length ? await this.st.get(keys) : new Map();
      for (const n of me.f) {
        const o = await this.user(n);
        const msgs = chats.get(pairKey(me.n, n)) || [];
        const unread = msgs.filter((m) => low(m.f) === low(n) && m.id > ((me.r || {})[low(n)] || 0)).length;
        friends.push(this.friendView(me, o, now, unread));
      }
      friends.sort((x, y) => (y.online - x.online) || x.nick.localeCompare(y.nick));
      return json({
        friends, incoming: me.i, outgoing: me.o, blocked: me.b, now,
        me: { verified: !!me.v, status: me.st || 'online', smsg: me.sm || '' },
        invites: this.liveInvites(me, now), party: await this.partyView(me, now), partyInvites: me.pi.filter((x) => now - x.at < INVITE_MS)
      });
    }

    if (op === 'status') {
      const st = STATUSES.has(b.status) ? b.status : 'online';
      const sm = cleanText(b.smsg, 60);
      const was = me.st || 'online';
      me.st = st; me.sm = sm; me.seen = now;
      await this.save(me);
      if (was !== st || st !== 'invisible') this.pushFriends(me, { t: 'presence', nick: me.n });
      return json({ ok: true });
    }

    if (op === 'party') return this.party(me, b, now);
    if (op === 'dismiss') {
      const id = String(b.id || '');
      me.inv = me.inv.filter((x) => x.id !== id);
      me.pi = me.pi.filter((x) => x.id !== id);
      await this.save(me);
      return json({ ok: true });
    }

    const to = String(b.to || b.with || '');
    if (!NICKRE.test(to) || low(to) === low(me.n)) return json({ error: 'bad_nick' }, 400);

    if (op === 'block') {
      const o = await this.user(to);
      if (!has(me.b, to)) { me.b.push(o.n); while (me.b.length > MAX_BLOCKED) me.b.shift(); }
      for (const [x, y] of [[me, o], [o, me]]) { x.f = without(x.f, y.n); x.i = without(x.i, y.n); x.o = without(x.o, y.n); x.inv = x.inv.filter((v) => low(v.from) !== low(y.n)); await this.save(x); }
      await this.st.delete(pairKey(me.n, o.n));
      this.push(o.n, { t: 'removed' });
      return json({ ok: true });
    }
    if (op === 'unblock') { me.b = without(me.b, to); await this.save(me); return json({ ok: true }); }

    if (op === 'request') {
      if (has(me.f, to)) return json({ error: 'already' }, 409);
      if (has(me.b, to)) return json({ error: 'blocked_by_you' }, 409);
      if (me.f.length >= MAX_FRIENDS) return json({ error: 'full' }, 409);
      if (this.limited('rq:' + low(me.n), 15, 60 * 60000)) return json({ error: 'slow' }, 429);
      const o = await this.user(to);
      if (has(o.b, me.n)) return json({ ok: true, status: 'pending' }); // no se le avisa que lo bloquearon
      if (has(me.i, to)) return this.accept(me, o);
      if (!has(me.o, to)) {
        if (o.i.length >= MAX_FRIENDS) return json({ error: 'busy' }, 409);
        me.o.push(o.n); o.i.push(me.n);
        await this.save(me); await this.save(o);
        this.push(o.n, { t: 'req', from: me.n });
      }
      return json({ ok: true, status: 'pending' });
    }
    if (op === 'accept') {
      if (!has(me.i, to)) return json({ error: 'no_request' }, 404);
      return this.accept(me, await this.user(to));
    }
    if (op === 'remove') {
      const o = await this.user(to);
      for (const [x, y] of [[me, o], [o, me]]) { x.f = without(x.f, y.n); x.i = without(x.i, y.n); x.o = without(x.o, y.n); await this.save(x); }
      await this.st.delete(pairKey(me.n, o.n));
      this.push(o.n, { t: 'removed' });
      return json({ ok: true });
    }

    // lo que sigue: solo entre amigos
    if (!has(me.f, to)) return json({ error: 'not_friends' }, 403);

    if (op === 'invite') {
      const inv = cleanInvite(b.inv);
      if (!inv) return json({ error: 'bad_invite' }, 400);
      if (this.limited('iv:' + low(me.n), 20, 10 * 60000)) return json({ error: 'slow' }, 429);
      const o = await this.user(to);
      const item = { id: randomId(), from: me.n, at: now, ...inv };
      o.inv = [...this.liveInvites(o, now).filter((x) => low(x.from) !== low(me.n)), item].slice(-MAX_INVITES);
      await this.save(o);
      this.push(o.n, { t: 'invite', from: me.n });
      return json({ ok: true });
    }

    const key = pairKey(me.n, to);
    const msgs = (await this.st.get(key)) || [];
    if (op === 'send') {
      const text = String(b.text || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 500);
      if (!text) return json({ error: 'empty' }, 400);
      if (this.limited('ms:' + low(me.n), 20, 60000)) return json({ error: 'slow' }, 429);
      const id = (msgs.length ? msgs[msgs.length - 1].id : 0) + 1;
      msgs.push({ id, f: me.n, t: text, ts: now });
      while (msgs.length > MAX_MSGS) msgs.shift();
      await this.st.put(key, msgs);
      this.push(to, { t: 'msg', from: me.n });
      return json({ ok: true, id });
    }
    if (op === 'poll') {
      const since = Number(b.since) || 0;
      const last = msgs.length ? msgs[msgs.length - 1].id : 0;
      if ((me.r || {})[low(to)] !== last) { me.r = { ...(me.r || {}), [low(to)]: last }; await this.save(me); this.push(to, { t: 'read', from: me.n }); }
      const o = await this.user(to);
      const vis = this.visible(o, now);
      return json({ messages: msgs.filter((m) => m.id > since), online: vis, playing: vis && !!o.playing, status: vis ? o.st || 'online' : 'offline', read: (o.r || {})[low(me.n)] || 0 });
    }
    return json({ error: 'not_found' }, 404);
  }

  // ---- party: un grupo de amigos (hasta 8) que entra junto ----
  async party(me, b, now) {
    const a = String(b.a || '');
    let p = me.pt ? await this.st.get('p:' + me.pt) : null;
    if (me.pt && !p) { me.pt = null; await this.save(me); }
    const isLeader = p && low(p.l) === low(me.n);
    const notify = (pp) => { for (const n of pp.m) this.push(n, { t: 'party' }); };
    if (a === 'create') {
      if (p) return json({ error: 'in_party' }, 409);
      p = { id: randomId(), l: me.n, m: [me.n], inv: [], at: now };
      me.pt = p.id;
      await this.st.put('p:' + p.id, p); await this.save(me);
      return json({ ok: true, id: p.id });
    }
    if (a === 'leave') { await this.leaveParty(me); return json({ ok: true }); }
    if (a === 'join') {
      const id = String(b.id || '');
      const q = await this.st.get('p:' + id);
      me.pi = me.pi.filter((x) => x.id !== id);
      if (!q || !has(q.inv || [], me.n)) { await this.save(me); return json({ error: 'no_party' }, 404); }
      if (q.m.length >= MAX_PARTY) { await this.save(me); return json({ error: 'party_full' }, 409); }
      if (p) await this.leaveParty(me);
      q.inv = without(q.inv, me.n);
      q.m.push(me.n);
      me.pt = q.id;
      await this.st.put('p:' + q.id, q); await this.save(me);
      notify(q);
      return json({ ok: true });
    }
    if (!p) return json({ error: 'no_party' }, 404);
    if (!isLeader) return json({ error: 'not_leader' }, 403);
    const to = String(b.to || '');
    if (a === 'invite') {
      if (!NICKRE.test(to) || !has(me.f, to)) return json({ error: 'not_friends' }, 403);
      if (p.m.length + (p.inv || []).length >= MAX_PARTY) return json({ error: 'party_full' }, 409);
      const o = await this.user(to);
      if (!has(p.inv || [], o.n) && !has(p.m, o.n)) p.inv = [...(p.inv || []), o.n];
      o.pi = [...o.pi.filter((x) => x.id !== p.id), { id: p.id, from: me.n, at: now }].slice(-MAX_INVITES);
      await this.st.put('p:' + p.id, p); await this.save(o);
      this.push(o.n, { t: 'party_inv', from: me.n });
      return json({ ok: true });
    }
    if (a === 'kick') {
      if (!NICKRE.test(to) || low(to) === low(me.n)) return json({ error: 'bad_nick' }, 400);
      const o = await this.user(to);
      p.m = without(p.m, o.n); p.inv = without(p.inv || [], o.n);
      if (low(o.pt || '') === low(p.id)) { o.pt = null; await this.save(o); }
      await this.st.put('p:' + p.id, p);
      this.push(o.n, { t: 'party' });
      notify(p);
      return json({ ok: true });
    }
    if (a === 'start') {
      const inv = cleanInvite(b.inv);
      if (!inv) return json({ error: 'bad_invite' }, 400);
      for (const n of p.m) {
        if (low(n) === low(me.n)) continue;
        const o = await this.user(n);
        o.inv = [...this.liveInvites(o, now).filter((x) => low(x.from) !== low(me.n)), { id: randomId(), from: me.n, at: now, party: true, ...inv }].slice(-MAX_INVITES);
        await this.save(o);
        this.push(o.n, { t: 'invite', from: me.n, party: true });
      }
      return json({ ok: true });
    }
    return json({ error: 'not_found' }, 404);
  }

  async accept(me, o) {
    me.i = without(me.i, o.n); me.o = without(me.o, o.n);
    o.i = without(o.i, me.n); o.o = without(o.o, me.n);
    if (!has(me.f, o.n)) me.f.push(o.n);
    if (!has(o.f, me.n)) o.f.push(me.n);
    await this.save(me); await this.save(o);
    this.push(o.n, { t: 'accepted', from: me.n });
    return json({ ok: true, status: 'accepted' });
  }
}

async function presence(request, env, op) {
  if (!env.PRESENCE) return json({ error: 'no_presence' }, 503);
  const text = await request.text();
  if (text.length > 2048) return json({ error: 'too_big' }, 413);
  const stub = env.PRESENCE.get(env.PRESENCE.idFromName('global'));
  return stub.fetch(new Request(`https://presence/${op}`, { method: 'POST', body: text }));
}
// Conexión en tiempo real del launcher (el nick va en la URL; el token, en el primer mensaje).
async function presenceSocket(request, env, url) {
  if (!env.PRESENCE) return json({ error: 'no_presence' }, 503);
  const nick = String(url.searchParams.get('nick') || '');
  if (!NICKRE.test(nick)) return json({ error: 'bad_nick' }, 400);
  const stub = env.PRESENCE.get(env.PRESENCE.idFromName('global'));
  return stub.fetch(new Request(`https://presence/ws?nick=${encodeURIComponent(nick)}`, request));
}


// ---- Revisión de contenido: avisa a los launchers de que un administrador publicó algo ----
// El launcher del administrador escribe data/rev.json en el repositorio al publicar; el Worker lo lee (con caché corta) y lo reparte.
const REV_RE = /^[a-z0-9]{6,32}$/;
const REV_URL = 'https://raw.githubusercontent.com/javierroman94/Nova-PX-Event-Launcher/main/data/rev.json';
async function getRev(request, env, ctx) {
  const cache = caches.default;
  const key = new Request('https://rev.cache/rev');
  const hit = await cache.match(key);
  if (hit) return hit;
  let rev = '000000';
  try {
    const r = await fetch(`${REV_URL}?t=${Math.floor(Date.now() / 10000)}`, { cf: { cacheTtl: 5 } });
    if (r.ok) { const d = await r.json(); if (REV_RE.test(String(d.rev || ''))) rev = d.rev; }
  } catch {}
  const res = new Response(JSON.stringify({ rev }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=12', 'Access-Control-Allow-Origin': '*' } });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/rev') { if (!(await allow(request, env, 'rev', 120, 60000))) return tooMany(); return getRev(request, env, ctx); }
    if (request.method === 'POST' && url.pathname === '/ping') { if (!(await allow(request, env, 'ping', 10, 60000))) return tooMany(); return handlePing(request, env); }
    if (request.method === 'GET' && url.pathname === '/presence/ws') { if (!(await allow(request, env, 'presencews', 30, 60000))) return tooMany(); return presenceSocket(request, env, url); }
    if (request.method === 'POST' && url.pathname.startsWith('/presence/') && OPS.has(url.pathname.slice(10))) { if (!(await allow(request, env, 'presence', 120, 60000))) return tooMany(); return presence(request, env, url.pathname.slice(10)); }
    // Códigos para compartir modpacks: crear tiene límite estricto (cada uno es una escritura en KV), leer es más libre.
    if (request.method === 'POST' && url.pathname === '/pack') { if (!(await allow(request, env, 'packpost', 6, 60 * 60 * 1000))) return tooMany(); return createPack(request, env); }
    if (request.method === 'GET' && url.pathname.startsWith('/pack/')) { if (!(await allow(request, env, 'packget', 40, 60000))) return tooMany(); return getPack(url.pathname.slice(6), env); }
    if (request.method === 'POST' && url.pathname === '/ads/track') {
      if (!(await allow(request, env, 'ads', 20, 60000))) return tooMany();
      let b = null;
      try { b = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
      if (!b || !ADS_ID.test(String(b.id || '')) || !['v', 'c'].includes(b.k)) return json({ error: 'bad_request' }, 400);
      const key = `ad:${b.id}`;
      const known = await knownAdIds();
      const cur = await env.USERS.get(key, 'json');
      // Solo se cuentan anuncios que existen en el repositorio (o que ya tenían contador si no se pudo leer la lista).
      if (!(known ? known.has(b.id) : !!cur)) return json({ ok: true, ignored: true });
      const next = cur || { v: 0, c: 0 };
      next[b.k] = (Number(next[b.k]) || 0) + 1;
      await env.USERS.put(key, JSON.stringify(next));
      return json({ ok: true });
    }
    if (request.method === 'GET' && url.pathname === '/ads/stats') {
      const st = await adminStatus(request, env);
      if (st !== 'ok') return denied(st);
      const ads = {};
      const page = await env.USERS.list({ prefix: 'ad:', limit: 200 });
      for (const k of page.keys) ads[k.name.slice(3)] = (await env.USERS.get(k.name, 'json')) || { v: 0, c: 0 };
      return json({ ads });
    }
    if (request.method === 'GET' && url.pathname === '/stats') {
      if (!(await allow(request, env, 'stats', 60, 60000))) return tooMany();
      const { total, day, week } = await stats(env);
      return json({ total, day, week });
    }
    if (request.method === 'GET' && url.pathname === '/online') {
      const st = await adminStatus(request, env);
      if (st !== 'ok') return denied(st);
      if (!env.PRESENCE) return json({ online: [] });
      const stub = env.PRESENCE.get(env.PRESENCE.idFromName('global'));
      return stub.fetch(new Request('https://presence/__online', { method: 'GET' }));
    }
    if (request.method === 'GET' && url.pathname === '/users') {
      const st = await adminStatus(request, env);
      if (st !== 'ok') return denied(st);
      return json({ users: await listUsers(env) });
    }
    if (request.method === 'DELETE' && url.pathname.startsWith('/users/')) {
      const st = await adminStatus(request, env);
      if (st !== 'ok') return denied(st);
      const id = url.pathname.slice(7);
      if (!ID.test(id)) return json({ error: 'bad_id' }, 400);
      await env.USERS.delete(`u:${id}`);
      return json({ ok: true });
    }
    if (url.pathname === '/') return new Response('Nova PX usage counter', { status: 200 });
    return json({ error: 'not_found' }, 404);
  }
};
