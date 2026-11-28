/* global document, window */
/* Mobs 3D de bloques (diseños propios) para acompañar a Pexy. Mini motor 3D en canvas 2D: cajas con sombreado plano,
   vista isométrica suave, caminan, giran hacia donde van y se mueven con animación de patas, alas y saltos. Sin librerías. */
(function () {
  const S = 5;               // píxeles por unidad de bloque
  const PITCH = 0.42;        // inclinación de la cámara (mira un poco desde arriba)
  const LIGHT = (() => { const v = [-0.45, 0.8, 0.5]; const l = Math.hypot(...v); return v.map((n) => n / l); })();
  const P = (x, y, z, w, h, d, c, o) => Object.assign({ p: [x, y, z], s: [w, h, d], c }, o || {});
  const eye = (x, y, z) => P(x, y, z, 1.2, 1.4, 0.25, '#15151d', { flat: true });

  const MOBS = {
    pig: { h: 10, parts: [
      P(0, 5.5, 0, 6, 5, 9, '#f2a0b8'), P(0, 6.5, 5.5, 5, 5, 5, '#f6b0c4', { a: 'head', piv: [0, 6.5, 3] }),
      P(0, 5.6, 8.2, 3, 2, 1, '#e07f9c', { a: 'head', piv: [0, 6.5, 3] }), P(-2.2, 9.3, 5, 1.4, 1.6, 1, '#e98fa9', { a: 'head', piv: [0, 6.5, 3] }), P(2.2, 9.3, 5, 1.4, 1.6, 1, '#e98fa9', { a: 'head', piv: [0, 6.5, 3] }), eye(-1.5, 7.6, 8.05), eye(1.5, 7.6, 8.05),
      ...[[-2, 3], [2, 3], [-2, -3], [2, -3]].map(([x, z], i) => P(x, 1.5, z, 2, 3, 2, '#e58aa6', { a: i % 3 === 0 ? 'legA' : 'legB', piv: [x, 3, z] }))] },
    sheep: { h: 11, parts: [
      P(0, 6, 0, 7, 6, 9, '#f4f0e8'), P(0, 9.4, 3.2, 5, 1.2, 5.5, '#ffffff'), P(0, 7.6, -4.9, 6, 3.5, 1.2, '#eee9df'), P(-3.9, 6.2, 0, 1.2, 4, 8, '#eee9df'), P(3.9, 6.2, 0, 1.2, 4, 8, '#eee9df'), P(0, 7.2, 5.6, 4, 4, 4, '#d9c7b0', { a: 'head', piv: [0, 7, 3] }),
      eye(-1.2, 7.9, 7.65), eye(1.2, 7.9, 7.65),
      ...[[-2, 3], [2, 3], [-2, -3], [2, -3]].map(([x, z], i) => P(x, 2, z, 2, 4, 2, '#cbbba8', { a: i % 3 === 0 ? 'legA' : 'legB', piv: [x, 4, z] }))] },
    hen: { h: 10, parts: [
      P(0, 4.5, 0, 4, 4, 5, '#fbf8f2'), P(0, 7.6, 2.6, 3, 3, 3, '#fbf8f2', { a: 'head', piv: [0, 6.5, 2] }),
      P(0, 7.2, 4.6, 1.4, 1, 1.2, '#ff9a2e', { a: 'head', piv: [0, 6.5, 2] }), P(0, 9.4, 2.4, 1, 1.2, 2, '#e8334a', { a: 'head', piv: [0, 6.5, 2] }),
      eye(-1.2, 8, 4.15), eye(1.2, 8, 4.15), P(0, 6, -3, 3, 3, 1.2, '#e9e2d6'),
      P(-2.4, 4.8, 0, 1, 3, 3.6, '#ece5da', { a: 'wingL', piv: [-2, 6, 0] }), P(2.4, 4.8, 0, 1, 3, 3.6, '#ece5da', { a: 'wingR', piv: [2, 6, 0] }),
      P(-1, 1.5, 0, 0.8, 3, 0.8, '#ff9a2e', { a: 'legA', piv: [-1, 3, 0] }), P(1, 1.5, 0, 0.8, 3, 0.8, '#ff9a2e', { a: 'legB', piv: [1, 3, 0] })] },
    jelly: { h: 9, parts: [
      P(0, 4.5, 0, 4, 4, 4, '#2f8f3d'), P(0, 4.5, 0, 8, 8, 8, '#55d063', { alpha: 0.78 }),
      eye(-2, 5.6, 4.1), eye(2, 5.6, 4.1), P(0, 3.4, 4.1, 3, 0.7, 0.2, '#15151d')] },
    bat: { h: 7, fly: true, yaw: 0.5, parts: [
      P(0, 2, 0, 4, 3.6, 3.4, '#34324a'), P(-1.4, 4.4, 0, 1.2, 1.6, 1, '#34324a'), P(1.4, 4.4, 0, 1.2, 1.6, 1, '#34324a'),
      P(-1, 2.6, 1.75, 1, 1, 0.25, '#ff4a4a', { flat: true }), P(1, 2.6, 1.75, 1, 1, 0.25, '#ff4a4a', { flat: true }), P(0, 1.3, 1.75, 1.2, 0.6, 0.25, '#e8e8f0', { flat: true }),
      P(-4.2, 2.4, 0, 6, 0.7, 4.4, '#4d4a6e', { a: 'wingL', piv: [-2, 2.6, 0] }), P(4.2, 2.4, 0, 6, 0.7, 4.4, '#4d4a6e', { a: 'wingR', piv: [2, 2.6, 0] })] }
  };

  // Pexy: panda blanco y negro con sudadera morada y estrella nova. Geometría articulada por pivotes.
  MOBS.px = { h: 24, sc: 1.25, yaw: 0.72, parts: [
    P(0, 9, 0, 9, 9, 6, '#713bb0'), P(0, 11.2, 3.12, 5.2, 2.2, 0.22, '#8f5bd0', { flat: true }),
    P(0, 18, 0, 9, 8.2, 7.2, '#f4f1ed', { a: 'head', piv: [0, 17, 0] }),
    P(-4.2, 22.1, 0, 2.8, 2.8, 2.8, '#17151d', { a: 'head', piv: [0, 17, 0] }),
    P(4.2, 22.1, 0, 2.8, 2.8, 2.8, '#17151d', { a: 'head', piv: [0, 17, 0] }),
    P(-2.1, 18.2, 3.7, 2.6, 3.2, 0.28, '#24212a', { a: 'head', piv: [0, 17, 0], flat: true }),
    P(2.1, 18.2, 3.7, 2.6, 3.2, 0.28, '#24212a', { a: 'head', piv: [0, 17, 0], flat: true }),
    P(-2.1, 18.5, 3.9, 0.9, 1, 0.12, '#ffffff', { a: 'head', piv: [0, 17, 0], flat: true }),
    P(2.1, 18.5, 3.9, 0.9, 1, 0.12, '#ffffff', { a: 'head', piv: [0, 17, 0], flat: true }),
    P(0, 16.3, 3.8, 3.5, 2.2, 0.4, '#ffffff', { a: 'head', piv: [0, 17, 0] }),
    P(0, 17.4, 4.05, 1.25, 0.9, 0.3, '#17151d', { a: 'head', piv: [0, 17, 0], flat: true }),
    P(0, 15.8, 4.05, 1.1, 0.35, 0.25, '#17151d', { a: 'head', piv: [0, 17, 0], flat: true }),
    P(0, 9.5, 3.18, 0.9, 4.2, 0.22, '#ffffff', { flat: true }),
    P(0, 9.5, 3.18, 3.6, 0.9, 0.22, '#ffffff', { flat: true }),
    P(0, 9.5, 3.32, 1.25, 1.25, 0.2, '#ffffff', { flat: true }),
    P(-3.4, 9.5, 0, 2.6, 6.8, 3, '#713bb0', { a: 'armA', piv: [-3.4, 12.3, 0] }),
    P(3.4, 9.5, 0, 2.6, 6.8, 3, '#713bb0', { a: 'armB', piv: [3.4, 12.3, 0] }),
    P(-2.5, 2.2, 0, 3.2, 4.4, 3.8, '#17151d', { a: 'legA', piv: [-2.5, 4.2, 0] }),
    P(2.5, 2.2, 0, 3.2, 4.4, 3.8, '#17151d', { a: 'legB', piv: [2.5, 4.2, 0] }),
    P(-3.4, 1.5, 1.1, 3.4, 1.4, 4, '#24212a'), P(3.4, 1.5, 1.1, 3.4, 1.4, 4, '#24212a')
  ] };

  // Hostiles (diseños propios, versión simpática): zombi lila, esqueleto de brillo verde, araña y bombito.
  const limb = (x, y, z, w, h, d, col, a, pv, rot) => P(x, y, z, w, h, d, col, { a, piv: pv, rot });
  MOBS.zombie = { h: 15, sc: 0.8, parts: [
    P(0, 7.6, 0, 6, 7, 3.4, '#8a5a44'), P(0, 5.2, 1.75, 2.4, 2.6, 0.2, '#6f4636', { flat: true }),
    P(0, 14.2, 0, 7.4, 7.4, 7.4, '#9bb67a', { a: 'head', piv: [0, 11.5, 0] }),
    P(0, 16.2, 3.75, 7.6, 1.4, 0.3, '#6c8a52', { a: 'head', piv: [0, 11.5, 0], flat: true }),
    P(-1.8, 14.6, 3.75, 1.6, 1.6, 0.25, '#ffe45c', { a: 'head', piv: [0, 11.5, 0], flat: true }), P(1.8, 14.6, 3.75, 1.6, 1.6, 0.25, '#ffe45c', { a: 'head', piv: [0, 11.5, 0], flat: true }),
    P(0, 12.2, 3.75, 3.6, 0.7, 0.25, '#3a2a2a', { a: 'head', piv: [0, 11.5, 0], flat: true }),
    limb(-4.3, 8.2, 0, 2.6, 6.5, 2.6, '#9bb67a', 'armZ', [-4.3, 11, 0]), limb(4.3, 8.2, 0, 2.6, 6.5, 2.6, '#9bb67a', 'armZ', [4.3, 11, 0]),
    limb(-1.5, 2.4, 0, 2.8, 4.8, 2.8, '#4b4a6a', 'legA', [-1.5, 4.8, 0]), limb(1.5, 2.4, 0, 2.8, 4.8, 2.8, '#4b4a6a', 'legB', [1.5, 4.8, 0])] };
  MOBS.skeleton = { h: 15, sc: 0.8, parts: [
    P(0, 8.6, 0, 4.4, 6, 2.2, '#bdb8a8'), P(0, 8.4, 0, 1.6, 6, 2.5, '#d9d4c4'), P(0, 10.4, 0, 5.2, 1, 2.4, '#ece8dc'), P(0, 8.6, 0, 4.6, 1, 2.2, '#ece8dc'), P(0, 6.8, 0, 4, 1, 2, '#ece8dc'),
    P(0, 14, 0, 7.4, 7, 7, '#f1eee4', { a: 'head', piv: [0, 11, 0] }),
    P(-1.9, 14.4, 3.55, 2, 2, 0.25, '#1d1d26', { a: 'head', piv: [0, 11, 0], flat: true }), P(1.9, 14.4, 3.55, 2, 2, 0.25, '#1d1d26', { a: 'head', piv: [0, 11, 0], flat: true }),
    P(-1.9, 14.4, 3.7, 0.9, 0.9, 0.2, '#9aff6b', { a: 'head', piv: [0, 11, 0], flat: true }), P(1.9, 14.4, 3.7, 0.9, 0.9, 0.2, '#9aff6b', { a: 'head', piv: [0, 11, 0], flat: true }),
    P(0, 12, 3.55, 3.4, 1.1, 0.25, '#1d1d26', { a: 'head', piv: [0, 11, 0], flat: true }),
    limb(-3.6, 8.6, 0, 1.5, 6.4, 1.5, '#e4dfd0', 'armA', [-3.6, 11, 0]), limb(3.6, 8.6, 0, 1.5, 6.4, 1.5, '#e4dfd0', 'armB', [3.6, 11, 0]),
    limb(-1.3, 2.4, 0, 1.6, 4.8, 1.6, '#e4dfd0', 'legA', [-1.3, 4.8, 0]), limb(1.3, 2.4, 0, 1.6, 4.8, 1.6, '#e4dfd0', 'legB', [1.3, 4.8, 0])] };
  MOBS.spider = { h: 6, sc: 0.95, parts: [
    P(0, 3, -1.2, 5, 3.4, 5.6, '#3b2a4a'), P(0, 3.2, 2.8, 3.6, 3, 3, '#4b3660'),
    P(-0.9, 3.8, 4.35, 0.9, 0.9, 0.2, '#ff4fd8'), P(0.9, 3.8, 4.35, 0.9, 0.9, 0.2, '#ff4fd8'), P(0, 2.6, 4.35, 0.6, 0.6, 0.2, '#ff4fd8'),
    ...[-2.2, -0.4, 1.4, 3].flatMap((z, i) => [
      P(-3.6, 2.6, z, 4.4, 0.8, 0.8, '#2d2040', { a: i % 2 ? 'spA' : 'spB', piv: [-1.6, 2.6, z], rot: [0, 0, 0.55] }),
      P(3.6, 2.6, z, 4.4, 0.8, 0.8, '#2d2040', { a: i % 2 ? 'spB' : 'spA', piv: [1.6, 2.6, z], rot: [0, 0, -0.55] })])] };
  MOBS.bomb = { h: 12, sc: 0.85, parts: [
    P(0, 5.5, 0, 8, 8, 8, '#3a3a45'), P(0, 5.5, 0, 8.4, 1.4, 8.4, '#555566'),
    P(0, 10.4, 0, 1.2, 2, 1.2, '#c9a35c'), P(0, 12, 0.4, 1.8, 1.8, 1.8, '#ffb02e', { a: 'fuse', piv: [0, 10.4, 0] }),
    P(-2, 6.6, 4.05, 2, 1.6, 0.2, '#ffffff'), P(2, 6.6, 4.05, 2, 1.6, 0.2, '#ffffff'), P(-2, 6.5, 4.15, 0.9, 0.9, 0.2, '#e8334a'), P(2, 6.5, 4.15, 0.9, 0.9, 0.2, '#e8334a'),
    P(0, 3.8, 4.05, 3.4, 0.7, 0.2, '#15151d'),
    limb(-2, 1, 0, 2.6, 2, 2.6, '#2a2a33', 'legA', [-2, 2, 0]), limb(2, 1, 0, 2.6, 2, 2.6, '#2a2a33', 'legB', [2, 2, 0])] };

  const FACES = [
    { n: [0, 0, 1], v: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] }, { n: [0, 0, -1], v: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
    { n: [1, 0, 0], v: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] }, { n: [-1, 0, 0], v: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
    { n: [0, 1, 0], v: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] }, { n: [0, -1, 0], v: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] }
  ];
  const rotX = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]; };
  const rotZ = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]]; };
  const rotY = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; };


  const texCache = new Map();
  const hashN = (a, b, c) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
  const hexRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  // Textura de píxeles de una cara: color base con variación suave (como bloques) y un borde un poco más oscuro.
  function faceTex(part, fi, seed) {
    const dims = [[part.s[0], part.s[1]], [part.s[0], part.s[1]], [part.s[2], part.s[1]], [part.s[2], part.s[1]], [part.s[0], part.s[2]], [part.s[0], part.s[2]]][fi];
    const tw = Math.max(1, Math.min(20, Math.round(dims[0] * 2))), th = Math.max(1, Math.min(20, Math.round(dims[1] * 2)));
    const key = part.c + '|' + tw + 'x' + th + '|' + seed + '|' + (part.flat ? 1 : 0);
    let cv = texCache.get(key); if (cv) return cv;
    cv = document.createElement('canvas'); cv.width = tw; cv.height = th; const x = cv.getContext('2d');
    const [r, g, b] = hexRgb(part.c); const big = tw >= 3 && th >= 3 && !part.flat;
    for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) {
      let k = 1; if (big) { k += (hashN(i, j, seed) - 0.5) * 0.16; if (i === 0 || j === 0 || i === tw - 1 || j === th - 1) k -= 0.05; }
      x.fillStyle = `rgb(${Math.max(0, Math.min(255, r * k)) | 0},${Math.max(0, Math.min(255, g * k)) | 0},${Math.max(0, Math.min(255, b * k)) | 0})`;
      x.fillRect(i, j, 1, 1);
    }
    texCache.set(key, cv); return cv;
  }

  function anim(part, t, moving, kind) {
    const swing = moving ? Math.sin(t) * 0.75 : 0;
    switch (part.a) {
      case 'legA': return { rx: swing }; case 'legB': return { rx: -swing };
      case 'head': return { rx: Math.sin(t * 0.5) * (moving ? 0.1 : 0.05) };
      case 'armZ': return { rx: -1.45 + Math.sin(t * 0.7) * 0.1 };
      case 'armA': return { rx: -swing }; case 'armB': return { rx: swing };
      case 'spA': return { ry: swing * 0.35 }; case 'spB': return { ry: -swing * 0.35 };
      case 'fuse': return { rz: Math.sin(t * 3) * 0.25 };
      case 'wingL': return { rz: kind === 'bat' ? 0.25 + Math.sin(t * 1.6) * 0.6 : (moving ? 0.5 + Math.sin(t * 1.4) * 0.25 : 0.1) };
      case 'wingR': return { rz: kind === 'bat' ? -0.25 - Math.sin(t * 1.6) * 0.6 : -(moving ? 0.5 + Math.sin(t * 1.4) * 0.25 : 0.1) };
      default: return {};
    }
  }
  const rotYp = (p, a) => rotY(p, a);

  // c: criatura (x, dir, ph, moving, vy, yaw). by: y de pantalla donde están los pies. Devuelve nada; dibuja en ctx.
  function draw(ctx, c, cx, by) {
    const def = MOBS[c.name]; if (!def) return false;
    const want = (c.dir >= 0 ? 1 : -1) * (def.yaw || 1.0);
    c.yaw = c.yaw == null ? want : c.yaw + (want - c.yaw) * 0.18;
    const yaw = c.yaw, t = c.ph || 0; const SC = S * (def.sc || 1);
    const moving = !!c.moving || !!def.fly;
    // squash & stretch del cubo de gelatina según su salto
    const sq = c.name === 'jelly' ? (c.vy && c.y < -1 ? 1.12 : 0.92 + 0.05 * Math.sin(t)) : 1;
    const polys = [];
    let pidx = 0;
    const extra = [];
    if (c.name === 'px') {
      if (c.acc === 'hat') extra.push(P(0, 23.8, 0, 7.2, 1.5, 6.2, '#201a2b'), P(0, 25, 0, 4.8, 1.2, 4.8, '#3b2a55'));
      if (c.acc === 'bow') extra.push(P(-4.2, 22.8, 0, 2.2, 1.7, 1.5, '#c36bff'), P(-2.8, 22.8, 0, 2.2, 1.7, 1.5, '#c36bff'), P(-3.5, 22.8, 0.9, 1, 1.4, 0.8, '#f4d9ff'));
      if (c.acc === 'scarf') extra.push(P(0, 13.4, 0, 8.6, 2.2, 6.8, '#9b62dc'), P(2.4, 11.4, 3.35, 2, 3.8, 0.7, '#9b62dc'));
      if (c.acc === 'glasses') extra.push(P(-2.1, 18.2, 4.05, 3.1, 2.7, 0.22, '#191721', { flat: true }), P(2.1, 18.2, 4.05, 3.1, 2.7, 0.22, '#191721', { flat: true }), P(0, 18.2, 4.05, 1.3, 0.5, 0.2, '#191721', { flat: true }));
      if (c.acc === 'crown') extra.push(P(0, 24.1, 0, 6.5, 1.1, 4.5, '#e9b83f'), P(-2.2, 25.3, 0, 1.3, 1.8, 1.4, '#ffd96a'), P(0, 25.7, 0, 1.3, 2.4, 1.4, '#ffd96a'), P(2.2, 25.3, 0, 1.3, 1.8, 1.4, '#ffd96a'));
    }
    for (const part of def.parts.concat(extra)) {
      pidx++;
      const an = anim(part, t, moving, c.name); const br = part.rot || [0, 0, 0];
      const rot = (an.rx || an.ry || an.rz || br[0] || br[1] || br[2]) ? [(an.rx || 0) + br[0], (an.ry || 0) + br[1], (an.rz || 0) + br[2]] : null;
      const [w, h, d] = part.s; const hw = w / 2, hh = h / 2, hd = d / 2;
      const norms = FACES.map((f) => f.n);
      FACES.forEach((f, i) => {
        const pts = f.v.map(([vx, vy, vz]) => {
          let q = [part.p[0] + vx * hw, part.p[1] + vy * hh, part.p[2] + vz * hd];
          if (rot) { const pv = part.piv || part.p; q = [q[0] - pv[0], q[1] - pv[1], q[2] - pv[2]]; if (rot[2]) q = rotZ(q, rot[2]); if (rot[0]) q = rotX(q, rot[0]); if (rot[1]) q = rotYp(q, rot[1]); q = [q[0] + pv[0], q[1] + pv[1], q[2] + pv[2]]; }
          q[1] *= sq; q = rotY(q, yaw); if (c.name === 'px') q[0] *= 1.65;
          return { x: q[0], y: q[1], z: q[2] };
        });
        let n = norms[i]; if (rot) { if (rot[2]) n = rotZ(n, rot[2]); if (rot[0]) n = rotX(n, rot[0]); if (rot[1]) n = rotYp(n, rot[1]); }
        const nw = rotY(n, yaw);
        const facing = nw[2] * Math.cos(PITCH) + nw[1] * Math.sin(PITCH);
        if (facing <= 0.001) return;
        const lit = 0.6 + 0.4 * Math.max(0, nw[0] * LIGHT[0] + nw[1] * LIGHT[1] + nw[2] * LIGHT[2]);
        let depth = 0; pts.forEach((p) => { depth += p.z * Math.cos(PITCH) + p.y * Math.sin(PITCH); });
        polys.push({ pts, depth: depth / 4 + (part.alpha ? 0.3 : 0), lit, alpha: part.alpha || 1, part, fi: i, seed: pidx * 7 + i });
      });
    }
    polys.sort((a, b) => a.depth - b.depth);
    // sombra en el suelo
    ctx.save(); ctx.globalAlpha = c.name === 'bat' ? 0.18 : 0.28; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(cx, (c.fly ? c.groundY : by) + 1, def.fly ? 9 : (c.name === 'hen' ? 9 : 15), def.fly ? 3 : 5, 0, 0, 7); ctx.fill(); ctx.restore();
    ctx.save(); ctx.lineJoin = 'round'; ctx.imageSmoothingEnabled = false;
    const cp = Math.cos(PITCH), sp = Math.sin(PITCH);
    for (const f of polys) {
      const sc = f.pts.map((p) => [cx + p.x * SC, by - (p.y * cp - p.z * sp) * SC]);
      const tex = faceTex(f.part, f.fi, f.seed);
      const ux = sc[1][0] - sc[0][0], uy = sc[1][1] - sc[0][1], vx = sc[3][0] - sc[0][0], vy = sc[3][1] - sc[0][1];
      ctx.globalAlpha = f.alpha;
      ctx.save(); ctx.transform(ux / tex.width, uy / tex.width, vx / tex.height, vy / tex.height, sc[0][0], sc[0][1]);
      ctx.drawImage(tex, 0, 0); ctx.restore();
      ctx.beginPath(); sc.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
      if (f.lit < 1) { ctx.fillStyle = `rgba(8,10,28,${(1 - f.lit).toFixed(3)})`; ctx.fill(); }
      ctx.strokeStyle = 'rgba(10,12,30,0.42)'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
    return true;
  }
  window.NovaMob3D = { draw, names: Object.keys(MOBS), unit: S };
}());
