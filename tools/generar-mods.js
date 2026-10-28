#!/usr/bin/env node
/*
 * Genera la lista de mods de data/manifest.json a partir de una carpeta con archivos .jar.
 *
 * Sin contraseña (cualquiera que conozca los enlaces puede descargar los mods):
 *   npm run mods -- https://github.com/TU-EQUIPO/TU-REPO/releases/download/evento-1
 *
 * Con contraseña (recomendado si el launcher o el repositorio pueden filtrarse):
 *   npm run mods -- https://github.com/TU-EQUIPO/TU-REPO/releases/download/evento-1 --password
 *
 * Con --password:
 *   - Cada .jar se cifra y queda en mods-evento/cifrados/ (sube ESOS archivos, nunca los .jar).
 *   - La lista de mods y sus enlaces se guarda cifrada dentro de data/manifest.json ("protected").
 *     Sin la contraseña no se puede ver qué mods hay ni de dónde se descargan.
 *   - Quien ya instaló el modpack no necesita la contraseña para jugar.
 *
 * La contraseña se pide por pantalla (no se muestra). También puedes ponerla en la variable
 * de entorno NOVAPX_PASSWORD para automatizar el proceso.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const pc = require('../lib/pack-crypto');

const root = path.join(__dirname, '..');
const modsDir = path.join(root, 'mods-evento');
const encDir = path.join(modsDir, 'cifrados');
const manifestPath = path.join(root, 'data', 'manifest.json');

const args = process.argv.slice(2);
const usePassword = args.includes('--password');
const baseUrl = (args.find((a) => !a.startsWith('--')) || '').replace(/\/+$/, '');

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.stdoutMuted = false;
    rl._writeToOutput = function (text) {
      if (rl.stdoutMuted && !/[\r\n]/.test(text)) rl.output.write('*');
      else rl.output.write(text);
    };
    rl.question(question, (answer) => {
      rl.close();
      console.log('');
      resolve(answer);
    });
    rl.stdoutMuted = true;
  });
}

const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex');

// Si la contraseña es la misma de antes se conserva la sal: los jugadores que ya la escribieron
// no tendrán que volver a escribirla al actualizar el modpack.
function sameAsBefore(prot, password) {
  if (!pc.isEnvelope(prot)) return false;
  try {
    pc.openEnvelope(prot, pc.deriveKey(password, prot.salt));
    return true;
  } catch {
    return false;
  }
}

async function readPassword(prot) {
  let password = process.env.NOVAPX_PASSWORD;
  if (!password) {
    password = await askHidden('Contraseña de instalación del modpack: ');
    if (!sameAsBefore(prot, password)) {
      const again = await askHidden('Repite la contraseña: ');
      if (again !== password) fail('Las contraseñas no coinciden. No se hizo ningún cambio.');
    }
  }
  const problem = pc.passwordProblem(password);
  if (problem) fail(problem);
  return password;
}

(async () => {
  if (!/^https:\/\//i.test(baseUrl)) {
    fail(
      'Falta la dirección base de descarga (debe empezar con https://).\n' +
        'Ejemplo: npm run mods -- https://github.com/TU-EQUIPO/TU-REPO/releases/download/evento-1 --password'
    );
  }
  if (!fs.existsSync(modsDir)) {
    fs.mkdirSync(modsDir, { recursive: true });
    fail('Creé la carpeta mods-evento/. Copia ahí los .jar del evento y vuelve a ejecutar el comando.');
  }
  const jars = fs.readdirSync(modsDir).filter((f) => f.toLowerCase().endsWith('.jar')).sort();
  if (!jars.length) {
    fail('No hay archivos .jar en mods-evento/. Copia ahí los mods del evento y vuelve a ejecutar el comando.');
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const previous = manifest.protected;

  if (!usePassword) {
    delete manifest.protected;
    manifest.mods = jars.map((file) => ({
      name: file.replace(/\.jar$/i, ''),
      file,
      url: `${baseUrl}/${encodeURIComponent(file)}`,
      sha1: sha1(fs.readFileSync(path.join(modsDir, file)))
    }));
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`Listo: ${jars.length} mods escritos en data/manifest.json`);
    jars.forEach((f) => console.log(`  - ${f}`));
    console.log(`\nSube esos mismos .jar a:\n  ${baseUrl}/`);
    return;
  }

  const password = await readPassword(previous);
  const reuse = sameAsBefore(previous, password);
  const salt = reuse ? previous.salt : pc.newSalt();
  const packKey = pc.newPackKey();

  fs.rmSync(encDir, { recursive: true, force: true });
  fs.mkdirSync(encDir, { recursive: true });

  const mods = jars.map((file) => {
    const plain = fs.readFileSync(path.join(modsDir, file));
    fs.writeFileSync(path.join(encDir, `${file}.enc`), pc.encryptFile(plain, packKey, file));
    return {
      name: file.replace(/\.jar$/i, ''),
      file,
      url: `${baseUrl}/${encodeURIComponent(`${file}.enc`)}`,
      sha1: sha1(plain)
    };
  });

  manifest.protected = pc.createEnvelope({ packKey, mods }, pc.deriveKey(password, salt), salt);
  manifest.mods = []; // la lista pública queda vacía: todo va dentro del bloque cifrado
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  if (previous && !reuse) {
    console.log('Cambiaste la contraseña: los jugadores tendrán que escribir la nueva una vez al actualizar.');
  }
  console.log(`Listo: ${mods.length} mods cifrados. data/manifest.json ya no muestra la lista de mods.`);
  mods.forEach((m) => console.log(`  - ${m.file}.enc`));
  console.log(`\nSube los archivos .enc de mods-evento/cifrados/ a:\n  ${baseUrl}/`);
  console.log('\nNo subas los .jar originales. Guarda bien la contraseña: no se puede recuperar.');
})().catch((err) => fail(`Error: ${err.message}`));
