/* loader (Quilt) — antes estaba dentro de main.js. Recibe lo que necesita en "ctx" y devuelve lo que usan las demás partes. */
'use strict';

module.exports = function (ctx) {
  const { loaders, fetchJson, path, GAME_DIR, fs } = ctx;
  /* ---------- loader (Quilt) ---------- */

  async function ensureQuilt(mcVersion, loaderVersion) {
    if (!loaders.isSafeVersion(mcVersion)) throw new Error(`La versión de Minecraft "${mcVersion}" no es válida.`);
    if (loaderVersion && !loaders.isSafeVersion(loaderVersion)) throw new Error(`La versión de Quilt "${loaderVersion}" no es válida.`);
    if (!loaderVersion) {
      const list = await fetchJson(`https://meta.quiltmc.org/v3/versions/loader/${mcVersion}`);
      if (!list.length) throw new Error(`Quilt no soporta Minecraft ${mcVersion}`);
      loaderVersion = (list.find((x) => x.loader && !/-(beta|pre|rc)/i.test(x.loader.version)) || list[0]).loader.version;
    }
    const id = `quilt-loader-${loaderVersion}-${mcVersion}`;
    const dir = path.join(GAME_DIR, 'versions', id);
    const file = path.join(dir, `${id}.json`);
    if (!fs.existsSync(file)) {
      const profile = await fetchJson(`https://meta.quiltmc.org/v3/versions/loader/${mcVersion}/${loaderVersion}/profile/json`);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(profile));
    }
    return id;
  }
  return { ensureQuilt };
};
