'use strict';
/*
 * Importar modpacks de otros launchers y exportar el formato propio ".novapx".
 * .novapx = zip con novapx.json (datos + lista de archivos con huella y enlace) y overrides/ (todo lo demás).
 * Red y disco entran por parámetro para poder probarlo.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { readZip } = require('./zip');
const { writeZip, walk } = require('./zipwrite');
const { safeRelPath, allowedUrl, MODRINTH_HOSTS } = require('./modpacks');
const { sanitizeSettings, cleanNotes } = require('./packs');
const { isSafeVersion } = require('./loaders');

const NOVAPX_EXT = '.novapx';
const CONTENT_DIRS = ['mods', 'shaderpacks', 'resourcepacks'];
// Lo que nunca se exporta ni se copia al importar una carpeta.
const SKIP_TOP = new Set(['logs', 'crash-reports', 'backups', 'saves', '.git', '.fabric', 'webcache2', 'downloads', 'screenshots']);

function insideRoot(root, rel) {
  const t = path.resolve(root, rel);
  const r = path.resolve(root);
  if (t !== r && !t.startsWith(r + path.sep)) throw new Error(`Ruta fuera de la instancia: ${rel}`);
  return t;
}
function put(root, rel, data) {
  const t = insideRoot(root, rel);
  fs.mkdirSync(path.dirname(t), { recursive: true });
  fs.writeFileSync(t, data);
}

// Qué es este zip.
function detectZip(zip) {
  if (zip.has('novapx.json')) return 'novapx';
  if (zip.has('modrinth.index.json')) return 'mrpack';
  if (zip.has('manifest.json')) return 'curse';
  if (zip.has('mmc-pack.json')) return 'prism';
  return null;
}

/* ---------- Prism / MultiMC ---------- */

function parseMmcPack(json) {
  const comps = (json && json.components) || [];
  const get = (uid) => (comps.find((c) => c.uid === uid) || {}).version;
  const mc = get('net.minecraft');
  if (!mc || !isSafeVersion(String(mc))) throw new Error('La instancia no indica una versión de Minecraft válida.');
  let loader = { type: 'vanilla', version: '' };
  let unsupported = '';
  if (get('net.fabricmc.fabric-loader')) loader = { type: 'fabric', version: String(get('net.fabricmc.fabric-loader')) };
  else if (get('net.minecraftforge')) loader = { type: 'forge', version: String(get('net.minecraftforge')) };
  else if (get('net.neoforged')) unsupported = 'NeoForge';
  else if (get('org.quiltmc.quilt-loader')) unsupported = 'Quilt';
  return { mcVersion: String(mc), loader, unsupported };
}
function cfgName(text) {
  const m = /^name=(.*)$/m.exec(String(text || ''));
  return m ? m[1].trim() : '';
}

function extractPrefixed(zip, prefixes, root) {
  let count = 0;
  for (const name of zip.names()) {
    const prefix = prefixes.find((p) => name.startsWith(p));
    if (!prefix || name.endsWith('/')) continue;
    const rel = safeRelPath(name.slice(prefix.length));
    if (!rel) throw new Error(`El archivo trae una ruta no permitida: ${name}`);
    if (SKIP_TOP.has(rel.split('/')[0])) continue;
    put(root, rel, zip.read(name));
    count++;
  }
  return count;
}

function installPrism({ buffer, root }) {
  const zip = readZip(buffer);
  // El zip puede traer una carpeta raíz con el nombre de la instancia.
  const packName = zip.names().find((n) => /(^|\/)mmc-pack\.json$/.test(n));
  if (!packName) throw new Error('Falta mmc-pack.json: no es una instancia de Prism/MultiMC.');
  const base = packName.slice(0, packName.length - 'mmc-pack.json'.length);
  const info = parseMmcPack(JSON.parse(zip.read(packName).toString('utf8')));
  if (info.unsupported) throw new Error(`Esta instancia usa ${info.unsupported}, que el launcher todavía no soporta.`);
  const cfg = zip.has(`${base}instance.cfg`) ? zip.read(`${base}instance.cfg`).toString('utf8') : '';
  fs.mkdirSync(root, { recursive: true });
  const files = extractPrefixed(zip, [`${base}.minecraft/`, `${base}minecraft/`], root);
  return { name: cfgName(cfg), mcVersion: info.mcVersion, loader: info.loader, files, overrides: files };
}

