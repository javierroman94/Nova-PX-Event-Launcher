'use strict';
/*
 * Contador de uso (opcional): qué enviar al Worker de Cloudflare y cómo resumir lo que devuelve.
 * Solo se envía: id de instalación aleatorio, nick si inició sesión, si es premium, versión y sistema.
 */
const crypto = require('crypto');
const fs = require('fs');

function installId(file) {
  try {
    const id = fs.readFileSync(file, 'utf8').trim();
    if (/^[0-9a-f-]{36}$/.test(id)) return id;
  } catch {}
  const id = crypto.randomUUID();
  try { fs.writeFileSync(file, id); } catch {}
  return id;
}

function buildPing({ id, session, version, platform }) {
  const nick = session && /^[A-Za-z0-9_]{1,16}$/.test(session.name || '') ? session.name : '';
  return { id, nick, premium: !!(session && session.mode === 'premium' && nick), version: String(version || '0.0.0'), os: ['win32', 'darwin', 'linux'].includes(platform) ? platform : 'linux' };
}

function validUrl(u) {
  return /^https:\/\/[A-Za-z0-9.-]+(\/[^\s]*)?$/.test(String(u || '')) ? String(u).replace(/\/+$/, '') : '';
}

// Totales para el panel: usuarios, con sesión, premium y activos en 24 h / 7 días / 30 días.
function summarize(users, now = Date.now()) {
  const day = 86400000;
  const out = { total: users.length, named: 0, premium: 0, day: 0, week: 0, month: 0, versions: {} };
  for (const u of users) {
    if (u.nick) out.named++;
    if (u.premium) out.premium++;
    const age = now - u.last;
    if (age <= day) out.day++;
    if (age <= 7 * day) out.week++;
    if (age <= 30 * day) out.month++;
    out.versions[u.version] = (out.versions[u.version] || 0) + 1;
  }
  return out;
}

module.exports = { installId, buildPing, validUrl, summarize };
