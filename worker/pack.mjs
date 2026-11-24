// Códigos para compartir modpacks (Nova PX).
// El launcher sube SOLO ids públicos de Modrinth (proyecto y versión), el nombre, la versión de Minecraft y el loader,
// y recibe un código de 7 letras. Nada de archivos, mundos, cuentas ni datos de la PC. Los códigos caducan a los 90 días.

export const CODE_ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{7}$/;
export const PACK_TTL = 60 * 60 * 24 * 90;
export const MAX_ITEMS = 400;
const LOADERS = new Set(['vanilla', 'fabric', 'forge', 'neoforge', 'quilt']);
const TYPES = new Set(['mod', 'resourcepack', 'shader']);
const MR_ID = /^[A-Za-z0-9]{8}$/;
const MC = /^[0-9A-Za-z.+_-]{2,24}$/;
const LV = /^[0-9A-Za-z.+_-]{0,48}$/;

// Devuelve una copia limpia del modpack o null si algo no cuadra (nunca se guarda lo que no se validó).
export function cleanPack(p) {
  if (!p || typeof p !== 'object' || p.v !== 1) return null;
  const n = String(p.n || '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!n) return null;
  const mc = String(p.mc || '');
  if (!MC.test(mc)) return null;
  const l = p.l && typeof p.l === 'object' ? p.l : {};
  const t = String(l.t || '').toLowerCase();
  const lv = String(l.v || '');
  if (!LOADERS.has(t) || !LV.test(lv)) return null;
  if (!Array.isArray(p.c) || p.c.length > MAX_ITEMS) return null;
  const seen = new Set();
  const c = [];
  for (const it of p.c) {
    if (!Array.isArray(it) || it.length !== 3) return null;
    const [type, project, version] = it.map((x) => String(x));
    if (!TYPES.has(type) || !MR_ID.test(project) || !MR_ID.test(version)) return null;
    if (seen.has(version)) continue;
    seen.add(version);
    c.push([type, project, version]);
  }
  return { v: 1, n, mc, l: { t, v: lv }, c };
}

export function newCode(random = (arr) => crypto.getRandomValues(arr)) {
  const bytes = random(new Uint8Array(7));
  let out = '';
  for (let i = 0; i < 7; i++) out += CODE_ALPHA[bytes[i] % CODE_ALPHA.length];
  return out;
}

const reply = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

// POST /pack  { pack }  -> { code }
export async function createPack(request, env) {
  if (!env.USERS) return reply({ error: 'no_storage' }, 503);
  const text = await request.text();
  if (text.length > 40000) return reply({ error: 'too_big' }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return reply({ error: 'bad_json' }, 400); }
  const pack = cleanPack(body && body.pack);
  if (!pack) return reply({ error: 'bad_pack' }, 400);
  if (!pack.c.length && pack.l.t !== 'vanilla') return reply({ error: 'empty' }, 400);
  for (let i = 0; i < 4; i++) {
    const code = newCode();
    if (await env.USERS.get(`pk:${code}`)) continue;
    await env.USERS.put(`pk:${code}`, JSON.stringify({ ...pack, at: Date.now() }), { expirationTtl: PACK_TTL });
    return reply({ code });
  }
  return reply({ error: 'busy' }, 503);
}

// GET /pack/CODIGO -> { pack }
export async function getPack(code, env) {
  if (!env.USERS) return reply({ error: 'no_storage' }, 503);
  const c = String(code || '').toUpperCase();
  if (!CODE_RE.test(c)) return reply({ error: 'bad_code' }, 400);
  const raw = await env.USERS.get(`pk:${c}`, 'json');
  const pack = cleanPack(raw);
  if (!pack) return reply({ error: 'not_found' }, 404);
  return reply({ pack });
}
