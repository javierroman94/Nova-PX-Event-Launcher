'use strict';
const fs = require('fs');
const path = require('path');
/*
 * OptiFine: se descarga directamente desde optifine.net (la página oficial), igual que lo haría el jugador con el
 * navegador. Nova PX no guarda ni redistribuye el .jar; solo lo baja a la carpeta mods de la instancia.
 */
const HOST = 'optifine.net';
const LIST_URL = `https://${HOST}/downloads`;

// Lee la página de descargas y devuelve { '1.12.2': { file, label }, ... } con la versión estable más nueva de cada Minecraft.
function parseList(html) {
  const out = {};
  const re = /adloadx\?f=((?!preview_)OptiFine_([0-9][0-9A-Za-z.]*)_HD_U_([A-Za-z0-9_]+)\.jar)/g;
  let m;
  while ((m = re.exec(String(html || '')))) {
    const [, file, mc] = m;
    if (!out[mc]) out[mc] = { file, label: file.replace(/^OptiFine_/, '').replace(/\.jar$/, '').replace(/_/g, ' ') };
  }
  return out;
}

const safeName = (f) => /^OptiFine_[0-9][0-9A-Za-z._]*\.jar$/.test(String(f || ''));

// La página adloadx contiene el enlace real con una clave: downloadx?f=...&x=...
function parseDownloadLink(html, file) {
  const re = /downloadx\?f=([^&'"]+)&(?:amp;)?x=([0-9a-f]+)/i.exec(String(html || ''));
  if (!re || re[1] !== file) return null;
  return `https://${HOST}/downloadx?f=${encodeURIComponent(file)}&x=${re[2]}`;
}

async function listVersions(fetchText) { return parseList(await fetchText(LIST_URL)); }

// Descarga OptiFine para esa versión de Minecraft en <dir>/mods. Devuelve el nombre del archivo o null si no existe.
async function installOptiFine({ fetchText, download, dir, mc }) {
  const list = await listVersions(fetchText);
  const hit = list[mc];
  if (!hit || !safeName(hit.file)) return null;
  const link = parseDownloadLink(await fetchText(`https://${HOST}/adloadx?f=${encodeURIComponent(hit.file)}`), hit.file);
  if (!link) throw new Error('optifine.net no dio el enlace de descarga.');
  const buf = await download(link);
  if (!buf || buf.length < 100000 || buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error('La descarga de OptiFine no es un .jar válido.');
  const mods = path.join(dir, 'mods');
  fs.mkdirSync(mods, { recursive: true });
  for (const f of fs.readdirSync(mods)) if (/^OptiFine_.*\.jar(\.disabled)?$/i.test(f) && f !== hit.file) fs.rmSync(path.join(mods, f), { force: true });
  fs.writeFileSync(path.join(mods, hit.file), buf);
  return hit.file;
}

module.exports = { LIST_URL, parseList, parseDownloadLink, safeName, listVersions, installOptiFine };
