'use strict';
// Revisa los datos publicados (data/*.json): que pasen por los mismos filtros que usa el administrador sin perder nada,
// que las imágenes que citan existan y que no haya nicks, fechas ni enlaces rotos.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const admin = require('../lib/admin.js');
const nicks = require('../lib/nicks.js');

const DATA = path.join(__dirname, '..', 'data');
const read = (n) => JSON.parse(fs.readFileSync(path.join(DATA, `${n}.json`), 'utf8'));
const problems = [];
const bad = (msg) => problems.push(msg);

const events = read('events'); const team = read('team'); const news = read('news'); const manifest = read('manifest');
const ads = read('ads'); const admins = read('admins'); const rec = read('recommended'); const nickMap = read('nicks');

// 1) Lo guardado ya está "limpio": volver a pasarlo por el filtro no debe cambiar nada.
const canon = (o) => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((x) => [x, v[x]])) : v));
const same = (label, a, b) => { if (canon(a) !== canon(b)) bad(`${label}: el filtro del administrador cambiaría el contenido guardado`); };
same('events.json', admin.sanitizeEvents(events), events);
same('team.json', admin.sanitizeTeam(team), team);
same('news.json', admin.sanitizeNews(news), news);
same('ads.json', admin.sanitizeAds(ads), ads);
same('admins.json', admin.sanitizeAdmins(admins), admins);
same('nicks.json', nicks.sanitizeMap(nickMap), nickMap);
same('plugins.json', require('../lib/plugin-library').sanitizeLibrary(read('plugins')), read('plugins'));

// 2) Imágenes citadas: deben existir dentro de data/ (y no escapar de la carpeta).
const imgs = [];
const addImg = (where, p) => { if (p) imgs.push([where, String(p)]); };
events.forEach((e) => { addImg(`evento «${e.name}»`, e.image); addImg(`evento «${e.name}» (fondo)`, e.background); });
team.forEach((m) => { addImg(`equipo ${m.nick}`, m.avatar); addImg(`equipo ${m.nick} (skin)`, m.skin); });
news.forEach((n) => addImg(`noticia «${n.title}»`, n.image));
ads.forEach((a) => addImg(`anuncio ${a.name || a.id || ''}`, a.image));
if (manifest.event) { addImg('manifest.event.image', manifest.event.image); addImg('manifest.event.logo', manifest.event.logo); }
(manifest.sponsors || []).forEach((s) => addImg(`patrocinador ${s.name}`, s.logo));
for (const [where, p] of imgs) {
  if (/^https:\/\//.test(p)) continue;
  const full = path.resolve(DATA, p);
  if (!full.startsWith(DATA + path.sep)) bad(`${where}: ruta fuera de data/ (${p})`);
  else if (!fs.existsSync(full)) bad(`${where}: no existe la imagen ${p}`);
}

// 3) Nicks, fechas y enlaces.
const NICK = /^[A-Za-z0-9_]{1,16}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const eventNames = new Set(); const undated = [];
events.forEach((e) => {
  if (!e.name) bad('evento sin nombre');
  if (eventNames.has(e.name)) bad(`evento repetido: ${e.name}`); eventNames.add(e.name);
  if (!e.date) undated.push(e.name);
  else if (!DATE.test(e.date) || Number.isNaN(Date.parse(e.date))) bad(`evento «${e.name}»: fecha inválida (${e.date})`);
  const w = Array.isArray(e.winners) ? e.winners : e.winner ? [e.winner] : [];
  w.forEach((n) => { if (!NICK.test(n)) bad(`evento «${e.name}»: ganador con nick inválido (${n})`); });
  (e.roster || []).concat(e.collabs || []).forEach((p) => { if (!NICK.test(p.nick || '')) bad(`evento «${e.name}»: nick inválido (${p.nick})`); });
  const seen = new Set();
  (e.roster || []).forEach((p) => { const k = p.nick.toLowerCase(); if (seen.has(k)) bad(`evento «${e.name}»: participante repetido (${p.nick})`); seen.add(k); });
  if (e.participants && e.roster && e.roster.length > e.participants) bad(`evento «${e.name}»: más participantes en la lista que el total`);
});
const teamNicks = new Set();
team.forEach((m) => {
  if (!NICK.test(m.nick || '')) bad(`equipo: nick inválido (${m.nick})`);
  const k = String(m.nick).toLowerCase(); if (teamNicks.has(k)) bad(`equipo: repetido (${m.nick})`); teamNicks.add(k);
});
news.forEach((n) => { if (!n.title) bad('noticia sin título'); if (!DATE.test(n.date || '')) bad(`noticia «${n.title}»: fecha inválida`); });
admins.forEach((a) => { if (!NICK.test(a.nick || '') || !/^[0-9a-f]{32}$/.test(a.uuid || '')) bad(`admins: entrada inválida (${a.nick})`); });
const urls = [];
const walk = (o) => { if (typeof o === 'string') { if (/^https?:\/\//.test(o)) urls.push(o); } else if (o && typeof o === 'object') Object.values(o).forEach(walk); };
[events, team, news, manifest, ads, rec, read('launcher')].forEach(walk);
urls.forEach((u) => { try { if (new URL(u).protocol !== 'https:') bad(`enlace sin https: ${u}`); } catch { bad(`enlace roto: ${u}`); } });
if (manifest.event && manifest.event.startsAt && Number.isNaN(Date.parse(manifest.event.startsAt))) bad('manifest.event.startsAt inválida');
if (!/^\d{4}$/.test(String(read('rev').rev)) && !/^[a-z0-9]{6,32}$/.test(read('rev').rev)) bad('rev.json inválido');

assert.strictEqual(problems.length, 0, '\n - ' + problems.join('\n - '));
if (undated.length) console.log(`  aviso: ${undated.length} evento(s) del historial sin fecha: ${undated.join(', ')}`);
console.log('data.test OK');
