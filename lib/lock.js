'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/*
 * Bloqueo del modpack del evento: en la carpeta propia del evento solo puede haber lo que publica el organizador.
 *  - mods: se borra todo lo que no esté en la lista instalada y todo mod cuyo contenido haya cambiado.
 *  - resourcepacks / shaderpacks: se vacían (el evento no los incluye).
 * No toca mundos, capturas ni opciones. Se ejecuta antes de jugar el evento (nunca en modpacks propios).
 */
const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex');
const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};

function enforce(gameDir, { mods = true, resourcepacks = true, shaderpacks = true } = {}) {
  const removed = [];
  const drop = (full, label) => {
    try {
      fs.rmSync(full, { recursive: true, force: true });
      removed.push(label);
    } catch {}
  };

  if (mods) {
    const modsDir = path.join(gameDir, 'mods');
    const allowed = new Set((readJson(path.join(gameDir, '.managed-mods.json'), []) || []).map((n) => path.basename(String(n))));
    const hashes = readJson(path.join(gameDir, '.managed-hashes.json'), {}) || {};
    let entries = [];
    try {
      entries = fs.readdirSync(modsDir, { withFileTypes: true });
    } catch {}
    for (const e of entries) {
      const full = path.join(modsDir, e.name);
      if (!allowed.has(e.name)) { drop(full, `mods/${e.name}`); continue; }
      const want = hashes[e.name];
      if (want && e.isFile()) {
        let got = '';
        try { got = sha1(fs.readFileSync(full)); } catch {}
        if (got !== want) drop(full, `mods/${e.name} (modificado)`);
      }
    }
  }
  for (const [flag, dirName] of [[resourcepacks, 'resourcepacks'], [shaderpacks, 'shaderpacks']]) {
    if (!flag) continue;
    const dir = path.join(gameDir, dirName);
    let entries = [];
    try {
      entries = fs.readdirSync(dir);
    } catch {}
    for (const n of entries) drop(path.join(dir, n), `${dirName}/${n}`);
  }
  return removed;
}

module.exports = { enforce };
