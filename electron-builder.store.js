// Configuración para el paquete de Microsoft Store: reutiliza la de package.json y añade la identidad que da Partner Center.
// La identidad pública de la app está en build/microsoft-store.json (Partner Center → Identidad del producto).
// Las variables STORE_* solo existen para el flujo manual «Paquete para Microsoft Store» y, si se dan, mandan.
const base = require('./package.json').build;
const tienda = require('./build/microsoft-store.json');

module.exports = {
  ...base,
  win: { ...base.win, target: [{ target: 'appx', arch: [tienda.arch] }] },
  appx: {
    ...base.appx,
    identityName: process.env.STORE_IDENTITY_NAME || tienda.identityName,
    publisher: process.env.STORE_PUBLISHER || tienda.publisher,
    publisherDisplayName: process.env.STORE_PUBLISHER_DISPLAY_NAME || tienda.publisherDisplayName
  }
};
