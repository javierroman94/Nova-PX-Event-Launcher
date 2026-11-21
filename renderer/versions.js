'use strict';
/*
 * Página «Versiones»: una tarjeta por serie de Minecraft (26, 1.21, 1.20…). Eliges versión y loader a la derecha
 * y pulsas Jugar: si ya tienes un perfil así lo abre, y si no lo crea al momento.
 */
(function () {
  const NAMES = {
    '1.21': ['Tricky Trials', 'Cámaras de pruebas, el mazo y las brisas.'],
    '1.20': ['Trails & Tales', 'Arqueología, camellos, sniffers y el cerezo.'],
    '1.19': ['The Wild Update', 'Los pantanos de manglar, el Warden y los renacuajos.'],
    '1.18': ['Caves & Cliffs II', 'Mundos más altos y profundos, con cuevas gigantes.'],
    '1.17': ['Caves & Cliffs I', 'Amatista, cobre, ajolotes y cabras.'],
    '1.16': ['Nether Update', 'Nuevos biomas del Nether, piglins y netherita.'],
    '1.15': ['Buzzy Bees', 'Abejas, colmenas y miel.'],
    '1.14': ['Village & Pillage', 'Aldeas nuevas, saqueadores y la ballesta.'],
    '1.13': ['Update Aquatic', 'Delfines, tortugas y un océano renovado.'],
    '1.12': ['World of Color', 'Concreto, terracota esmaltada y loros.'],
    '1.11': ['Exploration Update', 'Mansiones, tótems de la inmortalidad y shulkers.'],
    '1.10': ['Frostburn Update', 'Osos polares y bloques de hueso.'],
    '1.9': ['Combat Update', 'Combate nuevo, élitros y el Final renovado.'],
    '1.8': ['Bountiful Update', 'La favorita para PvP y servidores clásicos.'],
    '1.7': ['The Update that Changed the World', 'Biomas nuevos y mundos muy variados.'],
    '26': ['Game Drops', 'Las actualizaciones de la serie 26 llegan varias veces al año.']
  };
  const g = (id) => document.getElementById(id);
  const LOADER_ORDER = ['nova', 'fabric', 'quilt', 'forge', 'neoforge', 'optifine', 'vanilla'];
  let series = [];       // [{ key, latest, versions:[...] }]
  let picked = null;     // key de la serie elegida
  let loader = 'nova';
  let ready = false;
  let art = {};          // versión -> { image, title } con las imágenes oficiales de Mojang
  let meta = { versions: {}, forge: [], optifine: [], quilt: [] }; // tipo/fecha de cada versión y qué versiones tienen Forge y OptiFine
  let installed = [];    // perfiles que ya tiene el jugador
  let testVer = null;    // versión de prueba elegida (snapshot, pre-release…); null = una versión estable
  let showTests = false;
  try { showTests = localStorage.getItem('vr-tests') === '1'; } catch {}

  const keyOf = (v) => {
    const m = /^(\d+)\.(\d+)/.exec(v);
    if (!m) return null;
    return +m[1] >= 26 ? m[1] : `${m[1]}.${m[2]}`;
  };
  // Imagen de la serie: la versión .0 (1.21) y, si no, la primera que tenga.
  const seriesArt = (s) => art[s.key] || art[s.versions.slice().reverse().find((v) => art[v])] || fallbackArt(s.key);
  function putArt(box, a) {
    if (!a) return;
    const im = document.createElement('img');
    im.className = 'vr-art-img'; im.alt = ''; im.loading = 'lazy'; im.src = a.image;
    im.addEventListener('error', () => im.remove());
    box.prepend(im);
    box.classList.add('has-img');
  }
  // Paisaje propio (cielo, sol, colinas y bloques) cuando Mojang no publica imagen de esa versión.
  function fallbackArt(k) {
    const h = hue(k), h2 = (h + 40) % 360;
    let n = h + 7;
    const rnd = () => { n = (n * 9301 + 49297) % 233280; return n / 233280; };
    let blocks = '';
    for (let i = 0; i < 9; i++) { const w = 18 + Math.floor(rnd() * 3) * 6, x = Math.floor(rnd() * 8) * 14, y = 150 + Math.floor(rnd() * 5) * 12; blocks += `<rect x="${x}" y="${y}" width="${w}" height="${w}" fill="hsl(${h2},45%,${22 + Math.floor(rnd() * 14)}%)"/>`; }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 200" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${h},70%,62%)"/><stop offset="1" stop-color="hsl(${h2},60%,28%)"/></linearGradient></defs><rect width="120" height="200" fill="url(#s)"/><circle cx="${30 + Math.floor(rnd() * 60)}" cy="38" r="12" fill="#fff6" /><path d="M0 130 L30 108 L56 126 L86 100 L120 124 L120 200 L0 200Z" fill="hsl(${h2},40%,20%)"/>${blocks}</svg>`;
    return { image: 'data:image/svg+xml;utf8,' + encodeURIComponent(svg) };
  }
  const hue = (k) => { let n = 0; for (const c of k) n = (n * 31 + c.charCodeAt(0)) % 360; return n; };


  // ¿Esta versión sirve con este loader? Solo mostramos lo que de verdad funciona.
  function okFor(ld, v) {
    if (ld === 'vanilla') return true;
    if (ld === 'nova') return NOVA_CLIENT_MC.includes(v);
    if (ld === 'fabric') return verAtLeast(v, [1, 14, 0]);
    if (ld === 'quilt') return verAtLeast(v, [1, 14, 0]) && (meta.quilt && meta.quilt.length ? meta.quilt.includes(v) : true);
    if (ld === 'neoforge') return verAtLeast(v, [1, 20, 2]);
    if (ld === 'forge') return meta.forge.length ? meta.forge.includes(v) : true;
    if (ld === 'optifine') return meta.optifine.length ? meta.optifine.includes(v) : true;
    return true;
  }
  const isRelease = (v) => !meta.versions[v] || meta.versions[v].type === 'release';
  const fmtDate = (v) => { const t = meta.versions[v] && meta.versions[v].time; if (!t) return '—'; try { return new Date(t).toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return '—'; } };
  const testKind = (v) => (/-rc\d+$/i.test(v) ? 'RC' : /-pre\d*$/i.test(v) ? 'Pre-release' : 'Snapshot');
  const LOADER_NOTE = {
    nova: 'Sodium, Lithium, Iris y el Nova Client con menú y HUD (Shift derecho).',
    fabric: 'Cargador ligero para mods modernos.',
    quilt: 'Basado en Fabric: usa sus mods y los de Quilt.',
    neoforge: 'El Forge moderno para mods nuevos.',
    forge: 'El clásico, el más compatible con modpacks.',
    optifine: 'OptiFine solo: el launcher lo baja de optifine.net y lo instala.',
    vanilla: 'Minecraft puro, sin mods.'
  };

  function buildSeries() {
    const map = new Map();
    (window.mcList || mcList || []).filter(isRelease).forEach((v) => {
      const k = keyOf(v);
      if (!k) return;
      if (!map.has(k)) map.set(k, { key: k, versions: [] });
      map.get(k).versions.push(v);
    });
    series = [...map.values()].map((s) => ({ ...s, latest: s.versions[0] }));
  }
  // Series que tienen al menos una versión compatible con el loader elegido (con sus versiones compatibles).
  const visibleSeries = () => series.map((s) => { const vs = s.versions.filter((v) => okFor(loader, v)); return vs.length ? { ...s, versions: vs, latest: vs[0] } : null; }).filter(Boolean);

  function paintBar() {
    const src = g('vr-src');
    src.replaceChildren();
    LOADER_ORDER.forEach((id) => { const o = el('option', '', LOADER_INFO[id].name); o.value = id; src.append(o); });
    src.value = loader;
  }

  const num = (k) => { const [a, b] = k.split('.').map(Number); return a * 1000 + (b || 0); };

  function paintGrid() {
    const grid = g('vr-grid');
    grid.replaceChildren();
    const q = g('vr-q').value.trim().toLowerCase();
    let list = visibleSeries().filter((s) => !q || s.key.includes(q) || s.versions.some((v) => v.includes(q)) || ((NAMES[s.key] || [''])[0] || '').toLowerCase().includes(q));
    list = list.sort((a, b) => (g('vr-sort').value === 'old' ? num(a.key) - num(b.key) : num(b.key) - num(a.key)));
    g('vr-count').textContent = list.length ? `${list.length} series · ${list.reduce((n, s) => n + s.versions.length, 0)} versiones` : '';
    if (!list.length) grid.append(el('p', 'muted', q ? `Ninguna versión coincide con "${g('vr-q').value}".` : 'No se pudo cargar la lista de versiones.'));
    list.forEach((s) => {
      const c = el('button', 'vr-card' + (!testVer && picked === s.key ? ' on' : ''));
      c.type = 'button';
      const a = el('div', 'vr-card-art');
      a.style.setProperty('--h', String(hue(s.key)));
      putArt(a, seriesArt(s));
      a.append(el('span', 'vr-card-num', s.key), el('span', 'vr-card-name', (NAMES[s.key] || ['', ''])[0]));
      const foot = el('div', 'vr-card-foot');
      foot.append(el('b', '', `${LOADER_INFO[loader].name} ${s.key}`), el('span', 'vr-card-n', s.versions.length > 1 ? `${s.versions.length} vers.` : s.versions[0]), el('span', 'vr-play-ico', '▶'));
      c.append(a, foot);
      c.addEventListener('click', () => { testVer = null; picked = s.key; paintGrid(); paintSide(); });
      c.addEventListener('dblclick', () => { testVer = null; picked = s.key; paintSide(); play(); });
      grid.append(c);
    });
    paintTests();
  }

  // Sección aparte (solo en Vanilla) con snapshots, pre-releases y release candidates.
  function paintTests() {
    const box = g('vr-tests-box');
    box.replaceChildren();
    const on = loader === 'vanilla' && showTests;
    box.hidden = !on;
    if (!on) return;
    const q = g('vr-q').value.trim().toLowerCase();
    const all = Object.entries(meta.versions).filter(([id, m]) => m.type === 'snapshot' && (!q || id.toLowerCase().includes(q)));
    all.sort((a, b) => (g('vr-sort').value === 'old' ? 1 : -1) * (new Date(b[1].time) - new Date(a[1].time)));
    box.append(el('h3', 'vr-tests-title', 'Versiones de prueba'), el('p', 'muted vr-tests-sub', 'Snapshots, pre-releases y release candidates: pueden fallar o dañar tus mundos. Haz una copia antes de abrir uno.'));
    if (!all.length) { box.append(el('p', 'muted', q ? 'Ninguna versión de prueba coincide.' : 'No hay datos de versiones de prueba (sin conexión).')); return; }
    const groups = new Map();
    all.forEach(([id, m]) => { const y = String(new Date(m.time).getFullYear()); if (!groups.has(y)) groups.set(y, []); groups.get(y).push(id); });
    groups.forEach((ids, year) => {
      const det = el('details', 'vr-tests-group');
      if ([...groups.keys()][0] === year || q) det.open = true;
      det.append(el('summary', '', `${year} · ${ids.length}`));
      const row = el('div', 'vr-tests-row');
      ids.forEach((id) => {
        const b = el('button', 'vr-test-chip' + (testVer === id ? ' on' : ''));
        b.type = 'button';
        b.append(el('b', '', id), el('small', '', testKind(id)));
        b.addEventListener('click', () => { testVer = id; paintTests(); document.querySelectorAll('.vr-card.on').forEach((n) => n.classList.remove('on')); paintSide(); });
        row.append(b);
      });
      det.append(row);
      box.append(det);
    });
  }

  const profileFor = (ver, ld) => installed.find((p) => p.provider === 'custom' && p.mcVersion === ver && (p.preset || '') === (ld === 'nova' || ld === 'optifine' ? ld : '') && p.loader === (ld === 'nova' ? 'fabric' : ld === 'optifine' ? 'vanilla' : ld));

  function stat(label, value) { const d = el('div', 'vr-stat'); d.append(el('small', '', label), el('b', '', value)); return d; }
  function badge(text, cls) { return el('span', 'vr-badge' + (cls ? ' ' + cls : ''), text); }

  function paintSide() {
    const artBox = g('vr-art');
    artBox.replaceChildren();
    artBox.classList.remove('has-img');
    const s = series.find((x) => x.key === picked);
    const body = g('vr-body');
    if (!s && !testVer) { g('vr-title').textContent = 'Elige una versión'; g('vr-desc').textContent = 'Toca una tarjeta de la izquierda.'; g('vr-play').disabled = true; body.hidden = true; return; }
    body.hidden = false;
    g('vr-play').disabled = false;
    const sel = g('vr-ver');
    const keep = sel.value;
    sel.replaceChildren();
    let keyForArt, name, desc;
    if (testVer) {
      const k = keyOf(testVer) || '';
      keyForArt = k || testVer;
      const o = el('option', '', testVer); o.value = testVer; sel.append(o); sel.value = testVer; sel.disabled = true;
      name = `Minecraft ${testVer}`; desc = `${testKind(testVer)} de prueba. Puede tener errores y cambiar entre versiones; no uses tus mundos importantes.`;
      const a = (k && series.find((x) => x.key === k) && seriesArt(series.find((x) => x.key === k))) || fallbackArt(keyForArt);
      artBox.style.setProperty('--h', String(hue(keyForArt)));
      putArt(artBox, a);
      artBox.append(el('span', 'vr-card-num vr-num-sm', testVer), el('span', 'vr-card-name', testKind(testVer)));
    } else {
      sel.disabled = false;
      const vs = s.versions.filter((v) => okFor(loader, v));
      (vs.length ? vs : s.versions).forEach((v) => { const o = el('option', '', v); o.value = v; sel.append(o); });
      sel.value = vs.includes(keep) ? keep : (vs[0] || s.latest);
      keyForArt = s.key;
      name = `Minecraft ${s.key}${NAMES[s.key] ? ' · ' + NAMES[s.key][0] : ''}`;
      desc = (NAMES[s.key] || ['', 'Elige la versión exacta y el loader que quieras.'])[1];
      artBox.style.setProperty('--h', String(hue(s.key)));
      putArt(artBox, art[sel.value] || seriesArt(s));
      artBox.append(el('span', 'vr-card-num', s.key), el('span', 'vr-card-name', (NAMES[s.key] || ['', ''])[0]));
    }
    g('vr-title').textContent = name;
    g('vr-desc').textContent = desc;
    paintDetails();
  }

  // Todo lo que depende de la versión exacta y del loader: datos, loaders compatibles y el botón.
  function paintDetails() {
    const ver = g('vr-ver').value;
    if (!ver) return;
    if (!okFor(loader, ver) && !testVer) { const first = LOADER_ORDER.find((id) => okFor(id, ver)); if (first) { loader = first; g('vr-src').value = first; } }
    const badges = g('vr-badges');
    badges.replaceChildren();
    badges.append(badge(testVer ? testKind(ver) : 'Estable', testVer ? 'warn' : 'ok'));
    const java = javaFor(ver);
    if (java) badges.append(badge(`Java ${java}`));
    if (okFor('nova', ver) && !testVer) badges.append(badge('Nova Client', 'nova'));
    const stats = g('vr-stats');
    stats.replaceChildren();
    const have = profileFor(ver, loader);
    stats.append(stat('Lanzamiento', fmtDate(ver)), stat('Java', java ? `Java ${java}` : '—'), stat('Loader', LOADER_INFO[loader].name), stat('Tu perfil', have ? 'Ya creado' : 'Se crea al jugar'));
    const box = g('vr-loaders');
    box.replaceChildren();
    LOADER_ORDER.forEach((id) => {
      const ok = testVer ? id === 'vanilla' : okFor(id, ver);
      const b = el('button', 'vr-loader' + (loader === id ? ' on' : '') + (ok ? '' : ' off'));
      b.type = 'button'; b.disabled = !ok;
      const top = el('span', 'vr-loader-top');
      top.append(el('span', 'vr-loader-ico', LOADER_INFO[id].icon), el('b', '', LOADER_INFO[id].name));
      if (LOADER_INFO[id].tag && ok) top.append(el('em', '', LOADER_INFO[id].tag));
      b.append(top, el('small', '', ok ? LOADER_NOTE[id] : `No disponible en ${ver}.`));
      b.addEventListener('click', () => { loader = id; g('vr-src').value = id; paintGrid(); paintDetails(); });
      box.append(b);
    });
    g('vr-note').textContent = java ? `Usa Java ${java}; el launcher lo instala si hace falta.` : '';
    g('vr-play').textContent = have ? '▶ Jugar' : (loader === 'vanilla' ? '▶ Crear y jugar' : '▶ Instalar y jugar');
  }

  async function play() {
    const ver = g('vr-ver').value;
    if (!ver) return;
    if (!loggedIn) { goTo('account'); showMsg('Inicia sesión como premium o no premium para jugar.', true); return; }
    const btn = g('vr-play');
    btn.disabled = true;
    try {
      const wantType = loader === 'nova' ? 'fabric' : loader === 'optifine' ? 'forge' : loader;
      let list = [];
      try { list = await window.api.modpackInstalled(); } catch {}
      let entry = list.find((p) => p.provider === 'custom' && p.mcVersion === ver && (p.preset || '') === (loader === 'nova' || loader === 'optifine' ? loader : '') && p.loader && p.loader.type === wantType);
      if (!entry) {
        g('vr-status').textContent = loader === 'nova' ? 'Creando tu perfil e instalando los mods de rendimiento… puede tardar un poco.' : 'Creando tu perfil…';
        entry = await window.api.modpackCreate({ name: `${LOADER_INFO[loader].name} ${ver}`, icon: '', mcVersion: ver, loader });
        try { await loadInstalled(); } catch {}
        toast(`Perfil "${entry.title}" creado.`);
        if (entry.preset === 'optifine') toast('Ahora descarga OptiFine en optifine.net y añade el .jar en Mods.');
      }
      g('vr-status').textContent = '';
      try { installed = await window.api.modpackInstalled(); } catch {}
      await playPack(entry.id);
    } catch (e) {
      g('vr-status').textContent = cleanError(e);
    }
    btn.disabled = false;
  }

  window.versionsShow = async function () {
    if (!ready) {
      paintBar();
      g('vr-status').textContent = 'Cargando versiones…';
      try { await loadMcVersions(); } catch {}
      buildSeries();
      try { art = (await window.api.mojangVersionArt()) || {}; } catch { art = {}; }
      try { meta = (await window.api.mcVersionMeta()) || meta; } catch {}
      g('vr-status').textContent = series.length ? '' : 'No se pudo cargar la lista de versiones. Revisa tu conexión.';
      ready = series.length > 0;
      picked = picked || (series.find((s) => s.key === '1.21') || series[0] || {}).key || null;
      g('vr-ver').addEventListener('change', () => { const s = series.find((x) => x.key === picked); if (s && !testVer) { artSwap(s); } paintDetails(); });
    }
    try { installed = await window.api.modpackInstalled(); } catch {}
    paintGrid();
    paintSide();
  };

  function artSwap(s) { const box = g('vr-art'); box.replaceChildren(); box.classList.remove('has-img'); putArt(box, art[g('vr-ver').value] || seriesArt(s)); box.append(el('span', 'vr-card-num', s.key), el('span', 'vr-card-name', (NAMES[s.key] || ['', ''])[0])); }

  document.addEventListener('DOMContentLoaded', () => {
    g('vr-tests').checked = showTests;
    g('vr-src').addEventListener('change', () => { loader = g('vr-src').value; testVer = loader === 'vanilla' ? testVer : null; const vs = visibleSeries(); if (!testVer && !vs.some((s) => s.key === picked)) picked = (vs.find((s) => s.key === '1.21') || vs[0] || {}).key || null; paintBar(); paintGrid(); paintSide(); });
    g('vr-tests').addEventListener('change', () => { showTests = g('vr-tests').checked; try { localStorage.setItem('vr-tests', showTests ? '1' : '0'); } catch {} if (!showTests) testVer = null; paintGrid(); paintSide(); });
    g('vr-q').addEventListener('input', paintGrid);
    g('vr-sort').addEventListener('change', paintGrid);
    g('vr-new').addEventListener('click', () => { goTo('modpacks'); setTimeout(() => g('mp-new-profile').click(), 60); }); // los cuadros de crear viven en la página Modpacks
    g('vr-play').addEventListener('click', play);
  });
})();
