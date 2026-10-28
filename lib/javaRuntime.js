'use strict';

/*
 * Instalación automática de Java (Eclipse Temurin, de Adoptium).
 * Se descarga solo el JRE (más liviano que el JDK) dentro de la carpeta del launcher,
 * sin tocar el Java del sistema ni pedir permisos de administrador.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const API = 'https://api.adoptium.net/v3/binary/latest';

function platformInfo(platform = process.platform, arch = process.arch) {
  const os = { win32: 'windows', darwin: 'mac', linux: 'linux' }[platform];
  const cpu = { x64: 'x64', arm64: 'aarch64', ia32: 'x32' }[arch];
  if (!os || !cpu) throw new Error(`Este sistema (${platform} ${arch}) no tiene instalación automática de Java.`);
  return { os, cpu };
}

function downloadApiUrl(major, platform, arch, base = API) {
  const { os, cpu } = platformInfo(platform, arch);
  return `${base}/${major}/ga/${os}/${cpu}/jre/hotspot/normal/eclipse`;
}

// Busca bin/java (o bin/java.exe) dentro de la carpeta extraída; en Mac está en Contents/Home/bin.
function findJavaBinary(dir, depth = 5) {
  if (!fs.existsSync(dir) || depth < 0) return null;
  const exe = process.platform === 'win32' ? 'java.exe' : 'java';
  const direct = path.join(dir, 'bin', exe);
  if (fs.existsSync(direct)) return direct;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      const found = findJavaBinary(path.join(dir, e.name), depth - 1);
      if (found) return found;
    }
  }
  return null;
}

function tarBinary() {
  // En Windows se usa el tar propio del sistema (lee .zip); el tar de Git no sabe hacerlo.
  if (process.platform === 'win32') {
    return path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  }
  return 'tar';
}

function extract(archive, destDir) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(destDir, { recursive: true });
    execFile(tarBinary(), ['-xf', archive, '-C', destDir], { timeout: 300000, windowsHide: true }, (err) =>
      err ? reject(new Error('No se pudo extraer el Java descargado.')) : resolve()
    );
  });
}

async function downloadToFile(url, dest, onProgress, fetchImpl) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`No se pudo descargar Java (HTTP ${res.status}).`);
  const total = Number(res.headers.get('content-length')) || 0;
  const hash = crypto.createHash('sha256');
  const out = fs.createWriteStream(dest);
  let done = 0;
  try {
    for await (const chunk of res.body) {
      hash.update(chunk);
      done += chunk.length;
      if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
      if (total && onProgress) onProgress(Math.round((done / total) * 100));
    }
  } finally {
    await new Promise((r) => out.end(r));
  }
  return hash.digest('hex');
}

/*
 * Instala el JRE de la versión `major` en <rootDir>/java-<major> y devuelve la ruta de java.
 * Opciones: rootDir, major, onStatus(texto), onProgress(porcentaje); base, platform y arch solo para pruebas.
 */
async function installJava({ rootDir, major, onStatus = () => {}, onProgress = () => {}, base, platform, arch, fetchImpl = fetch }) {
  const dest = path.join(rootDir, `java-${major}`);
  const existing = findJavaBinary(dest);
  if (existing) return existing;

  fs.mkdirSync(rootDir, { recursive: true });
  const apiUrl = downloadApiUrl(major, platform, arch, base);

  onStatus(`Preparando Java ${major}…`);
  const first = await fetchImpl(apiUrl, { redirect: 'manual' });
  const finalUrl = first.status >= 300 && first.status < 400 ? first.headers.get('location') : null;
  if (!finalUrl || !/^https:\/\//i.test(new URL(finalUrl, apiUrl).href) && !base) {
    throw new Error(`No hay una versión de Java ${major} disponible para este sistema.`);
  }
  const archiveUrl = new URL(finalUrl, apiUrl).href;
  const archive = path.join(rootDir, `java-${major}-descarga${/\.zip(\?|$)/i.test(archiveUrl) ? '.zip' : '.tar.gz'}`);
  const tmp = path.join(rootDir, `java-${major}-tmp`);

  try {
    onStatus(`Descargando Java ${major}…`);
    const sha256 = await downloadToFile(archiveUrl, archive, onProgress, fetchImpl);

    // Adoptium publica la suma sha256 junto a cada archivo; si está disponible, se comprueba.
    try {
      const res = await fetchImpl(`${archiveUrl}.sha256.txt`);
      if (res.ok) {
        const expected = (await res.text()).trim().split(/\s+/)[0].toLowerCase();
        if (/^[0-9a-f]{64}$/.test(expected) && expected !== sha256) {
          throw new Error('El Java descargado está dañado (no coincide su sha256). Inténtalo de nuevo.');
        }
      }
    } catch (err) {
      if (/sha256/.test(err.message)) throw err;
    }

    onStatus(`Instalando Java ${major}…`);
    fs.rmSync(tmp, { recursive: true, force: true });
    await extract(archive, tmp);
    const entries = fs.readdirSync(tmp);
    // El archivo trae una sola carpeta (jdk-17.0.9+9-jre): se usa como carpeta final.
    const inner = entries.length === 1 && fs.statSync(path.join(tmp, entries[0])).isDirectory() ? path.join(tmp, entries[0]) : tmp;
    fs.rmSync(dest, { recursive: true, force: true });
    fs.renameSync(inner, dest);
  } finally {
    fs.rmSync(archive, { force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  const bin = findJavaBinary(dest);
  if (!bin) throw new Error('Java se descargó, pero no se encontró el programa dentro de la carpeta.');
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(bin, 0o755);
    } catch {}
  }
  return bin;
}

module.exports = { installJava, findJavaBinary, downloadApiUrl, platformInfo };
