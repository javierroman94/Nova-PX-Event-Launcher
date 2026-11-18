'use strict';
/*
 * Avisos a Discord (webhook) y atajo para compartir en X.
 * El webhook es un secreto: quien lo tiene puede escribir en tu canal. Se guarda cifrado y nunca se muestra.
 */
const HOOK = /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api\/webhooks\/\d{15,25}\/[A-Za-z0-9_-]{20,120}$/;

const validWebhook = (u) => HOOK.test(String(u || '').trim());
const cut = (s, n) => String(s || '').replace(/\r/g, '').slice(0, n);
const httpsOnly = (u) => (/^https:\/\/[^\s]+$/i.test(String(u || '')) ? String(u) : '');

// Mensaje con "embed". allowed_mentions vacío evita que un texto con @everyone avise a todos.
function buildPayload({ title, text, image, link, color, footer } = {}) {
  const embed = { title: cut(title, 250) || 'Nova PX', description: cut(text, 3500), color: Number.isInteger(color) ? color : 0x35d6ff };
  if (httpsOnly(link)) embed.url = httpsOnly(link);
  if (httpsOnly(image)) embed.image = { url: httpsOnly(image) };
  if (footer) embed.footer = { text: cut(footer, 100) };
  return { username: 'Nova PX', allowed_mentions: { parse: [] }, embeds: [embed] };
}

async function post(fetchFn, url, payload) {
  if (!validWebhook(url)) throw new Error('La dirección del webhook de Discord no es válida.');
  const r = await fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!r.ok) throw new Error(r.status === 404 || r.status === 401 ? 'Discord no reconoce ese webhook (¿lo borraron?).' : `Discord respondió ${r.status}.`);
  return true;
}

// Enlace para abrir la ventana de "publicar" de X con el texto ya escrito (gratis, sin claves de API).
function xShareUrl(text, link) {
  const q = new URLSearchParams({ text: cut(text, 260) });
  if (httpsOnly(link)) q.set('url', httpsOnly(link));
  return `https://x.com/intent/post?${q.toString()}`;
}

module.exports = { validWebhook, buildPayload, post, xShareUrl };
