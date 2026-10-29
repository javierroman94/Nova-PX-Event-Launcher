'use strict';
// Traduce errores técnicos de red/GitHub a una causa que el jugador entiende.
function classifyNetworkError(err) {
  const text = String((err && (err.code ? `${err.code} ${err.message}` : err.message)) || err || '');
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_NETWORK|net::ERR|getaddrinfo|socket hang up|timed? ?out/i.test(text)) return 'offline';
  if (/\b(429)\b|rate limit|API rate/i.test(text) || (/\b403\b/.test(text) && /rate|limit/i.test(text))) return 'ratelimit';
  if (/\b404\b|Not Found|Cannot find latest|latest\.yml/i.test(text)) return 'notfound';
  if (/\b(401|403)\b|Forbidden|Unauthorized/i.test(text)) return 'denied';
  if (/\b5\d\d\b|Bad Gateway|Service Unavailable/i.test(text)) return 'server';
  if (/certificate|CERT_|SSL|TLS/i.test(text)) return 'tls';
  return 'other';
}

const MESSAGES = {
  offline: 'No hay conexión con internet. Revisa tu red e inténtalo de nuevo.',
  ratelimit: 'GitHub recibió demasiadas consultas desde tu red. Espera unos minutos y vuelve a intentarlo.',
  notfound: 'Todavía no hay una versión publicada para actualizar.',
  denied: 'GitHub no permitió la consulta. Inténtalo más tarde.',
  server: 'El servidor de actualizaciones tiene problemas ahora mismo. Inténtalo más tarde.',
  tls: 'No se pudo verificar la conexión segura. Revisa la fecha y hora de tu equipo y tu antivirus.',
  other: 'No se pudo buscar actualizaciones por un error inesperado. Si se repite, copia el registro de la Consola.'
};

module.exports = { classifyNetworkError, networkMessage: (err) => MESSAGES[classifyNetworkError(err)] };
module.exports.MESSAGES = MESSAGES;
