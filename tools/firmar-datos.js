#!/usr/bin/env node
'use strict';
/*
 * Firma los archivos críticos de data/ (manifest, plugins, recommended, launcher) con la llave privada de firma.
 *
 *   node tools/firmar-datos.js ruta/a/firma-datos.PRIVADA.pem
 *
 * La llave privada NO está en el repositorio. Hay que correr esto después de editar esos archivos a mano
 * (por ejemplo con tools/generar-mods.js). Publicando desde el launcher, la firma se hace sola.
 */
const fs = require('fs');
const path = require('path');
const { FIRMADOS, firmar, llaveCoincide, rutaFirma } = require('../lib/firma');

const root = path.join(__dirname, '..');
const privFile = process.argv[2];
if (!privFile) {
  console.error('Uso: node tools/firmar-datos.js ruta/a/firma-datos.PRIVADA.pem');
  process.exit(1);
}
const priv = fs.readFileSync(privFile, 'utf8');
const pub = fs.readFileSync(path.join(root, 'config', 'firma-datos.pub.pem'), 'utf8');
if (!llaveCoincide(priv, pub)) {
  console.error('Esa llave no corresponde a config/firma-datos.pub.pem.');
  process.exit(1);
}
for (const nombre of FIRMADOS) {
  const file = path.join(root, 'data', `${nombre}.json`);
  const sig = firmar(nombre, fs.readFileSync(file), priv);
  fs.writeFileSync(rutaFirma(file), JSON.stringify(sig, null, 2) + '\n');
  console.log(`Firmado data/${nombre}.json`);
}
