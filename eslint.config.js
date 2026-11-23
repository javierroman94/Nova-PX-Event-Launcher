// Revisión automática del código: encuentra variables sin declarar, usadas antes de definirse, etc.
const js = require('@eslint/js');
const globals = require('globals');

const SHARED = ['el', 'toast', 'cleanError', 'adm', 'goTo', 'LOADER_INFO', 'askConfirm', 'isAdmin', 'imageUrl', 'verAtLeast', 'paintNews', 'paintTeam', 'paintAdminEvents', 'pickImageCropped', 'PAGE_TITLES', 'NOVA_CLIENT_MC', 'mcList', 'javaFor', 'loggedIn', 'showMsg', 'NovaI18n', 'initRemote', 'loadInstalled', 'playPack', 'loadMcVersions'];

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
  {
    files: ['renderer/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      // La pantalla carga varios scripts en la misma página: lo que define app.js lo usan los demás.
      globals: {
        ...globals.browser, module: 'readonly',
        ...Object.fromEntries(SHARED.map((n) => [n, 'readonly']))
      }
    }
  },
  {
    // app.js es quien define esas funciones compartidas, así que ahí no cuentan como globales.
    files: ['renderer/app.js'],
    languageOptions: { globals: Object.fromEntries(SHARED.filter((n) => n !== 'NovaI18n' && n !== 'initRemote').map((n) => [n, 'off'])) }
  },
  {
    // Esta prueba manda código al navegador (window, document) dentro de page.evaluate.
    files: ['tools/prueba-arranque.js'],
    languageOptions: { globals: { ...globals.browser } }
  },
  {
    files: ['worker/**/*.mjs'],
    languageOptions: { sourceType: 'module', globals: { ...globals.serviceworker, ...globals.browser } }
  }
];
