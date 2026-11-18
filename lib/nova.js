'use strict';
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

module.exports = { NOVA_MODS, PRESETS, installNovaMods };
