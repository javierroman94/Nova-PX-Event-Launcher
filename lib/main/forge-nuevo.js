/* Forge nuevo (61.x: Minecraft 1.21.11+) — antes estaba dentro de main.js. Recibe lo que necesita en "ctx" y devuelve lo que usan las demás partes. */
'use strict';

module.exports = function (ctx) {
  const { readZip, fs, path, GAME_DIR, ensureVanillaFiles, send, pushLog, os } = ctx;
  /* ---------- Forge nuevo (61.x: Minecraft 1.21.11+) ---------- */

  // Estos Forge arrancan con ForgeBootstrap, que ForgeWrapper (el motor del launcher) no puede iniciar.
  // Se instalan con el instalador oficial y se lanzan como versión propia, igual que Fabric.
  function forgeInstallerInfo(file) {
    try {
      const z = readZip(fs.readFileSync(file));
      if (!z.has('version.json')) return null;
      const json = JSON.parse(z.read('version.json').toString('utf8'));
      return { id: json.id, mainClass: String(json.mainClass || ''), bootstrap: /net\.minecraftforge\.bootstrap\./.test(String(json.mainClass || '')) };
    } catch { return null; }
  }

  async function installForgeClient(installer, info, mcVersion, javaPath, flag = '--installClient') {
    const id = info.id;
    const jsonFile = path.join(GAME_DIR, 'versions', id, `${id}.json`);
    const done = path.join(GAME_DIR, 'versions', id, '.nova-installed');
    if (fs.existsSync(jsonFile) && fs.existsSync(done)) return id;
    await ensureVanillaFiles(mcVersion);
    const profiles = path.join(GAME_DIR, 'launcher_profiles.json');
    if (!fs.existsSync(profiles)) fs.writeFileSync(profiles, JSON.stringify({ profiles: {} }));
    // El instalador es una aplicación de consola: se usa java.exe, no javaw.exe, para poder leer su salida.
    let java = javaPath || 'java';
    if (/javaw(\.exe)?$/i.test(java)) { const alt = java.replace(/javaw(\.exe)?$/i, 'java$1'); if (fs.existsSync(alt)) java = alt; }
    send('game:status', { text: 'Instalando Forge (la primera vez tarda unos minutos)…' });
    pushLog('launcher', `[Nova] Instalando ${id} con el instalador oficial…`);
    const tail = [];
    await new Promise((resolve, reject) => {
      const child = require('child_process').spawn(java, ['-jar', installer, flag, GAME_DIR], { cwd: GAME_DIR, windowsHide: true });
      const timer = setTimeout(() => { try { child.kill(); } catch {} reject(new Error('La instalación de Forge tardó demasiado y se canceló.')); }, 20 * 60 * 1000);
      const onData = (b) => { for (const line of String(b).split(/\r?\n/)) { if (!line.trim()) continue; tail.push(line); if (tail.length > 40) tail.shift(); if (!/^\s+\S+\.class$/.test(line) && !/^\s{2}/.test(line)) pushLog('launcher', `[Forge] ${line}`); } };
      child.stdout.on('data', onData);
      child.stderr.on('data', onData);
      child.on('error', (err) => { clearTimeout(timer); reject(new Error(`No se pudo ejecutar el instalador de Forge: ${err.message}`)); });
      child.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`El instalador de Forge terminó con error (${code}). ${tail.filter((l) => !/^\s/.test(l)).slice(-3).join(' | ')}`)); });
    });
    if (!fs.existsSync(jsonFile)) throw new Error('El instalador de Forge terminó, pero no dejó la versión instalada.');
    fs.writeFileSync(done, new Date().toISOString());
    return id;
  }

  // Argumentos de Java que trae la versión instalada por Forge/NeoForge (-p, --add-modules, --add-opens…).
  // El motor del launcher solo lee los argumentos del juego, así que se resuelven aquí.
  function installedJvmArgs(id) {
    try {
      const json = JSON.parse(fs.readFileSync(path.join(GAME_DIR, 'versions', id, `${id}.json`), 'utf8'));
      const list = (json.arguments && json.arguments.jvm) || [];
      const osName = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux';
      const subst = (v) => String(v)
        .replace(/\$\{library_directory\}/g, path.join(GAME_DIR, 'libraries'))
        .replace(/\$\{classpath_separator\}/g, path.delimiter)
        .replace(/\$\{version_name\}/g, id);
      const out = [];
      for (const a of list) {
        if (typeof a === 'string') { out.push(subst(a)); continue; }
        if (!a || !a.rules) continue;
        let ok = false;
        for (const r of a.rules) {
          if (r.features) continue;
          const match = !r.os || !r.os.name || r.os.name === osName;
          if (match) ok = r.action === 'allow';
        }
        if (ok) for (const v of [].concat(a.value || [])) out.push(subst(v));
      }
      // Estos los pone el propio launcher: el classpath y la carpeta de nativos.
      const clean = [];
      for (let i = 0; i < out.length; i++) {
        if (out[i] === '-cp' || out[i] === '-classpath') { i++; continue; }
        if (/\$\{/.test(out[i])) continue;
        clean.push(out[i]);
      }
      return clean;
    } catch { return []; }
  }

  // Minecraft 1.21.11 en adelante (incluye 26.x): NeoForge y Forge cambiaron su arranque y ya no sirven con ForgeWrapper.
  function isNewForgeEra(mc) {
    const m = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(String(mc));
    if (!m) return false;
    const a = +m[1], b = +m[2], c = +(m[3] || 0);
    return a >= 26 || (a === 1 && (b > 21 || (b === 21 && c >= 11)));
  }

  // Minecraft muy viejo (1.10 y anteriores) se cierra si options.txt trae un idioma que no conoce (por ejemplo es_ec de versiones nuevas).
  function sanitizeOldOptions(gameDir, mc) {
    try {
      const m = /^1\.(\d+)/.exec(String(mc));
      const w = /^(\d\d)w\d+/.exec(String(mc));
      const old = (m && +m[1] <= 10) || (w && +w[1] <= 15);
      if (!old) return;
      const file = path.join(gameDir, 'options.txt');
      if (!fs.existsSync(file)) return;
      const text = fs.readFileSync(file, 'utf8');
      const next = text.replace(/^lang:(?!en_US\s*$).*$/m, 'lang:en_US');
      if (next !== text) { fs.writeFileSync(file, next); pushLog('launcher', `[Nova] options.txt: idioma cambiado a en_US (Minecraft ${mc} no conoce el idioma anterior).`); }
    } catch {}
  }
  return { forgeInstallerInfo, installForgeClient, installedJvmArgs, isNewForgeEra, sanitizeOldOptions };
};
