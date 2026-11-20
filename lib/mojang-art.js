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

module.exports = { FEED, HOST, buildArtMap };
