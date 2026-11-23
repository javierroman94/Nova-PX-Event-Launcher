/* Interfaz del launcher — Publicidad y mods del evento. (parte de lo que antes era app.js; se carga en este orden desde index.html). */

/* ---------- PUBLICIDAD ---------- */
const adToday = () => new Date().toISOString().slice(0, 10);
const adActive = (a, where) => a.enabled !== false && (a.where === 'both' || a.where === where) && (!a.from || a.from <= adToday()) && (!a.to || a.to >= adToday()) && (a.image || a.text);
const adRot = {};
function paintAdSlot(slot, list, where) {
  const box = $(`ad-slot-${where}`);
  if (!box) return;
  const ads = list.filter((a) => adActive(a, where));
  clearInterval(adRot[where]);
  if (!ads.length) { box.hidden = true; box.replaceChildren(); return; }
  let i = Math.floor(Math.random() * ads.length);
  const show = () => {
    const a = ads[i % ads.length];
    box.replaceChildren();
    const card = el(a.url ? 'button' : 'div', 'ad-card-banner'); if (a.url) card.type = 'button';
    const u = a.image && imageUrl(a.image);
    if (u) { const im = el('img', 'adb-img'); im.alt = a.name; im.src = u; card.append(im); }
    const body = el('div', 'adb-body');
    body.append(el('span', 'adb-tag', 'Publicidad'), el('strong', '', a.name));
    if (a.text) body.append(el('span', 'muted', a.text));
    card.append(body);
    if (a.url) { card.append(el('span', 'adb-go', 'Visitar ↗')); card.addEventListener('click', () => { window.api.adsTrack(a.id, 'c').catch(() => {}); window.api.openLink(a.url).catch(() => {}); }); }
    box.append(card);
    box.hidden = false;
    window.api.adsTrack(a.id, 'v').catch(() => {});
    i++;
  };
  show();
  if (ads.length > 1) adRot[where] = setInterval(show, 25000);
}
async function renderAds() {
  try {
    const list = await window.api.getData('ads');
    const arr = Array.isArray(list) ? list : [];
    paintAdSlot(null, arr, 'home');
    paintAdSlot(null, arr, 'event');
  } catch { /* sin anuncios */ }
}

