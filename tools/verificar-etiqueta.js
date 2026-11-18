'use strict';
// Comprueba que una etiqueta de versión (vX.Y.Z) es una versión nueva de verdad
// antes de compilar y publicar. Falla si:
//   - la etiqueta no tiene el formato vX.Y.Z,
//   - la versión de package.json en ese commit no coincide con la etiqueta, o
//   - el commit etiquetado es el mismo que el de una versión
//     anterior (por ejemplo, v1.0.51 apuntando al commit de v1.0.50).
//
// Uso (lo ejecuta .github/workflows/release.yml):
//   node tools/verificar-etiqueta.js v1.0.55
// Necesita el historial y las etiquetas completas (checkout con fetch-depth: 0).
const { execFileSync } = require('child_process');

const SEMVER = /^v(\d+)\.(\d+)\.(\d+)$/;

function parse(tag) {
  const m = SEMVER.exec(tag);
  return m ? m.slice(1).map(Number) : null;
}

function compare(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

// tag: nombre de la etiqueta; pkgVersion: versión de package.json en el commit etiquetado;
// commit: sha del commit etiquetado; tags: [{ name, commit }] con todas las etiquetas del repo.
// Devuelve una lista de errores (vacía si todo está bien).
function verificar({ tag, pkgVersion, commit, tags }) {
  const errores = [];
  const actual = parse(tag);
  if (!actual) return [`La etiqueta '${tag}' no tiene el formato vX.Y.Z.`];

  const version = tag.slice(1);
  if (pkgVersion !== version) {
    errores.push(
      `package.json dice "${pkgVersion}" pero la etiqueta es ${tag}. ` +
        `¿Olvidaste hacer commit del cambio de versión? Usa "npm version patch" y "git push --follow-tags".`
    );
  }

  const versiones = tags
    .filter((t) => t.name !== tag && parse(t.name))
    .map((t) => ({ ...t, v: parse(t.name) }));

  const anteriores = versiones.filter((t) => compare(t.v, actual) < 0).sort((a, b) => compare(b.v, a.v));
  const previa = anteriores[0];
  if (previa && previa.commit === commit) {
    errores.push(`${tag} apunta al mismo commit que la versión anterior ${previa.name} (${commit.slice(0, 7)}).`);
  }

  const otras = anteriores.filter((t) => t.commit === commit && t !== previa).map((t) => t.name);
  if (otras.length) {
    errores.push(`${tag} apunta al mismo commit que ${otras.join(', ')} (${commit.slice(0, 7)}).`);
  }

  return errores;
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

// Lee todas las etiquetas con el commit al que apuntan (las anotadas se "despegan" con ^{}).
function leerEtiquetas() {
  const map = new Map();
  for (const line of git('show-ref', '--tags', '-d').split('\n').filter(Boolean)) {
    const [sha, ref] = line.split(' ');
    const peeled = ref.endsWith('^{}');
    const name = ref.replace(/^refs\/tags\//, '').replace(/\^\{\}$/, '');
    if (peeled || !map.has(name)) map.set(name, sha);
  }
  return [...map].map(([name, commit]) => ({ name, commit }));
}

if (require.main === module) {
  const tag = process.argv[2] || process.env.GITHUB_REF_NAME;
  if (!tag) {
    console.error('Uso: node tools/verificar-etiqueta.js vX.Y.Z');
    process.exit(2);
  }
  let errores;
  if (!parse(tag)) {
    errores = [`La etiqueta '${tag}' no tiene el formato vX.Y.Z.`];
  } else {
    const commit = git('rev-list', '-n', '1', tag);
    const pkgVersion = JSON.parse(git('show', `${commit}:package.json`)).version;
    errores = verificar({ tag, pkgVersion, commit, tags: leerEtiquetas() });
  }
  if (errores.length) {
    for (const e of errores) console.error(`::error::${e}`);
    process.exit(1);
  }
  console.log(`${tag} está bien: package.json coincide y es un commit nuevo.`);
}

module.exports = { verificar, parse, compare };
