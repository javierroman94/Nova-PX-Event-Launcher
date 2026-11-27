/*
 * IPC de las funciones de la 1.0.188: servidores con ping, modo rendimiento, avisos de actualizaciones de mods,
 * galería de capturas, códigos para compartir modpacks y copias automáticas de mundos.
 * Recibe de main.js lo que necesita en "ctx" y devuelve lo que usa el arranque del juego.
 */
'use strict';

const os = require('os');
const crypto = require('crypto');
const pingLib = require('../ping');
const serversLib = require('../servers');
const perf = require('../rendimiento');
const respaldos = require('../respaldos');
const share = require('../compartir');
const modrinth = require('../modrinth');
const modpacks = require('../modpacks');
const { isSafeVersion } = require('../loaders');
const { settle, retry, shouldRetry, wait } = require('../descargas');

const API = 'https://api.modrinth.com/v2';
const SHOT_NAME = /^[^\\/:*?"<>|\u0000-\u001f]{1,150}\.(png|jpe?g)$/i;

module.exports = function (ctx) {
  const {
    ipcMain, fs, path, app, shell, dialog, clipboard, nativeImage, GAME_DIR, USAGE_URL,
    readModpacks, writeModpacks, packRoot, instanceDir, instanceId, loadData, readSettings, send, pushLog,
    apiRequest, downloadBuffer, cachedSha1, content, planAllUpdates, assertEditable, getMainWindow, packEntryFrom
  } = ctx;

  const dl = (url) => retry(() => downloadBuffer(url), { tries: 3, delayMs: 800, shouldRetry });
  const progress = (text) => send('modpack:progress', { text });
  const cleanId = (id) => String(id || '').slice(0, 60);

  /* ---------- servidores de cada perfil: ping directo (latencia, jugadores y mensaje) ---------- */
  // La dirección nunca se devuelve a la interfaz: solo el nombre que le puso el jugador y lo que responde el servidor.
  ipcMain.handle('servers:list', async (_e, id) => {
    const { root } = packRoot(cleanId(id));
    const list = serversLib.listPackServers(root);
    const res = await settle(list, (s) => pingLib.pingCached(s.host, s.port, { timeout: 3500 }), { concurrency: 6 });
    return list.map((s, i) => {
      const r = res[i];
      const base = { i, name: s.name || `Servidor ${i + 1}` };
      if (!r.ok) return { ...base, online: false };
      const v = r.value;
      return { ...base, online: true, ms: v.ms, players: v.players, version: v.version, motd: v.motd, icon: v.icon };
    });
  });

  /* ---------- modo rendimiento ---------- */
  function packInfo(id) {
    const { entry, root } = packRoot(cleanId(id));
    if (entry.protected) throw new Error('Este modpack no se puede modificar.');
    const loader = String((entry.loader && entry.loader.type) || 'vanilla').toLowerCase();
    return { entry, root, loader };
  }
  const enabledMods = (root) => content.listContent(root, 'mod').filter((m) => m.enabled).length;

  ipcMain.handle('perf:info', (_e, id) => {
    const { entry, root, loader } = packInfo(id);
    const slots = perf.PERF_MODS[loader] || [];
    return {
      loader,
      supported: slots.length > 0,
      mods: slots.map((alts) => perf.niceName(alts[0])),
      ramGb: perf.recommendRamGb({ totalBytes: os.totalmem(), mods: enabledMods(root) + (slots.length || 0) }),
      currentRam: (entry.settings && entry.settings.ramGb) || readSettings().ramGb,
      pcGb: Math.round(os.totalmem() / 1024 ** 3)
    };
  });

  ipcMain.handle('perf:apply', async (_e, id) => {
    assertEditable();
    const { entry, root, loader } = packInfo(id);
    const installed = [];
    const failed = [];
    let plan = { install: [], skip: [], unsupported: true };
    try {
      if (perf.PERF_MODS[loader]) {
        const modDir = content.contentDir(root, 'mod');
        const files = content.listContent(root, 'mod');
        let slugs = [];
        try {
          const hashed = [];
          for (const f of files) hashed.push({ file: f.file, hash: await cachedSha1(path.join(modDir, f.file)) });
          const { projects } = hashed.length ? await modrinth.lookup(hashed, apiRequest) : { projects: {} };
          slugs = Object.values(projects || {}).map((p) => p && p.slug).filter(Boolean);
        } catch {} // sin conexión a Modrinth: se usan solo los nombres de archivo
        plan = perf.planPerfMods({ loader, installed: slugs, fileNames: files.map((f) => f.file) });
        for (const alts of plan.install) {
          let ok = false;
          for (const slug of alts) {
            for (const ld of loader === 'quilt' ? ['quilt', 'fabric'] : [loader]) {
              try {
                progress(`Instalando ${perf.niceName(slug)}…`);
                await content.installFromModrinth({ request: apiRequest, download: dl, root, type: 'mod', projectId: slug, mc: entry.mcVersion, loader: ld });
                installed.push(perf.niceName(slug));
                ok = true;
                break;
              } catch {}
            }
            if (ok) break;
          }
          if (!ok) failed.push(perf.niceName(alts[0]));
        }
      }
      // RAM: según la memoria de esta PC y los mods que quedaron activos.
      const ramGb = perf.recommendRamGb({ totalBytes: os.totalmem(), mods: enabledMods(root) });
      writeModpacks(readModpacks().map((x) => (x.id === entry.id ? { ...x, settings: { ...(x.settings || {}), ramGb } } : x)));
      pushLog('launcher', `[Nova] Modo rendimiento en ${entry.title}: ${installed.length ? installed.join(', ') : 'sin mods nuevos'}; RAM ${ramGb} GB.`);
      return {
        installed, failed, ramGb, vanilla: !!plan.unsupported,
        already: plan.skip.filter((s) => s.reason === 'ya-esta').map((s) => perf.niceName(s.slug)),
        optifine: plan.skip.some((s) => s.reason === 'optifine')
      };
    } finally {
      progress('Listo');
    }
  });

  /* ---------- avisos de actualizaciones de mods en la biblioteca ---------- */
  const UPD_FILE = path.join(app.getPath('userData'), 'updates-cache.json');
  const UPD_TTL = 12 * 60 * 60 * 1000;
  const readUpd = () => { try { const j = JSON.parse(fs.readFileSync(UPD_FILE, 'utf8')); return j && typeof j === 'object' ? j : {}; } catch { return {}; } };
  const writeUpd = (c) => { try { fs.writeFileSync(UPD_FILE, JSON.stringify(c)); } catch {} };
  const counts = (c) => Object.fromEntries(Object.entries(c).filter(([, v]) => v && v.n > 0).map(([k, v]) => [k, v.n]));
  let scanning = null;

  async function checkOne(entry, cache) {
    const root = instanceDir(GAME_DIR, { event: { id: entry.id } });
    if (!fs.existsSync(root)) return false;
    const plan = await planAllUpdates(entry, root);
    cache[entry.id] = { at: Date.now(), n: plan.length };
    return true;
  }
  function scanUpdates() {
    if (scanning) return scanning;
    scanning = (async () => {
      const cache = readUpd();
      const list = readModpacks().filter((p) => !p.protected && p.provider !== 'event' && p.mcVersion);
      let changed = false;
      for (const k of Object.keys(cache)) if (!list.some((p) => p.id === k)) { delete cache[k]; changed = true; }
      // Primero los que se jugaron hace poco; como mucho 20 por vuelta, con pausas para no cargar la PC ni a Modrinth.
      const order = [...list].sort((a, b) => String(b.lastPlayedAt || b.installedAt || '').localeCompare(String(a.lastPlayedAt || a.installedAt || '')));
      for (const entry of order.slice(0, 20)) {
        const c = cache[entry.id];
        if (c && Date.now() - c.at < UPD_TTL) continue;
        try { if (await checkOne(entry, cache)) changed = true; } catch {}
        await wait(500);
      }
      if (changed) { writeUpd(cache); send('updates:summary', counts(cache)); }
      return counts(cache);
    })().finally(() => { scanning = null; });
    return scanning;
  }
  // Lo que se ve al abrir un modpack o al actualizar manda sobre la última revisión en segundo plano.
  function noteUpdates(id, n) {
    const c = readUpd();
    c[id] = { at: Date.now(), n: Math.max(0, Number(n) || 0) };
    writeUpd(c);
    send('updates:summary', counts(c));
  }
  ipcMain.handle('updates:summary', () => counts(readUpd()));
  ipcMain.handle('updates:recheck', async (_e, id) => {
    const { entry } = packRoot(cleanId(id));
    const cache = readUpd();
    try { await checkOne(entry, cache); writeUpd(cache); } catch {}
    const c = counts(cache);
    send('updates:summary', c);
    return c[entry.id] || 0;
  });
  setTimeout(() => scanUpdates().catch(() => {}), 90 * 1000).unref();
  setInterval(() => scanUpdates().catch(() => {}), 6 * 60 * 60 * 1000).unref();

  /* ---------- galería de capturas (todas las instancias) ---------- */
  let srcMemo = { at: 0, list: null };
  async function shotSources() {
    if (srcMemo.list && Date.now() - srcMemo.at < 30000) return srcMemo.list;
    const out = [];
    const packs = readModpacks();
    const known = new Set();
    for (const p of packs) {
      known.add(p.id);
      if (p.protected) continue;
      out.push({ src: `pack:${p.id}`, title: p.title, own: true, dir: instanceDir(GAME_DIR, { event: { id: p.id } }) });
    }
    let current = '';
    let currentName = '';
    try { const m = await loadData('manifest'); current = instanceId(m); currentName = (m.event && m.event.name) || ''; } catch {}
    let dirs = [];
    try { dirs = fs.readdirSync(path.join(GAME_DIR, 'instancias'), { withFileTypes: true }).filter((d) => d.isDirectory() && !d.isSymbolicLink()).map((d) => d.name); } catch {}
    for (const d of dirs) {
      if (known.has(d) || !/^[a-z0-9][a-z0-9_-]{0,39}$/.test(d)) continue;
      out.push({ src: `event:${d}`, title: d === current && currentName ? `Evento: ${currentName}` : 'Evento anterior', own: false, dir: path.join(GAME_DIR, 'instancias', d) });
    }
    srcMemo = { at: Date.now(), list: out };
    return out;
  }
  async function resolveShot(src, name) {
    const s = String(src || '');
    const n = String(name || '');
    if (!SHOT_NAME.test(n) || n !== path.basename(n)) throw new Error('Captura no válida.');
    const found = (await shotSources()).find((x) => x.src === s);
    if (!found) throw new Error('Esa instancia ya no existe.');
    const dir = path.join(found.dir, 'screenshots');
    const file = path.join(dir, n);
    if (path.dirname(file) !== dir) throw new Error('Captura no válida.');
    const st = fs.statSync(file);
    if (!st.isFile()) throw new Error('Esa captura ya no existe.');
    return { file, dir, st, source: found };
  }
  ipcMain.handle('shots:list', async () => {
    const items = [];
    for (const s of await shotSources()) {
      let names = [];
      try { names = fs.readdirSync(path.join(s.dir, 'screenshots')); } catch { continue; }
      for (const n of names) {
        if (!SHOT_NAME.test(n)) continue;
        try {
          const st = fs.statSync(path.join(s.dir, 'screenshots', n));
          if (st.isFile()) items.push({ src: s.src, title: s.title, own: s.own, name: n, mtime: st.mtimeMs, size: st.size });
        } catch {}
      }
    }
    return items.sort((a, b) => b.mtime - a.mtime).slice(0, 500);
  });
  const thumbs = new Map();
  async function thumbOf(file, mtime, width) {
    const key = `${file}|${mtime}|${width}`;
    if (thumbs.has(key)) return thumbs.get(key);
    let img;
    // En Windows y macOS la miniatura se hace fuera del hilo principal.
    if (typeof nativeImage.createThumbnailFromPath === 'function' && process.platform !== 'linux') {
      try { img = await nativeImage.createThumbnailFromPath(file, { width, height: Math.round(width * 0.5625) }); } catch {}
    }
    if (!img || img.isEmpty()) {
      img = nativeImage.createFromPath(file);
      if (!img.isEmpty() && img.getSize().width > width) img = img.resize({ width, quality: 'good' });
    }
    const url = img.isEmpty() ? '' : `data:image/jpeg;base64,${img.toJPEG(80).toString('base64')}`;
    if (thumbs.size > 400) thumbs.delete(thumbs.keys().next().value);
    thumbs.set(key, url);
    return url;
  }
  ipcMain.handle('shots:thumbs', async (_e, list) => {
    const want = Array.isArray(list) ? list.slice(0, 16) : [];
    const out = [];
    for (const it of want) {
      try {
        const { file, st } = await resolveShot(it && it.src, it && it.name);
        out.push({ src: it.src, name: it.name, thumb: await thumbOf(file, st.mtimeMs, 360) });
      } catch { out.push({ src: it && it.src, name: it && it.name, thumb: '' }); }
    }
    return out;
  });
  ipcMain.handle('shots:full', async (_e, src, name) => {
    const { file, st } = await resolveShot(src, name);
    return { url: await thumbOf(file, st.mtimeMs, 1920), size: st.size, mtime: st.mtimeMs };
  });
  ipcMain.handle('shots:copy', async (_e, src, name) => {
    const { file } = await resolveShot(src, name);
    const img = nativeImage.createFromPath(file);
    if (img.isEmpty()) throw new Error('No se pudo leer la captura.');
    clipboard.writeImage(img);
    return true;
  });
  ipcMain.handle('shots:save', async (_e, src, name) => {
    const { file } = await resolveShot(src, name);
    const ext = path.extname(file).slice(1).toLowerCase();
    const r = await dialog.showSaveDialog(getMainWindow(), { defaultPath: path.join(app.getPath('pictures'), path.basename(file)), filters: [{ name: 'Imagen', extensions: [ext] }] });
    if (r.canceled || !r.filePath) return false;
    await fs.promises.copyFile(file, r.filePath);
    return true;
  });
  ipcMain.handle('shots:delete', async (_e, src, name) => {
    const { file } = await resolveShot(src, name);
    await shell.trashItem(file); // a la papelera: se puede recuperar
    for (const k of [...thumbs.keys()]) if (k.startsWith(`${file}|`)) thumbs.delete(k);
    return true;
  });
  ipcMain.handle('shots:folder', async (_e, src) => {
    const found = (await shotSources()).find((x) => x.src === String(src || ''));
    if (!found || !found.own) throw new Error('Esa carpeta no se puede abrir.');
    const dir = path.join(found.dir, 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    const err = await shell.openPath(dir);
    if (err) throw new Error(err);
    return true;
  });

  /* ---------- compartir un modpack con un código ---------- */
  const workerUrl = () => {
    if (!USAGE_URL) throw new Error('Esta versión del launcher no puede usar códigos para compartir.');
    return USAGE_URL.replace(/\/$/, '');
  };
  async function workerFetch(url, opts = {}) {
    const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(12000) });
    let j = {};
    try { j = await r.json(); } catch {}
    return { status: r.status, ok: r.ok, data: j };
  }

  async function createShareCode(id) {
    const { entry, root } = packInfo(id);
    const found = [];
    let skipped = 0;
    progress('Preparando el código…');
    try {
      for (const type of Object.keys(content.TYPES)) {
        const dir = content.contentDir(root, type);
        const files = content.listContent(root, type).filter((f) => f.enabled);
        if (!files.length) continue;
        const hashed = [];
        for (const f of files) hashed.push({ file: f.file, hash: await cachedSha1(path.join(dir, f.file)) });
        let byHash = {};
        try {
          byHash = (await apiRequest(`${API}/version_files`, { method: 'POST', body: { hashes: hashed.map((h) => h.hash), algorithm: 'sha1' } })) || {};
        } catch {
          throw new Error('No se pudo consultar Modrinth. Revisa tu conexión e inténtalo otra vez.');
        }
        for (const h of hashed) {
          const v = byHash[h.hash];
          if (v && v.id && v.project_id) found.push({ type, projectId: v.project_id, versionId: v.id });
          else skipped++;
        }
      }
      const pack = share.buildPack({ title: entry.title, mcVersion: entry.mcVersion, loader: entry.loader, found });
      if (!pack) throw new Error('No se pudo preparar este modpack para compartirlo.');
      if (!pack.c.length && pack.l.t !== 'vanilla') throw new Error('Ningún mod de este perfil está en Modrinth, así que no se puede compartir con código. Usa «Exportar .novapx».');
      const r = await workerFetch(`${workerUrl()}/pack`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pack }) });
      if (r.status === 429) throw new Error('Creaste varios códigos seguidos. Espera un rato y vuelve a intentarlo.');
      if (!r.ok || !share.CODE_RE.test(String(r.data.code || ''))) throw new Error('No se pudo crear el código ahora. Inténtalo más tarde.');
      return { code: share.formatCode(r.data.code), included: pack.c.length, skipped };
    } finally {
      progress('Listo');
    }
  }
  ipcMain.handle('share:create', (_e, id) => createShareCode(id));

  async function importShareCode(input) {
    const code = share.normalizeCode(input);
    if (!code) throw new Error('Ese código no es válido. Tiene la forma NPX-XXXXXXX.');
    const r = await workerFetch(`${workerUrl()}/pack/${code}`);
    if (r.status === 404) throw new Error('Ese código no existe o ya caducó (duran 90 días).');
    if (r.status === 429) throw new Error('Demasiados intentos seguidos. Espera un minuto.');
    const pack = r.ok ? share.cleanPack(r.data.pack) : null;
    if (!pack) throw new Error('No se pudo leer ese código ahora. Inténtalo más tarde.');
    if (!isSafeVersion(pack.mc)) throw new Error('Ese modpack tiene una versión de Minecraft no válida.');
    progress('Buscando los archivos en Modrinth…');
    try {
      // Qué archivo baja cada versión (solo de cdn.modrinth.com y con su huella).
      const byId = new Map();
      const ids = pack.c.map((c) => c[2]);
      for (let i = 0; i < ids.length; i += 100) {
        const list = await apiRequest(`${API}/versions?ids=${encodeURIComponent(JSON.stringify(ids.slice(i, i + 100)))}`);
        for (const v of list || []) if (v && v.id) byId.set(v.id, v);
      }
      const tasks = [];
      let missing = 0;
      for (const [type, , versionId] of pack.c) {
        const v = byId.get(versionId);
        const file = v && ((v.files || []).find((f) => f.primary) || (v.files || [])[0]);
        const name = file && content.safeFileName(file.filename, type);
        const sha1 = file && file.hashes && String(file.hashes.sha1 || '').toLowerCase();
        if (!name || !modpacks.allowedUrl(file.url, ['cdn.modrinth.com']) || !/^[0-9a-f]{40}$/.test(sha1)) { missing++; continue; }
        tasks.push({ type, name, url: file.url, sha1 });
      }
      const list = readModpacks();
      const id = modpacks.instanceIdFor(pack.n, list.map((x) => x.id));
      const root = instanceDir(GAME_DIR, { event: { id } });
      fs.mkdirSync(root, { recursive: true });
      const results = await settle(tasks, async (t) => {
        const data = await dl(t.url);
        if (crypto.createHash('sha1').update(data).digest('hex') !== t.sha1) throw new Error('La huella no coincide.');
        const dir = content.contentDir(root, t.type);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, t.name), data);
      }, { concurrency: 4, onProgress: (done, total) => progress(`Descargando ${done} de ${total}…`) });
      const failed = results.filter((x) => !x.ok).length;
      if (tasks.length && failed === tasks.length) {
        fs.rmSync(root, { recursive: true, force: true });
        throw new Error('No se pudo descargar ningún archivo del modpack. Revisa tu conexión e inténtalo otra vez.');
      }
      const loaderVersion = isSafeVersion(pack.l.v) ? pack.l.v : '';
      const entry = packEntryFrom(id, pack.n, { mcVersion: pack.mc, loader: { type: pack.l.t, version: loaderVersion } }, { emoji: '🔗', shareCode: code, notes: `Importado con el código ${share.formatCode(code)}.` });
      writeModpacks([...readModpacks(), entry]);
      return { entry, installed: tasks.length - failed, missing: missing + failed };
    } finally {
      progress('Listo');
    }
  }
  ipcMain.handle('share:import', (_e, input) => importShareCode(input));

  /* ---------- copias automáticas de mundos ---------- */
  const running = new Map();
  function autoBackupFor(root, { onStatus } = {}) {
    const st = readSettings();
    if (st.autoBackup === false) return Promise.resolve(null);
    const prev = running.get(root) || Promise.resolve();
    const next = prev.catch(() => {}).then(() => respaldos.autoBackup(root, { keep: st.backupKeep || 3, onStatus }))
      .then((r) => {
        if (r && r.made.length) pushLog('launcher', `[Nova] Copia automática: ${r.made.map((m) => m.world).join(', ')}.`);
        if (r && r.skipped.some((s) => s.reason === 'grande')) pushLog('launcher', '[Nova] Un mundo pasa de 1,5 GB: no se copia solo. Haz una copia a mano desde Mundos.');
        return r;
      })
      .catch((err) => { pushLog('launcher', `[Nova] No se pudo hacer la copia automática: ${String((err && err.message) || err)}`); return null; })
      .finally(() => { if (running.get(root) === next) running.delete(root); });
    running.set(root, next);
    return next;
  }

  return { autoBackupFor, noteUpdates, createShareCode, importShareCode };
};
