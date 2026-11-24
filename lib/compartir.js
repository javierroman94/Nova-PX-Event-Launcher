'use strict';
/*
 * Códigos para compartir modpacks (lado del launcher).
 * Lo que viaja al Worker: nombre, versión de Minecraft, loader y los ids públicos de Modrinth (proyecto y versión)
 * de los mods, texturas y shaders. Los archivos que no están en Modrinth no se comparten (se avisa cuántos).
 * Las mismas reglas que worker/pack.mjs: lo que llega del Worker se vuelve a validar aquí.
 */

const CODE_ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{7}$/;
const MAX_ITEMS = 400;
const LOADERS = new Set(['vanilla', 'fabric', 'forge', 'neoforge', 'quilt']);
const TYPES = new Set(['mod', 'resourcepack', 'shader']);
const MR_ID = /^[A-Za-z0-9]{8}$/;
const MC = /^[0-9A-Za-z.+_-]{2,24}$/;
const LV = /^[0-9A-Za-z.+_-]{0,48}$/;

// "npx-7k2 qf9", "NPX7K2QF9X", "7K2QF9X" -> "7K2QF9X" (o '' si no es un código)
function normalizeCode(input) {
  let s = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length === 10 && s.startsWith('NPX')) s = s.slice(3);
  return CODE_RE.test(s) ? s : '';
}
const formatCode = (code) => `NPX-${code}`;

function cleanPack(p) {
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

// Arma el modpack a compartir. found: [{ type, projectId, versionId }] (lo que Modrinth reconoció por huella).
function buildPack({ title, mcVersion, loader, found }) {
  const items = (found || []).filter((f) => f && TYPES.has(f.type) && MR_ID.test(String(f.projectId)) && MR_ID.test(String(f.versionId)))
    .slice(0, MAX_ITEMS)
    .map((f) => [f.type, String(f.projectId), String(f.versionId)]);
  return cleanPack({ v: 1, n: title, mc: mcVersion, l: { t: (loader && loader.type) || 'vanilla', v: (loader && loader.version) || '' }, c: items });
}

// Carpeta de cada tipo dentro de la instancia.
const FOLDER = { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks' };

module.exports = { CODE_ALPHA, CODE_RE, MAX_ITEMS, normalizeCode, formatCode, cleanPack, buildPack, FOLDER };
