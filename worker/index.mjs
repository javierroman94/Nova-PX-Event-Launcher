// Nova PX - contador de usuarios (Cloudflare Worker + KV).
// Guarda por instalación: nick (si inició sesión), si es premium, versión del launcher y sistema.
// No guarda IP ni nada más. Los registros inactivos se borran solos a los 180 días.
// Variables: KV "USERS" y secreto "ADMIN_KEY" (clave que solo conoce el administrador).

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NICK = /^[A-Za-z0-9_]{0,16}$/;
const VERSION = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const OS = new Set(['win32', 'darwin', 'linux']);
const TTL = 60 * 60 * 24 * 180;
const WRITE_EVERY_MS = 6 * 60 * 60 * 1000; // el plan gratis de KV permite ~1000 escrituras al día

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

function isAdmin(request, env) {
  const key = env.ADMIN_KEY || '';
  const got = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!key || key.length < 16 || got.length !== key.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
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
const MAX_MSGS = 80;
const OPS = new Set(['sync', 'leave', 'request', 'accept', 'remove', 'send', 'poll']);

async function sha256(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
const low = (n) => String(n).toLowerCase();
const pairKey = (a, b) => 'c:' + [low(a), low(b)].sort().join('|');
const has = (list, n) => list.some((x) => low(x) === low(n));
const without = (list, n) => list.filter((x) => low(x) !== low(n));

export class Presence {
  constructor(state) { this.st = state.storage; this.cache = new Map(); }
  async user(nick) {
    const k = low(nick);
    if (!this.cache.has(k)) {
      if (this.cache.size > 3000) this.cache.clear();
      this.cache.set(k, (await this.st.get('u:' + k)) || { n: nick, f: [], i: [], o: [], seen: 0, playing: false, r: {} });
    }
    return this.cache.get(k);
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
  online(u, now) { return !!u && now - (u.seen || 0) <= ONLINE_MS; }

  async fetch(request) {
    const op = new URL(request.url).pathname.slice(1);
    const now = Date.now();
    let b = {};
    try { b = JSON.parse(await request.text()); } catch { return json({ error: 'bad_json' }, 400); }
    if (!OPS.has(op)) return json({ error: 'not_found' }, 404);
    const me = await this.auth(b);
    if (!me) return json({ error: 'auth' }, 401);

    if (op === 'leave') { me.seen = 0; await this.save(me); return json({ ok: true }); }

    if (op === 'sync') {
      if (now - (me.seen || 0) > 30000 || me.playing !== !!b.playing) { me.seen = now; me.playing = !!b.playing; await this.save(me); }
      const friends = [];
      const keys = me.f.map((n) => pairKey(me.n, n));
      const chats = keys.length ? await this.st.get(keys) : new Map();
      for (const n of me.f) {
        const o = await this.user(n);
        const msgs = chats.get(pairKey(me.n, n)) || [];
        const unread = msgs.filter((m) => low(m.f) === low(n) && m.id > ((me.r || {})[low(n)] || 0)).length;
        friends.push({ nick: o.n, online: this.online(o, now), playing: this.online(o, now) && !!o.playing, seen: o.seen || 0, unread });
      }
      friends.sort((x, y) => (y.online - x.online) || x.nick.localeCompare(y.nick));
      return json({ friends, incoming: me.i, outgoing: me.o, now });
    }

    const to = String(b.to || b.with || '');
    if (!NICKRE.test(to) || low(to) === low(me.n)) return json({ error: 'bad_nick' }, 400);

    if (op === 'request') {
      if (has(me.f, to)) return json({ error: 'already' }, 409);
      if (me.f.length >= MAX_FRIENDS) return json({ error: 'full' }, 409);
      const o = await this.user(to);
      if (has(me.i, to)) return this.accept(me, o);
      if (!has(me.o, to)) {
        if (o.i.length >= MAX_FRIENDS) return json({ error: 'busy' }, 409);
        me.o.push(o.n); o.i.push(me.n);
        await this.save(me); await this.save(o);
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
      return json({ ok: true });
    }

    // chat: solo entre amigos
    if (!has(me.f, to)) return json({ error: 'not_friends' }, 403);
    const key = pairKey(me.n, to);
    const msgs = (await this.st.get(key)) || [];
    if (op === 'send') {
      const text = String(b.text || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 300);
      if (!text) return json({ error: 'empty' }, 400);
      const id = (msgs.length ? msgs[msgs.length - 1].id : 0) + 1;
      msgs.push({ id, f: me.n, t: text, ts: now });
      while (msgs.length > MAX_MSGS) msgs.shift();
      await this.st.put(key, msgs);
      return json({ ok: true, id });
    }
    if (op === 'poll') {
      const since = Number(b.since) || 0;
      const last = msgs.length ? msgs[msgs.length - 1].id : 0;
      if ((me.r || {})[low(to)] !== last) { me.r = { ...(me.r || {}), [low(to)]: last }; await this.save(me); }
      const o = await this.user(to);
      return json({ messages: msgs.filter((m) => m.id > since), online: this.online(o, now), playing: this.online(o, now) && !!o.playing });
    }
    return json({ error: 'not_found' }, 404);
  }
  async accept(me, o) {
    me.i = without(me.i, o.n); me.o = without(me.o, o.n);
    o.i = without(o.i, me.n); o.o = without(o.o, me.n);
    if (!has(me.f, o.n)) me.f.push(o.n);
    if (!has(o.f, me.n)) o.f.push(me.n);
    await this.save(me); await this.save(o);
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
    if (request.method === 'GET' && url.pathname === '/rev') return getRev(request, env, ctx);
    if (request.method === 'POST' && url.pathname === '/ping') return handlePing(request, env);
    if (request.method === 'POST' && url.pathname.startsWith('/presence/') && OPS.has(url.pathname.slice(10))) return presence(request, env, url.pathname.slice(10));
    if (request.method === 'POST' && url.pathname === '/ads/track') {
      let b = null;
      try { b = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
      if (!b || !/^[a-z0-9-]{1,40}$/.test(String(b.id || '')) || !['v', 'c'].includes(b.k)) return json({ error: 'bad_request' }, 400);
      const key = `ad:${b.id}`;
      const cur = (await env.USERS.get(key, 'json')) || { v: 0, c: 0 };
      cur[b.k] = (Number(cur[b.k]) || 0) + 1;
      await env.USERS.put(key, JSON.stringify(cur));
      return json({ ok: true });
    }
    if (request.method === 'GET' && url.pathname === '/ads/stats') {
      if (!isAdmin(request, env)) return json({ error: 'unauthorized' }, 401);
      const ads = {};
      const page = await env.USERS.list({ prefix: 'ad:', limit: 200 });
      for (const k of page.keys) ads[k.name.slice(3)] = (await env.USERS.get(k.name, 'json')) || { v: 0, c: 0 };
      return json({ ads });
    }
    if (request.method === 'GET' && url.pathname === '/stats') {
      const { total, day, week } = await stats(env);
      return json({ total, day, week });
    }
    if (request.method === 'GET' && url.pathname === '/users') {
      if (!isAdmin(request, env)) return json({ error: 'unauthorized' }, 401);
      return json({ users: await listUsers(env) });
    }
    if (request.method === 'DELETE' && url.pathname.startsWith('/users/')) {
      if (!isAdmin(request, env)) return json({ error: 'unauthorized' }, 401);
      const id = url.pathname.slice(7);
      if (!ID.test(id)) return json({ error: 'bad_id' }, 400);
      await env.USERS.delete(`u:${id}`);
      return json({ ok: true });
    }
    if (url.pathname === '/') return new Response('Nova PX usage counter', { status: 200 });
    return json({ error: 'not_found' }, 404);
  }
};
