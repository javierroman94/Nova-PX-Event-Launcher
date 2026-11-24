'use strict';
/*
 * Lee un archivo de data/ comprobando su firma (lib/firma.js).
 *  - Archivo no crítico, o launcher sin llave pública: se acepta tal cual.
 *  - Con firma válida y no más vieja que la última conocida: se acepta.
 *  - Con firma inválida: siempre se rechaza.
 *  - Sin firma: solo se acepta si la firma no es obligatoria.
 */
const firma = require('./firma');

async function leerFirmado({ name, getText, pub, obligatoria, known = null, wait = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  let text = await getText(`${name}.json`);
  if (!pub || !firma.esFirmado(name)) return { data: JSON.parse(text), sig: null };
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    let sigText = null;
    try { sigText = await getText(`${name}.firma.json`); } catch (err) { lastErr = err; }
    if (sigText === null) {
      if (!obligatoria) return { data: JSON.parse(text), sig: null };
      lastErr = new Error('falta la firma');
    } else {
      try {
        const sig = JSON.parse(sigText);
        const { firmadoEn } = firma.verificar(name, text, sig, pub);
        if (known && known.firmadoEn && Date.parse(firmadoEn) < Date.parse(known.firmadoEn)) throw new Error('es más vieja que la última conocida');
        return { data: JSON.parse(text), sig };
      } catch (err) { lastErr = err; }
    }
    // Puede que el archivo y su firma se estén publicando justo ahora: se reintenta una vez.
    if (attempt === 0) { await wait(1500); try { text = await getText(`${name}.json`); } catch {} }
  }
  throw new Error(`Firma de ${name} no válida: ${lastErr && lastErr.message}`);
}

module.exports = { leerFirmado };
