'use strict';
/*
 * Busca instancias de otros launchers (Prism, MultiMC, ATLauncher, CurseForge App, Modrinth App)
 * en sus carpetas habituales para importarlas con un clic. Solo lee; el disco se inyecta para poder probarlo.
 */
const fs = require('fs');
const path = require('path');
const { inspectFolder } = require('./importers');

// Carpetas donde cada launcher guarda sus instancias, según el sistema.
function roots({ platform = process.platform, env = process.env, home = require('os').homedir() } = {}) {
  const appdata = env.APPDATA || path.join(home, 'AppData', 'Roaming');
  const local = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  const mac = path.join(home, 'Library', 'Application Support');
  const share = env.XDG_DATA_HOME || path.join(home, '.local', 'share');
  const base = platform === 'win32' ? appdata : platform === 'darwin' ? mac : share;
  const L = [];
  const add = (launcher, dir) => L.push({ launcher, dir });
  add('Prism Launcher', path.join(base, 'PrismLauncher', 'instances'));
  add('PolyMC', path.join(base, 'PolyMC', 'instances'));
  for (const d of [home, path.join(home, 'Desktop'), path.join(home, 'Downloads'), path.join(home, 'Documents')]) add('MultiMC', path.join(d, 'MultiMC', 'instances'));
  if (platform === 'win32') add('Prism Launcher', path.join(local, 'PrismLauncher', 'instances'));
  for (const d of [path.join(base, 'ATLauncher'), path.join(home, 'ATLauncher'), path.join(home, 'Desktop', 'ATLauncher'), path.join(home, 'Downloads', 'ATLauncher')]) add('ATLauncher', path.join(d, 'instances'));
  add('CurseForge App', path.join(home, 'curseforge', 'minecraft', 'Instances'));
  add('CurseForge App', path.join(home, 'Documents', 'curseforge', 'minecraft', 'Instances'));
  add('Modrinth App', path.join(base, 'ModrinthApp', 'profiles'));
  add('Modrinth App', path.join(base, 'com.modrinth.theseus', 'profiles'));
  add('GDLauncher', path.join(base, 'gdlauncher_next', 'instances'));
  return L;
}

const SAFE_NAME = (n) => n && n === path.basename(n) && !n.startsWith('.');

// Formatos propios de ATLauncher y del Modrinth App antiguo (profile.json); el resto lo entiende inspectFolder.
function inspectExtra(dir, launcher) {
  const j = (f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; } };
  const { isSafeVersion } = require('./loaders');
  const at = j('instance.json');
  if (at && at.id && at.launcher) {
    const mc = String(at.id);
    if (!isSafeVersion(mc)) return null;
    const lt = String((at.launcher.loaderVersion && at.launcher.loaderVersion.type) || '').toLowerCase();
    const lv = String((at.launcher.loaderVersion && at.launcher.loaderVersion.version) || '');
    let loader = { type: 'vanilla', version: '' }; let unsupported = '';
    if (lt === 'fabric') loader = { type: 'fabric', version: lv };
    else if (lt === 'forge') loader = { type: 'forge', version: lv };
    else if (lt === 'neoforge') loader = { type: 'neoforge', version: lv };
    else if (lt === 'quilt') unsupported = 'Quilt';
    return { source: 'ATLauncher', name: String(at.launcher.name || ''), mcVersion: mc, loader, unsupported, contentDir: dir };
  }
  const mr = j('profile.json');
  const md = mr && mr.metadata;
  if (md && md.game_version && isSafeVersion(String(md.game_version))) {
    const lt = String(md.loader || '').toLowerCase();
    let loader = { type: 'vanilla', version: '' }; let unsupported = '';
    if (lt === 'fabric') loader = { type: 'fabric', version: String(md.loader_version && md.loader_version.id || '') };
    else if (lt === 'forge') loader = { type: 'forge', version: String(md.loader_version && md.loader_version.id || '') };
    else if (lt === 'neoforge') loader = { type: 'neoforge', version: String(md.loader_version && md.loader_version.id || '') };
    else if (lt === 'quilt') unsupported = 'Quilt';
    return { source: 'Modrinth App', name: String(md.name || ''), mcVersion: String(md.game_version), loader, unsupported, contentDir: dir };
  }
  return null;
}

function countMods(dir) {
  try { return fs.readdirSync(path.join(dir, 'mods')).filter((f) => /\.jar(\.disabled)?$/i.test(f)).length; } catch { return 0; }
}

// Devuelve [{ launcher, name, dir, mcVersion, loader, unsupported, mods }] ordenado por launcher y nombre.
function scan(opts = {}) {
  const out = [];
  const seen = new Set();
  for (const { launcher, dir } of roots(opts)) {
    let names;
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const n of names) {
      if (!SAFE_NAME(n)) continue;
      const full = path.join(dir, n);
      try { if (!fs.statSync(full).isDirectory()) continue; } catch { continue; }
      if (seen.has(full)) continue;
      let info = null;
      try { info = inspectFolder(full) || inspectExtra(full, launcher); } catch { info = null; }
      if (!info) continue;
      seen.add(full);
      out.push({ launcher, name: info.name || n, dir: full, mcVersion: info.mcVersion, loader: info.loader, unsupported: info.unsupported || '', mods: countMods(info.contentDir || full) });
    }
  }
  return out.sort((a, b) => a.launcher.localeCompare(b.launcher) || a.name.localeCompare(b.name));
}

module.exports = { roots, scan, inspectExtra };