const AD_WHERE_LABELS = { both: 'Inicio y Evento', home: 'Solo Inicio', event: 'Solo Evento' };
function paintAds() {
  const box = $('ad-ads');
  if (!box) return;
  box.replaceChildren();
  const list = adm.ads || (adm.ads = []);
  const cnt = $('ad-ads-count'); if (cnt) cnt.textContent = `${list.length} ${list.length === 1 ? 'anuncio' : 'anuncios'}`;
  list.forEach((a, idx) => {
    const row = el('div', 'mod-card news-edit ad-edit');
    const media = el('div', 'ne-media');
    const showImg = () => { media.replaceChildren(); const u = a.image && imageUrl(a.image); if (u) { const im = el('img'); im.alt = ''; im.src = u; media.append(im); } else media.append(el('span', 'ne-ph', '🖼\nSin imagen')); };
    showImg();
    const pick = el('button', 'ne-pick', a.image ? 'Cambiar imagen' : '+ Imagen'); pick.type = 'button';
    pick.addEventListener('click', async () => { try { const r = await pickImageCropped(a.name || 'anuncio', 16 / 9); if (r) { a.image = r.path; pick.textContent = 'Cambiar imagen'; showImg(); } } catch (e) { $('ad-ads-status').textContent = cleanError(e); } });
    const left = el('div', 'ne-left'); left.append(media, pick);
    const f = el('div', 'ne-fields');
    const inp = (ph, key, max, type) => { const i = el('input'); i.type = type || 'text'; i.placeholder = ph; i.maxLength = max || 120; i.value = a[key] || ''; i.addEventListener('input', () => { a[key] = i.value; }); return i; };
    const where = el('select'); Object.entries(AD_WHERE_LABELS).forEach(([k, v]) => { const o = el('option', '', v); o.value = k; where.append(o); }); where.value = a.where || 'both'; where.addEventListener('change', () => { a.where = where.value; });
    const dates = el('div', 'ad-dates'); dates.append(el('label', 'muted', 'Desde'), inp('', 'from', 10, 'date'), el('label', 'muted', 'Hasta'), inp('', 'to', 10, 'date'));
    const on = el('label', 'ad-on'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = a.enabled !== false; cb.addEventListener('change', () => { a.enabled = cb.checked; }); on.append(cb, document.createTextNode(' Activo'));
    const stats = el('span', 'ad-chip ad-stat-chip', 'Sin datos'); stats.dataset.adId = a.id || '';
    const del = el('button', 'ghost danger', 'Quitar'); del.type = 'button';
    del.addEventListener('click', async () => { if (!await askConfirm(`¿Quitar el anuncio "${a.name || 'sin nombre'}"?`)) return; list.splice(idx, 1); paintAds(); });
    const foot = el('div', 'ad-foot'); foot.append(on, where, stats, del);
    f.append(inp('Anunciante (ej. Holi Hosting)', 'name', 60), inp('Enlace https://…', 'url', 300), inp('Texto corto (opcional)', 'text', 120), dates, foot);
    row.append(left, f);
    box.append(row);
  });
  if (!list.length) box.append(el('p', 'muted ne-empty', 'Todavía no hay anuncios. Pulsa «+ Anuncio» cuando tengas un anunciante.'));
  if (adm.adStats) fillAdStats();
}
window.paintAds = paintAds;
function fillAdStats() {
  document.querySelectorAll('.ad-stat-chip').forEach((c) => {
    const s = adm.adStats[c.dataset.adId];
    c.textContent = s ? `${s.v} vistas · ${s.c} clics · ${s.v ? Math.round((s.c / s.v) * 1000) / 10 : 0}%` : 'Sin datos aún (guarda y espera)';
  });
}
$('ad-ads-add').addEventListener('click', () => { (adm.ads || (adm.ads = [])).unshift({ id: '', name: '', where: 'both', from: '', to: '', enabled: true }); paintAds(); });
$('ad-ads-stats').addEventListener('click', async () => {
  const st = $('ad-ads-status');
  try { adm.adStats = await window.api.adminAdsStats(); fillAdStats(); st.textContent = 'Números actualizados.'; } catch (e) { st.textContent = cleanError(e); }
});
$('ad-ads-save').addEventListener('click', async () => {
  const st = $('ad-ads-status'); st.textContent = 'Guardando…';
  try {
    adm.ads = await window.api.adminSaveAds(adm.ads || []);
    paintAds(); st.textContent = 'Publicidad guardada. Los jugadores la ven en unos minutos.';
    if (window.refreshContent) window.refreshContent();
  } catch (e) { st.textContent = cleanError(e); }
});

async function renderNews() {
  const box = $('news-list');
  if (!box.children.length) box.replaceChildren(el('div', 'skeleton'), el('div', 'skeleton'));
  try {
    const news = await window.api.getData('news');
    box.replaceChildren();
    if (!news.length) box.append(el('p', 'muted', 'Todavía no hay novedades.'));
    news.forEach((n) => {
      const item = el('article', 'news-item news-card');
      const time = el('time', '', n.date);
      const src = imageUrl(n.image);
      if (src) { const im = el('img', 'news-img'); im.alt = ''; im.loading = 'lazy'; im.src = src; item.append(im); }
      item.append(el('h3', '', n.title), time, el('p', '', n.text));
      if (n.links && n.links.length) item.append(linkChips(n.links));
      box.append(item);
    });
  } catch {
    box.replaceChildren();
    box.append(el('p', 'muted', 'No se pudieron cargar las novedades. Revisa tu conexión.'));
  }
}

if (/Windows/i.test(navigator.userAgent)) document.documentElement.classList.add('win');

/* --- botón ✕ en todos los diálogos grandes (el contenido puede ser más alto que la ventana) --- */
document.querySelectorAll('dialog.event-modal').forEach((dlg) => {
  const x = el('button', 'modal-x', '✕');
  x.type = 'button';
  x.setAttribute('aria-label', 'Cerrar');
  x.addEventListener('click', () => dlg.close());
  dlg.prepend(x);
});

/* --- confirmación con la estética del launcher (reemplaza al confirm() de Windows) --- */
function askConfirm(message, okLabel, cancelLabel) {
  return new Promise((resolve) => {
    const dlg = el('dialog', 'event-modal confirm-modal');
    dlg.setAttribute('aria-label', 'Confirmar');
    const body = el('div', 'event-modal-body');
    const msg = el('p', 'confirm-msg', String(message));
    const actions = el('div', 'mp-actions');
    const no = el('button', '', cancelLabel || 'Cancelar'); no.type = 'button';
    const yes = el('button', 'primary', okLabel || 'Aceptar'); yes.type = 'button';
    actions.append(no, yes);
    body.append(msg, actions);
    dlg.append(body);
    let done = false;
    const finish = (v) => { if (done) return; done = true; resolve(v); try { dlg.close(); } catch {} dlg.remove(); };
    yes.addEventListener('click', () => finish(true));
    no.addEventListener('click', () => finish(false));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(false); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) finish(false); });
    document.body.append(dlg);
    dlg.showModal();
    yes.focus();
  });
}

