// Configuración para el paquete de Microsoft Store: reutiliza la de package.json y añade la identidad que da Partner Center.
const base = require('./package.json').build;
module.exports = {
  ...base,
  win: { ...base.win, target: 'appx' },
  appx: {
    ...base.appx,
    identityName: process.env.STORE_IDENTITY_NAME,
    publisher: process.env.STORE_PUBLISHER,
    publisherDisplayName: process.env.STORE_PUBLISHER_DISPLAY_NAME
  }
};
