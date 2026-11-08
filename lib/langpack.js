'use strict';
/*
 * Paquetes de idioma: archivos JSON { code, name, author, strings: {"texto en español": "traducción"}, patterns: [{match, to}] }.
 * Vienen en renderer/lang/ y la comunidad puede añadir más en la carpeta "idiomas" de los datos del launcher.
 * Se limpian aquí para que un archivo mal hecho no pueda romper la interfaz (la interfaz solo escribe texto plano, nunca HTML).
 */
const fs = require('fs');
const path = require('path');

const MAX_STRINGS = 6000;
const MAX_PATTERNS = 400;
const MAX_LEN = 600;
const CODE_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

function sanitizePack(raw, fallbackCode = '') {
  if (!raw || typeof raw !== 'object') return null;
  const code = String(raw.code || fallbackCode || '').trim();
  if (!CODE_RE.test(code)) return null;
  const strings = {};
  let n = 0;
  for (const [k, v] of Object.entries(raw.strings && typeof raw.strings === 'object' ? raw.strings : {})) {
    if (typeof v !== 'string' || !k || k.length > MAX_LEN || v.length > MAX_LEN) continue;
    strings[k] = v;
    if (++n >= MAX_STRINGS) break;
  }
  const patterns = [];
  for (const p of Array.isArray(raw.patterns) ? raw.patterns : []) {
    if (!p || typeof p.match !== 'string' || typeof p.to !== 'string' || p.match.length > 400 || p.to.length > MAX_LEN) continue;
    try { new RegExp(p.match); } catch { continue; }
    patterns.push({ match: p.match, to: p.to });
    if (patterns.length >= MAX_PATTERNS) break;
  }
  return {
    code,
    name: String(raw.name || code).slice(0, 40),
    author: String(raw.author || '').slice(0, 60),
    strings,
    patterns
  };
}

function readDir(dir, builtin) {
  const out = [];
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.json')); } catch { return out; }
  for (const f of files) {
    try {
      const st = fs.statSync(path.join(dir, f));
      if (!st.isFile() || st.size > 2 * 1024 * 1024) continue;
      const pack = sanitizePack(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), path.basename(f, '.json'));
      if (pack) out.push({ ...pack, builtin });
    } catch {}
  }
  return out;
}

// Los paquetes de la carpeta del usuario reemplazan a los incluidos con el mismo código.
function loadAll(builtinDir, userDir) {
  const map = new Map();
  for (const p of readDir(builtinDir, true)) map.set(p.code, p);
  for (const p of readDir(userDir, false)) map.set(p.code, p);
  return map;
}

module.exports = { sanitizePack, loadAll, CODE_RE };
