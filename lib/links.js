'use strict';
/*
 * Enlaces externos (noticias, anuncios, equipo, eventos, chat…). Lo que viene de data/ no va firmado, así que un enlace
 * puede ser de phishing. Solo https, sin usuario:clave en la URL, y fuera de una lista de sitios conocidos el launcher
 * pregunta antes de abrir mostrando el dominio real (en punycode, para que «nоvapx» con letras cirílicas no engañe).
 */
const TRUSTED = [
  'novapx.pages.dev', 'github.com', 'x.com', 'twitter.com', 'discord.gg', 'discord.com', 'youtube.com', 'youtu.be',
  'twitch.tv', 'tiktok.com', 'instagram.com', 'kick.com', 'modrinth.com', 'curseforge.com', 'minecraft.net',
  'apps.microsoft.com', 'trello.com', 'holyhosting.net', 'holihosting.com'
];

function checkLink(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { return { ok: false, reason: 'El enlace no es válido.' }; }
  if (u.protocol !== 'https:') return { ok: false, reason: 'Solo se pueden abrir enlaces https.' };
  if (u.username || u.password) return { ok: false, reason: 'El enlace trae usuario o contraseña: no se abre.' };
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  const trusted = TRUSTED.some((d) => host === d || host.endsWith('.' + d));
  return { ok: true, href: u.href, host, trusted };
}

module.exports = { checkLink, TRUSTED };
