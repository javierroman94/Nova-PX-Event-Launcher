'use strict';
/*
 * Configuración remota del launcher (data/launcher.json): lo que el administrador cambia desde el panel
 * y los jugadores reciben sin reinstalar. Todo se limpia al leer Y al guardar: nunca se confía en el archivo.
 */
const str = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
const url = (u) => (/^https:\/\/[^\s"'<>]+$/i.test(String(u || '')) ? String(u).slice(0, 300) : '');
const hex = (c) => (/^#[0-9a-fA-F]{6}$/.test(String(c || '')) ? String(c).toLowerCase() : '');
const bool = (v, d) => (v === undefined || v === null ? d : v === true || v === 'true');
const pick = (v, list, d) => (list.includes(v) ? v : d);

const THEMES = ['nova', 'dark', 'light', 'oled'];
const SEASONS = ['auto', 'off', 'halloween', 'navidad', 'anio'];
const LEVELS = ['info', 'warn', 'danger'];

function sanitize(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const o = (k) => (r[k] && typeof r[k] === 'object' ? r[k] : {});
  const ram = Math.round(Number(o('defaults').ramGb));
  const ver = str(r.minVersion, 20);
  return {
    version: 1,
    brand: { name: str(o('brand').name, 40), subtitle: str(o('brand').subtitle, 60) },
    theme: { preset: pick(o('theme').preset, THEMES, ''), accent: hex(o('theme').accent), season: pick(o('theme').season, SEASONS, '') },
    welcome: { title: str(o('welcome').title, 80), text: str(o('welcome').text, 300) },
    announcement: { enabled: bool(o('announcement').enabled, false), level: pick(o('announcement').level, LEVELS, 'info'), text: str(o('announcement').text, 240), url: url(o('announcement').url) },
    maintenance: { enabled: bool(o('maintenance').enabled, false), text: str(o('maintenance').text, 240) },
    minVersion: /^\d+\.\d+\.\d+$/.test(ver) ? ver : '',
    links: { discord: url(o('links').discord), x: url(o('links').x), youtube: url(o('links').youtube), web: url(o('links').web) },
    defaults: { ramGb: ram >= 1 && ram <= 32 ? ram : 0 },
    features: { nonPremium: bool(o('features').nonPremium, true), usageCounter: bool(o('features').usageCounter, true), importPacks: bool(o('features').importPacks, true) }
  };
}

const parts = (v) => String(v).split('.').map((n) => parseInt(n, 10) || 0);
function versionLt(a, b) {
  const x = parts(a), y = parts(b);
  for (let i = 0; i < 3; i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0);
  }
  return false;
}

// Motivo por el que no se puede jugar ('' si se puede). Los administradores pueden probar durante un mantenimiento.
function blockReason(cfg, appVersion, { admin = false } = {}) {
  if (cfg.minVersion && versionLt(appVersion, cfg.minVersion)) {
    return `Esta versión del launcher (${appVersion}) ya no se puede usar para jugar. Actualiza a la ${cfg.minVersion} o superior en Ajustes → Actualizaciones.`;
  }
  if (cfg.maintenance.enabled && !admin) return cfg.maintenance.text || 'El launcher está en mantenimiento. Vuelve en unos minutos.';
  return '';
}

// Lista de modpacks recomendados (data/recommended.json).
function sanitizeRecommended(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : [])
    .map((x) => ({ provider: 'modrinth', id: str(x && x.id, 64).toLowerCase(), note: str(x && x.note, 160) }))
    .filter((x) => /^[a-z0-9][a-z0-9!@$()`.+,_"'~-]{1,63}$/.test(x.id) && !seen.has(x.id) && seen.add(x.id))
    .slice(0, 24);
}

module.exports = { sanitize, sanitizeRecommended, versionLt, blockReason, THEMES, SEASONS, LEVELS };
