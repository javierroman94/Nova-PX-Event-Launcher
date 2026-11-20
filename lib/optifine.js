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

// Descarga solo el .jar oficial (sin tocar mods) a <destDir>. Devuelve el nombre o null si no hay versión para ese Minecraft.
async function fetchJar({ fetchText, download, destDir, mc }) {
  const list = await listVersions(fetchText);
  const hit = list[mc];
  if (!hit || !safeName(hit.file)) return null;
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, hit.file);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 100000) return hit.file;
  const link = parseDownloadLink(await fetchText(`https://${HOST}/adloadx?f=${encodeURIComponent(hit.file)}`), hit.file);
  if (!link) throw new Error('optifine.net no dio el enlace de descarga.');
  const buf = await download(link);
  if (!buf || buf.length < 100000 || buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error('La descarga de OptiFine no es un .jar válido.');
  fs.writeFileSync(dest, buf);
  return hit.file;
}

// Id de la versión que crea el instalador de OptiFine (p. ej. «1.12.2-OptiFine_HD_U_G5»), si ya existe en <gameDir>/versions.
function installedVersionId(gameDir, mc) {
  try {
    const want = new RegExp(`^${String(mc).replace(/[^0-9A-Za-z]/g, (c) => '\\' + c)}-OptiFine_`);
    return fs.readdirSync(path.join(gameDir, 'versions')).filter((d) => want.test(d) && fs.existsSync(path.join(gameDir, 'versions', d, `${d}.json`))).sort().pop() || null;
  } catch { return null; }
}

// OptiFine «solo»: ejecuta el instalador oficial del propio .jar (sin ventana) sobre <gameDir>. Necesita el Minecraft
// vanilla de esa versión ya en <gameDir>/versions (lo prepara ensureVanilla). run(args) ejecuta Java y devuelve la salida.
async function installStandalone({ gameDir, mc, jarPath, ensureVanilla, run, helperClass }) {
  const have = installedVersionId(gameDir, mc);
  if (have) return have;
  await ensureVanilla();
  const profiles = path.join(gameDir, 'launcher_profiles.json');
  if (!fs.existsSync(profiles)) fs.writeFileSync(profiles, JSON.stringify({ profiles: {}, version: 3 }));
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'nova-of-'));
  try {
    fs.writeFileSync(path.join(tmp, 'NovaOfInstall.class'), helperClass);
    const out = await run(['-Djava.awt.headless=true', '-cp', `${jarPath}${path.delimiter}${tmp}`, 'NovaOfInstall', gameDir]);
    if (!/NOVA_OF_OK/.test(String(out))) throw new Error('El instalador de OptiFine no terminó bien.');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  const id = installedVersionId(gameDir, mc);
  if (!id) throw new Error('OptiFine no creó la versión esperada.');
  return id;
}

module.exports = { fetchJar, installedVersionId, installStandalone, LIST_URL, parseList, parseDownloadLink, safeName, listVersions, installOptiFine };
