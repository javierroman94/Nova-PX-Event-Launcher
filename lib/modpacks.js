'use strict';
/*
 * Instalación de modpacks de Modrinth (.mrpack) y CurseForge (.zip con manifest.json).
 * Todo lo que toca la red o el disco recibe sus funciones por parámetro, así se prueba sin internet.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { readZip } = require('./zip');

const MODRINTH_HOSTS = ['cdn.modrinth.com', 'github.com', 'raw.githubusercontent.com', 'gitlab.com'];
const CURSE_HOSTS = ['edge.forgecdn.net', 'mediafilez.forgecdn.net', 'media.forgecdn.net'];
const SUPPORTED = ['vanilla', 'fabric', 'forge'];

// Ruta relativa segura dentro de la instancia (nada de "..", rutas absolutas ni unidades).
function safeRelPath(p) {
  const s = String(p || '').replace(/\\/g, '/');
  if (!s || s.startsWith('/') || /^[a-zA-Z]:/.test(s) || s.includes('\0')) return null;
  const parts = s.split('/').filter((x) => x && x !== '.');
  if (!parts.length || parts.some((x) => x === '..')) return null;
  return parts.join('/');
}

function allowedUrl(url, hosts) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && hosts.includes(u.hostname);
  } catch {
    return false;
  }
}

// "Mi Modpack Épico!" -> "mi-modpack-epico" (cabe en el id de instancia: 40 caracteres como máximo)
function slugify(text) {
  const s = String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'modpack';
}
function instanceIdFor(title, taken = []) {
  const base = `mp-${slugify(title)}`.slice(0, 34).replace(/-+$/, '');
  let id = base;
  for (let i = 2; taken.includes(id); i++) id = `${base}-${i}`;
  return id;
}

/* ---------- Modrinth (.mrpack) ---------- */

function parseMrpackIndex(index) {
  if (!index || index.formatVersion !== 1 || index.game !== 'minecraft') throw new Error('Este modpack no tiene el formato de Modrinth esperado.');
  const deps = index.dependencies || {};
  if (!deps.minecraft) throw new Error('El modpack no indica la versión de Minecraft.');
  let loader = { type: 'vanilla', version: '' };
  let unsupported = '';
  if (deps['fabric-loader']) loader = { type: 'fabric', version: String(deps['fabric-loader']) };
  else if (deps.forge) loader = { type: 'forge', version: String(deps.forge) };
  else if (deps.neoforge) unsupported = 'NeoForge';
  else if (deps['quilt-loader']) unsupported = 'Quilt';
  const files = [];
  for (const f of index.files || []) {
    if (f.env && f.env.client === 'unsupported') continue;
    const rel = safeRelPath(f.path);
    if (!rel) throw new Error(`El modpack trae una ruta no permitida: ${f.path}`);
    const urls = (f.downloads || []).filter((u) => allowedUrl(u, MODRINTH_HOSTS));
    if (!urls.length) throw new Error(`No hay una descarga permitida para ${rel}.`);
    files.push({ path: rel, sha1: (f.hashes || {}).sha1 || '', sha512: (f.hashes || {}).sha512 || '', size: Number(f.fileSize) || 0, urls });
  }
  return { name: String(index.name || ''), mcVersion: String(deps.minecraft), loader, unsupported, files };
}

function verifyHashes(buf, f) {
  if (f.sha512 && crypto.createHash('sha512').update(buf).digest('hex') !== f.sha512.toLowerCase()) return false;
  if (!f.sha512 && f.sha1 && crypto.createHash('sha1').update(buf).digest('hex') !== f.sha1.toLowerCase()) return false;
  return true;
}