/* ---------- carpetas (Prism, CurseForge App, otras) ---------- */

// Mira una carpeta de instancia y adivina versión y loader. Devuelve null si no puede.
function inspectFolder(dir) {
  const j = (f) => {
    try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; }
  };
  const mmc = j('mmc-pack.json');
  if (mmc) {
    const info = parseMmcPack(mmc);
    let name = '';
    try { name = cfgName(fs.readFileSync(path.join(dir, 'instance.cfg'), 'utf8')); } catch {}
    const sub = ['.minecraft', 'minecraft'].find((s) => fs.existsSync(path.join(dir, s)));
    return { source: 'Prism/MultiMC', name, ...info, contentDir: sub ? path.join(dir, sub) : dir };
  }
  const cf = j('minecraftinstance.json');
  if (cf) {
    const mc = String(cf.gameVersion || (cf.baseModLoader && cf.baseModLoader.minecraftVersion) || '');
    if (!isSafeVersion(mc)) return null;
    let loader = { type: 'vanilla', version: '' };
    let unsupported = '';
    const bl = String((cf.baseModLoader && cf.baseModLoader.name) || '');
    if (/^forge-/i.test(bl)) loader = { type: 'forge', version: bl.slice(6) };
    else if (/^fabric-/i.test(bl)) loader = { type: 'fabric', version: bl.replace(/^fabric-(loader-)?/i, '').split('-')[0] };
    else if (/^neoforge/i.test(bl)) unsupported = 'NeoForge';
    else if (/^quilt/i.test(bl)) unsupported = 'Quilt';
    return { source: 'CurseForge App', name: String(cf.name || ''), mcVersion: mc, loader, unsupported, contentDir: dir };
  }
  return null;
}

function copyFolder(from, to) {
  if (fs.existsSync(to) && fs.readdirSync(to).length) throw new Error('La carpeta de destino ya tiene contenido.');
  fs.mkdirSync(to, { recursive: true });
  let count = 0;
  fs.cpSync(from, to, {
    recursive: true,
    dereference: false,
    filter: (src) => {
      const st = fs.lstatSync(src);
      if (st.isSymbolicLink()) return false;
      const rel = path.relative(from, src);
      if (rel && SKIP_TOP.has(rel.split(path.sep)[0])) return false;
      if (/^(mmc-pack\.json|instance\.cfg|minecraftinstance\.json)$/.test(rel)) return false;
      if (st.isFile()) count++;
      return true;
    }
  });
  return count;
}

/* ---------- .novapx: instalar ---------- */

function parseNovapx(json) {
  if (!json || json.format !== 1) throw new Error('Este archivo .novapx es de una versión que este launcher no entiende. Actualiza el launcher.');
  if (!isSafeVersion(String(json.mcVersion || ''))) throw new Error('El .novapx no indica una versión de Minecraft válida.');
  const type = String((json.loader && json.loader.type) || 'vanilla').toLowerCase();
  if (!['vanilla', 'fabric', 'forge'].includes(type)) throw new Error('El .novapx usa un loader no soportado.');
  const files = [];
  for (const f of json.files || []) {
    const rel = safeRelPath(f.path);
    if (!rel || !CONTENT_DIRS.includes(rel.split('/')[0]) || rel.split('/').length !== 2) throw new Error(`El .novapx trae una ruta no permitida: ${f.path}`);
    const urls = (f.urls || []).filter((u) => allowedUrl(u, MODRINTH_HOSTS));
    if (!urls.length || !/^[0-9a-f]{40}$/i.test(String(f.sha1 || ''))) throw new Error(`El .novapx no tiene una descarga verificable para ${rel}.`);
    files.push({ path: rel, sha1: f.sha1.toLowerCase(), urls });
  }
  return {
    name: String(json.name || '').slice(0, 60), emoji: String(json.emoji || ''), notes: cleanNotes(json.notes),
    mcVersion: String(json.mcVersion), loader: { type, version: String((json.loader && json.loader.version) || '') },
    settings: sanitizeSettings(json.settings || {}), server: json.server && json.server.host ? { host: String(json.server.host).slice(0, 253), port: Number(json.server.port) || 25565 } : null,
    files
  };
}

