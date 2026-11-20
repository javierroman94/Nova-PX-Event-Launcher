/* Servidores de prueba (solo administradores). Usa $, el, toast, cleanError y askConfirm de app.js solo cuando se llama. */
(function () {
  const g = (id) => document.getElementById(id);
  let current = null; // id del servidor abierto
  let servers = [];
  let types = [];
  const KEEP_LINES = 400;

  // [clave, etiqueta, tipo, valor por defecto, ayuda]
  const GROUPS = [
    ['🏷️ General', [
      ['motd', 'Mensaje del servidor', 'text', 'Servidor de pruebas Nova PX', 'Lo que ven los jugadores en la lista de servidores.'],
      ['server-port', 'Puerto', 'number', '25565', 'Para entrar usa localhost y este puerto.'],
      ['max-players', 'Jugadores máximos', 'number', '10', '']
    ]],
    ['🎮 Reglas del juego', [
      ['gamemode', 'Modo de juego', ['survival', 'creative', 'adventure', 'spectator'], 'survival', ''],
      ['difficulty', 'Dificultad', ['peaceful', 'easy', 'normal', 'hard'], 'easy', ''],
      ['pvp', 'PvP', 'bool', 'true', 'Que los jugadores se puedan golpear entre sí.'],
      ['allow-flight', 'Permitir volar', 'bool', 'false', 'Evita que te expulsen por volar con mods o plugins.']
    ]],
    ['🔐 Acceso', [
      ['online-mode', 'Solo cuentas premium', 'bool', 'true', 'Apágalo para que entren cuentas no premium.'],
      ['white-list', 'Lista blanca', 'bool', 'false', 'Solo entran los jugadores que agregues con /whitelist.']
    ]],
    ['🌍 Mundo', [
      ['level-name', 'Nombre del mundo', 'text', 'world', 'Carpeta donde se guarda el mundo.'],
      ['level-seed', 'Semilla', 'text', '', 'Vacío = mundo aleatorio.'],
      ['spawn-protection', 'Protección del spawn', 'number', '16', 'Radio en bloques donde solo los operadores construyen.'],
      ['view-distance', 'Distancia de visión', 'number', '10', 'Más alta se ve más lejos pero pide más memoria.']
    ]]
  ];

  // Tus servidores de prueba, también en la Biblioteca para que se vean donde creas perfiles.
  async function paintLibrary() {
    const box = g('mp-servers');
    if (!box) return;
    let list = [];
    try { if (await window.api.srvAllowed()) list = await window.api.srvList(); } catch {}
    box.textContent = '';
    box.hidden = !list.length;
    if (!list.length) return;
    box.append(el('h3', 'mp-heading', 'Mis servidores de prueba'));
    const row = el('div', 'mp-srv-row');
    list.forEach((s) => {
      const c = el('button', 'mp-srv'); c.type = 'button';
      c.append(el('span', 'mp-srv-ic', '🖥️'), el('b', '', s.name), el('small', 'muted', `${(s.type || '').toUpperCase()} · Minecraft ${s.mc}`));
      c.addEventListener('click', () => { current = s.id; goTo('servers'); });
      row.append(c);
    });
    box.append(row);
  }
  window.serversPaintLibrary = paintLibrary;

  async function refreshNav() {
    let ok = false;
    try { ok = !!(await window.api.srvAllowed()); } catch {}
    g('nav-servers').hidden = !ok; // también se entra desde «Nuevo perfil» y desde la Biblioteca
    const c = g('np-server'); if (c) c.hidden = !ok;
    paintLibrary();
  }
  window.serversRefreshNav = refreshNav;
  window.addEventListener('load', () => setTimeout(refreshNav, 2000));

  const meta = () => servers.find((s) => s.id === current);

  async function loadList(keep) {
    servers = await window.api.srvList();
    setTimeout(paintLibrary, 0);
    const pick = g('sv-pick');
    pick.textContent = '';
    servers.forEach((s) => { const o = document.createElement('option'); o.value = s.id; o.textContent = `${s.name} · ${(s.type || '').toUpperCase()} ${s.mc}`; pick.append(o); });
    if (keep && servers.some((s) => s.id === keep)) current = keep;
    else current = servers[0] ? servers[0].id : null;
    if (current) pick.value = current;
    g('sv-empty').hidden = !!servers.length;
    g('sv-pick').hidden = !servers.length;
    g('sv-main').hidden = !current;
    if (current) await paint();
  }

  function setState(running) {
    g('sv-state').textContent = running ? 'Encendido' : 'Apagado';
    g('sv-start').disabled = running;
    g('sv-stop').disabled = !running;
    g('sv-delete').disabled = running;
    g('sv-export').disabled = running;
  }

  function appendLine(line) {
    const log = g('sv-log');
    const stick = log.scrollTop + log.clientHeight >= log.scrollHeight - 30;
    log.append(document.createTextNode(line + '\n'));
    while (log.childNodes.length > KEEP_LINES) log.removeChild(log.firstChild);
    if (stick) log.scrollTop = log.scrollHeight;
  }

  async function paint() {
    const s = meta();
    if (!s) return;
    g('sv-title').textContent = s.name;
    g('sv-meta').textContent = `${(s.type || '').toUpperCase()} · Minecraft ${s.mc}${s.build ? ' · compilación ' + s.build : ''} · ${s.ramGb} GB de memoria · se conecta a localhost:${'25565'}`;
    const st = await window.api.srvLog(s.id);
    setState(st.running);
    g('sv-log').textContent = st.lines.join('\n') + (st.lines.length ? '\n' : '');
    g('sv-log').scrollTop = g('sv-log').scrollHeight;
    const kinds = (types.find((t) => t.id === s.type) || { content: [] }).content;
    const sel = g('sv-kind');
    sel.textContent = '';
    kinds.forEach((k) => { const o = document.createElement('option'); o.value = k.id; o.textContent = k.label; sel.append(o); });
    const tabBtn = g('sv-tabs').querySelector('[data-svt="content"]');
    if (tabBtn) tabBtn.textContent = kinds.map((k) => k.label).join(' y ').replace(/^(.*) y (.*) y (.*)$/, '$1, $2 y $3');
    g('sv-results').textContent = '';
    g('sv-q').value = '';
    paintProps();
    paintInstalled();
    paintNova();
  }

  async function paintProps() {
    const box = g('sv-props');
    box.textContent = '';
    let props = {};
    try { props = await window.api.srvPropsGet(current); } catch (e) { toast(cleanError(e)); return; }
    g('sv-meta').textContent = g('sv-meta').textContent.replace(/localhost:\d+/, `localhost:${props['server-port'] || 25565}`);
    GROUPS.forEach(([title, items]) => {
      const card = el('section', 'sv-pgroup');
      card.append(el('h4', '', title));
      const grid = el('div', 'sv-pgrid');
      items.forEach(([key, label, kind, def, help]) => {
        const row = el('label', 'sv-prop' + (kind === 'bool' ? ' sv-prop-bool' : ''));
        const top = el('span', 'sv-prop-name', label);
        let input;
        const val = props[key] !== undefined && props[key] !== '' ? props[key] : def;
        if (Array.isArray(kind)) { input = document.createElement('select'); kind.forEach((v) => { const o = document.createElement('option'); o.value = v; o.textContent = v; input.append(o); }); input.value = val; }
        else if (kind === 'bool') {
          input = document.createElement('input'); input.type = 'checkbox'; input.className = 'sv-switch';
          input.checked = String(val) === 'true';
          input.addEventListener('change', () => { input.dataset.val = input.checked ? 'true' : 'false'; });
          input.dataset.val = input.checked ? 'true' : 'false';
          input.dataset.bool = '1';
        } else { input = document.createElement('input'); input.type = kind === 'number' ? 'number' : 'text'; input.value = val; if (key === 'level-seed') input.placeholder = 'aleatoria'; }
        input.dataset.prop = key;
        if (kind === 'bool') { row.append(top, input); } else row.append(top, input);
        if (help) row.append(el('small', 'muted', help));
        grid.append(row);
      });
      card.append(grid);
      box.append(card);
    });
  }

  async function paintInstalled() {
    const box = g('sv-installed');
    box.textContent = '';
    let items = [];
    try { items = await window.api.srvContentList(current); } catch { return; }
    if (!items.length) box.append(el('p', 'muted', 'Todavía no instalaste nada.'));
    items.forEach((it) => {
      const row = el('div', 'sv-item');
      row.append(el('span', '', `${it.file} · ${it.kind}`));
      const rm = el('button', '', 'Quitar'); rm.type = 'button';
      rm.addEventListener('click', async () => {
        try { await window.api.srvContentRemove(current, it.kind, it.file); toast('Quitado.'); paintInstalled(); } catch (e) { toast(cleanError(e)); }
      });
      row.append(rm);
      box.append(row);
    });
  }

  // Plugins propios de Nova PX (solo en Paper, Purpur y Spigot). Los bloqueados piden la contraseña de la biblioteca.
  async function paintNova() {
    const s = meta();
    const box = g('sv-nova');
    const wrap = g('sv-nova-box');
    box.textContent = '';
    wrap.hidden = !s || !['paper', 'purpur', 'spigot'].includes(s.type);
    if (wrap.hidden) return;
    let lib;
    try { lib = await window.api.srvPluginsList(); } catch { wrap.hidden = true; return; }
    if (!lib.plugins.length) { wrap.hidden = true; return; }
    lib.plugins.forEach((p) => {
      const row = el('div', 'sv-card');
      const src = p.image && typeof imageUrl === 'function' ? imageUrl(p.image) : '';
      if (src) { const im = el('img'); im.alt = ''; im.src = src; row.append(im); } else row.append(el('div', 'sv-noimg', p.locked ? '🔒' : '🧩'));
      const info = el('div', 'sv-grow');
      info.append(el('b', '', `${p.locked ? '🔒 ' : ''}${p.name}`));
      if (p.creator && p.creator.name) {
        const by = el('div', 'muted', 'Por ');
        if (p.creator.url) { const a = el('a', '', p.creator.name); a.addEventListener('click', () => window.api.openLink(p.creator.url).catch(() => {})); by.append(a); } else by.append(document.createTextNode(p.creator.name));
        info.append(by);
      }
      if (p.description) info.append(el('p', '', p.description));
      if (p.info) info.append(el('p', 'muted', p.info));
      if (p.locked) info.append(el('p', 'muted', 'Bloqueado: puedes verlo, pero para instalarlo necesitas la clave que te dé un administrador.'));
      if (p.links && p.links.length) {
        const ls = el('div', 'sv-links');
        p.links.forEach((l) => { const a = el('a', '', l.label); a.addEventListener('click', () => window.api.openLink(l.url).catch(() => {})); ls.append(a); });
        info.append(ls);
      }
      row.append(info);
      const add = el('button', 'primary', p.locked ? 'Desbloquear e instalar' : 'Instalar'); add.type = 'button';
      add.addEventListener('click', async () => {
        add.disabled = true;
        const run = (pw) => window.api.srvPluginInstall(current, p.id, pw);
        try {
          let r;
          try { r = await run(''); } catch (e) {
            const m = cleanError(e);
            if (m !== 'LOCKED' && m !== 'BAD_KEY') throw e;
            const pw = await window.askPassword(m === 'BAD_KEY' ? 'Clave incorrecta. Inténtalo otra vez.' : 'Este plugin está bloqueado. Escribe la clave de la biblioteca (te la da un administrador).');
            if (!pw) { add.disabled = false; return; }
            r = await run(pw);
          }
          toast(`Instalado: ${r.file}`);
          paintInstalled();
        } catch (e) { const m = cleanError(e); toast(m === 'BAD_KEY' ? 'Esa clave no es la correcta.' : m); }
        add.disabled = false;
      });
      row.append(add);
      box.append(row);
    });
  }

  /* ---------- crear ---------- */
  // Descripción corta de cada tipo para elegir sin adivinar.
  const TYPE_INFO = {
    vanilla: ['🟩', 'El servidor oficial de Mojang, sin cambios.', 'Datapacks'],
    paper: ['📄', 'Rápido y estable. El más usado para plugins.', 'Plugins'],
    purpur: ['🟣', 'Basado en Paper con muchos ajustes extra.', 'Plugins'],
    spigot: ['🔌', 'El clásico de plugins. Se compila al crearlo.', 'Plugins'],
    fabric: ['🧵', 'Ligero y moderno, para mods de Fabric.', 'Mods'],
    forge: ['⚒️', 'El de mods clásicos y packs grandes.', 'Mods'],
    neoforge: ['🔥', 'El sucesor de Forge para versiones nuevas.', 'Mods']
  };
  async function newServer() {
    const dlg = el('dialog', 'event-modal confirm-modal sv-new');
    dlg.setAttribute('aria-label', 'Nuevo servidor');
    const body = el('div', 'event-modal-body');
    const head = el('div', 'svn-head');
    head.append(el('span', 'svn-ic', '🖥️'));
    const ht = el('div', '');
    ht.append(el('h3', '', 'Nuevo servidor de prueba'), el('p', 'muted', 'Se crea en tu computadora para probar. Luego lo exportas a tu host.'));
    head.append(ht);

    const name = document.createElement('input'); name.type = 'text'; name.placeholder = 'Ej.: Survival, Minijuegos, Pruebas…'; name.maxLength = 40;
    let chosen = (types[0] && types[0].id) || 'vanilla';
    const grid = el('div', 'svn-types');
    const cards = new Map();
    types.forEach((t) => {
      const [icon, desc, kind] = TYPE_INFO[t.id] || ['📦', '', ''];
      const c = el('button', 'svn-type'); c.type = 'button';
      c.append(el('span', 'svn-type-ic', icon), el('strong', '', t.label), el('small', '', desc), el('span', 'svn-kind', kind));
      c.addEventListener('click', () => { chosen = t.id; mark(); loadVersions(); });
      cards.set(t.id, c);
      grid.append(c);
    });
    const mark = () => {
      cards.forEach((c, id) => c.classList.toggle('on', id === chosen));
      hint.textContent = chosen === 'spigot' ? 'Spigot se compila al crearlo y la primera vez tarda varios minutos.'
        : (chosen === 'forge' || chosen === 'neoforge') ? 'Forge y NeoForge instalan sus archivos al crear el servidor; puede tardar un poco.'
        : 'Se descarga solo lo necesario, con el Java que haga falta.';
    };

    const mc = document.createElement('select');
    const ram = document.createElement('input'); ram.type = 'number'; ram.min = '1'; ram.max = '32'; ram.value = '4';
    const quick = el('div', 'svn-quick');
    [2, 4, 6, 8].forEach((n) => {
      const q = el('button', '', `${n} GB`); q.type = 'button';
      q.addEventListener('click', () => { ram.value = String(n); syncQuick(); });
      quick.append(q);
    });
    const syncQuick = () => [...quick.children].forEach((q) => q.classList.toggle('on', q.textContent === `${Number(ram.value)} GB`));
    ram.addEventListener('input', syncQuick);
    syncQuick();

    const status = el('p', 'svn-status', '');
    const hint = el('p', 'svn-hint', '');
    const lab = (t, n, extra) => { const l = el('label', 'svn-field'); l.append(el('span', '', t), n); if (extra) l.append(extra); return l; };
    const loadVersions = async () => {
      const mine = chosen;
      mc.textContent = ''; mc.disabled = true; status.textContent = 'Buscando versiones…';
      try {
        const v = await window.api.srvVersions(mine);
        if (mine !== chosen) return;
        v.slice(0, 80).forEach((x, i) => { const o = document.createElement('option'); o.value = x; o.textContent = i === 0 ? `${x} (la más nueva)` : x; mc.append(o); });
        status.textContent = v.length ? '' : 'No hay versiones disponibles.';
      } catch (e) { status.textContent = cleanError(e); }
      mc.disabled = false;
    };
    const row = el('div', 'svn-row');
    row.append(lab('Versión de Minecraft', mc), lab('Memoria (GB)', ram, quick));
    const actions = el('div', 'mp-actions');
    const no = el('button', '', 'Cancelar'); no.type = 'button';
    const yes = el('button', 'primary', 'Crear servidor'); yes.type = 'button';
    actions.append(no, yes);
    body.append(head, lab('Nombre', name), el('span', 'svn-label', 'Tipo de servidor'), grid, row, hint, status, actions);
    dlg.append(body);
    mark();
    const close = () => { try { dlg.close(); } catch {} dlg.remove(); };
    no.addEventListener('click', close);
    dlg.addEventListener('cancel', (e) => { if (yes.disabled) e.preventDefault(); else close(); });
    window.api.onSrvProgress && (window.__svProg = (d) => { if (d.text) status.textContent = d.text; else if (d.percent != null) status.textContent = `Descargando… ${d.percent}%`; });
    yes.addEventListener('click', async () => {
      yes.disabled = no.disabled = true;
      try {
        const made = await window.api.srvCreate({ name: name.value, type: chosen, mc: mc.value, ramGb: Number(ram.value) || 2 });
        toast('Servidor creado.');
        close();
        await loadList(made.id);
      } catch (e) { status.textContent = cleanError(e); yes.disabled = no.disabled = false; }
    });
    document.body.append(dlg);
    dlg.showModal();
    name.focus();
    loadVersions();
  }

  /* ---------- acciones ---------- */
  async function start() {
    const s = meta();
    try {
      const props = await window.api.srvPropsGet(s.id);
      // El EULA lo acepta la persona, nunca el launcher por su cuenta.
      if (!s.eula) {
        const ok = await askConfirm('Para encender el servidor tienes que aceptar el EULA de Minecraft (https://aka.ms/MinecraftEULA). ¿Lo aceptas?', 'Acepto', 'Cancelar').catch(() => false);
        if (!ok) return;
        await window.api.srvEula(s.id);
        s.eula = true;
      }
      g('sv-log').textContent = '';
      await window.api.srvStart(s.id);
      setState(true);
      toast(`Encendiendo… entra a localhost:${props['server-port'] || 25565}`);
    } catch (e) { toast(cleanError(e)); }
  }

  // Lo usa el cuadro unificado «Crear» (Nuevo perfil → Servidor de prueba).
  window.serversApi = {
    types: async () => { if (!types.length) types = await window.api.srvTypes(); return types; },
    versions: (t) => window.api.srvVersions(t),
    create: (o) => window.api.srvCreate(o),
    progress: (fn) => { window.__svProg = fn; },
    typeInfo: (id) => TYPE_INFO[id] || ['📦', '', ''],
    after: async (id) => { await loadList(id); paintLibrary(); }
  };
  g('sv-pick').addEventListener('change', (e) => { current = e.target.value; paint(); });
  g('sv-new').addEventListener('click', newServer);
  g('sv-start').addEventListener('click', start);
  g('sv-stop').addEventListener('click', async () => { try { toast('Apagando…'); await window.api.srvStop(current); } catch (e) { toast(cleanError(e)); } });
  g('sv-folder').addEventListener('click', () => window.api.srvFolder(current).catch((e) => toast(cleanError(e))));
  g('sv-export').addEventListener('click', async () => {
    try {
      const r = await window.api.srvExport(current);
      if (r) toast(`Exportado: ${r.files} archivos. Súbelo a tu host y descomprímelo en la carpeta del servidor.`);
    } catch (e) { toast(cleanError(e)); }
  });
  g('sv-delete').addEventListener('click', async () => {
    const s = meta();
    if (!(await askConfirm(`¿Borrar «${s.name}» con su mundo y todo su contenido? No se puede deshacer. Si quieres conservarlo, expórtalo primero.`, 'Borrar', 'Cancelar'))) return;
    try { await window.api.srvDelete(s.id); toast('Servidor borrado.'); await loadList(); } catch (e) { toast(cleanError(e)); }
  });
  const send = async () => {
    const t = g('sv-cmd').value.trim();
    if (!t) return;
    g('sv-cmd').value = '';
    try { appendLine('> ' + t); await window.api.srvCommand(current, t); } catch (e) { toast(cleanError(e)); }
  };
  g('sv-send').addEventListener('click', send);
  g('sv-cmd').addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  g('sv-props-save').addEventListener('click', async () => {
    const changes = {};
    g('sv-props').querySelectorAll('[data-prop]').forEach((i) => { changes[i.dataset.prop] = i.dataset.bool ? (i.checked ? 'true' : 'false') : i.value; });
    try { await window.api.srvPropsSave(current, changes); toast('Ajustes guardados.'); paintProps(); } catch (e) { toast(cleanError(e)); }
  });
  g('sv-tabs').querySelectorAll('[data-svt]').forEach((b) => b.addEventListener('click', () => {
    g('sv-tabs').querySelectorAll('[data-svt]').forEach((x) => x.classList.toggle('active', x === b));
    ['console', 'props', 'content'].forEach((t) => { g(`svt-${t}`).hidden = t !== b.dataset.svt; });
    if (b.dataset.svt === 'content' && !g('sv-results').children.length) search();
  }));
  const SRC = { modrinth: 'Modrinth', hangar: 'Hangar', spiget: 'SpigotMC' };
  const fmtN = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n >= 1e3 ? `${Math.round(n / 1e3)} mil` : String(n || 0));
  let searchSeq = 0;
  const search = async () => {
    const box = g('sv-results');
    const seq = ++searchSeq;
    box.textContent = '';
    box.append(el('p', 'muted', 'Buscando en Modrinth, Hangar y SpigotMC…'));
    try {
      const kind = g('sv-kind').value;
      const res = await window.api.srvContentSearch(current, kind, g('sv-q').value);
      if (seq !== searchSeq) return;
      box.textContent = '';
      if (!res.length) { box.append(el('p', 'muted', 'No encontré nada con ese nombre. Prueba con otra palabra.')); return; }
      if (res.some((r) => r.exact === false)) box.append(el('p', 'muted sv-note', 'Tu versión de Minecraft es muy nueva: se muestra lo más descargado y puede que alguno aún no tenga versión para ella.'));
      res.forEach((r) => {
        const row = el('div', 'sv-item sv-res');
        if (r.icon) { const im = document.createElement('img'); im.className = 'sv-ic'; im.alt = ''; im.loading = 'lazy'; im.src = r.icon; im.addEventListener('error', () => im.remove()); row.append(im); }
        const t = el('div', 'sv-res-text');
        const head = el('div', 'sv-res-head');
        head.append(el('strong', '', r.title), el('span', 'sv-src', SRC[r.source] || r.source), el('span', 'sv-dl', `⬇ ${fmtN(r.downloads)}`));
        t.append(head, el('small', 'muted', r.description || ''));
        const add = el('button', 'primary', 'Instalar'); add.type = 'button';
        add.addEventListener('click', async () => {
          add.disabled = true;
          try { const x = await window.api.srvContentInstall(current, kind, r.id, r.source); toast(x.warning ? `Instalado: ${x.file}. ${x.warning}` : `Instalado: ${x.file}`); paintInstalled(); } catch (e) { toast(cleanError(e)); }
          add.disabled = false;
        });
        row.append(t, add);
        box.append(row);
      });
    } catch (e) { if (seq !== searchSeq) return; box.textContent = ''; box.append(el('p', 'muted', 'No pude conectar con las tiendas de contenido. Revisa tu internet e inténtalo otra vez.')); toast(cleanError(e)); }
  };
  window.svSearchPopular = () => { g('sv-q').value = ''; return search(); };
  g('sv-search').addEventListener('click', search);
  g('sv-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });
  g('sv-kind').addEventListener('change', () => search());

  window.api.onSrvLine((d) => { if (d.id === current) appendLine(d.line); });
  window.api.onSrvExit((d) => { if (d.id === current) { setState(false); appendLine(`[launcher] El servidor se apagó (código ${d.code}).`); } });
  window.api.onSrvProgress((d) => { if (window.__svProg) window.__svProg(d); });

  window.serversShow = async function () {
    try {
      if (!types.length) types = await window.api.srvTypes();
      await loadList(current);
    } catch (e) { toast(cleanError(e)); }
  };
})();
