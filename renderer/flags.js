/*
 * Banderas en SVG (las banderas emoji no se dibujan en Windows: salen como dos letras).
 * NovaFlags.node(codigo) devuelve un <span class="flag"> listo para insertar. El código puede ser "es", "pt-BR", etc.
 */
(function () {
  const W = (inner) => `<svg viewBox="0 0 30 20" aria-hidden="true" focusable="false">${inner}</svg>`;
  const band = (colors, vertical) => colors.map((c, i) => {
    const n = colors.length;
    return vertical ? `<rect x="${(30 / n) * i}" width="${30 / n + 0.2}" height="20" fill="${c}"/>` : `<rect y="${(20 / n) * i}" width="30" height="${20 / n + 0.2}" fill="${c}"/>`;
  }).join('');
  const FLAGS = {
    es: W('<rect width="30" height="20" fill="#AA151B"/><rect y="5" width="30" height="10" fill="#F1BF00"/>'),
    ec: W('<rect width="30" height="10" fill="#FFD100"/><rect y="10" width="30" height="5" fill="#0072CE"/><rect y="15" width="30" height="5" fill="#EF3340"/>'),
    en: W('<rect width="30" height="20" fill="#012169"/><path d="M0 0L30 20M30 0L0 20" stroke="#fff" stroke-width="4"/><path d="M0 0L30 20M30 0L0 20" stroke="#C8102E" stroke-width="1.5"/><path d="M15 0V20M0 10H30" stroke="#fff" stroke-width="6"/><path d="M15 0V20M0 10H30" stroke="#C8102E" stroke-width="3.4"/>'),
    pt: W('<rect width="30" height="20" fill="#009C3B"/><path d="M15 2.2L27.2 10 15 17.8 2.8 10z" fill="#FFDF00"/><circle cx="15" cy="10" r="4.3" fill="#002776"/><path d="M10.9 9.2q4.4-1.1 8.4 1.5" stroke="#fff" stroke-width=".7" fill="none"/>'),
    fr: W(band(['#0055A4', '#fff', '#EF4135'], true)),
    de: W(band(['#000', '#DD0000', '#FFCE00'], false)),
    it: W(band(['#009246', '#fff', '#CE2B37'], true)),
    ru: W(band(['#fff', '#0039A6', '#D52B1E'], false)),
    ja: W('<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="6" fill="#BC002D"/>'),
    ko: W('<rect width="30" height="20" fill="#fff"/><path d="M15 5a5 5 0 010 10 2.5 2.5 0 010-5 2.5 2.5 0 000-5z" fill="#CD2E3A"/><path d="M15 15a5 5 0 010-10 2.5 2.5 0 010 5 2.5 2.5 0 000 5z" fill="#0047A0"/>'),
    zh: W('<rect width="30" height="20" fill="#DE2910"/><path d="M6 3l1.2 3.6H11L8 8.8l1.2 3.6L6 10.2 2.8 12.4 4 8.8 1 6.6h3.8z" fill="#FFDE00"/>'),
    tr: W('<rect width="30" height="20" fill="#E30A17"/><circle cx="11" cy="10" r="5" fill="#fff"/><circle cx="12.5" cy="10" r="4" fill="#E30A17"/><path d="M17 10l3.2-1-2 2.7v-3.4l2 2.7z" fill="#fff"/>'),
    ca: W('<rect width="30" height="20" fill="#FCDD09"/><path d="M0 2.2h30M0 6.7h30M0 11.1h30M0 15.6h30" stroke="#DA121A" stroke-width="2.2"/>'),
    globe: W('<rect width="30" height="20" fill="#1e3a5f"/><circle cx="15" cy="10" r="7" fill="none" stroke="#7fc4ff" stroke-width="1.2"/><path d="M8 10h14M15 3c3.5 3 3.5 11 0 14M15 3c-3.5 3-3.5 11 0 14" fill="none" stroke="#7fc4ff" stroke-width="1"/>')
  };
  function key(code) {
    const c = String(code || '').toLowerCase();
    if (FLAGS[c]) return c;
    const base = c.split('-')[0];
    return FLAGS[base] ? base : 'globe';
  }
  function node(code) {
    const s = document.createElement('span');
    s.className = 'flag';
    s.innerHTML = FLAGS[key(code)]; // SVG fijo definido arriba, nunca texto de un paquete de idioma
    return s;
  }
  window.NovaFlags = { node, has: (c) => key(c) !== 'globe' };
})();
