/* Java — antes estaba dentro de main.js. Recibe lo que necesita en "ctx" y devuelve lo que usan las demás partes. */
'use strict';

module.exports = function (ctx) {
  const { execFile, findJavaBinary, path, RUNTIME_DIR, fs, readSettings, loaders, config, installJava, send } = ctx;
  /* ---------- Java ---------- */

  function readJavaVersionOutput(javaBin) {
    return new Promise((resolve) => {
      execFile(javaBin, ['-version'], { timeout: 10000, windowsHide: true }, (err, stdout, stderr) => {
        resolve(err && !stderr ? null : String(stderr || stdout));
      });
    });
  }

  function managedJavaPath(major) {
    return findJavaBinary(path.join(RUNTIME_DIR, `java-${major}`));
  }

  // Elige el Java correcto para el modpack. Orden: el que el jugador eligió en Ajustes, el que instaló
  // el launcher, el del sistema. Si ninguno sirve, lo descarga (si el jugador no lo desactivó).
  // En Windows, java.exe abre una ventana negra de consola al jugar; javaw.exe es el mismo Java sin esa ventana.
  async function preferJavaw(bin) {
    if (process.platform !== 'win32') return bin;
    try {
      if (bin) {
        const w = String(bin).replace(/java(\.exe)?$/i, 'javaw.exe');
        return w !== bin && fs.existsSync(w) ? w : bin;
      }
      const found = await new Promise((resolve) => execFile('where', ['javaw'], { timeout: 5000, windowsHide: true }, (err, out) => resolve(err ? '' : String(out).split(/\r?\n/)[0].trim())));
      return found && fs.existsSync(found) ? found : bin;
    } catch { return bin; }
  }

  // Devuelve la ruta de Java, o undefined para usar el Java del sistema.
  async function resolveJava(manifest, loaderType, st = readSettings()) {
    const mc = manifest.minecraftVersion;
    const need = loaders.requiredJavaMajor(mc);
    const explicit = st.javaPath || config.javaPath || '';
    if (!need) return explicit || undefined;

    const installMajor = loaders.javaInstallMajor(mc);
    const candidates = [];
    if (explicit) candidates.push(explicit);
    const managed = managedJavaPath(installMajor);
    if (managed) candidates.push(managed);
    candidates.push('java');

    let foundMajor = null;
    for (const bin of candidates) {
      const major = loaders.parseJavaMajor(await readJavaVersionOutput(bin));
      if (major && !foundMajor) foundMajor = major;
      if (loaders.javaIsOk(major, mc, loaderType)) return bin === 'java' ? undefined : bin;
    }

    if (st.autoJava) {
      return installJava({
        rootDir: RUNTIME_DIR,
        major: installMajor,
        onStatus: (text) => send('game:status', { text }),
        onProgress: (percent) => send('game:progress', { type: 'java', task: percent, total: 100 })
      });
    }

    if (!foundMajor) {
      throw new Error(
        `No encontré Java. Minecraft ${mc} necesita Java ${need} o superior. ` +
          'Activa "Instalar Java automáticamente" en Ajustes o elige su ruta.'
      );
    }
    throw new Error(
      `Este evento usa Minecraft ${mc}, que necesita Java ${need}${need === 8 && loaderType === 'forge' ? ' (exactamente)' : ' o superior'}, ` +
        `y tu Java es el ${foundMajor}. Activa "Instalar Java automáticamente" en Ajustes o elige otro Java.`
    );
  }
  return { readJavaVersionOutput, managedJavaPath, preferJavaw, resolveJava };
};