async function installNovapx({ buffer, root, download, onProgress }) {
  const zip = readZip(buffer);
  if (!zip.has('novapx.json')) throw new Error('Falta novapx.json: no es un archivo .novapx válido.');
  const info = parseNovapx(JSON.parse(zip.read('novapx.json').toString('utf8')));
  fs.mkdirSync(root, { recursive: true });
  let done = 0;
  for (const f of info.files) {
    let data = null;
    let lastErr;
    for (const url of f.urls) {
      for (let attempt = 0; attempt < 4 && !data; attempt++) {
        if (attempt) await new Promise((r) => setTimeout(r, 800 * attempt));
        try {
          const d = await download(url);
          if (crypto.createHash('sha1').update(d).digest('hex') !== f.sha1) throw new Error('La huella no coincide.');
          data = d;
        } catch (err) { lastErr = err; }
      }
      if (data) break;
    }
    if (!data) throw new Error(`No se pudo descargar ${f.path} (${lastErr && lastErr.message}). Revisa tu conexión o antivirus e inténtalo otra vez.`);
    put(root, f.path, data);
    onProgress && onProgress(++done, info.files.length);
  }
  let overrides = 0;
  for (const name of zip.names()) {
    if (!name.startsWith('overrides/') || name.endsWith('/')) continue;
    const rel = safeRelPath(name.slice('overrides/'.length));
    if (!rel) throw new Error(`El .novapx trae una ruta no permitida: ${name}`);
    put(root, rel, zip.read(name));
    overrides++;
  }
  return { ...info, overrides };
}

/* ---------- .novapx: exportar ---------- */

/**
 * Empaqueta una instancia. lookup(hashes) -> { sha1: {url} } con lo que Modrinth sabe (puede ser {}).
 * includeMods: 'links' (solo enlaces cuando Modrinth los tiene; el resto va dentro) | 'bundle' (todo dentro).
 */
async function exportNovapx({ root, dest, entry, lookup, includeMods = 'links', includeSettings = true, version = '' }) {
  const hashes = new Map();
  const content = [];
  for (const d of CONTENT_DIRS) {
    const dir = path.join(root, d);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!f.isFile() || f.name.startsWith('.')) continue;
      const abs = path.join(dir, f.name);
      const sha1 = crypto.createHash('sha1').update(fs.readFileSync(abs)).digest('hex');
      content.push({ rel: `${d}/${f.name}`, abs, sha1 });
      hashes.set(sha1, true);
    }
  }
  const known = includeMods === 'links' && content.length ? await lookup([...hashes.keys()]) : {};
  const files = [];
  const entries = [];
  for (const c of content) {
    const k = known[c.sha1];
    // Los archivos desactivados (.disabled) no se pueden descargar por nombre: van dentro.
    if (k && k.url && allowedUrl(k.url, MODRINTH_HOSTS) && !/\.disabled$/i.test(c.rel)) files.push({ path: c.rel, sha1: c.sha1, urls: [k.url] });
    else entries.push({ name: `overrides/${c.rel}`, abs: c.abs });
  }
  const linked = new Set(files.map((f) => f.path));
  for (const f of walk(root)) {
    const top = f.rel.split('/')[0];
    if (SKIP_TOP.has(top) || CONTENT_DIRS.includes(top)) continue;
    if (f.rel.includes('/') === false && /^(launcher_|usercache|realms_persistence|hotkeys)/.test(f.rel)) continue;
    entries.push({ name: `overrides/${f.rel}`, abs: f.abs });
  }
  const meta = {
    format: 1, name: entry.title, emoji: entry.emoji || '', notes: includeSettings ? cleanNotes(entry.notes) : '',
    mcVersion: entry.mcVersion, loader: { type: (entry.loader && entry.loader.type) || 'vanilla', version: (entry.loader && entry.loader.version) || '' },
    settings: includeSettings ? sanitizeSettings(entry.settings || {}) : {}, files, createdBy: `Nova PX Event Launcher ${version}`.trim(), created: new Date().toISOString()
  };
  const r = writeZip(dest, [{ name: 'novapx.json', data: JSON.stringify(meta, null, 2) }, ...entries]);
  return { linked: linked.size, bundled: content.length - linked.size, files: r.files, bytes: fs.statSync(dest).size };
}

module.exports = {
  NOVAPX_EXT, detectZip, parseMmcPack, installPrism, inspectFolder, copyFolder, parseNovapx, installNovapx, exportNovapx
};
