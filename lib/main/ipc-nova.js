/*
 * Loader Nova (1.0.190): instala la lista fija de mods probados (data/nova-loader.json), ofrece "Actualizar Nova"
 * y pone gráficos según la PC la primera vez que se abre un perfil Nova.
 */
'use strict';

const os = require('os');
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
    return { version: mark ? mark.version : null, latest: lock && novaLoader.entryFor(lock, entry.mcVersion) ? lock.version : null, update: up };
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

  // Primera vez que se abre un perfil Nova: gráficos según la PC (si el jugador ya tiene options.txt, no se toca).
  async function autoGraphics(dir, mc) {
    const file = path.join(dir, 'options.txt');
    if (fs.existsSync(file)) return null;
    let gpu = '';
    try {
      const info = await app.getGPUInfo('basic');
      const devs = (info && info.gpuDevice) || [];
      if (devs.length) gpu = devs.some((d) => d.vendorId && d.vendorId !== 0x8086 && d.vendorId !== 0x1414) ? 'dedicada' : 'integrada';
    } catch {}
    const level = perf.graphicsLevel({ totalBytes: os.totalmem(), cpus: (os.cpus() || []).length, gpu });
    fs.writeFileSync(file, perf.optionsLines(level, mc).join('\n') + '\n');
    pushLog('launcher', `[Nova] Gráficos ajustados a tu PC: nivel ${level}. Puedes cambiarlos en Opciones → Gráficos.`);
    return level;
  }

  return { installNova, autoGraphics, getLock };
};
