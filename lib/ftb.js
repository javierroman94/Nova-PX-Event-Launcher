'use strict';
/*
 * Modpacks de FTB (Feed The Beast): búsqueda, versiones e instalación con su API pública (sin clave).
 * Red y disco entran por parámetro para poder probarlo sin internet.
 */
const crypto = require('crypto');
const fs = require('fs');
const { safeRelPath, allowedUrl, writeInside, downloadAll } = require('./modpacks');
const { isSafeVersion } = require('./loaders');

const BASE = 'https://api.feed-the-beast.com/v1/modpacks/public/modpack';
const FTB_HOSTS = ['cdn.feed-the-beast.com', 'files.feed-the-beast.com', 'edge.forgecdn.net', 'mediafilez.forgecdn.net'];
const httpsOr = (u) => (/^https:\/\//i.test(u || '') ? u : '');

function ftb(request) {
  return {
    async search({ query = '', offset = 0 }) {
      const q = query.trim();
      const off = Math.max(0, Math.floor(Number(offset) || 0));
      const limit = Math.min(off + 20, 100);
      const url = q
        ? `${BASE}/search/${limit}?term=${encodeURIComponent(q)}`
        : `${BASE}/popular/plays/${limit}`;
      const r = await request(url);
      const ids = (r.packs || []).slice(off, off + 20);
      const packs = await Promise.all(ids.map((id) => request(`${BASE}/${Number(id)}`).catch(() => null)));
      return {
        total: Number(r.total || r.count || ids.length) || 0,
        items: packs.filter((d) => d && !d.private).map((d) => {
          const art = (d.art || []).find((a) => a.type === 'square') || (d.art || [])[0] || {};
          return {
            provider: 'ftb', id: String(d.id), title: d.name || '', summary: d.synopsis || '',
            icon: httpsOr(art.url), downloads: d.installs || d.plays || 0,
            author: (d.authors && d.authors[0] && d.authors[0].name) || 'FTB',
            url: d.slug ? `https://www.feed-the-beast.com/modpacks/${Number(d.id)}-${encodeURIComponent(d.slug)}` : ''
          };
        })
      };
    },
    async versions(id) {
      const d = await request(`${BASE}/${Number(id)}`);
      return (d.versions || []).slice().reverse().map((v) => ({
        id: String(v.id), name: v.name || '', number: v.name || '', mcVersions: [], loaders: [],
        date: '', supported: true, downloadUrl: '', size: 0, channel: v.type || 'release'
      }));
    },
    async manifest(id, versionId) {
      return request(`${BASE}/${Number(id)}/${Number(versionId)}`);
    }
  };
}

// Lee el manifest de una versión: versión de Minecraft, loader y lista de archivos permitidos.
function parseFtbManifest(m) {
  if (!m || !Array.isArray(m.targets) || !Array.isArray(m.files)) throw new Error('Este modpack no tiene el formato de FTB esperado.');
  const t = (type, name) => m.targets.find((x) => x.type === type && (!name || x.name === name));
  const game = t('game', 'minecraft');
  const mc = game && String(game.version || '');
  if (!mc || !isSafeVersion(mc)) throw new Error('El modpack no indica una versión de Minecraft válida.');
  const ml = t('modloader');
  let loader = { type: 'vanilla', version: '' };
  let unsupported = '';
  if (ml) {
    const name = String(ml.name || '').toLowerCase();
    const version = String(ml.version || '');
    if (['forge', 'fabric', 'neoforge'].includes(name) && isSafeVersion(version)) loader = { type: name, version };
    else unsupported = name === 'quilt' ? 'Quilt' : name || 'otro loader';
  }
  const files = [];
  for (const f of m.files) {
    if (f.serveronly) continue;
    const dir = String(f.path || './').replace(/\\/g, '/');
    const rel = safeRelPath(`${dir}/${f.name}`);
    if (!rel) throw new Error(`El modpack trae una ruta no permitida: ${dir}${f.name}`);
    const urls = [f.url, ...(f.mirrors || [])].filter((u) => allowedUrl(u, FTB_HOSTS));
    if (!urls.length) throw new Error(`No hay una descarga permitida para ${rel}.`);
    files.push({ path: rel, sha1: String((f.hashes && f.hashes.sha1) || f.sha1 || '').toLowerCase(), size: Number(f.size) || 0, urls });
  }
  return { mcVersion: mc, loader, unsupported, files };
}

async function installFtb({ manifest, root, download, onProgress }) {
  const info = parseFtbManifest(manifest);
  if (info.unsupported) throw new Error(`Este modpack usa ${info.unsupported}, que el launcher todavía no soporta.`);
  fs.mkdirSync(root, { recursive: true });
  const tasks = info.files.map((f) => async () => {
    let lastErr;
    for (const url of f.urls) {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt) await new Promise((r) => setTimeout(r, 800 * attempt));
        try {
          const data = await download(url);
          if (f.sha1 && crypto.createHash('sha1').update(data).digest('hex') !== f.sha1) throw new Error('La huella del archivo no coincide.');
          return writeInside(root, f.path, data);
        } catch (err) {
          lastErr = err;
        }
      }
    }
    throw new Error(`No se pudo descargar ${f.path} (${lastErr && lastErr.message}). Revisa tu conexión o antivirus e inténtalo otra vez.`);
  });
  await downloadAll(tasks, { onProgress });
  return { mcVersion: info.mcVersion, loader: info.loader, files: tasks.length, skipped: [] };
}

module.exports = { ftb, parseFtbManifest, installFtb, FTB_HOSTS };
