/* Configuración remota: lo que el administrador publica desde el panel (data/launcher.json) y llega a todos.
 * Todo texto entra con textContent; los enlaces solo se abren si son https. */
(function () {
  const g = (id) => document.getElementById(id);
  const mk = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const touched = () => { try { return localStorage.getItem('px.themeTouched') === '1'; } catch { return false; } };
  const hasTheme = () => !!(window.NovaTheme && window.NovaTheme.preview);

  let base = null; // marca original (de config/launcher.config.json)
  let current = null; // última configuración aplicada
  let appVersion = '';
  let remoteLinkList = [];

  function captureBase() {
    if (base) return;
    base = { name: g('brand-name') ? g('brand-name').textContent : '', sub: g('brand-sub') ? g('brand-sub').textContent : '', title: document.title };
  }

  function linksFrom(cfg) {
    const names = { discord: 'Discord', x: 'X', youtube: 'YouTube', web: 'Sitio web' };
    return Object.keys(names).filter((k) => cfg.links && cfg.links[k]).map((k) => ({ name: names[k], url: cfg.links[k] }));
  }
  // Une los enlaces del evento con los del administrador (sin repetir direcciones).
  window.withRemoteLinks = function (eventLinks) {
    const out = [...(Array.isArray(eventLinks) ? eventLinks : [])];
    remoteLinkList.forEach((l) => { if (!out.some((x) => x && x.url === l.url)) out.push(l); });
    return out;
  };

  function bar(level, text, url, onClose, extra) {
    const b = mk('div', `announce announce-${level}`);
    b.setAttribute('role', level === 'danger' ? 'alert' : 'status');
    if (extra && extra.image && typeof imageUrl === 'function') {
      const src = imageUrl(extra.image);
      if (src) { const im = mk('img', 'announce-img'); im.alt = ''; im.src = src; b.append(im); }
    }
    b.append(mk('span', 'announce-text', text));
    if (url) {
      const more = mk('button', 'ghost', (extra && extra.label) || 'Más información');
      more.type = 'button';
      more.addEventListener('click', () => window.api.openLink(url).catch(() => {}));
      b.append(more);
    }
    if (onClose) {
      const x = mk('button', 'announce-x', '×');
      x.type = 'button';
      x.setAttribute('aria-label', 'Cerrar aviso');
      x.addEventListener('click', onClose);
      b.append(x);
    }
    return b;
  }

  function paintAnnounce(cfg) {
    const box = g('announce');
    if (!box) return;
    box.replaceChildren();
    const key = `px.ann.${cfg.announcement.text}`;
    let closed = false;
    try { closed = sessionStorage.getItem(key) === '1'; } catch {}
    if (appVersion && cfg.minVersion && cmp(appVersion, cfg.minVersion) < 0) {
      box.append(bar('danger', `Tu versión (${appVersion}) es antigua: actualiza a la ${cfg.minVersion} o superior para poder jugar.`));
    }
    if (cfg.maintenance.enabled) box.append(bar('warn', cfg.maintenance.text || 'El launcher está en mantenimiento. Vuelve en unos minutos.'));
    if (cfg.announcement.enabled && cfg.announcement.text && !closed) {
      box.append(bar(cfg.announcement.level, cfg.announcement.text, cfg.announcement.url, () => {
        try { sessionStorage.setItem(key, '1'); } catch {}
        paintAnnounce(cfg);
      }, { image: cfg.announcement.image, label: cfg.announcement.urlLabel }));
    }
  }
  function cmp(a, b) {
    const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
    for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0) ? -1 : 1;
    return 0;
  }

  function apply(cfg, { preview = false } = {}) {
    if (!cfg) return;
    captureBase();
    current = cfg;
    const name = cfg.brand.name || (base && base.name.split(' - ')[0]);
    const sub = cfg.brand.name ? cfg.brand.subtitle : cfg.brand.subtitle || (base && base.sub);
    if (g('brand-name') && name) g('brand-name').textContent = name;
    if (g('brand-sub')) g('brand-sub').textContent = sub || '';
    document.title = cfg.brand.name ? [cfg.brand.name, cfg.brand.subtitle].filter(Boolean).join(' - ') : base.title;

    if (hasTheme() && (preview || !touched())) {
      const patch = {};
      if (cfg.theme.preset) patch.theme = cfg.theme.preset;
      if (cfg.theme.accent) patch.accent = cfg.theme.accent;
      if (cfg.theme.season) patch.season = cfg.theme.season;
      if (Object.keys(patch).length) window.NovaTheme.preview(patch);
    }

    const w = g('home-welcome');
    if (w) {
      w.hidden = !(cfg.welcome.title || cfg.welcome.text);
      g('hw-title').textContent = cfg.welcome.title;
      g('hw-text').textContent = cfg.welcome.text;
    }
    paintAnnounce(cfg);

    remoteLinkList = linksFrom(cfg);
    if (typeof window.refreshLinks === 'function') window.refreshLinks();

    // Funciones apagadas desde el panel.
    ['mp-import-file', 'mp-import-folder', 'mp-import-hint'].forEach((id) => { if (g(id)) g(id).hidden = !cfg.features.importPacks; });
    if (g('card-offline')) g('card-offline').hidden = !cfg.features.nonPremium;
  }

  window.applyRemoteConfig = apply;
  window.remoteCurrent = () => current;
  // Quita la vista previa del administrador y vuelve a lo publicado (y a los ajustes propios del jugador).
  window.restoreRemote = async function (published) {
    try {
      const st = await window.api.getSettings();
      if (hasTheme()) window.NovaTheme.preview({ theme: st.theme, accent: st.accent, season: st.season });
    } catch {}
    apply(published || current);
  };

  window.initRemote = async function () {
    try { appVersion = (await window.api.getConfig()).version || ''; } catch {}
    try { apply(await window.api.remoteGet()); } catch {}
    try { window.api.onRemoteChanged((c) => apply(c)); } catch {}
  };
})();
