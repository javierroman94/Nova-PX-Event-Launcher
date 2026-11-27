'use strict';

const crypto = require('crypto');
const PREFIX = 'safeStorage:v1:';
const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

function makePresenceTokenStore({ fs, file, safeStorage }) {
  let token = null;

  const available = () => {
    try { return !!(safeStorage && safeStorage.isEncryptionAvailable()); } catch { return false; }
  };

  const persist = () => {
    if (!available() || !TOKEN.test(token || '')) return false;
    try {
      const encrypted = safeStorage.encryptString(token);
      fs.writeFileSync(file, PREFIX + encrypted.toString('base64'), { mode: 0o600 });
      try { fs.chmodSync(file, 0o600); } catch {}
      return true;
    } catch {
      return false;
    }
  };

  function get() {
    if (token) return token;
    if (!available()) {
      // Borra solo el formato antiguo en texto plano; conserva sobres cifrados para cuando vuelva el llavero.
      try {
        const raw = fs.readFileSync(file, 'utf8').trim();
        if (raw && !raw.startsWith(PREFIX)) fs.unlinkSync(file);
      } catch {}
      return null;
    }

    try {
      const raw = fs.readFileSync(file, 'utf8').trim();
      if (raw.startsWith(PREFIX)) token = safeStorage.decryptString(Buffer.from(raw.slice(PREFIX.length), 'base64'));
      else if (TOKEN.test(raw)) token = raw; // migración única del token antiguo
    } catch {}

    if (!TOKEN.test(token || '')) token = crypto.randomBytes(24).toString('base64url');
    if (!persist()) { token = null; return null; }
    return token;
  }

  return { get };
}

module.exports = { makePresenceTokenStore };