function writeInside(root, rel, data) {
  const target = path.resolve(root, rel);
  if (target !== path.resolve(root) && !target.startsWith(path.resolve(root) + path.sep)) throw new Error(`Ruta fuera de la instancia: ${rel}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, data);
}

// Copia las carpetas "overrides" del zip (configuración, shaders, resource packs…) a la instancia.
function extractOverrides(zip, prefixes, root) {
  let count = 0;
  for (const prefix of prefixes) {
    for (const name of zip.names()) {
      if (!name.startsWith(prefix + '/') || name.endsWith('/')) continue;
      const rel = safeRelPath(name.slice(prefix.length + 1));
      if (!rel) throw new Error(`El modpack trae una ruta no permitida: ${name}`);
      writeInside(root, rel, zip.read(name));
      count++;
    }
  }
  return count;
}

async function downloadAll(tasks, { concurrency = 4, onProgress }) {
  let next = 0;
  let done = 0;
  const run = async () => {
    while (next < tasks.length) {
      const t = tasks[next++];
      await t();
      onProgress && onProgress(++done, tasks.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, run));
}

async function installMrpack({ buffer, root, download, onProgress }) {
  const zip = readZip(buffer);
  if (!zip.has('modrinth.index.json')) throw new Error('Falta modrinth.index.json: no es un .mrpack válido.');
  const info = parseMrpackIndex(JSON.parse(zip.read('modrinth.index.json').toString('utf8')));
  if (info.unsupported) throw new Error(`Este modpack usa ${info.unsupported}, que el launcher todavía no soporta.`);
  fs.mkdirSync(root, { recursive: true });
  const tasks = info.files.map((f) => async () => {
    let lastErr;
    for (const url of f.urls) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const data = await download(url);
          if (!verifyHashes(data, f)) throw new Error('La huella del archivo no coincide.');
          return writeInside(root, f.path, data);
        } catch (err) {
          lastErr = err;
        }
      }
    }
    throw new Error(`No se pudo descargar ${f.path}: ${lastErr && lastErr.message}`);
  });
  await downloadAll(tasks, { onProgress });
  const overrides = extractOverrides(zip, ['overrides', 'client-overrides'], root);
  return { mcVersion: info.mcVersion, loader: info.loader, files: info.files.length, overrides, name: info.name };
}

/* ---------- CurseForge (.zip con manifest.json) ---------- */

function parseCurseManifest(m) {
  if (!m || m.manifestType !== 'minecraftModpack' || !m.minecraft) throw new Error('Este modpack no tiene el formato de CurseForge esperado.');
  const mc = String(m.minecraft.version || '');
  if (!mc) throw new Error('El modpack no indica la versión de Minecraft.');
  const primary = (m.minecraft.modLoaders || []).find((l) => l.primary) || (m.minecraft.modLoaders || [])[0];
  let loader = { type: 'vanilla', version: '' };
  let unsupported = '';
  if (primary) {
    const [type, ...rest] = String(primary.id).split('-');
    const version = rest.join('-');
    if (type === 'fabric' || type === 'forge') loader = { type, version };
    else unsupported = type === 'neoforge' ? 'NeoForge' : type === 'quilt' ? 'Quilt' : type;
  }
  const files = (m.files || []).filter((f) => f.required !== false).map((f) => ({ projectID: Number(f.projectID), fileID: Number(f.fileID) }));
  const overrides = safeRelPath(m.overrides || 'overrides');
  return { name: String(m.name || ''), mcVersion: mc, loader, unsupported, files, overrides: overrides || 'overrides' };
}

// Carpeta de destino según el tipo de proyecto de CurseForge (classId).
function curseFolder(classId) {
  return { 6: 'mods', 12: 'resourcepacks', 6552: 'shaderpacks' }[classId] || 'mods';
}

async function installCurse({ buffer, root, resolveFiles, download, onProgress }) {
  const zip = readZip(buffer);
  if (!zip.has('manifest.json')) throw new Error('Falta manifest.json: no es un modpack de CurseForge válido.');
  const info = parseCurseManifest(JSON.parse(zip.read('manifest.json').toString('utf8')));
  if (info.unsupported) throw new Error(`Este modpack usa ${info.unsupported}, que el launcher todavía no soporta.`);
  fs.mkdirSync(root, { recursive: true });
  const resolved = await resolveFiles(info.files); // [{ fileID, projectID, fileName, downloadUrl, sha1, classId }]
  const byId = new Map(resolved.map((r) => [r.fileID, r]));
  const skipped = [];
  const tasks = [];
  for (const f of info.files) {
    const r = byId.get(f.fileID);
    const fileName = r && safeRelPath(r.fileName);
    if (!r || !fileName || fileName.includes('/') || !r.downloadUrl || !allowedUrl(r.downloadUrl, CURSE_HOSTS)) {
      skipped.push((r && r.fileName) || `archivo ${f.fileID}`);
      continue;
    }
    tasks.push(async () => {
      const data = await download(r.downloadUrl);
      if (r.sha1 && crypto.createHash('sha1').update(data).digest('hex') !== r.sha1.toLowerCase()) throw new Error(`La huella de ${fileName} no coincide.`);
      writeInside(root, `${curseFolder(r.classId)}/${fileName}`, data);
    });
  }
  await downloadAll(tasks, { onProgress });
  const overrides = extractOverrides(zip, [info.overrides], root);
  return { mcVersion: info.mcVersion, loader: info.loader, files: tasks.length, skipped, overrides, name: info.name };
}

module.exports = {
  SUPPORTED, MODRINTH_HOSTS, CURSE_HOSTS,
  safeRelPath, allowedUrl, slugify, instanceIdFor,
  parseMrpackIndex, installMrpack, parseCurseManifest, installCurse, curseFolder
};
