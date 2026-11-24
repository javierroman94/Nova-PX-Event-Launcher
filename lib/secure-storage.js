'use strict';
/*
 * Envuelve safeStorage de Electron. En Linux, si no hay llavero del sistema, Electron cifra con una llave fija
 * ("basic_text"), que no protege nada. En ese caso se trata como "sin almacén seguro" y los tokens no se guardan.
 */
function makeSecureStorage(raw, platform = process.platform) {
  const backendOk = () => {
    if (platform !== 'linux') return true;
    try {
      const b = typeof raw.getSelectedStorageBackend === 'function' ? raw.getSelectedStorageBackend() : 'unknown';
      return b !== 'basic_text' && b !== 'unknown';
    } catch {
      return false;
    }
  };
  return {
    isEncryptionAvailable() {
      try { return !!raw.isEncryptionAvailable() && backendOk(); } catch { return false; }
    },
    encryptString: (s) => raw.encryptString(s),
    decryptString: (b) => raw.decryptString(b)
  };
}

module.exports = { makeSecureStorage };
