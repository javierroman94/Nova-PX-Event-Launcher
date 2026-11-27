#!/usr/bin/env node
'use strict';
/*
 * Firma data/nova-loader.json con la llave de publicaciones de Nova (Ed25519).
 * La llave privada NO está en el repositorio: llega como secreto de GitHub Actions en NOVA_FIRMA_PRIVADA (PEM).
 * Si el launcher ya trae config/nova-firma.pub.pem, la llave tiene que corresponder a esa pública.
 * Uso (en CI): NOVA_FIRMA_PRIVADA="$SECRETO" node tools/firmar-nova.js
 */
const fs = require('fs');
const path = require('path');
const firma = require('../lib/firma');

const root = path.join(__dirname, '..');
const priv = process.env.NOVA_FIRMA_PRIVADA || '';
if (!priv.trim()) { console.error('Falta NOVA_FIRMA_PRIVADA.'); process.exit(1); }
const pubFile = path.join(root, 'config', 'nova-firma.pub.pem');
if (fs.existsSync(pubFile) && !firma.llaveCoincide(priv, fs.readFileSync(pubFile, 'utf8'))) {
  console.error('NOVA_FIRMA_PRIVADA no corresponde a config/nova-firma.pub.pem.');
  process.exit(1);
}
const file = path.join(root, 'data', 'nova-loader.json');
const bytes = fs.readFileSync(file);
const sig = firma.firmar('nova-loader', bytes, priv);
fs.writeFileSync(path.join(root, 'data', 'nova-loader.firma.json'), JSON.stringify(sig, null, 1) + '\n');
console.log(`Firmado nova-loader.json (${sig.firmadoEn}).`);
