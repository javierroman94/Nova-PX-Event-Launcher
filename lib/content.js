'use strict';
/*
 * Contenido de una instancia (mods, shaders, paquetes de recursos): listar, activar/desactivar,
 * borrar e instalar desde Modrinth con sus dependencias. Red y disco entran por parámetro para poder probarlo.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { nameFromFile } = require('./modrinth');
const { allowedUrl } = require('./modpacks');

const API = 'https://api.modrinth.com/v2';
const TYPES = {
  mod: { dir: 'mods', ext: '.jar', project: 'mod', label: 'Mods' },
  shader: { dir: 'shaderpacks', ext: '.zip', project: 'shader', label: 'Shaders' },
  resourcepack: { dir: 'resourcepacks', ext: '.zip', project: 'resourcepack', label: 'Texturas' }
};

function typeInfo(type) {
  const t = TYPES[type];
  if (!t) throw new Error('Tipo de contenido desconocido.');
  return t;
}

// Nombre de archivo simple: sin carpetas, sin caracteres raros, con la extensión del tipo (o .disabled).
function safeFileName(name, type) {
  const n = String(name || '');
  const ext = typeInfo(type).ext;
  if (!n || n !== path.basename(n) || /[\\/\0:*?"<>|]/.test(n) || n.startsWith('.') || n.length > 160) return null;
  const base = n.replace(/\.disabled$/i, '');
  return base.toLowerCase().endsWith(ext) ? n : null;
}

function contentDir(root, type) {
  return path.join(root, typeInfo(type).dir);
}

function listContent(root, type) {
  const dir = contentDir(root, type);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => safeFileName(f, type))
    .map((f) => {
      const st = fs.statSync(path.join(dir, f));
      return { type, file: f, enabled: !/\.disabled$/i.test(f), size: st.size, mtime: st.mtimeMs };
    })
    .filter((x) => fs.statSync(path.join(dir, x.file)).isFile());
}

function toggleContent(root, type, file) {
  if (!safeFileName(file, type)) throw new Error('Nombre de archivo no válido.');
  const dir = contentDir(root, type);
  const from = path.join(dir, file);
  if (!fs.existsSync(from)) throw new Error('Ese archivo ya no existe.');
  const next = /\.disabled$/i.test(file) ? file.replace(/\.disabled$/i, '') : `${file}.disabled`;
  const to = path.join(dir, next);
  if (fs.existsSync(to)) throw new Error('Ya hay un archivo con ese nombre.');
  fs.renameSync(from, to);
  return next;
}

function removeContent(root, type, file) {
  if (!safeFileName(file, type)) throw new Error('Nombre de archivo no válido.');
  fs.rmSync(path.join(contentDir(root, type), file), { force: true });
}

function addLocalFile(root, type, srcPath) {
  const name = path.basename(String(srcPath || ''));
  if (!safeFileName(name, type)) throw new Error(`"${name}" no es un archivo ${typeInfo(type).ext} válido para ${typeInfo(type).label.toLowerCase()}.`);
  const dir = contentDir(root, type);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, name);
  if (fs.existsSync(dest)) throw new Error(`Ya tienes "${name}".`);
  fs.copyFileSync(srcPath, dest);
  return name;
}

function sha1Stream(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha1');
    fs.createReadStream(file).on('data', (c) => h.update(c)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

// Une cada archivo con lo que Modrinth sabe de él. byHash: sha1 -> versión; projects: id -> proyecto.
function buildContentList(items, byHash, projects) {
  return items
    .map((it) => {
      const v = byHash[it.hash];
      const p = v && projects[v.project_id];
      const shown = it.file.replace(/\.disabled$/i, '');
      return {
        type: it.type, file: it.file, enabled: it.enabled, size: it.size,
        name: p ? p.title : nameFromFile(shown),
        known: !!p,
        version: (v && v.version_number) || '',
        icon: p && /^https:\/\//i.test(p.icon_url || '') ? p.icon_url : '',
        projectId: p ? p.id : ''
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
}

/* ---------- buscar e instalar desde Modrinth ---------- */

function facetsFor(type, mc, loader) {
  const f = [[`project_type:${typeInfo(type).project}`]];
  if (mc) f.push([`versions:${mc}`]);
  if (type === 'mod' && loader && loader !== 'vanilla') f.push([`categories:${loader}`]);
  return f;
}

async function searchContent(request, { type, mc, loader, query = '', offset = 0 }) {
  const q = String(query).trim();
  const url = `${API}/search?query=${encodeURIComponent(q)}&facets=${encodeURIComponent(JSON.stringify(facetsFor(type, mc, loader)))}&limit=20&offset=${Math.max(0, Number(offset) || 0)}&index=${q ? 'relevance' : 'downloads'}`;
  const r = await request(url);
  return {
    total: r.total_hits || 0,
    items: (r.hits || []).map((h) => ({
      id: String(h.project_id), title: h.title, summary: h.description || '', author: h.author || '',
      downloads: h.downloads || 0, icon: /^https:\/\//i.test(h.icon_url || '') ? h.icon_url : ''
    }))
  };
}

async function compatibleVersions(request, projectId, type, mc, loader) {
  const params = [`game_versions=${encodeURIComponent(JSON.stringify([mc]))}`];
  if (type === 'mod' && loader && loader !== 'vanilla') params.push(`loaders=${encodeURIComponent(JSON.stringify([loader]))}`);
  return request(`${API}/project/${encodeURIComponent(projectId)}/version?${params.join('&')}`);
}

// Instala la última versión compatible y, para mods, sus dependencias obligatorias.
async function installFromModrinth({ request, download, root, type, projectId, mc, loader, onStatus = () => {} }) {
  const installed = [];
  const seen = new Set();
  const info = typeInfo(type);

  async function put(version, kind) {
    const file = (version.files || []).find((f) => f.primary) || (version.files || [])[0];
    if (!file) throw new Error('Esa versión no tiene archivos.');
    const name = safeFileName(file.filename, kind);
    if (!name) throw new Error(`El archivo "${file.filename}" no es válido.`);
    if (!allowedUrl(file.url, ['cdn.modrinth.com'])) throw new Error('La descarga no viene de un sitio permitido.');
    const dest = path.join(contentDir(root, kind), name);
    if (fs.existsSync(dest)) return null;
    onStatus(`Descargando ${name}…`);
    const data = await download(file.url);
    const want = (file.hashes || {}).sha1;
    if (want && crypto.createHash('sha1').update(data).digest('hex') !== want.toLowerCase()) throw new Error(`La huella de ${name} no coincide.`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, data);
    installed.push(name);
    return name;
  }

  async function visit(pid, kind, depth) {
    if (seen.has(pid) || seen.size >= 25) return;
    seen.add(pid);
    const versions = await compatibleVersions(request, pid, kind, mc, loader);
    const v = (versions || [])[0];
    if (!v) {
      if (depth === 0) throw new Error(`No hay una versión para Minecraft ${mc}${kind === 'mod' && loader ? ' con ' + loader : ''}.`);
      return;
    }
    await put(v, kind);
    if (kind !== 'mod' || depth >= 3) return;
    for (const d of v.dependencies || []) {
      if (d.dependency_type !== 'required' || !d.project_id) continue;
      await visit(d.project_id, 'mod', depth + 1);
    }
  }

  await visit(projectId, type, 0);
  return { installed, dir: info.dir };
}

module.exports = {
  TYPES, typeInfo, safeFileName, contentDir, listContent, toggleContent, removeContent, addLocalFile,
  sha1Stream, buildContentList, searchContent, installFromModrinth
};
