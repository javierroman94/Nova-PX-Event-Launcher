'use strict';
// Ayudas para el envío automático a Microsoft Store (.github/workflows/release.yml, trabajo «tienda»).
//
//   node tools/tienda.js validar <paquete.appx> <versión X.Y.Z>
//     Abre el paquete y comprueba identidad, publisher, versión y arquitectura contra
//     build/microsoft-store.json y package.json. Falla si algo no coincide.
//
//   node tools/tienda.js decidir <envio.json> <versión X.Y.Z>
//     Lee la salida de «msstore submission get <productId>» y decide si hay que enviar:
//       enviar        → la Store tiene publicada una versión anterior y no hay envío en curso.
//       ya-enviado    → esa versión ya está en un envío (en curso o publicado): no se repite.
//       en-curso      → hay otro envío abierto en Partner Center; «msstore publish» lo borraría,
//                       así que no se toca y se avisa.
//       version-vieja → la Store ya tiene una versión más nueva.
//     Escribe «accion=<valor>» en $GITHUB_OUTPUT si existe.
const fs = require('fs');
const path = require('path');

const TIENDA = require('../build/microsoft-store.json');
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const ARCH_OK = new Set(['x64', 'arm64', 'x86', 'neutral']);

// "1.0.193" → "1.0.193.0" (la Store usa cuatro números; electron-builder añade el .0).
function versionStore(v) {
  if (!SEMVER.test(String(v))) throw new Error(`Versión inválida: ${v}`);
  return `${v}.0`;
}

function compararVersion(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 4; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

function atributo(etiqueta, nombre) {
  // electron-builder escribe Publisher entre comillas simples y el resto entre dobles.
  const m = new RegExp(`\\s${nombre}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(etiqueta);
  return m ? (m[1] !== undefined ? m[1] : m[2]) : null;
}

// Revisa el AppxManifest.xml. Devuelve { datos, errores }.
function revisarManifiesto(xml, version, tienda = TIENDA) {
  const errores = [];
  const ident = /<Identity\b[^>]*>/.exec(xml);
  if (!ident) return { datos: null, errores: ['El paquete no tiene <Identity> en AppxManifest.xml'] };
  const datos = {
    name: atributo(ident[0], 'Name'),
    publisher: atributo(ident[0], 'Publisher'),
    version: atributo(ident[0], 'Version'),
    arch: atributo(ident[0], 'ProcessorArchitecture'),
    publisherDisplayName: (/<PublisherDisplayName>([^<]*)<\/PublisherDisplayName>/.exec(xml) || [])[1] || null
  };
  if (datos.name !== tienda.identityName) errores.push(`Identity Name es «${datos.name}», se esperaba «${tienda.identityName}»`);
  if (datos.publisher !== tienda.publisher) errores.push(`Publisher es «${datos.publisher}», se esperaba «${tienda.publisher}»`);
  if (datos.publisherDisplayName !== tienda.publisherDisplayName)
    errores.push(`PublisherDisplayName es «${datos.publisherDisplayName}», se esperaba «${tienda.publisherDisplayName}»`);
  if (datos.version !== versionStore(version)) errores.push(`Version es «${datos.version}», se esperaba «${versionStore(version)}»`);
  if (datos.arch !== tienda.arch || !ARCH_OK.has(datos.arch))
    errores.push(`ProcessorArchitecture es «${datos.arch}», se esperaba «${tienda.arch}»`);
  if (/\bEntryPoint\s*=\s*"Windows\.FullTrustApplication"/.test(xml) === false)
    errores.push('La aplicación no declara EntryPoint="Windows.FullTrustApplication" (app de escritorio)');
  return { datos, errores };
}

function validarPaquete(archivo, version) {
  const AdmZip = require('adm-zip');
  const zip = new AdmZip(archivo);
  const entrada = zip.getEntry('AppxManifest.xml');
  if (!entrada) return { datos: null, errores: ['El archivo no contiene AppxManifest.xml'], firmado: false };
  const r = revisarManifiesto(entrada.getData().toString('utf8'), version);
  // La Store vuelve a firmar el paquete con el certificado de Microsoft; la firma local es opcional.
  r.firmado = !!zip.getEntry('AppxSignature.p7x');
  return r;
}

// La salida de msstore puede traer texto antes del JSON: se toma del primer «{» al último «}».
function leerJson(texto) {
  const a = texto.indexOf('{');
  const b = texto.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('La respuesta de msstore no contiene JSON');
  return JSON.parse(texto.slice(a, b + 1));
}

// Lee una clave sin importar mayúsculas (msstore escribe «Status» o «status» según la versión).
function campo(obj, nombre) {
  if (!obj || typeof obj !== 'object') return undefined;
  const k = Object.keys(obj).find((x) => x.toLowerCase() === nombre.toLowerCase());
  return k === undefined ? undefined : obj[k];
}

function decidir(envio, version) {
  const objetivo = versionStore(version);
  const estado = String(campo(envio, 'status') || '');
  const paquetes = (campo(envio, 'applicationPackages') || []).filter(
    (p) => String(campo(p, 'fileStatus') || '') !== 'PendingDelete'
  );
  const versiones = paquetes.map((p) => String(campo(p, 'version') || '')).filter(Boolean);
  if (!estado) throw new Error('El envío no tiene estado; no se puede decidir sin riesgo');
  if (versiones.includes(objetivo)) return { accion: 'ya-enviado', estado, versiones };
  if (estado !== 'Published') return { accion: 'en-curso', estado, versiones };
  if (versiones.some((v) => compararVersion(v, objetivo) > 0)) return { accion: 'version-vieja', estado, versiones };
  return { accion: 'enviar', estado, versiones };
}

function salida(clave, valor) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${clave}=${valor}\n`);
}

function main(argv) {
  const [cmd, archivo, version] = argv;
  if (cmd === 'validar' && archivo && version) {
    const r = validarPaquete(path.resolve(archivo), version);
    if (r.datos) console.log(`Paquete: ${r.datos.name} ${r.datos.version} ${r.datos.arch} (${r.datos.publisher})`);
    console.log(r.firmado ? 'Firma local presente (la Store la reemplaza).' : 'Sin firma local: la Store firma el paquete.');
    for (const e of r.errores) console.error(`✗ ${e}`);
    return r.errores.length ? 1 : 0;
  }
  if (cmd === 'decidir' && archivo && version) {
    const r = decidir(leerJson(fs.readFileSync(archivo, 'utf8')), version);
    console.log(`Estado en la Store: ${r.estado}. Paquetes: ${r.versiones.join(', ') || 'ninguno'}. Acción: ${r.accion}.`);
    salida('accion', r.accion);
    salida('estado', r.estado);
    return 0;
  }
  console.error('Uso: node tools/tienda.js validar <paquete.appx> <X.Y.Z> | decidir <envio.json> <X.Y.Z>');
  return 2;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { versionStore, compararVersion, revisarManifiesto, leerJson, decidir, campo };
