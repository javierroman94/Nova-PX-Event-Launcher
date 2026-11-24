/*
 * Loader Nova (1.0.190): instala la lista fija de mods probados (data/nova-loader.json), ofrece "Actualizar Nova"
 * y pone gráficos según la PC la primera vez que se abre un perfil Nova.
 */
'use strict';

const os = require('os');
const crypto = require('crypto');
const novaLoader = require('../nova-loader');
const perf = require('../rendimiento');
const { retry, shouldRetry } = require('../descargas');

module.exports = function (ctx) {
  const { ipcMain, fs, path, app, readModpacks, writeModpacks, packRoot, loadData, send, pushLog, apiRequest, downloadBuffer, novaLib, assertEditable } = ctx;
  const dl = (url) => retry(() => downloadBuffer(url), { tries: 3, delayMs: 800, shouldRetry });
  const progress = (text) => send('modpack:progress', { text });
  const cleanId = (id) => String(id || '').slice(0, 60);
  const modIdOf = (file) => { const i = novaLib.modInfoFromJar(fs.readFileSync(file)); return i && i.id; };

  let memo = { at: 0, lock: null };
  async function getLock() {
    if (memo.lock && Date.now() - memo.at < 10 * 60 * 1000) return memo.lock;
    try {
      const lock = novaLoader.cleanLock(await loadData('nova-loader'));
      if (lock) memo = { at: Date.now(), lock };
    } catch (err) { pushLog('launcher', `[Nova] No se pudo leer la lista del loader Nova: ${err.message}`); }
    return memo.lock;
  }

  // Instala el loader Nova en un perfil. Devuelve la versión instalada o null si no hay lista para esa versión de Minecraft.
  async function installNova(dir, mc) {
    const lock = await getLock();
    if (!lock || !novaLoader.entryFor(lock, mc)) return null;
    const r = await novaLoader.installLock({ lock, mc, dir, download: dl, onStatus: progress, modIdOf });
    return r && r.version;
  }

  function novaPack(id) {
    const { entry, root } = packRoot(cleanId(id));
    if (entry.preset !== 'nova') throw new Error('Ese perfil no usa el loader Nova.');
    if (entry.protected) throw new Error('Este modpack no se puede modificar.');
    return { entry, root };
  }

  ipcMain.handle('nova:status', async (_e, id) => {
    const { entry, root } = novaPack(id);
    const mark = novaLoader.readMark(root);
    const lock = await getLock();
    const up = lock ? novaLoader.updateFor(root, lock, entry.mcVersion) : null;
    return { mode: perf.NOVA_MODES.includes(entry.novaMode) ? entry.novaMode : null, version: mark ? mark.version : null, latest: lock && novaLoader.entryFor(lock, entry.mcVersion) ? lock.version : null, update: up };
  });

  ipcMain.handle('nova:update', async (_e, id) => {
    assertEditable();
    const { entry, root } = novaPack(id);
    try {
      memo.at = 0;
      const version = await installNova(root, entry.mcVersion);
      if (!version) throw new Error(`Todavía no hay loader Nova para Minecraft ${entry.mcVersion}.`);
      progress('Actualizando Nova Client…');
      try { await novaLib.installNovaClient({ request: apiRequest, download: dl, dir: root, mc: entry.mcVersion }); } catch {}
      writeModpacks(readModpacks().map((x) => (x.id === entry.id ? { ...x, novaLoader: version } : x)));
      pushLog('launcher', `[Nova] Perfil "${entry.title}" actualizado a Nova ${version}.`);
      return { version };
    } finally { progress('Listo'); }
  });

  async function pcLevel() {
    let gpu = '';
    try {
      const info = await app.getGPUInfo('basic');
      const devs = (info && info.gpuDevice) || [];
      if (devs.length) gpu = devs.some((d) => d.vendorId && d.vendorId !== 0x8086 && d.vendorId !== 0x1414) ? 'dedicada' : 'integrada';
    } catch {}
    return perf.graphicsLevel({ totalBytes: os.totalmem(), cpus: (os.cpus() || []).length, gpu });
  }

  // Primera vez que se abre un perfil Nova: gráficos según la PC (si el jugador ya tiene options.txt, no se toca).
  async function autoGraphics(dir, mc) {
    const file = path.join(dir, 'options.txt');
    if (fs.existsSync(file)) return null;
    const level = await pcLevel();
    fs.writeFileSync(file, perf.optionsLines(level, mc).join('\n') + '\n');
    pushLog('launcher', `[Nova] Gráficos ajustados a tu PC: nivel ${level}. Puedes cambiarlos en Opciones → Gráficos.`);
    return level;
  }

  // Texture pack Nova (de la release de Nova Client), verificado con su huella SHA-256.
  async function ensureNovaPack(dir) {
    const dest = path.join(dir, 'resourcepacks', 'Nova-Pack.zip');
    const rel = await apiRequest(`https://api.github.com/repos/${novaLib.CLIENT_REPO}/releases/latest`);
    const a = ((rel && rel.assets) || []).find((x) => x && x.name === 'Nova-Pack.zip');
    const want = a && /^sha256:([a-f0-9]{64})$/.exec(String(a.digest || ''));
    let u = null;
    try { u = new URL(a.browser_download_url); } catch {}
    if (!want || !u || u.protocol !== 'https:' || u.hostname !== 'github.com' || !u.pathname.startsWith(`/${novaLib.CLIENT_REPO}/releases/download/`)) throw new Error('No encontré el texture pack Nova.');
    if (fs.existsSync(dest) && crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex') === want[1]) return;
    progress('Descargando el texture pack Nova…');
    const data = await dl(a.browser_download_url);
    if (crypto.createHash('sha256').update(data).digest('hex') !== want[1]) throw new Error('La huella del texture pack Nova no coincide.');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, data);
  }

  // Modo del cliente: «clasico» o «pvp». Ajusta gráficos, módulos de Nova Client y el texture pack.
  async function applyMode(entry, root, mode) {
    const mc = entry.mcVersion;
    const file = path.join(root, 'options.txt');
    let text = '';
    try { text = fs.readFileSync(file, 'utf8'); } catch {}
    const lines = perf.modeOptions(mode, mc, mode === 'pvp' ? 'bajo' : await pcLevel());
    let pack = mode === 'clasico';
    if (pack) {
      try { await ensureNovaPack(root); } catch (err) { pack = false; pushLog('launcher', `[Nova] ${err.message}`); }
    }
    const packs = perf.packList(perf.optionValue(text, 'resourcePacks'), pack);
    // El pack sirve para todas las versiones: se marca como aceptado aunque Minecraft diga «hecho para otra versión».
    const bad = perf.packList(perf.optionValue(text, 'incompatibleResourcePacks'), pack, []);
    lines.push(`resourcePacks:${packs}`, `incompatibleResourcePacks:${bad}`);
    fs.writeFileSync(file, perf.mergeOptions(text, lines));
    // Nova Client lee config/nova-client.json al arrancar.
    const cfgDir = path.join(root, 'config');
    fs.mkdirSync(cfgDir, { recursive: true });
    const cfgFile = path.join(cfgDir, 'nova-client.json');
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8')) || {}; } catch {}
    cfg.modules = { ...(cfg.modules && typeof cfg.modules === 'object' ? cfg.modules : {}), ...perf.modeModules(mode) };
    fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2));
    pushLog('launcher', `[Nova] Modo ${mode === 'pvp' ? 'PvP' : 'Clásico'} aplicado a "${entry.title}".`);
  }

  ipcMain.handle('nova:setMode', async (_e, id, mode) => {
    assertEditable();
    if (!perf.NOVA_MODES.includes(mode)) throw new Error('Ese modo no existe.');
    const { entry, root } = novaPack(id);
    try {
      await applyMode(entry, root, mode);
      const updated = { ...entry, novaMode: mode };
      writeModpacks(readModpacks().map((x) => (x.id === entry.id ? updated : x)));
      return updated;
    } finally { progress('Listo'); }
  });

  return { installNova, autoGraphics, getLock };
};
