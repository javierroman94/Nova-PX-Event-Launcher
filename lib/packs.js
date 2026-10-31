'use strict';
/*
 * Instancias propias de la comunidad: crear, ajustes por instancia, duplicar, respaldos y actualización de mods.
 * Funciones puras o con disco/red inyectados para poder probarlas (npm test).
 */
const fs = require('fs');
const path = require('path');
const { slugify, instanceIdFor } = require('./modpacks');
const { isSafeVersion } = require('./loaders');
const { walk, writeZip } = require('./zipwrite');

const LOADERS = ['vanilla', 'fabric', 'forge'];
const API = 'https://api.modrinth.com/v2';

const clampInt = (v, min, max) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
};

// Ajustes propios de una instancia. Lo que no se pone aquí usa el valor global de Ajustes.
function sanitizeSettings(s = {}) {
  const out = {};
  const ram = clampInt(s.ramGb, 1, 32);
  if (ram) out.ramGb = ram;
  const java = String(s.javaPath || '').trim().slice(0, 500);
  if (java) out.javaPath = java;
  const args = String(s.jvmArgs || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 500);
  if (args) out.jvmArgs = args;
  if (typeof s.fullscreen === 'boolean') out.fullscreen = s.fullscreen;
  const w = clampInt(s.width, 320, 7680);
  const h = clampInt(s.height, 240, 4320);
  if (w && h) { out.width = w; out.height = h; }
  return out;
}

function mergeSettings(global, own) {
  const o = sanitizeSettings(own);
  return { ...global, ...o };
}

function cleanNotes(s) {
  return String(s || '').replace(/\0/g, '').slice(0, 4000);
}

// Solo versiones "release" de Minecraft, de la más nueva a la más vieja.
function releaseVersions(manifest) {
  return ((manifest && manifest.versions) || []).filter((v) => v && v.type === 'release' && isSafeVersion(v.id)).map((v) => v.id);
}

function buildCustomEntry({ name, icon, mcVersion, loader, existingIds = [], now = new Date() }) {
  const title = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!title) throw new Error('Ponle un nombre a tu modpack.');
  if (!isSafeVersion(mcVersion)) throw new Error('Elige una versión de Minecraft válida.');
  const type = String(loader || 'vanilla').toLowerCase();
  if (!LOADERS.includes(type)) throw new Error('Loader no soportado.');
  const em = (/^\p{Extended_Pictographic}\uFE0F?/u.exec(String(icon || '').trim()) || [''])[0];
  return {
    id: instanceIdFor(title, existingIds),
    provider: 'custom', projectId: '', versionId: '', version: '',
    title, icon: '', emoji: em,
    mcVersion, loader: { type, version: '' },
    installedAt: now.toISOString(), skipped: [], settings: {}, notes: ''
  };
}

// Copia la carpeta de una instancia (sin registros ni respaldos). withWorlds=false deja fuera los mundos.
function duplicateDir(from, to, { withWorlds = true } = {}) {
  if (fs.existsSync(to)) throw new Error('Ya existe una carpeta con ese nombre.');
  fs.cpSync(from, to, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(from, src).split(path.sep)[0];
      if (rel === 'logs' || rel === 'backups' || rel === 'crash-reports') return false;
      if (!withWorlds && rel === 'saves') return false;
      return true;
    }
  });
}

/* ---------- respaldos de mundos ---------- */

const safeWorld = (n) => {
  const s = String(n || '');
  return s && s === path.basename(s) && !/[\\/\0]/.test(s) && !s.startsWith('.') ? s : null;
};

function backupWorld(root, world, now = new Date()) {
  const w = safeWorld(world);
  if (!w) throw new Error('Nombre de mundo no válido.');
  const dir = path.join(root, 'saves', w);
  if (!fs.existsSync(dir)) throw new Error('Ese mundo ya no existe.');
  const files = walk(dir).filter((f) => f.rel !== 'session.lock');
  const stamp = now.toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const outDir = path.join(root, 'backups');
  fs.mkdirSync(outDir, { recursive: true });
  const name = `${slugify(w) || 'mundo'}-${stamp}.zip`;
  const dest = path.join(outDir, name);
  const r = writeZip(dest, files.map((f) => ({ name: `${w}/${f.rel}`, abs: f.abs })));
  return { name, files: r.files, bytes: fs.statSync(dest).size };
}

function listBackups(root) {
  const dir = path.join(root, 'backups');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /\.zip$/i.test(f) && f === path.basename(f))
    .map((f) => { const st = fs.statSync(path.join(dir, f)); return { name: f, size: st.size, mtime: st.mtimeMs }; })
    .sort((a, b) => b.mtime - a.mtime);
}

/* ---------- actualizar mods (Modrinth) ---------- */

// Pide a Modrinth la última versión compatible de cada archivo (por sha1). Devuelve lo que se puede actualizar.
async function planModUpdates({ request, items, mc, loader }) {
  const hashes = items.map((i) => i.hash).filter(Boolean);
  if (!hashes.length) return [];
  const res = await request(`${API}/version_files/update`, {
    method: 'POST',
    body: { hashes, algorithm: 'sha1', loaders: loader && loader !== 'vanilla' ? [loader] : undefined, game_versions: [mc] }
  });
  const out = [];
  for (const it of items) {
    const v = res && res[it.hash];
    if (!v) continue;
    const file = (v.files || []).find((f) => f.primary) || (v.files || [])[0];
    if (!file || !file.hashes || !file.hashes.sha1 || file.hashes.sha1.toLowerCase() === it.hash) continue;
    out.push({ file: it.file, enabled: it.enabled, newFile: file.filename, url: file.url, sha1: file.hashes.sha1.toLowerCase(), version: v.version_number || '' });
  }
  return out;
}

module.exports = {
  LOADERS, sanitizeSettings, mergeSettings, cleanNotes, releaseVersions, buildCustomEntry,
  duplicateDir, backupWorld, listBackups, planModUpdates, safeWorld
};
