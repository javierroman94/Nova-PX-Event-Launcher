'use strict';
/*
 * Modo rendimiento: qué mods de optimización conviene poner en un perfil y cuánta RAM darle.
 * Funciones puras (sin red ni disco) para poder probarlas con npm test.
 */

// Cada hueco es una lista de alternativas: se instala la primera que tenga versión compatible.
const PERF_MODS = {
  fabric: [['sodium'], ['lithium'], ['ferrite-core'], ['modernfix'], ['entityculling']],
  quilt: [['sodium'], ['lithium'], ['ferrite-core'], ['modernfix'], ['entityculling']],
  forge: [['embeddium'], ['ferrite-core'], ['modernfix'], ['entityculling']],
  neoforge: [['sodium', 'embeddium'], ['ferrite-core'], ['modernfix'], ['entityculling']]
};

const NAMES = {
  sodium: 'Sodium', embeddium: 'Embeddium', lithium: 'Lithium', 'ferrite-core': 'FerriteCore', modernfix: 'ModernFix', entityculling: 'EntityCulling'
};

// Motores de render que chocan entre sí: con uno de estos ya puesto no se añade otro.
const RENDERERS = ['sodium', 'embeddium', 'rubidium', 'magnesium', 'xenon', 'celeritas'];
const RENDER_SLOT = new Set(['sodium', 'embeddium']);

// Pistas por nombre de archivo, por si Modrinth no reconoce un .jar (mod bajado a mano).
const FILE_HINTS = {
  sodium: /sodium(?!-extra|-options|extra)/i,
  embeddium: /embeddium/i,
  rubidium: /rubidium/i,
  magnesium: /magnesium/i,
  lithium: /lithium/i,
  'ferrite-core': /ferrite-?core/i,
  modernfix: /modernfix/i,
  entityculling: /entity-?culling/i,
  optifine: /optifine|optifabric/i
};

function hasFile(fileNames, key) {
  const re = FILE_HINTS[key];
  return !!re && (fileNames || []).some((f) => re.test(String(f)));
}

/*
 * Qué instalar. installed: slugs de Modrinth ya presentes (se calcula con las huellas de los .jar).
 * -> { install: [[alternativas]], skip: [{ slug, reason }] }
 */
function planPerfMods({ loader, installed = [], fileNames = [] }) {
  const slots = PERF_MODS[String(loader || '').toLowerCase()];
  if (!slots) return { install: [], skip: [], unsupported: true };
  const have = new Set(installed.map((s) => String(s).toLowerCase()));
  const present = (slug) => have.has(slug) || hasFile(fileNames, slug);
  const optifine = hasFile(fileNames, 'optifine');
  const anyRenderer = RENDERERS.some(present);
  const install = [];
  const skip = [];
  for (const alts of slots) {
    const main = alts[0];
    if (RENDER_SLOT.has(main)) {
      if (optifine) { skip.push({ slug: main, reason: 'optifine' }); continue; }
      if (anyRenderer) { skip.push({ slug: main, reason: 'ya-esta' }); continue; }
    }
    if (alts.some(present)) { skip.push({ slug: main, reason: 'ya-esta' }); continue; }
    install.push(alts);
  }
  return { install, skip };
}

/*
 * RAM recomendada (GB) según la memoria de la PC y cuántos mods tiene el perfil.
 * Deja siempre margen para Windows y para el propio launcher.
 */
function recommendRamGb({ totalBytes, mods = 0 }) {
  const totalGb = Math.max(1, Number(totalBytes) / 1024 ** 3 || 8);
  const n = Math.max(0, Math.floor(Number(mods) || 0));
  const byMods = n === 0 ? 2 : n <= 40 ? 3 : n <= 120 ? 4 : n <= 200 ? 6 : 8;
  const cap = Math.max(2, Math.floor(Math.min(totalGb * 0.5, totalGb - 3)));
  return Math.max(2, Math.min(byMods, cap, 16));
}

const niceName = (slug) => NAMES[slug] || slug;

module.exports = { PERF_MODS, RENDERERS, planPerfMods, recommendRamGb, niceName, hasFile };
