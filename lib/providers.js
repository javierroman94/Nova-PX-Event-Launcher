'use strict';
// Búsqueda de modpacks en Modrinth y CurseForge. `request(url, {method, body, headers})` se inyecta.
const MODRINTH = 'https://api.modrinth.com/v2';
const CURSE = 'https://api.curseforge.com/v1';
const CURSE_GAME = 432; // Minecraft
const CURSE_MODPACKS = 4471; // clase "Modpacks"

const httpsOr = (u) => (/^https:\/\//i.test(u || '') ? u : '');
const LOADERS = ['fabric', 'forge', 'neoforge', 'quilt'];

function modrinth(request) {
  return {
    async search({ query = '', offset = 0 }) {
      const facets = encodeURIComponent(JSON.stringify([['project_type:modpack']]));
      const q = query.trim();
      const r = await request(`${MODRINTH}/search?query=${encodeURIComponent(q)}&facets=${facets}&limit=20&offset=${Number(offset) || 0}&index=${q ? 'relevance' : 'downloads'}`);
      return {
        total: r.total_hits || 0,
        items: (r.hits || []).map((h) => ({
          provider: 'modrinth', id: String(h.project_id), title: h.title, summary: h.description || '',
          icon: httpsOr(h.icon_url), downloads: h.downloads || 0, author: h.author || '',
          url: h.slug ? `https://modrinth.com/modpack/${encodeURIComponent(h.slug)}` : ''
        }))
      };
    },
    async versions(id) {
      const list = await request(`${MODRINTH}/project/${encodeURIComponent(id)}/version`);
      return (list || []).map((v) => {
        const file = (v.files || []).find((f) => f.primary) || (v.files || [])[0];
        const loaders = (v.loaders || []).filter((l) => LOADERS.includes(l));
        return {
          id: String(v.id), name: v.name || v.version_number || '', number: v.version_number || '',
          mcVersions: v.game_versions || [], loaders, date: v.date_published || '',
          supported: !loaders.length || loaders.some((l) => l === 'fabric' || l === 'forge'),
          downloadUrl: file ? file.url : '', size: file ? file.size : 0
        };
      }).filter((v) => v.downloadUrl);
    }
  };
}

function curseforge(request, apiKey) {
  const headers = { 'x-api-key': apiKey, Accept: 'application/json' };
  return {
    async search({ query = '', offset = 0 }) {
      const q = query.trim();
      const r = await request(`${CURSE}/mods/search?gameId=${CURSE_GAME}&classId=${CURSE_MODPACKS}&searchFilter=${encodeURIComponent(q)}&pageSize=20&index=${Number(offset) || 0}&sortField=${q ? 1 : 2}&sortOrder=desc`, { headers });
      return {
        total: (r.pagination && r.pagination.totalCount) || 0,
        items: (r.data || []).map((m) => ({
          provider: 'curseforge', id: String(m.id), title: m.name, summary: m.summary || '',
          icon: httpsOr(m.logo && (m.logo.thumbnailUrl || m.logo.url)), downloads: m.downloadCount || 0,
          author: (m.authors && m.authors[0] && m.authors[0].name) || '',
          url: httpsOr(m.links && m.links.websiteUrl)
        }))
      };
    },
    async versions(id) {
      const r = await request(`${CURSE}/mods/${encodeURIComponent(id)}/files?pageSize=30`, { headers });
      return (r.data || []).map((f) => {
        const gv = f.gameVersions || [];
        const loaders = gv.map((x) => String(x).toLowerCase()).filter((x) => LOADERS.includes(x));
        return {
          id: String(f.id), name: f.displayName || f.fileName, number: f.fileName || '',
          mcVersions: gv.filter((x) => /^\d+\.\d+/.test(x)), loaders, date: f.fileDate || '',
          supported: !loaders.length || loaders.some((l) => l === 'fabric' || l === 'forge'),
          downloadUrl: f.downloadUrl || '', blocked: !f.downloadUrl, size: f.fileLength || 0
        };
      });
    },
    // Datos de descarga de cada archivo del modpack (y su tipo, para saber en qué carpeta va).
    async resolveFiles(files) {
      const out = [];
      for (let i = 0; i < files.length; i += 50) {
        const chunk = files.slice(i, i + 50);
        const fr = await request(`${CURSE}/mods/files`, { method: 'POST', headers, body: { fileIds: chunk.map((f) => f.fileID) } });
        const mr = await request(`${CURSE}/mods`, { method: 'POST', headers, body: { modIds: [...new Set(chunk.map((f) => f.projectID))] } });
        const cls = new Map((mr.data || []).map((m) => [m.id, m.classId]));
        for (const f of fr.data || []) {
          const sha1 = ((f.hashes || []).find((h) => h.algo === 1) || {}).value || '';
          out.push({ fileID: f.id, projectID: f.modId, fileName: f.fileName, downloadUrl: f.downloadUrl || '', sha1, classId: cls.get(f.modId) });
        }
      }
      return out;
    },
    async fileDownloadUrl(modId, fileId) {
      const r = await request(`${CURSE}/mods/${encodeURIComponent(modId)}/files/${encodeURIComponent(fileId)}`, { headers });
      return (r.data && r.data.downloadUrl) || '';
    }
  };
}

module.exports = { modrinth, curseforge };
