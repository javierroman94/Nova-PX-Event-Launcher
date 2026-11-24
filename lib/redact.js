'use strict';
/*
 * Quita de un texto lo que nunca debe verse en la consola ni en un informe: tokens de acceso de Minecraft/Microsoft,
 * cabeceras Authorization y tokens JWT. minecraft-launcher-core imprime todos los argumentos del juego, token incluido.
 */
const SECRET_ARGS = ['accessToken', 'session', 'xuid', 'clientId', 'userProperties'];
const ARG_RE = new RegExp(`(--(?:${SECRET_ARGS.join('|')}))(\\s+|=)(?:"[^"]*"|'[^']*'|\\S+)`, 'gi');
const JWT_RE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const BEARER_RE = /\b(Bearer|Authorization:?)\s+[A-Za-z0-9._~+/=-]{12,}/gi;
const TOKEN_KV_RE = /\b(access_token|refresh_token|id_token|accessToken)(["']?\s*[:=]\s*["']?)[A-Za-z0-9._~+/=-]{12,}/gi;

function redactSecrets(text) {
  return String(text)
    .replace(ARG_RE, '$1$2•••')
    .replace(BEARER_RE, '$1 •••')
    .replace(TOKEN_KV_RE, '$1$2•••')
    .replace(JWT_RE, '•••');
}

module.exports = { redactSecrets };
