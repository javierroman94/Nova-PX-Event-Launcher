/* loader (NeoForge) — antes estaba dentro de main.js. Recibe lo que necesita en "ctx" y devuelve lo que usan las demás partes. */
'use strict';

module.exports = function (ctx) {
  const { loaders, path, GAME_DIR, fs, fetchWithTimeout, send, downloadBuffer, sha1OfFile } = ctx;
  /* ---------- loader (NeoForge) ---------- */

  // Igual que Forge: se descarga el instalador oficial y minecraft-launcher-core lo ejecuta al iniciar.
  async function ensureNeoForge(mcVersion, wantedVersion) {
    if (!loaders.isSafeVersion(mcVersion)) throw new Error(`La versión de Minecraft "${mcVersion}" no es válida.`);
    if (!loaders.neoforgeMcPrefix(mcVersion) && !wantedVersion) throw new Error(`NeoForge solo está disponible desde Minecraft 1.20.2 (este modpack usa ${mcVersion}).`);
    const dir = path.join(GAME_DIR, 'installers');
    fs.mkdirSync(dir, { recursive: true });

    let version = null;
    try {
      let versions = [];
      if (!wantedVersion) {
        const xml = await (await fetchWithTimeout('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml')).text();
        versions = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]);
      }
      version = loaders.pickNeoForgeVersion(versions, mcVersion, wantedVersion);
    } catch (err) {
      const cached = fs.readdirSync(dir).filter((f) => /^neoforge-.*-installer\.jar$/.test(f)).sort().pop();
      if (cached && !wantedVersion) return path.join(dir, cached);
      throw new Error(`No se pudo consultar las versiones de NeoForge: ${err.message}`);
    }
    if (!version) throw new Error(wantedVersion ? `La versión de NeoForge "${wantedVersion}" no es válida.` : `NeoForge no tiene una versión publicada para Minecraft ${mcVersion}.`);

    const url = loaders.neoforgeUrl(version);
    const dest = path.join(dir, loaders.neoforgeFileName(version));
    if (fs.existsSync(dest)) return dest;
    send('game:status', { text: `Descargando NeoForge ${version}…` });
    fs.writeFileSync(dest, await downloadBuffer(url));
    try {
      const expected = (await (await fetchWithTimeout(`${url}.sha1`)).text()).trim().split(/\s+/)[0].toLowerCase();
      if (/^[0-9a-f]{40}$/.test(expected) && sha1OfFile(dest).toLowerCase() !== expected) {
        fs.unlinkSync(dest);
        throw new Error('El instalador de NeoForge descargado está dañado (no coincide su sha1). Inténtalo de nuevo.');
      }
    } catch (err) {
      if (!fs.existsSync(dest)) throw err;
    }
    return dest;
  }
  return { ensureNeoForge };
};