const winnersOf = (ev) => (Array.isArray(ev.winners) ? ev.winners : ev.winner ? [ev.winner] : []).slice(0, 12);
let winViewers = [];
let winEnv = null;
// Fondo propio, "Comisionado por" (primero), y botones de tráiler / tweet / póster.
function paintEventExtras(ev) {
  const modal = $('event-modal');
  const bg = imageUrl(ev.background);
  modal.classList.toggle('has-bg', !!bg);
  modal.style.setProperty('--ev-bg', bg ? `url("${String(bg).replace(/"/g, '%22')}")` : 'none');
  const com = $('event-modal-commissioner');
  com.hidden = !ev.commissioner;
  com.replaceChildren();
  com.onclick = null;
  if (ev.commissioner) {
    const ic = window.brandIcon && ev.commissioner.url ? window.brandIcon({ name: '', url: ev.commissioner.url }) : null;
    const left = el('span', 'com-ico');
    if (ic) left.append(ic); else left.textContent = '🎬';
    const txt = el('span', 'com-text');
    txt.append(el('small', 'muted', 'Comisionado por'), el('b', '', ev.commissioner.name));
    com.append(left, txt);
    if (ev.commissioner.nick) com.append(head3d({ nick: ev.commissioner.nick }, 46));
    com.disabled = !ev.commissioner.url;
    if (ev.commissioner.url) com.onclick = () => window.api.openLink(ev.commissioner.url).catch(() => {});
  }
  const posts = $('event-modal-posts');
  posts.replaceChildren();
  if (ev.posts && ev.posts.length) posts.append(linkChips(ev.posts));
}

function paintWinners(ev) {
  const box = $('event-modal-winners');
  winViewers.forEach((v) => v.destroy());
  winViewers = [];
  box.replaceChildren();
  const list = winnersOf(ev);
  box.hidden = !list.length;
  if (!list.length) return;
  box.append(el('h4', 'winners-title', list.length === 1 ? '🏆 Ganador' : `🏆 Ganadores (${list.length})`));
  // Solo la cabeza de cada jugador, en una fila horizontal (si tiene skin subida por el admin, se usa esa).
  const extra = [...(ev.roster || []), ...(ev.collabs || [])];
  const row = el('div', 'winners-heads');
  list.forEach((nick) => {
    const known = extra.find((p) => p.nick.toLowerCase() === nick.toLowerCase());
    const card = el('div', 'winner-head');
    card.append(head3d({ nick, ...(known && known.skin ? { skin: known.skin, slim: known.slim } : {}) }, 44), el('div', 'nick', nick));
    row.append(card);
  });
  box.append(row);
}

// Participantes y colaboradores con nombre: tarjetas con skin, rol y enlaces.
function paintPeople(ev) {
  const box = $('event-modal-people');
  box.replaceChildren();
  // Si los participantes traen "rol" distinto (p. ej. cada nación), se separan en grupos con su propio título.
  const split = (list) => {
    const roles = [...new Set((list || []).map((p) => p.role || ''))];
    if (roles.length < 2 || roles.length > 12 || roles.includes('')) return [['', list]];
    return roles.map((r) => [r, list.filter((p) => (p.role || '') === r)]);
  };
  const groups = [['👥 Participantes', ev.roster], ['🤝 Colaboraron con Nova PX', ev.collabs]];
  let any = false;
  groups.forEach(([title, list]) => {
    if (!list || !list.length) return;
    any = true;
    box.append(el('h4', 'winners-title', `${title} (${list.length})`));
    const parts = title.startsWith('👥') ? split(list) : [['', list]];
    parts.forEach(([sub, items]) => {
      if (sub) box.append(el('h5', 'people-sub', `${sub} · ${items.length}`));
      const row = el('div', 'people-row compact' + (sub ? ' grouped' : ''));
      items.forEach((p) => {
        const c = el('div', 'person');
        c.append(head3d({ nick: p.nick, ...(p.skin ? { skin: p.skin, slim: p.slim } : {}) }, 44), el('div', 'nick', p.nick));
        if (p.role && !sub) c.append(el('div', 'role', p.role));
        if (p.links && p.links.length) c.append(linkChips(p.links));
        row.append(c);
      });
      box.append(row);
    });
  });
  box.hidden = !any;
}

