'use strict';
// Abre un informe sellado (event-error.enc) con la llave privada de soporte.
// Uso: node tools/abrir-informe.js informe.enc llave-privada.pem
const fs = require('fs');
const { unseal } = require('../lib/seal');
const [file, key] = process.argv.slice(2);
if (!file || !key) { console.error('Uso: node tools/abrir-informe.js informe.enc llave-privada.pem'); process.exit(1); }
process.stdout.write(unseal(fs.readFileSync(file), fs.readFileSync(key, 'utf8')));
