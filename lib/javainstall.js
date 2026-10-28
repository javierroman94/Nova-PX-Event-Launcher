'use strict';

/*
 * Ayudas para instalar Java automáticamente (Eclipse Temurin, desde Adoptium).
 * Solo funciones que no necesitan internet, para poder probarlas.
 */

const fs = require('fs');
const path = require('path');

// Nombres que usa Adoptium para sistema operativo y arquitectura.
function adoptiumPlatform(platform, arch) {
  const os = { win32: 'windows', linux: 'linux', darwin: 'mac' }[platform];
  const cpu = { x64: 'x64', arm64: 'aarch64' }[arch];
  return os && cpu ? { os, arch: cpu } : null;
}

// Java 16 ya no se publica: para Minecraft 1.17 se usa Java 17.
function installMajor(need) {
  return need === 16 ? 17 : need;
}

function assetsUrl(major, os, arch) {
  const m = Number(major);
  if (!Number.isInteger(m) || m < 8 || m > 99) throw new Error('Versión de Java no válida.');
  return `https://api.adoptium.net/v3/assets/latest/${m}/hotspot?architecture=${arch}&image_type=jre&os=${os}&vendor=eclipse`;
}

// La respuesta de Adoptium es una lista; se toma el primer paquete con enlace de descarga https.
function pickAsset(list) {
  if (!Array.isArray(list)) return null;
  for (const item of list) {
    const pkg = item && item.binary && item.binary.package;
    if (pkg && /^https:\/\//i.test(String(pkg.link || '')) && pkg.name) {
      return {
        link: pkg.link,
        name: path.basename(String(pkg.name)),
        checksum: /^[0-9a-f]{64}$/i.test(String(pkg.checksum || '')) ? String(pkg.checksum).toLowerCase() : null
      };
    }
  }
  return null;
}

// Busca bin/java (o bin/java.exe) dentro de la carpeta donde se extrajo Java.
function findJavaBin(dir, platform, depth = 5) {
  const exe = platform === 'win32' ? 'java.exe' : 'java';
  if (depth < 0 || !fs.existsSync(dir)) return null;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  const direct = path.join(dir, 'bin', exe);
  if (path.basename(dir) !== 'bin' && fs.existsSync(direct) && fs.statSync(direct).isFile()) return direct;
  for (const e of entries) {
    if (e.isDirectory()) {
      const found = findJavaBin(path.join(dir, e.name), platform, depth - 1);
      if (found) return found;
    }
  }
  return null;
}

module.exports = { adoptiumPlatform, installMajor, assetsUrl, pickAsset, findJavaBin };