async function renderEvents() {
  const list = $('events-list');
  list.replaceChildren();
  try {
    const nickMap = await window.api.getData('nicks').then((d) => (d && d.map) || null).catch(() => null);
    const events = window.NovaNicks.events(await window.api.getData('events'), nickMap).sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
    const modal = $('event-modal');
    const facts = (ev, withWinners) => {
      const box = el('div', 'facts');
      if (ev.participants) box.append(el('span', 'fact', `${ev.participants} participantes`));
      const w = withWinners ? winnersOf(ev) : [];
      if (w.length === 1) box.append(el('span', 'fact', `🏆 ${w[0]}`));
      else if (w.length > 1) box.append(el('span', 'fact', `🏆 ${w.length} ganadores`));
      return box;
    };
    const open = (ev) => {
      const src = imageUrl(ev.image);
      $('event-modal-media').hidden = !src;
      if (src) { $('event-modal-img').src = src; $('event-modal-media').style.setProperty('--ev-img', `url("${src.replace(/"/g, '%22')}")`); }
      $('event-modal-name').textContent = ev.name;
      $('event-modal-date').textContent = ev.date || '';
      $('event-modal-desc').textContent = ev.description || '';
      $('event-modal-facts').replaceChildren(...facts(ev, true).childNodes);
      paintEventExtras(ev);
      paintWinners(ev);
      paintPeople(ev);
      if (!modal.open) modal.showModal();
    };
    if (!modal.dataset.bound) {
      modal.dataset.bound = '1';
      $('event-modal-close').addEventListener('click', () => modal.close());
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });
      modal.addEventListener('close', () => { winViewers.forEach((v) => v.destroy()); winViewers = []; });
    }
    const yearOf = (ev) => (/^\d{4}/.test(ev.date || '') ? ev.date.slice(0, 4) : '');
    // Imagen que rellena su marco: la imagen entera encima y, detrás, la misma desenfocada (sin barras negras).
    const media = (ev, cls) => {
      const m = el('div', `ev-media ${cls || ''}`);
      const src = imageUrl(ev.image);
      if (src) {
        m.style.setProperty('--ev-img', `url("${src.replace(/"/g, '%22')}")`);
        const img = el('img', 'ev-img'); img.alt = ''; img.loading = 'lazy'; img.src = src;
        m.append(img);
      } else {
        m.classList.add('no-img');
        m.append(el('span', 'ev-initial', (ev.name || '?').trim().slice(0, 2).toUpperCase()));
      }
      return m;
    };
    const mkCard = (ev) => {
      const card = el('button', 'ev-card');
      card.type = 'button';
      card.dataset.tilt = '';
      const m = media(ev);
      const y = yearOf(ev);
      if (y) m.append(el('span', 'ev-year', y));
      const w = winnersOf(ev);
      if (w.length) m.append(el('span', 'ev-trophy', w.length === 1 ? `🏆 ${w[0]}` : `🏆 ${w.length}`));
      const body = el('div', 'ev-body');
      body.append(el('h3', '', ev.name));
      const meta = el('div', 'ev-meta');
      if (ev.date) meta.append(el('span', 'ev-date', ev.date));
      if (ev.participants) meta.append(el('span', 'ev-part', `👥 ${ev.participants}`));
      body.append(meta, el('span', 'ev-more', 'Ver detalles →'));
      card.append(m, body);
      card.addEventListener('click', () => open(ev));
      return card;
    };
    const cards = events.map((ev) => ({ ev, card: mkCard(ev) }));
    list.append(...cards.map((c) => c.card));

    // Resumen y evento más reciente
    const stats = $('events-stats');
    const totalPart = events.reduce((n, e) => n + (Number(e.participants) || 0), 0);
    const champs = new Set(events.flatMap((e) => winnersOf(e).map((n) => String(n).toLowerCase())));
    stats.replaceChildren();
    if (events.length) {
      [[events.length, 'eventos'], [totalPart, 'participaciones'], [champs.size, 'ganadores']].forEach(([n, l]) => {
        const t = el('div', 'ev-stat'); t.append(el('b', '', String(n)), el('span', 'muted', l)); stats.append(t);
      });
    }
    const heroBox = $('events-hero');
    heroBox.replaceChildren();
    const latest = events[0];
    if (latest) {
      const h = el('button', 'ev-hero'); h.type = 'button';
      const m = media(latest, 'ev-hero-media');
      const txt = el('div', 'ev-hero-txt');
      txt.append(el('span', 'ev-hero-kicker', 'Último evento'), el('h3', '', latest.name));
      const meta = el('div', 'ev-meta'); if (latest.date) meta.append(el('span', 'ev-date', latest.date)); if (latest.participants) meta.append(el('span', 'ev-part', `👥 ${latest.participants} participantes`)); const hw = winnersOf(latest); if (hw.length) meta.append(el('span', 'ev-part', `🏆 ${hw.slice(0, 3).join(', ')}`));
      txt.append(meta);
      if (latest.description) txt.append(el('p', 'ev-hero-desc', latest.description.length > 170 ? latest.description.slice(0, 167) + '…' : latest.description));
      txt.append(el('span', 'ev-hero-cta', 'Ver detalles →'));
      h.append(m, txt);
      h.addEventListener('click', () => open(latest));
      heroBox.append(h);
    }

    // Filtros: por año y por nombre
    const years = [...new Set(events.map(yearOf).filter(Boolean))].sort().reverse();
    let year = 'all';
    const yBox = $('events-years');
    yBox.replaceChildren();
    const chips = [];
    ['all', ...years].forEach((y) => {
      const c = el('button', 'ev-year-chip', y === 'all' ? 'Todos' : y); c.type = 'button';
      c.addEventListener('click', () => { year = y; chips.forEach((x) => x.b.classList.toggle('active', x.y === y)); filter(); });
      chips.push({ y, b: c }); yBox.append(c);
    });
    chips[0].b.classList.add('active');
    const count = $('events-count');
    const filter = () => {
      const q = $('events-search').value.trim().toLowerCase();
      let n = 0;
      cards.forEach(({ ev, card }) => {
        const show = (!q || ev.name.toLowerCase().includes(q)) && (year === 'all' || yearOf(ev) === year);
        card.hidden = !show;
        if (show) n++;
      });
      heroBox.hidden = !!q || year !== 'all';
      if (!heroBox.hidden && cards[0]) { cards[0].card.hidden = true; n--; }
      count.textContent = events.length ? `${n} de ${events.length} eventos` : '';
    };
    $('events-search').oninput = filter;
    filter();
    if (!events.length) list.append(el('p', 'muted', 'Aún no hay eventos en el historial.'));
  } catch {
    list.append(el('p', 'muted', 'No se pudo cargar el historial. Revisa tu conexión.'));
  }
}

