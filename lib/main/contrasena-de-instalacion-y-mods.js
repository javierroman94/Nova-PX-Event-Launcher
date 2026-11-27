/* contraseña de instalación y mods — antes estaba dentro de main.js. Recibe lo que necesita en "ctx" y devuelve lo que usan las demás partes. */
'use strict';

module.exports = function (ctx) {
  const { memoryKeys, safeStorage, fs, KEYS_FILE, path, fetchWithTimeout, send, packInstall, app, instanceId } = ctx;
  /* ---------- contraseña de instalación y mods ---------- */

  // La clave derivada de la contraseña se guarda cifrada con el almacén del sistema (DPAPI, Keychain...).
  // Si el sistema no ofrece ese almacén, solo se recuerda mientras el launcher está abierto.
  const keyStore = {
    load(salt) {
      if (memoryKeys.has(salt)) return memoryKeys.get(salt);
      if (!safeStorage.isEncryptionAvailable()) return null;
      try {
        const all = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
        if (!all[salt]) return null;
        const key = Buffer.from(safeStorage.decryptString(Buffer.from(all[salt], 'base64')), 'base64');
        memoryKeys.set(salt, key);
        return key;
      } catch {
        return null;
      }
    },
    save(salt, key) {
      memoryKeys.set(salt, key);
      if (!safeStorage.isEncryptionAvailable()) return;
      try {
        let all = {};
        try {
          all = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
        } catch {}
        all[salt] = safeStorage.encryptString(key.toString('base64')).toString('base64');
        fs.mkdirSync(path.dirname(KEYS_FILE), { recursive: true });
        fs.writeFileSync(KEYS_FILE, JSON.stringify(all));
      } catch {}
    },
    clear() {
      memoryKeys.clear();
      try {
        fs.unlinkSync(KEYS_FILE);
      } catch {}
    }
  };

  const MAX_DOWNLOAD = 1.5 * 1024 * 1024 * 1024; // tope por archivo: evita llenar la memoria con una descarga enorme
  async function downloadBuffer(url) {
    const res = await fetchWithTimeout(url, 180000);
    const len = Number(res.headers && res.headers.get && res.headers.get('content-length'));
    if (len && len > MAX_DOWNLOAD) throw new Error('El archivo a descargar es demasiado grande.');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_DOWNLOAD) throw new Error('El archivo a descargar es demasiado grande.');
    return buf;
  }

  // Instala o actualiza los mods. Con modpack protegido pide la contraseña solo si hace falta
  // (primera instalación o actualización); quien ya lo tiene instalado juega sin escribirla.
  async function installMods(manifest, password, gameDir) {
    const onStatus = (text) => send('game:status', { text });
    if (manifest.protected) {
      const r = await packInstall.installProtected({
        prot: manifest.protected,
        password,
        gameDir,
        download: downloadBuffer,
        keyStore,
        onStatus,
        cacheDir: path.join(app.getPath('userData'), 'pack-cache', instanceId(manifest)),
        // Fabric carga mods de otra carpeta (-Dfabric.addMods): los .jar descifrados no tocan la carpeta del juego.
        pxMode: String((manifest.loader && manifest.loader.type) || '').toLowerCase() === 'fabric',
        runRoot: app.getPath('temp')
      });
      if (r.status === 'need-password') {
        throw new Error(
          r.wrong
            ? 'WRONG_PASSWORD: La contraseña no es correcta.'
            : 'NEEDS_PASSWORD: Este modpack necesita la contraseña de instalación.'
        );
      }
      return r.runDir || null;
    }
    await packInstall.syncMods({
      modsDir: path.join(gameDir, 'mods'),
      stateFile: path.join(gameDir, '.managed-mods.json'),
      mods: manifest.mods || [],
      download: downloadBuffer,
      onStatus
    });
  }
  return { keyStore, downloadBuffer, installMods };
};
