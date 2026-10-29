'use strict';
// Reconoce los mods instalados con la API pública de Modrinth (por la huella SHA-1 de cada .jar).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const API = 'https://api.modrinth.com/v2';

function sha1File(file) {
  return crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
}

// Nombre legible cuando Modrinth no conoce el mod: "sodium-fabric-0.6.0+mc1.21.jar" -> "sodium fabric 0.6.0+mc1.21"
function nameFromFile(file) {
  return path.basename(file).replace(/\.jar$/i, '').replace(/[_]+/g, ' ');
}

// Une lo que sabemos de cada .jar. `byHash`: sha1 -> versión de Modrinth; `projects`: id -> proyecto.
function buildModList(files, byHash, projects) {
  return files
    .map(({ file, hash }) => {
      const v = byHash[hash];
      const p = v && projects[v.project_id];
      if (!p) return { file, name: nameFromFile(file), known: false };
      return {
        file,
        known: true,
        name: p.title,
        summary: p.description || '',
        icon: /^https:\/\//i.test(p.icon_url || '') ? p.icon_url : '',
        version: v.version_number || '',
        url: p.slug ? `https://modrinth.com/mod/${encodeURIComponent(p.slug)}` : ''
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
}

async function lookup(files, request) {
  const hashes = files.map((f) => f.hash);
  if (!hashes.length) return {};
  const byHash = await request(`${API}/version_files`, { method: 'POST', body: { hashes, algorithm: 'sha1' } });
  const ids = [...new Set(Object.values(byHash || {}).map((v) => v.project_id))];
  const projects = {};
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const list = await request(`${API}/projects?ids=${encodeURIComponent(JSON.stringify(chunk))}`);
    for (const p of list || []) projects[p.id] = p;
  }
  return { byHash: byHash || {}, projects };
}

module.exports = { sha1File, nameFromFile, buildModList, lookup, API };
