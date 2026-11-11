// Sagitta - contador de usuarios (Cloudflare Worker + KV).
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/ping') return handlePing(request, env);
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
    if (url.pathname === '/') return new Response('Sagitta usage counter', { status: 200 });
    return json({ error: 'not_found' }, 404);
  }
};
