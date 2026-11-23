/* loader (Forge) — antes estaba dentro de main.js. Recibe lo que necesita en "ctx" y devuelve lo que usan las demás partes. */
'use strict';

module.exports = function (ctx) {
  const { readZip, fs, loaders, path, GAME_DIR, fetchJson, send, downloadBuffer, fetchWithTimeout, sha1OfFile, pushLog, instanceDir, novaLib, content, apiRequest } = ctx;
  /* ---------- loader (Forge) ---------- */

  // Descarga el instalador de Forge (o el jar "universal" en Minecraft 1.12.2 y anteriores) y
  // devuelve su ruta. minecraft-launcher-core se encarga de instalarlo al iniciar el juego.
  // ¿El instalador de Forge sirve para arrancar? Debe ser un zip válido con version.json (si no, el motor de
  // lanzamiento cae en Vanilla sin avisar). Los instaladores muy viejos de 1.12.2 no lo traen.
  function forgeInstallerOk(file) {
    try {
      const z = readZip(fs.readFileSync(file));
      return z.has('version.json');
    } catch { return false; }
  }

  async function ensureForge(mcVersion, wantedVersion) {
    if (!loaders.isSafeVersion(mcVersion)) throw new Error(`La versión de Minecraft "${mcVersion}" no es válida.`);

    const dir = path.join(GAME_DIR, 'installers');
    fs.mkdirSync(dir, { recursive: true });

    let promos = null;
    try { promos = await fetchJson('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json'); } catch {}

    // Intenta la versión pedida por el modpack; si su instalador no sirve, prueba la recomendada de ese Minecraft.
    const candidates = [];
    const wanted = loaders.pickForgeVersion(promos, mcVersion, wantedVersion);
    if (wantedVersion && !wanted) throw new Error(`La versión de Forge "${wantedVersion}" no es válida.`);
    if (wanted) candidates.push(wanted);
    const rec = loaders.pickForgeVersion(promos, mcVersion, '');
    if (rec && !candidates.includes(rec)) candidates.push(rec);

    if (!candidates.length) {
      // Sin internet: se reutiliza el instalador de Forge que ya se descargó para esta versión.
      const cached = fs.readdirSync(dir).filter((f) => f.startsWith(`forge-${mcVersion}-`) && forgeInstallerOk(path.join(dir, f))).sort().pop();
      if (cached) return path.join(dir, cached);
      throw new Error(promos ? `Forge no tiene una versión publicada para Minecraft ${mcVersion}.` : 'No se pudo consultar las versiones de Forge. Revisa tu conexión.');
    }

    let lastErr = null;
    for (let i = 0; i < candidates.length; i++) {
      const forgeVersion = candidates[i];
      const url = loaders.forgeUrl(mcVersion, forgeVersion);
      const dest = path.join(dir, loaders.forgeFileName(mcVersion, forgeVersion));
      try {
        if (fs.existsSync(dest) && !forgeInstallerOk(dest)) fs.unlinkSync(dest); // descarga vieja dañada: se baja de nuevo
        if (!fs.existsSync(dest)) {
          send('game:status', { text: `Descargando Forge ${forgeVersion}…` });
          fs.writeFileSync(dest, await downloadBuffer(url));
          // Forge publica el hash sha1 junto a cada archivo: si está disponible, se comprueba.
          try {
            const expected = (await (await fetchWithTimeout(`${url}.sha1`)).text()).trim().split(/\s+/)[0].toLowerCase();
            if (/^[0-9a-f]{40}$/.test(expected) && sha1OfFile(dest).toLowerCase() !== expected) {
              fs.unlinkSync(dest);
              throw new Error('El instalador de Forge descargado está dañado (no coincide su sha1). Inténtalo de nuevo.');
            }
          } catch (err) {
            if (!fs.existsSync(dest)) throw err;
          }
        }
        if (!forgeInstallerOk(dest)) {
          try { fs.unlinkSync(dest); } catch {}
          throw new Error(`El instalador de Forge ${forgeVersion} no es compatible con este launcher.`);
        }
        if (i > 0) pushLog('launcher', `[Nova] Forge ${candidates[0]} no sirve; se usa Forge ${forgeVersion} para Minecraft ${mcVersion}.`);
        return dest;
      } catch (err) {
        lastErr = err;
        pushLog('launcher', `[Nova] Forge ${forgeVersion}: ${err.message}`);
      }
    }
    throw lastErr || new Error('No se pudo preparar Forge.');
  }


  // Sodium + Iris: si chocan, deja una pareja que funcione (cambia Sodium o quita Iris). Solo perfiles Nova.
  async function fixNovaMods(instanceDir, mc) {
    const modsDir = path.join(instanceDir, 'mods');
    if (!fs.existsSync(modsDir)) return;
    try {
      await novaLib.fixSodiumIris(modsDir, {
        listSodium: () => content.compatibleVersions(apiRequest, 'sodium', 'mod', mc, 'fabric'),
        download: (u) => downloadBuffer(u),
        log: (t) => pushLog('launcher', t)
      });
    } catch (err) { pushLog('launcher', `[Nova] No se pudo revisar Sodium/Iris: ${err.message}`); }
    // Nova Client (y casi todos los mods Fabric) necesita Fabric API: si falta, se instala.
    try {
      const jars = fs.readdirSync(modsDir).filter((f) => /\.jar(\.disabled)?$/i.test(f));
      if (jars.some((f) => /nova-client/i.test(f)) && !jars.some((f) => /^fabric[-_]?api/i.test(f) && /\.jar$/i.test(f))) {
        pushLog('launcher', '[Nova] Falta Fabric API (la necesita Nova Client); instalándola…');
        await content.installFromModrinth({ request: apiRequest, download: (u) => downloadBuffer(u), root: instanceDir, type: 'mod', projectId: 'fabric-api', mc, loader: 'fabric' });
      }
    } catch (err) { pushLog('launcher', `[Nova] No se pudo instalar Fabric API: ${err.message}`); }
    // En Minecraft viejo (hasta 1.19.1) la Fabric API se llama «fabric» y un Nova Client que pida «fabric-api» no la encuentra.
    try {
      const marker = path.join(instanceDir, '.nova-client-off');
      const broken = (st) => st.client && st.needs && !st.hasApi && st.hasLegacy;
      let st = novaLib.novaClientApiState(modsDir);
      if (broken(st) || (!st.client && fs.existsSync(marker))) {
        pushLog('launcher', '[Nova] Nova Client no encaja con la Fabric API de esta versión; buscando un Nova Client corregido…');
        try { await novaLib.installNovaClient({ request: apiRequest, download: (u) => downloadBuffer(u), dir: instanceDir, mc }); } catch {}
        st = novaLib.novaClientApiState(modsDir);
        if (broken(st)) {
          fs.renameSync(path.join(modsDir, st.client), path.join(modsDir, `${st.client}.disabled`));
          fs.writeFileSync(marker, '1');
          pushLog('launcher', '[Nova] Nova Client se desactivó en este perfil (todavía no hay una versión corregida para esta versión de Minecraft). El juego abre sin él.');
        } else if (st.client) {
          fs.rmSync(marker, { force: true });
          pushLog('launcher', '[Nova] Nova Client actualizado.');
        }
      }
    } catch (err) { pushLog('launcher', `[Nova] No se pudo revisar Nova Client: ${err.message}`); }
  }
  return { ensureForge, fixNovaMods };
};
