'use strict';
const fs = require('fs');
const path = require('path');

// Borra solo lo que el launcher instaló del evento (mods y sus marcas), nunca ajustes, cuenta ni mundos.
// La carpeta debe estar dentro de "instancias" para no borrar nada fuera por error.
function repairInstance(eventDir) {
  const resolved = path.resolve(eventDir);
  if (path.basename(path.dirname(resolved)) !== 'instancias') throw new Error('Carpeta de evento no válida.');
  let removed = 0;
  const mods = path.join(resolved, 'mods');
  if (fs.existsSync(mods)) {
    for (const f of fs.readdirSync(mods)) {
      fs.rmSync(path.join(mods, f), { recursive: true, force: true });
      removed++;
    }
  }
  for (const marker of ['.managed-mods.json', '.pack-state.json']) {
    const p = path.join(resolved, marker);
    if (fs.existsSync(p)) {
      fs.rmSync(p, { force: true });
      removed++;
    }
  }
  return removed;
}

module.exports = { repairInstance };
