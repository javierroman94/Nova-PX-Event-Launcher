'use strict';
/*
 * Imágenes oficiales de cada versión de Minecraft. No se guardan en el launcher: se leen en vivo del contenido que
 * Mojang publica para su propio launcher (https://launchercontent.mojang.com) y solo se muestran en pantalla.
 */
const HOST = 'launchercontent.mojang.com';
const FEED = `https://${HOST}/v2/javaPatchNotes.json`;

// Devuelve { '1.21.1': { image, title }, ... } solo con versiones finales (no snapshots) y de imágenes en ese servidor.
function buildArtMap(feed) {
  const out = {};
  for (const e of (feed && feed.entries) || []) {
    if (!e || e.type !== 'release' || !/^\d+\.\d+(\.\d+)?$/.test(String(e.version)) || !e.image || typeof e.image.url !== 'string') continue;
    let u;
    try { u = new URL(e.image.url, `https://${HOST}`); } catch { continue; }
    if (u.protocol !== 'https:' || u.hostname !== HOST || !u.pathname.startsWith('/v2/images/')) continue;
    out[e.version] = { image: u.toString(), title: String(e.title || '').slice(0, 80) };
  }
  return out;
}

// Para las series que el servidor de Mojang ya no ilustra (1.12 y anteriores) se usa la imagen de portada de la
// página «Java Edition 1.X» de minecraft.wiki (arte oficial de Mojang). Se muestra en vivo, no se guarda.
const WIKI_HOST = 'minecraft.wiki';
const wikiUrl = (keys) => `https://${WIKI_HOST}/api.php?action=query&prop=pageimages&format=json&pithumbsize=600&redirects=1&titles=` +
  keys.filter((k) => /^1\.\d{1,2}$/.test(k)).map((k) => encodeURIComponent(`Java Edition ${k}`)).join('%7C');

function buildWikiMap(json) {
  const out = {};
  const pages = (json && json.query && json.query.pages) || {};
  for (const p of Object.values(pages)) {
    const m = /^Java Edition (1\.\d{1,2})$/.exec(String((p && p.title) || ''));
    if (!m || !p.thumbnail || typeof p.thumbnail.source !== 'string') continue;
    let u;
    try { u = new URL(p.thumbnail.source); } catch { continue; }
    if (u.protocol !== 'https:' || u.hostname !== WIKI_HOST || !u.pathname.startsWith('/images/')) continue;
    out[m[1]] = { image: u.toString(), title: '' };
  }
  return out;
}

module.exports = { FEED, HOST, buildArtMap, wikiUrl, buildWikiMap };
