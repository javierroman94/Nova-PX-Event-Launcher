/* loader (Fabric) — antes estaba dentro de main.js. Recibe lo que necesita en "ctx" y devuelve lo que usan las demás partes. */
'use strict';

module.exports = function (ctx) {
  const { loaders, fetchJson, path, GAME_DIR, fs } = ctx;
  /* ---------- loader (Fabric) ---------- */

  async function ensureFabric(mcVersion, loaderVersion) {
    if (!loaders.isSafeVersion(mcVersion)) throw new Error(`La versión de Minecraft "${mcVersion}" no es válida.`);
    if (loaderVersion && !loaders.isSafeVersion(loaderVersion)) throw new Error(`La versión de Fabric "${loaderVersion}" no es válida.`);
    if (!loaderVersion) {
      const list = await fetchJson(`https://meta.fabricmc.net/v2/versions/loader/${mcVersion}`);
      if (!list.length) throw new Error(`Fabric no soporta Minecraft ${mcVersion}`);
      const stable = list.find((x) => x.loader.stable) || list[0];
      loaderVersion = stable.loader.version;
    }
    const id = `fabric-loader-${loaderVersion}-${mcVersion}`;
    const dir = path.join(GAME_DIR, 'versions', id);
    const file = path.join(dir, `${id}.json`);
    if (!fs.existsSync(file)) {
      const profile = await fetchJson(
        `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${loaderVersion}/profile/json`
      );
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(profile));
    }
    return id;
  }
  return { ensureFabric };
};
