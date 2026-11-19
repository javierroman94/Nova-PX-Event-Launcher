'use strict';
// Pruebas de lib/loaders.js. Ejecutar con: npm test
const assert = require('assert');
const L = require('../lib/loaders');

let count = 0;
function test(name, fn) {
  fn();
  count++;
  console.log(`  ok  ${name}`);
}

test('Java mínimo según la versión de Minecraft', () => {
  assert.strictEqual(L.requiredJavaMajor('1.12.2'), 8);
  assert.strictEqual(L.requiredJavaMajor('1.16.5'), 8);
  assert.strictEqual(L.requiredJavaMajor('1.17.1'), 16);
  assert.strictEqual(L.requiredJavaMajor('1.18'), 17);
  assert.strictEqual(L.requiredJavaMajor('1.20.1'), 17);
  assert.strictEqual(L.requiredJavaMajor('1.20.4'), 17);
  assert.strictEqual(L.requiredJavaMajor('1.20.5'), 21);
  assert.strictEqual(L.requiredJavaMajor('1.21'), 21);
  assert.strictEqual(L.requiredJavaMajor('1.21.1'), 21);
  assert.strictEqual(L.requiredJavaMajor('26.1'), 25);
  assert.strictEqual(L.requiredJavaMajor('24w14a'), null);
  assert.strictEqual(L.requiredJavaMajor(''), null);
});

test('Lee la versión de Java desde "java -version"', () => {
  assert.strictEqual(L.parseJavaMajor('java version "1.8.0_391"\nJava(TM) SE Runtime'), 8);
  assert.strictEqual(L.parseJavaMajor('openjdk version "17.0.9" 2023-10-17'), 17);
  assert.strictEqual(L.parseJavaMajor('openjdk version "21" 2023-09-19'), 21);
  assert.strictEqual(L.parseJavaMajor('openjdk version "21-ea" 2023-09-19'), 21);
  assert.strictEqual(L.parseJavaMajor('no es java'), null);
  assert.strictEqual(L.parseJavaMajor(null), null);
});

test('Elige la versión de Forge: recomendada, luego la última, o la que pidas', () => {
  const promos = { promos: { '1.20.1-latest': '47.3.0', '1.20.1-recommended': '47.2.0', '1.19.2-latest': '43.4.0' } };
  assert.strictEqual(L.pickForgeVersion(promos, '1.20.1'), '47.2.0');
  assert.strictEqual(L.pickForgeVersion(promos, '1.19.2'), '43.4.0');
  assert.strictEqual(L.pickForgeVersion(promos, '1.8.9'), null);
  assert.strictEqual(L.pickForgeVersion(null, '1.20.1', '47.1.0'), '47.1.0');
  assert.strictEqual(L.pickForgeVersion(null, '1.20.1'), null);
});

test('Rechaza versiones con caracteres peligrosos (rutas o enlaces manipulados)', () => {
  assert.strictEqual(L.isSafeVersion('47.2.0'), true);
  assert.strictEqual(L.isSafeVersion('1.20.1'), true);
  assert.strictEqual(L.isSafeVersion('../../x'), false);
  assert.strictEqual(L.isSafeVersion('47/2'), false);
  assert.strictEqual(L.isSafeVersion('a b'), false);
  assert.strictEqual(L.isSafeVersion(''), false);
  assert.strictEqual(L.pickForgeVersion(null, '1.20.1', '../evil'), null);
  assert.strictEqual(L.pickForgeVersion({ promos: { '1.20.1-recommended': '../evil' } }, '1.20.1'), null);
});

test('Enlace y nombre del archivo de Forge', () => {
  assert.strictEqual(L.forgeKind('1.20.1'), 'installer');
  assert.strictEqual(L.forgeKind('1.13'), 'installer');
  assert.strictEqual(L.forgeKind('1.12.2'), 'universal');
  assert.strictEqual(
    L.forgeUrl('1.20.1', '47.2.0'),
    'https://maven.minecraftforge.net/net/minecraftforge/forge/1.20.1-47.2.0/forge-1.20.1-47.2.0-installer.jar'
  );
  assert.strictEqual(L.forgeFileName('1.12.2', '14.23.5.2860'), 'forge-1.12.2-14.23.5.2860-universal.jar');
});

test('Loaders soportados', () => {
  assert.deepStrictEqual(L.SUPPORTED_LOADERS, ['vanilla', 'fabric', 'forge', 'neoforge']);
});

console.log(`\n${count} pruebas correctas.`);

// ---- NeoForge ----
{
  const assert = require('assert');
  const L = require('../lib/loaders');
  assert.strictEqual(L.neoforgeMcPrefix('1.21.1'), '21.1.');
  assert.strictEqual(L.neoforgeMcPrefix('1.21'), '21.0.');
  assert.strictEqual(L.neoforgeMcPrefix('1.20.2'), '20.2.');
  assert.strictEqual(L.neoforgeMcPrefix('1.20.1'), null, '1.20.1 usaba otro esquema');
  assert.strictEqual(L.neoforgeMcPrefix('24w14a'), null);
  const vs = ['20.2.86', '21.0.167', '21.1.9', '21.1.172', '21.1.73', '21.1.200-beta', '21.10.3', '21.11.0-beta'];
  assert.strictEqual(L.pickNeoForgeVersion(vs, '1.21.1'), '21.1.172');
  assert.strictEqual(L.pickNeoForgeVersion(['21.11.0-beta'], '1.21.11'), '21.11.0-beta', 'sin estable, la beta más nueva');
  assert.strictEqual(L.pickNeoForgeVersion(vs, '1.21.11'), '21.11.0-beta');
  assert.strictEqual(L.pickNeoForgeVersion(vs, '1.19.2'), null);
  assert.strictEqual(L.pickNeoForgeVersion(vs, '1.21.1', '21.1.77'), '21.1.77');
  assert.strictEqual(L.pickNeoForgeVersion(vs, '1.21.1', '../x'), null);
  assert.strictEqual(L.neoforgeUrl('21.1.172'), 'https://maven.neoforged.net/releases/net/neoforged/neoforge/21.1.172/neoforge-21.1.172-installer.jar');
  assert.ok(L.SUPPORTED_LOADERS.includes('neoforge'));
  console.log('  ok  NeoForge: versión según Minecraft, estable antes que beta y rutas seguras');
}
