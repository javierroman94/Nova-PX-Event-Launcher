/*
 * Idiomas. El launcher está escrito en español: un paquete de idioma traduce, al vuelo, cada texto exacto (y los textos con
 * números mediante patrones). Lo que no esté en el paquete se queda en español. Cambiar de idioma no reinicia nada.
 */
(function () {
  const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  let strings = new Map();
  let patterns = [];
  let active = 'es';
  let observer = null;
  const textState = new WeakMap(); // nodo -> { orig, shown }
  const attrState = new WeakMap(); // elemento -> { attr: { orig, shown } }

  function translate(src) {
    if (active === 'es' || !src) return src;
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(src);
    const key = m[2].replace(/\s+/g, ' ');
    if (!key) return src;
    let out = strings.get(key);
    if (out === undefined) {
      for (const p of patterns) {
        if (p.re.test(key)) { out = key.replace(p.re, p.to); break; }
      }
    }
    return out === undefined ? src : m[1] + out + m[3];
  }

  function doText(node) {
    const st = textState.get(node);
    const orig = st && node.data === st.shown ? st.orig : node.data;
    const shown = translate(orig);
    if (shown !== node.data) node.data = shown;
    textState.set(node, { orig, shown });
  }

  function doAttrs(el) {
    let st = attrState.get(el);
    if (!st) { st = {}; attrState.set(el, st); }
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const cur = el.getAttribute(a);
      const prev = st[a];
      const orig = prev && cur === prev.shown ? prev.orig : cur;
      const shown = translate(orig);
      if (shown !== cur) el.setAttribute(a, shown);
      st[a] = { orig, shown };
    }
  }

  function walk(root) {
    if (root.nodeType === 3) { if (root.parentNode && !/^(SCRIPT|STYLE)$/.test(root.parentNode.nodeName)) doText(root); return; }
    if (root.nodeType !== 1 || /^(SCRIPT|STYLE)$/.test(root.nodeName)) return;
    doAttrs(root);
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let n = tw.nextNode();
    while (n) {
      if (n.nodeType === 3) { if (!/^(SCRIPT|STYLE)$/.test(n.parentNode.nodeName)) doText(n); }
      else if (!/^(SCRIPT|STYLE)$/.test(n.nodeName)) doAttrs(n);
      n = tw.nextNode();
    }
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver((records) => {
      observer.disconnect();
      try {
        for (const r of records) {
          if (r.type === 'characterData') doText(r.target);
          else if (r.type === 'attributes') doAttrs(r.target);
          else r.addedNodes.forEach((n) => walk(n));
        }
      } finally {
        observe();
      }
    });
    observe();
  }
  function observe() {
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  // Los cuadros nativos (confirm/alert) también se traducen.
  const nativeConfirm = window.confirm.bind(window);
  const nativeAlert = window.alert.bind(window);
  window.confirm = (m) => nativeConfirm(translate(String(m)));
  window.alert = (m) => nativeAlert(translate(String(m)));

  function load(pack) {
    strings = new Map(Object.entries((pack && pack.strings) || {}));
    patterns = [];
    for (const p of (pack && pack.patterns) || []) {
      try { patterns.push({ re: new RegExp(p.match), to: String(p.to).replace(/\$(\d)/g, '$$$1') }); } catch {}
    }
  }

  async function setLanguage(code) {
    let pack = null;
    if (code && code !== 'es') {
      try { pack = await window.api.langGet(code); } catch {}
    }
    active = pack ? pack.code : 'es';
    load(pack);
    document.documentElement.lang = active;
    startObserver();
    observer.disconnect();
    walk(document.body);
    document.title = translate(document.title) || document.title;
    observe();
    window.dispatchEvent(new CustomEvent('nova-lang', { detail: active }));
    return active;
  }

  // "auto" usa el idioma del sistema si hay paquete; si no, español.
  async function resolve(setting) {
    if (setting && setting !== 'auto') return setting;
    const sys = String(navigator.language || 'es').toLowerCase().split('-')[0];
    if (sys === 'es') return 'es';
    try {
      const list = await window.api.langList();
      if (list.some((l) => l.code.split('-')[0] === sys)) return list.find((l) => l.code.split('-')[0] === sys).code;
    } catch {}
    return 'es';
  }

  window.NovaI18n = { setLanguage, resolve, translate, get active() { return active; } };
})();
