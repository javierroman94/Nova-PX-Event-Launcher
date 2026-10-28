'use strict';
// Ejecuta todas las pruebas (cualquier archivo test/*.test.js). Uso: npm test
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let failed = 0;
for (const file of fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js')).sort()) {
  console.log(`\n== ${file}`);
  const r = spawnSync(process.execPath, [path.join(__dirname, file)], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}
if (failed) {
  console.error(`\n${failed} archivo(s) de pruebas fallaron.`);
  process.exit(1);
}
console.log('\nTodas las pruebas pasaron.');
