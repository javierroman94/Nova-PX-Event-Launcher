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
  const LOADER_ORDER = ['nova', 'fabric', 'forge', 'optifine', 'vanilla'];
  let series = [];       // [{ key, latest, versions:[...] }]
  let picked = null;     // key de la serie elegida
  let loader = 'nova';
  let ready = false;

  const keyOf = (v) => {
    const m = /^(\d+)\.(\d+)/.exec(v);
    if (!m) return null;
    return +m[1] >= 26 ? m[1] : `${m[1]}.${m[2]}`;
  };
  const hue = (k) => { let n = 0; for (const c of k) n = (n * 31 + c.charCodeAt(0)) % 360; return n; };

  function buildSeries() {
    const map = new Map();
    (window.mcList || mcList || []).forEach((v) => {
      const k = keyOf(v);
      if (!k) return;
      if (!map.has(k)) map.set(k, { key: k, versions: [] });
      map.get(k).versions.push(v);
    });
    series = [...map.values()].map((s) => ({ ...s, latest: s.versions[0] }));
  }

  function paintBar() {
    const src = g('vr-src');
    src.replaceChildren();
    LOADER_ORDER.forEach((id) => { const o = el('option', '', LOADER_INFO[id].name); o.value = id; src.append(o); });
    src.value = loader;
  }

  function paintGrid() {
    const grid = g('vr-grid');
    grid.replaceChildren();
    const q = g('vr-q').value.trim().toLowerCase();
    let list = series.filter((s) => !q || s.key.includes(q) || s.versions.some((v) => v.includes(q)) || ((NAMES[s.key] || [''])[0] || '').toLowerCase().includes(q));
    const num = (k) => parseFloat(k);
    list = list.sort((a, b) => (g('vr-sort').value === 'old' ? num(a.key) - num(b.key) : num(b.key) - num(a.key)));
    if (!list.length) grid.append(el('p', 'muted', q ? `Ninguna versión coincide con "${g('vr-q').value}".` : 'No se pudo cargar la lista de versiones.'));
    list.forEach((s) => {
      const c = el('button', 'vr-card' + (picked === s.key ? ' on' : ''));
      c.type = 'button';
      const art = el('div', 'vr-card-art');
      art.style.setProperty('--h', String(hue(s.key)));
      art.append(el('span', 'vr-card-num', s.key), el('span', 'vr-card-name', (NAMES[s.key] || ['', ''])[0]));
      const foot = el('div', 'vr-card-foot');
      foot.append(el('b', '', `${LOADER_INFO[loader].name} ${s.key}`), el('span', 'vr-play-ico', '▶'));
      c.append(art, foot);
      c.addEventListener('click', () => { picked = s.key; paintGrid(); paintSide(); });
      c.addEventListener('dblclick', () => { picked = s.key; paintSide(); play(); });
      grid.append(c);
    });
  }

  function paintSide() {
    const s = series.find((x) => x.key === picked);
    const art = g('vr-art');
    art.replaceChildren();
    if (!s) { g('vr-title').textContent = 'Elige una versión'; g('vr-desc').textContent = 'Toca una tarjeta de la izquierda.'; g('vr-play').disabled = true; return; }
    g('vr-play').disabled = false;
    art.style.setProperty('--h', String(hue(s.key)));
    art.append(el('span', 'vr-card-num', s.key), el('span', 'vr-card-name', (NAMES[s.key] || ['', ''])[0]));
    g('vr-title').textContent = `Minecraft ${s.key}${NAMES[s.key] ? ' · ' + NAMES[s.key][0] : ''}`;
    g('vr-desc').textContent = (NAMES[s.key] || ['', 'Elige la versión exacta y el loader que quieras.'])[1];
    const sel = g('vr-ver');
    const keep = sel.value;
    sel.replaceChildren();
    s.versions.forEach((v) => { const o = el('option', '', v); o.value = v; sel.append(o); });
    sel.value = s.versions.includes(keep) ? keep : s.latest;
    paintLoaders();
  }

  function paintLoaders() {
    const ver = g('vr-ver').value;
    if (!loaderOk(loader, ver)) loader = 'forge';
    const box = g('vr-loaders');
    box.replaceChildren();
    LOADER_ORDER.forEach((id) => {
      const ok = loaderOk(id, ver);
      box.append(wizChip(LOADER_INFO[id].name, loader === id, () => { loader = id; g('vr-src').value = id; paintLoaders(); paintGrid(); }, !ok, ok ? '' : `No disponible en Minecraft ${ver}.`));
    });
    const java = javaFor(ver);
    g('vr-note').textContent = [LOADER_INFO[loader].desc, java ? `Usa Java ${java}; el launcher lo instala si hace falta.` : ''].filter(Boolean).join(' ');
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
      g('vr-status').textContent = series.length ? '' : 'No se pudo cargar la lista de versiones. Revisa tu conexión.';
      ready = series.length > 0;
      picked = picked || (series.find((s) => s.key === '1.21') || series[0] || {}).key || null;
      g('vr-ver').addEventListener('change', paintLoaders);
    }
    paintGrid();
    paintSide();
  };

  document.addEventListener('DOMContentLoaded', () => {
    g('vr-src').addEventListener('change', () => { loader = g('vr-src').value; paintGrid(); paintLoaders(); });
    g('vr-q').addEventListener('input', paintGrid);
    g('vr-sort').addEventListener('change', paintGrid);
    g('vr-new').addEventListener('click', () => { goTo('modpacks'); setTimeout(() => g('mp-new-profile').click(), 60); }); // los cuadros de crear viven en la página Modpacks
    g('vr-play').addEventListener('click', play);
  });
})();