/* ---------- mods del evento (nombres e iconos de Modrinth) ---------- */
let modsSeq = 0;
async function renderMods() {
  const seq = ++modsSeq;
  const list = $('mods-list');
  const note = $('mods-note');
  note.textContent = 'Cargando mods…';
  list.replaceChildren();
  try {
    const r = await window.api.modsList();
    if (seq !== modsSeq) return;
    if (r.hidden) {
      note.textContent = `${r.eventName} mantiene su lista de mods privada. Tienes ${r.count} mods instalados.`;
      return;
    }
    if (!r.count) {
      note.textContent = 'Todavía no hay mods instalados. Se descargan la primera vez que pulses Jugar.';
      return;
    }
    const cards = r.mods.map((m) => {
      const row = el(m.url ? 'button' : 'div', 'mod-card');
      if (m.url) {
        row.type = 'button';
        row.addEventListener('click', () => window.api.openLink(m.url));
      }
      if (m.icon) {
        const img = el('img', 'mod-icon');
        img.alt = '';
        img.loading = 'lazy';
        img.src = m.icon;
        row.append(img);
      } else {
        row.append(el('div', 'mod-icon mod-icon-empty', m.name.slice(0, 1).toUpperCase()));
      }
      const body = el('div', 'mod-body');
      body.append(el('strong', '', m.name));
      body.append(el('span', 'muted', m.summary || m.file));
      row.append(body);
      if (m.version) row.append(el('span', 'fact', m.version));
      return { m, row };
    });
    list.append(...cards.map((c) => c.row));
    const count = () => {
      const q = $('mods-search').value.trim().toLowerCase();
      let n = 0;
      cards.forEach(({ m, row }) => {
        const show = !q || m.name.toLowerCase().includes(q) || m.file.toLowerCase().includes(q);
        row.hidden = !show;
        if (show) n++;
      });
      note.textContent = `${n} de ${r.count} mods${r.offline ? ' · sin conexión: nombres e iconos pueden faltar' : ''}`;
    };
    $('mods-search').oninput = count;
    count();
  } catch (err) {
    note.textContent = cleanError(err);
  }
}
