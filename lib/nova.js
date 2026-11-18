'use strict';
const fs = require('fs');
const path = require('path');
/*
 * Perfil "Nova": Fabric + los mods de rendimiento que usan los packs optimizados (Keo Optimized y similares).
 * Todo viene de Modrinth. Si un mod no existe para esa versión de Minecraft se salta y el resto se instala igual.
 */

// slug de Modrinth -> para qué sirve (se muestra en la instancia).
const NOVA_MODS = [
  ['sodium', 'Motor de render: muchos más FPS'],
  ['lithium', 'Optimiza la lógica del juego'],
  ['ferrite-core', 'Menos uso de memoria RAM'],
  ['modernfix', 'Arranque rápido y menos tirones'],
  ['entityculling', 'No dibuja lo que no se ve'],
  ['scalablelux', 'Iluminación mucho más rápida'],
  ['immersive-optimization', 'Menos carga con muchas entidades'],
  ['badoptimizations', 'Pequeñas mejoras de rendimiento'],
  ['saturn', 'Menos memoria en entidades y modelos'],
  ['reeses-sodium-options', 'Menú de vídeo claro para Sodium'],
  ['iris', 'Shaders (compatible con Sodium)']
];

const PRESETS = ['nova', 'optifine'];

// Instala los mods del preset. install(slug) debe instalar un mod (lanza error si no hay versión compatible).
async function installNovaMods(install, { onStatus = () => {}, mods = NOVA_MODS } = {}) {
  const installed = [];
  const skipped = [];
  for (const [slug] of mods) {
    onStatus(`Instalando ${slug}…`);
    try {
      const r = await install(slug);
      for (const f of (r && r.installed) || []) installed.push(f);
    } catch {
      skipped.push(slug);
    }
  }
  return { installed: [...new Set(installed)], skipped };
}

// ---- Nova Client (el mod propio): se baja de la última release de GitHub ----
const CLIENT_REPO = 'javierroman94/Nova-Client';

// Elige el .jar de la release que sirve para esa versión de Minecraft (nova-client-X.Y.Z+mc1.21.1.jar).
function pickClientAsset(release, mc) {
  const want = new RegExp(`^nova-client-[0-9A-Za-z._-]+\\+mc${String(mc).replace(/[^0-9A-Za-z]/g, (c) => '\\' + c)}\\.jar$`);
  for (const a of (release && release.assets) || []) {
    if (!a || !want.test(String(a.name))) continue;
    try {
      const u = new URL(a.browser_download_url);
      if (u.protocol === 'https:' && u.hostname === 'github.com' && u.pathname.startsWith(`/${CLIENT_REPO}/releases/download/`)) return { name: a.name, url: a.browser_download_url };
    } catch {}
  }
  return null;
}

// Descarga Nova Client en la carpeta mods de la instancia (reemplaza versiones anteriores). Devuelve el nombre o null.
async function installNovaClient({ request, download, dir, mc }) {
  const release = await request(`https://api.github.com/repos/${CLIENT_REPO}/releases/latest`);
  const asset = pickClientAsset(release, mc);
  if (!asset) return null;
  const mods = path.join(dir, 'mods');
  fs.mkdirSync(mods, { recursive: true });
  for (const f of fs.readdirSync(mods)) if (/^nova-client-.*\.jar(\.disabled)?$/i.test(f) && f !== asset.name) fs.rmSync(path.join(mods, f), { force: true });
  const dest = path.join(mods, asset.name);
  if (!fs.existsSync(dest)) fs.writeFileSync(dest, await download(asset.url));
  return asset.name;
}

module.exports = { NOVA_MODS, PRESETS, CLIENT_REPO, installNovaMods, pickClientAsset, installNovaClient };
