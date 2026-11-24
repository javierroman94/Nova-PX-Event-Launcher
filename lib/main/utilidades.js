/* utilidades — antes estaba dentro de main.js. Recibe lo que necesita en "ctx" y devuelve lo que usan las demás partes. */
'use strict';

module.exports = function (ctx) {
  const { streamer, readSettings, execFile, send, ipcMain, bumpRev, fs, DATA_CACHE_DIR, path } = ctx;
  /* ---------- utilidades ---------- */

  async function fetchWithTimeout(url, ms = 8000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
      return res;
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchJson(url, ms) {
    return (await fetchWithTimeout(url, ms)).json();
  }

  // Orden de lectura: 1) GitHub (siempre lo más nuevo), 2) última copia descargada (sin internet),
  // 3) copia incluida en el instalador. Así el launcher nunca se queda sin datos.
  // Modo streamer: detecta programas de directo (OBS, Streamlabs…) y avisa a la interfaz.
  let streamDetected = false;
  let streamLast = null;
  const streamerOn = () => streamer.effective(readSettings().streamer, streamDetected);
  async function checkStreamer() {
    try {
      if (readSettings().streamer === 'auto') streamDetected = streamer.streamingDetected(await streamer.listProcesses(execFile));
      else streamDetected = false;
    } catch { streamDetected = false; }
    const now = { on: streamerOn(), detected: streamDetected };
    if (!streamLast || streamLast.on !== now.on || streamLast.detected !== now.detected) { streamLast = now; send('streamer:changed', now); }
  }
  ipcMain.handle('streamer:get', async () => { await checkStreamer(); return streamLast; });

  // Lo que el administrador acaba de publicar se ve al instante en su propio launcher (GitHub tarda un poco en servirlo).
  const justPublished = new Map();
  function remember(name, data) {
    dataMemo.delete(name);
    bumpRev();
    justPublished.set(name, { data, at: Date.now(), until: Date.now() + 60 * 1000 });
    try {
      fs.mkdirSync(DATA_CACHE_DIR, { recursive: true });
      fs.writeFileSync(path.join(DATA_CACHE_DIR, `${name}.json`), JSON.stringify(data));
    } catch {}
  }
  const dataMemo = new Map();
  return { fetchWithTimeout, fetchJson, checkStreamer, justPublished, remember, dataMemo };
};
