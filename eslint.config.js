// Revisión automática del código: encuentra variables sin declarar, usadas antes de definirse, etc.
const js = require('@eslint/js');
const globals = require('globals');
const fs = require('fs');
const path = require('path');
const espree = require('espree');

// La pantalla carga muchos scripts en la misma página y comparten lo que declaran al nivel superior (funciones y variables).
// Para que el linter lo entienda, se lee qué declara cada archivo y se avisa a los demás de que esos nombres existen.
function topLevelNames(file) {
  const names = new Set();
  const addPattern = (p) => {
    if (!p) return;
    if (p.type === 'Identifier') names.add(p.name);
    else if (p.type === 'ObjectPattern') p.properties.forEach((q) => addPattern(q.value || q.argument));
    else if (p.type === 'ArrayPattern') p.elements.forEach(addPattern);
    else if (p.type === 'AssignmentPattern') addPattern(p.left);
    else if (p.type === 'RestElement') addPattern(p.argument);
  };
  const ast = espree.parse(fs.readFileSync(file, 'utf8'), { ecmaVersion: 2023, sourceType: 'script' });
  for (const n of ast.body) {
    if ((n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration') && n.id) names.add(n.id.name);
    else if (n.type === 'VariableDeclaration') n.declarations.forEach((d) => addPattern(d.id));
  }
  return names;
}
// Se asignan con window.X = ... en un script y se usan sin "window." en otros.
const WINDOW_GLOBALS = ['NovaI18n', 'initRemote'];

function rendererConfigs() {
  const dirs = ['renderer', 'renderer/app'];
  const files = dirs.flatMap((d) => fs.readdirSync(path.join(__dirname, d)).filter((f) => f.endsWith('.js')).map((f) => path.join(d, f)));
  const own = new Map(files.map((f) => [f, topLevelNames(path.join(__dirname, f))]));
  return files.map((f) => {
    const globalsHere = { ...globals.browser, module: 'readonly' };
    WINDOW_GLOBALS.forEach((n) => { globalsHere[n] = 'readonly'; });
    for (const [other, names] of own) if (other !== f) names.forEach((n) => { globalsHere[n] = 'writable'; });
    own.get(f).forEach((n) => { globalsHere[n] = 'off'; });
    return {
      files: [f.split(path.sep).join('/')],
      languageOptions: { sourceType: 'script', globals: globalsHere },
      // Lo declarado al nivel superior lo usan otros scripts: solo se avisa de variables sin uso dentro de funciones.
      rules: { 'no-unused-vars': ['warn', { vars: 'local', args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }] }
    };
  });
}


module.exports = [
  { ignores: ['node_modules/**', 'dist/**', 'renderer/images/**', 'data/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...globals.node } },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-use-before-define': ['error', { functions: false, classes: false, variables: false }],
      'no-prototype-builtins': 'off',
      'no-control-regex': 'off',
      'no-useless-escape': 'off',
      'no-inner-declarations': 'off',
      'no-useless-assignment': 'off',
      'preserve-caught-error': 'off'
    }
  },
  ...rendererConfigs(),
  {
    // Esta prueba manda código al navegador (window, document) dentro de page.evaluate.
    files: ['tools/prueba-arranque.js', 'tools/capturas.js'],
    languageOptions: { globals: { ...globals.browser } }
  },
  {
    files: ['worker/**/*.mjs'],
    languageOptions: { sourceType: 'module', globals: { ...globals.serviceworker, ...globals.browser } }
  }
];
