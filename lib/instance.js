'use strict';

/*
 * Instancias: cada evento se instala en su propia carpeta (mods, mundos, options.txt...).
 * Las librerías, assets y versiones de Minecraft se comparten en la carpeta raíz para no descargarlas dos veces.
 */

const path = require('path');

// El id viene de internet (manifest.json): solo letras, números, guion y guion bajo.
function instanceId(manifest) {
  const raw = String((manifest && manifest.event && manifest.event.id) || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,39}$/.test(raw) ? raw : 'evento';
}

function instanceDir(rootDir, manifest) {
  return path.join(rootDir, 'instancias', instanceId(manifest));
}

module.exports = { instanceId, instanceDir };
