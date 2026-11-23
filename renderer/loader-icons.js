/* Iconos de cada loader (Nova, Fabric, Quilt, NeoForge, Forge, OptiFine, Vanilla).
   Dibujos SVG simples hechos para el launcher, con los colores de cada proyecto;
   Nova usa el logo de NovaPX y Vanilla un bloque de pasto. */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  // Cada icono: lista de [etiqueta, atributos] sobre un viewBox 0 0 24 24.
  const SHAPES = {
    fabric: [
      ['path', { d: 'M12 1.5L22.5 12 12 22.5 1.5 12z', fill: '#DBD0B4', stroke: '#38342A', 'stroke-width': 1, 'stroke-linejoin': 'round' }],
      ['path', { d: 'M12 5L19 12 12 19 5 12z', fill: 'none', stroke: '#38342A', 'stroke-width': 1.2, 'stroke-dasharray': '1.8 1.4' }]
    ],
    quilt: [
      ['rect', { x: 2.5, y: 2.5, width: 8.6, height: 8.6, rx: 2.2, fill: '#9722FF' }],
      ['rect', { x: 12.9, y: 2.5, width: 8.6, height: 8.6, rx: 2.2, fill: '#27A2FD' }],
      ['rect', { x: 2.5, y: 12.9, width: 8.6, height: 8.6, rx: 2.2, fill: '#DC29DD' }],
      ['rect', { x: 12.9, y: 12.9, width: 8.6, height: 8.6, rx: 2.2, fill: '#6B5CFF' }]
    ],
    neoforge: [
      ['path', { d: 'M3 3l5 4h8l5-4-1 9c0 5-4 9-8 9s-8-4-8-9z', fill: '#D7742F' }],
      ['path', { d: 'M7 13c1.5 0 3 1 5 1s3.5-1 5-1c0 3.5-2.5 6-5 6s-5-2.5-5-6z', fill: '#FFF3E6' }],
      ['circle', { cx: 9, cy: 11, r: 1.2, fill: '#2A1A10' }],
      ['circle', { cx: 15, cy: 11, r: 1.2, fill: '#2A1A10' }]
    ],
    forge: [
      ['path', { d: 'M2 7h14c3 0 5 1.3 6 3h-6v2.2c0 1.2-1 2.3-2.2 2.6L15 18H7l1.2-3.2C6.6 14.4 5 12.8 5 11H2z', fill: '#DFA86A' }],
      ['rect', { x: 5, y: 18, width: 12, height: 2.5, rx: .8, fill: '#B07A3E' }]
    ],
    optifine: [
      ['rect', { x: 2.5, y: 2.5, width: 19, height: 19, rx: 4, fill: '#B91C1C' }],
      ['circle', { cx: 12, cy: 12, r: 5.6, fill: 'none', stroke: '#FFFFFF', 'stroke-width': 2.2 }],
      ['circle', { cx: 12, cy: 12, r: 2, fill: '#FFFFFF' }]
    ],
    vanilla: [
      ['path', { d: 'M12 2.5l9 4.5-9 4.5-9-4.5z', fill: '#5DAA3A' }],
      ['path', { d: 'M3 7l9 4.5V21.5L3 17z', fill: '#8B5A2B' }],
      ['path', { d: 'M21 7l-9 4.5V21.5l9-4.5z', fill: '#6E4421' }],
      ['path', { d: 'M3 7l9 4.5v2.2L3 9.2z', fill: '#4C8C2F' }],
      ['path', { d: 'M21 7l-9 4.5v2.2l9-4.5z', fill: '#3F7A26' }]
    ]
  };

  // Devuelve un elemento con el icono del loader (o null si no se conoce).
  window.loaderIcon = function (id, cls) {
    const className = 'loader-ico' + (cls ? ' ' + cls : '');
    const FILES = { nova: 'images/logo.png', fabric: 'images/loaders/fabric.png', quilt: 'images/loaders/quilt.png', neoforge: 'images/loaders/neoforge.png', forge: 'images/loaders/forge.png' };
    if (FILES[id]) {
      const im = document.createElement('img');
      im.src = FILES[id];
      if (id === 'neoforge') im.style.imageRendering = 'pixelated';
      im.alt = '';
      im.className = className;
      im.draggable = false;
      return im;
    }
    const shapes = SHAPES[id];
    if (!shapes) return null;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', className);
    shapes.forEach(([tag, attrs]) => {
      const n = document.createElementNS(NS, tag);
      Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, String(v)));
      svg.append(n);
    });
    return svg;
  };
  window.LOADER_ICON_IDS = ['nova', ...Object.keys(SHAPES)];
})();
