#!/usr/bin/env node
'use strict';
/*
 * Comprueba la llave de publicaciones de Nova antes de configurarla (no sube ni imprime nada secreto).
 *   node tools/verificar-llave-nova.js nova-firma.PRIVADA.pem             → tipo, huella de la pública y si coincide con config/
 *   node tools/verificar-llave-nova.js nova-firma.PRIVADA.pem --pub ruta  → además escribe la pública derivada en «ruta»
 * También acepta la privada en la variable NOVA_FIRMA_PRIVADA (así la usa el CI).
 * La huella es el SHA-256 de la pública (SPKI DER): compárala con la que muestra el PR o la documentación.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const firma = require('../lib/firma');

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--pub');
const pubOut = args.includes('--pub') ? args[args.indexOf('--pub') + 1] : null;
const pem = file ? fs.readFileSync(file, 'utf8') : process.env.NOVA_FIRMA_PRIVADA || '';
if (!pem.trim()) { console.error('Pasa la ruta de la llave privada o define NOVA_FIRMA_PRIVADA.'); process.exit(1); }

let priv;
try { priv = crypto.createPrivateKey(pem); } catch { console.error('No es una llave privada PEM válida.'); process.exit(1); }
if (priv.asymmetricKeyType !== 'ed25519') { console.error(`La llave es ${priv.asymmetricKeyType}, no Ed25519.`); process.exit(1); }
const pub = crypto.createPublicKey(priv);
const huella = crypto.createHash('sha256').update(pub.export({ type: 'spki', format: 'der' })).digest('hex');
console.log('Tipo: Ed25519');
console.log(`Huella de la pública (SHA-256): ${huella}`);

// Prueba de ida y vuelta: firma y verifica un texto de prueba con el mismo formato que usa el launcher.
const prueba = firma.firmar('nova-loader', Buffer.from('prueba'), pem);
firma.verificar('nova-loader', Buffer.from('prueba'), prueba, pub.export({ type: 'spki', format: 'pem' }));
console.log('Firma de prueba: correcta');

const cfg = path.join(__dirname, '..', 'config', 'nova-firma.pub.pem');
if (fs.existsSync(cfg)) {
  const ok = firma.llaveCoincide(pem, fs.readFileSync(cfg, 'utf8'));
  console.log(ok ? 'Coincide con config/nova-firma.pub.pem' : 'NO coincide con config/nova-firma.pub.pem');
  if (!ok) process.exit(2);
} else console.log('config/nova-firma.pub.pem todavía no existe.');
if (pubOut) {
  fs.writeFileSync(pubOut, pub.export({ type: 'spki', format: 'pem' }));
  console.log(`Pública escrita en ${pubOut}`);
}
