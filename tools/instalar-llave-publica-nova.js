#!/usr/bin/env node
'use strict';
/*
 * Copia la llave PÚBLICA de Nova a config/nova-firma.pub.pem después de comprobarla.
 *   node tools/instalar-llave-publica-nova.js nova-firma.pub.pem
 * Se niega si el archivo es una llave privada (nunca debe entrar al repositorio) o si no es Ed25519.
 * Muestra la huella SHA-256 para compararla con la de `tools/verificar-llave-nova.js` y la del flujo
 * «Comprobar llave Nova» (que usa el secreto NOVA_FIRMA_PRIVADA sin mostrarlo).
 * Instalar la pública NO hace obligatoria la firma: eso se activa aparte con "novaFirmaObligatoria": true.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const src = process.argv[2];
if (!src) { console.error('Uso: node tools/instalar-llave-publica-nova.js <archivo.pub.pem>'); process.exit(1); }
const text = fs.readFileSync(src, 'utf8');
if (/PRIVATE KEY/.test(text)) { console.error('Ese archivo es una llave PRIVADA. No la copies al repositorio; usa la pública.'); process.exit(1); }
let pub;
try { pub = crypto.createPublicKey(text); } catch { console.error('No es una llave pública PEM válida.'); process.exit(1); }
if (pub.asymmetricKeyType !== 'ed25519') { console.error(`La llave es ${pub.asymmetricKeyType}, no Ed25519.`); process.exit(1); }
const pem = pub.export({ type: 'spki', format: 'pem' });
const huella = crypto.createHash('sha256').update(pub.export({ type: 'spki', format: 'der' })).digest('hex');
const dest = path.join(__dirname, '..', 'config', 'nova-firma.pub.pem');
fs.writeFileSync(dest, pem);
console.log(`Llave pública Ed25519 instalada en config/nova-firma.pub.pem`);
console.log(`Huella (SHA-256): ${huella}`);
console.log('La firma sigue opcional hasta poner "novaFirmaObligatoria": true en config/launcher.config.json.');
