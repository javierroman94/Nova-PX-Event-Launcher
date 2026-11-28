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

  /* ---------- Pexy, la mascota oficial ----------
     Dos diseños con el mismo esqueleto (así los accesorios y las animaciones sirven para los dos):
     «rosa»: el panda rosa de bloques original de MegaDeker (@DekerModMaker).
     «sudadera»: panda blanco y negro con sudadera morada y la estrella nova en el pecho.
     Medidas en unidades de bloque; los pies están en y = 0 y la cara mira hacia +z. */
  const HEAD = { a: 'head', piv: [0, 13, 0] };
  const DESIGNS = {
    rosa: { lid: '#1b1024', head: '#d95bcf', face: '#f6f1ea', patch: '#a232a0', ear: '#d95bcf', earIn: '#a232a0', snout: '#f6f1ea', nose: '#d95bcf', body: '#d95bcf', belly: '#f6f1ea', arm: '#d95bcf', paw: '#ec82e0', leg: '#d95bcf', foot: '#a232a0' },
    sudadera: { lid: '#f4f1ed', head: '#f4f1ed', face: null, patch: '#1d1a24', ear: '#17151d', earIn: null, snout: '#ffffff', nose: '#17151d', body: '#713bb0', belly: null, arm: '#713bb0', paw: '#17151d', leg: '#17151d', foot: '#24212a', hoodie: true }
  };
  function pexyParts(design) {
    const d = DESIGNS[design] || DESIGNS.rosa; const h = (o) => Object.assign({}, HEAD, o || {});
    const parts = [
      // cuerpo y piernas
      P(0, 9, 0, 9, 8, 6, d.body),
      P(-2.3, 2.6, 0, 3.4, 5.2, 4, d.leg, { a: 'legA', piv: [-2.3, 5, 0] }), P(2.3, 2.6, 0, 3.4, 5.2, 4, d.leg, { a: 'legB', piv: [2.3, 5, 0] }),
      P(-2.3, 0.6, 0.5, 3.6, 1.2, 4.8, d.foot, { a: 'legA', piv: [-2.3, 5, 0] }), P(2.3, 0.6, 0.5, 3.6, 1.2, 4.8, d.foot, { a: 'legB', piv: [2.3, 5, 0] }),
      // brazos con patitas
      P(-5.8, 9.6, 0, 2.6, 7, 3, d.arm, { a: 'armA', piv: [-5.8, 12.6, 0] }), P(5.8, 9.6, 0, 2.6, 7, 3, d.arm, { a: 'armB', piv: [5.8, 12.6, 0] }),
      P(-5.8, 6.4, 0, 2.8, 1.6, 3.2, d.paw, { a: 'armA', piv: [-5.8, 12.6, 0] }), P(5.8, 6.4, 0, 2.8, 1.6, 3.2, d.paw, { a: 'armB', piv: [5.8, 12.6, 0] }),
      // cabeza
      P(0, 18, 0, 12, 10, 9, d.head, h()),
      P(-4.7, 23.6, -0.4, 3, 3, 2.6, d.ear, h()), P(4.7, 23.6, -0.4, 3, 3, 2.6, d.ear, h()),
      // ojos: manchas, ojos abiertos (blanco, pupila y brillo), cerrados y felices (^ ^)
      P(-2.6, 18.6, 4.6, 3.2, 3.4, 0.2, d.patch, h({ flat: true, bias: 0.15 })), P(2.6, 18.6, 4.6, 3.2, 3.4, 0.2, d.patch, h({ flat: true, bias: 0.15 })),
      P(-2.5, 18.5, 4.72, 2, 2.1, 0.14, '#ffffff', h({ flat: true, eye: 'open', bias: 0.6 })), P(2.5, 18.5, 4.72, 2, 2.1, 0.14, '#ffffff', h({ flat: true, eye: 'open', bias: 0.6 })),
      P(-2.4, 18.3, 4.8, 1.3, 1.5, 0.12, '#0b0a10', h({ flat: true, eye: 'open', bias: 0.75 })), P(2.4, 18.3, 4.8, 1.3, 1.5, 0.12, '#0b0a10', h({ flat: true, eye: 'open', bias: 0.75 })),
      P(-2.05, 18.85, 4.86, 0.55, 0.55, 0.1, '#ffffff', h({ flat: true, eye: 'open', bias: 0.9 })), P(2.75, 18.85, 4.86, 0.55, 0.55, 0.1, '#ffffff', h({ flat: true, eye: 'open', bias: 0.9 })),
      P(-2.5, 18.2, 4.78, 2.1, 0.4, 0.12, d.lid, h({ flat: true, eye: 'closed', bias: 0.8 })), P(2.5, 18.2, 4.78, 2.1, 0.4, 0.12, d.lid, h({ flat: true, eye: 'closed', bias: 0.8 })),
      P(-3, 18.4, 4.78, 1.2, 0.42, 0.12, d.lid, h({ flat: true, eye: 'happy', rot: [0, 0, 0.6], bias: 0.8 })), P(-2, 18.4, 4.78, 1.2, 0.42, 0.12, d.lid, h({ flat: true, eye: 'happy', rot: [0, 0, -0.6], bias: 0.8 })),
      P(2, 18.4, 4.78, 1.2, 0.42, 0.12, d.lid, h({ flat: true, eye: 'happy', rot: [0, 0, 0.6], bias: 0.8 })), P(3, 18.4, 4.78, 1.2, 0.42, 0.12, d.lid, h({ flat: true, eye: 'happy', rot: [0, 0, -0.6], bias: 0.8 })),
      // hocico, nariz y boca (cerrada o abierta para comer)
      P(0, 15.6, 4.9, 4.4, 2.6, 1.2, d.snout, h({ bias: 1.6 })),
      P(0, 16.4, 5.55, 1.5, 0.9, 0.14, d.nose, h({ flat: true, bias: 1.2 })),
      P(0, 15.1, 5.55, 1.4, 0.32, 0.12, '#1b1b24', h({ flat: true, mouth: 'closed', bias: 1.2 })),
      P(0, 14.9, 5.55, 1.6, 1.0, 0.12, '#4a1630', h({ flat: true, mouth: 'open', bias: 1.2 }))
    ];
    if (d.face) parts.push(P(0, 17.5, 4.55, 9.6, 7.6, 0.16, d.face, h({ flat: true, bias: -0.9 })));
    if (d.earIn) parts.push(P(-4.7, 23.6, 0.95, 1.6, 1.6, 0.14, d.earIn, h({ flat: true })), P(4.7, 23.6, 0.95, 1.6, 1.6, 0.14, d.earIn, h({ flat: true })));
    if (d.belly) parts.push(P(0, 8.6, 3.05, 5, 5.6, 0.16, d.belly, { flat: true }));
    if (d.hoodie) {
      parts.push(
        P(0, 13.4, -2.2, 10, 3.2, 4.6, '#5f2f9a'),                    // capucha bajada en la espalda
        P(0, 6.4, 3.05, 6.4, 2.4, 0.16, '#5f2f9a', { flat: true }),    // bolsillo
        // estrella nova de cuatro puntas (blanca)
        P(0, 10.2, 3.08, 0.9, 4.2, 0.14, '#ffffff', { flat: true }), P(0, 10.2, 3.08, 4.2, 0.9, 0.14, '#ffffff', { flat: true }),
        P(0, 10.2, 3.16, 1.5, 1.5, 0.12, '#ffffff', { flat: true, rot: [0, 0, 0.785] })
      );
    }
    return parts;
  }
  // Accesorios: van pegados a la cabeza (o al cuello) y sirven para los dos diseños.
  const ACC3D = {
    hat: [P(0, 23.4, 0, 12.4, 0.8, 10.4, '#201a2b', HEAD), P(0, 25.2, 0, 7.6, 3, 7, '#2a2140', HEAD), P(0, 24.1, 0, 7.8, 0.8, 7.2, '#8b5cf6', HEAD)],
    bow: [P(-3.3, 23.6, 1.6, 2.4, 1.8, 1.4, '#ff6fb5', HEAD), P(-0.9, 23.6, 1.6, 2.4, 1.8, 1.4, '#ff6fb5', HEAD), P(-2.1, 23.6, 2.0, 1, 1.2, 1, '#ffd1ea', HEAD)],
    scarf: [P(0, 13.4, 0, 10.2, 1.8, 7.2, '#e0457b'), P(2.8, 11.4, 3.7, 1.8, 3.4, 0.6, '#e0457b'), P(2.8, 9.9, 3.75, 1.8, 0.5, 0.62, '#ffd1ea')],
    glasses: [P(-2.5, 18.5, 5.0, 3.1, 2.5, 0.16, '#191721', Object.assign({ flat: true, bias: 1.4 }, HEAD)), P(2.5, 18.5, 5.0, 3.1, 2.5, 0.16, '#191721', Object.assign({ flat: true, bias: 1.4 }, HEAD)),
      P(0, 18.9, 5.0, 1.8, 0.45, 0.16, '#191721', Object.assign({ flat: true, bias: 1.4 }, HEAD)), P(-3.4, 19.3, 5.08, 0.7, 0.5, 0.1, '#6b6680', Object.assign({ flat: true, bias: 1.4 }, HEAD)), P(1.6, 19.3, 5.08, 0.7, 0.5, 0.1, '#6b6680', Object.assign({ flat: true, bias: 1.4 }, HEAD))],
    crown: [P(0, 23.6, 0, 7.4, 1.2, 5.4, '#e9b83f', HEAD), P(-2.6, 24.9, 0, 1.3, 1.8, 1.4, '#ffd96a', HEAD), P(0, 25.3, 0, 1.3, 2.6, 1.4, '#ffd96a', HEAD), P(2.6, 24.9, 0, 1.3, 1.8, 1.4, '#ffd96a', HEAD), P(0, 25.3, 0.75, 0.7, 0.7, 0.1, '#e8334a', Object.assign({ flat: true }, HEAD))]
  };
  MOBS.px = { h: 26, sc: 1, yaw: 0.32, parts: pexyParts('rosa'), pexy: true };
  const PEXY_CACHE = { rosa: MOBS.px.parts, sudadera: pexyParts('sudadera') };

  /* Poses de Pexy. Devuelve rotaciones por grupo (head, armA, armB, legA, legB), inclinación de todo el cuerpo,
     rebote vertical, estado de ojos y boca. t es la fase de animación; secs, el reloj para parpadear. */
  const ACTS = ['idle', 'walk', 'run', 'jump', 'dance', 'sleep', 'eat', 'celebrate', 'pet', 'hungry', 'tired', 'sad', 'happy', 'held'];
  function pose(act, t, secs, still) {
    const sn = (k, f) => (still ? 0 : Math.sin(t * f) * k);
    const blink = !still && (secs % 4.2) < 0.13;
    const o = { head: {}, armA: {}, armB: {}, legA: {}, legB: {}, lean: 0, roll: 0, bob: 0, eyes: blink ? 'closed' : 'open', mouth: 'closed', fx: '' };
    switch (act) {
      case 'walk':
        o.legA.rx = sn(0.6, 1); o.legB.rx = -o.legA.rx; o.armA.rx = -o.legA.rx * 0.8; o.armB.rx = o.legA.rx * 0.8;
        o.bob = Math.abs(sn(0.35, 1)); o.head.rx = sn(0.05, 2); break;
      case 'run':
        o.legA.rx = sn(1.0, 1.8); o.legB.rx = -o.legA.rx; o.armA.rx = -o.legA.rx * 1.1; o.armB.rx = o.legA.rx * 1.1;
        o.lean = 0.16; o.bob = Math.abs(sn(0.7, 1.8)); break;
      case 'jump': case 'held':
        o.armA.rx = -2.5; o.armB.rx = -2.5; o.armA.rz = -0.25; o.armB.rz = 0.25;
        o.legA.rx = act === 'held' ? sn(0.5, 2.4) : 0.35; o.legB.rx = act === 'held' ? -sn(0.5, 2.4) : 0.15;
        o.eyes = 'happy'; o.mouth = 'open'; break;
      case 'dance':
        o.armA.rx = -2.2 + sn(0.6, 2); o.armB.rx = -2.2 - sn(0.6, 2); o.roll = sn(0.14, 1); o.head.rz = sn(0.18, 1);
        o.legA.rx = sn(0.35, 2); o.legB.rx = -o.legA.rx; o.bob = Math.abs(sn(0.6, 2)); o.eyes = 'happy'; break;
      case 'sleep':
        o.head.rx = 0.32; o.head.rz = 0.12; o.armA.rx = 0.1; o.armB.rx = 0.1; o.bob = -0.6 + sn(0.18, 0.35);
        o.eyes = 'closed'; o.fx = 'zzz'; break;
      case 'eat': {
        const k = still ? 0.5 : (Math.sin(t * 2.2) + 1) / 2;
        o.armA.rx = -1.5 - k * 0.5; o.armA.rz = 0.45; o.armB.rx = -1.3 - (1 - k) * 0.5; o.armB.rz = -0.45;
        o.head.rx = sn(0.08, 4.4); o.mouth = k > 0.5 ? 'open' : 'closed'; o.eyes = 'happy'; o.fx = 'food'; break;
      }
      case 'celebrate':
        o.armA.rx = -2.8 + sn(0.4, 3); o.armB.rx = -2.8 - sn(0.4, 3); o.armA.rz = -0.3; o.armB.rz = 0.3;
        o.bob = Math.abs(sn(2.2, 1.6)); o.eyes = 'happy'; o.mouth = 'open'; o.fx = 'stars'; break;
      case 'pet':
        o.head.rz = 0.22 + sn(0.06, 1.5); o.head.rx = -0.06; o.roll = sn(0.05, 1.5); o.eyes = 'happy'; o.fx = 'hearts'; break;
      case 'hungry':
        o.armA.rx = -0.7; o.armA.rz = 0.6; o.armB.rx = -0.7; o.armB.rz = -0.6; o.head.rx = 0.18; o.mouth = 'open'; o.bob = sn(0.1, 0.6); break;
      case 'tired':
        o.head.rx = 0.22 + sn(0.08, 0.5); o.roll = sn(0.06, 0.5); o.eyes = (secs % 3) < 1.6 ? 'closed' : 'open'; o.bob = -0.2; break;
      case 'sad':
        o.head.rx = 0.3; o.armA.rz = 0.08; o.armB.rz = -0.08; o.bob = -0.25; o.fx = 'sad'; break;
      case 'happy':
        o.armA.rz = -0.35 + sn(0.15, 2); o.armB.rz = 0.35 - sn(0.15, 2); o.bob = Math.abs(sn(0.5, 2)); o.head.rz = sn(0.08, 1); o.eyes = blink ? 'closed' : 'happy'; break;
      default: // idle: respira y parpadea
        o.bob = sn(0.22, 0.8); o.head.rx = sn(0.04, 0.4); o.armA.rz = sn(0.04, 0.8); o.armB.rz = -sn(0.04, 0.8);
    }
    return o;
  }

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
    const yaw = c.yaw, t = c.ph || 0; const SC = S * (def.sc || 1) * (c.scale > 0 ? c.scale : 1);
    const moving = !!c.moving || !!def.fly;
    // squash & stretch del cubo de gelatina según su salto
    const sq = c.name === 'jelly' ? (c.vy && c.y < -1 ? 1.12 : 0.92 + 0.05 * Math.sin(t)) : 1;
    const polys = [];
    let pidx = 0;
    const isPx = !!def.pexy;
    const ps = isPx ? pose(ACTS.includes(c.act) ? c.act : (moving ? 'walk' : 'idle'), c.still ? 0 : t, c.still ? 1 : (c.secs != null ? c.secs : t / 2), !!c.still) : null;
    let parts = def.parts;
    if (isPx) {
      parts = (PEXY_CACHE[c.design] || PEXY_CACHE.rosa).filter((pt) => (!pt.eye || pt.eye === ps.eyes) && (!pt.mouth || pt.mouth === ps.mouth));
      if (c.acc && ACC3D[c.acc]) parts = parts.concat(ACC3D[c.acc]);
    }
    const lean = isPx ? ps.lean : 0, roll = isPx ? ps.roll : 0, bob = isPx ? ps.bob : 0;
    for (const part of parts) {
      pidx++;
      const an = isPx ? (ps[part.a] || {}) : anim(part, t, moving, c.name); const br = part.rot || [0, 0, 0];
      const rot = (an.rx || an.ry || an.rz || br[0] || br[1] || br[2]) ? [(an.rx || 0) + br[0], (an.ry || 0) + br[1], (an.rz || 0) + br[2]] : null;
      const [w, h, d] = part.s; const hw = w / 2, hh = h / 2, hd = d / 2;
      const norms = FACES.map((f) => f.n);
      FACES.forEach((f, i) => {
        const pts = f.v.map(([vx, vy, vz]) => {
          let q = [part.p[0] + vx * hw, part.p[1] + vy * hh, part.p[2] + vz * hd];
          if (rot) {
            // giro estático de la pieza (rot) alrededor de su centro y animación alrededor de su pivote
            if (br[0] || br[1] || br[2]) { const pc = part.p; q = [q[0] - pc[0], q[1] - pc[1], q[2] - pc[2]]; if (br[2]) q = rotZ(q, br[2]); if (br[0]) q = rotX(q, br[0]); if (br[1]) q = rotYp(q, br[1]); q = [q[0] + pc[0], q[1] + pc[1], q[2] + pc[2]]; }
            const ar = [an.rx || 0, an.ry || 0, an.rz || 0];
            if (ar[0] || ar[1] || ar[2]) { const pv = part.piv || part.p; q = [q[0] - pv[0], q[1] - pv[1], q[2] - pv[2]]; if (ar[2]) q = rotZ(q, ar[2]); if (ar[0]) q = rotX(q, ar[0]); if (ar[1]) q = rotYp(q, ar[1]); q = [q[0] + pv[0], q[1] + pv[1], q[2] + pv[2]]; }
          }
          if (lean) q = rotX(q, lean);
          if (roll) q = rotZ(q, roll);
          q[1] = q[1] * sq + bob; q = rotY(q, yaw);
          return { x: q[0], y: q[1], z: q[2] };
        });
        let n = norms[i];
        if (rot) { if (rot[2]) n = rotZ(n, rot[2]); if (rot[0]) n = rotX(n, rot[0]); if (rot[1]) n = rotYp(n, rot[1]); }
        if (lean) n = rotX(n, lean);
        if (roll) n = rotZ(n, roll);
        const nw = rotY(n, yaw);
        const facing = nw[2] * Math.cos(PITCH) + nw[1] * Math.sin(PITCH);
        if (facing <= 0.001) return;
        const lit = 0.6 + 0.4 * Math.max(0, nw[0] * LIGHT[0] + nw[1] * LIGHT[1] + nw[2] * LIGHT[2]);
        let depth = 0; pts.forEach((p) => { depth += p.z * Math.cos(PITCH) + p.y * Math.sin(PITCH); });
        polys.push({ pts, depth: depth / 4 + (part.alpha ? 0.3 : 0) + (part.flat ? 1.2 : 0) + (part.bias || 0), lit, alpha: part.alpha || 1, part, fi: i, seed: pidx * 7 + i });
      });
    }
    polys.sort((a, b) => a.depth - b.depth);
    // sombra en el suelo
    ctx.save(); ctx.globalAlpha = c.name === 'bat' ? 0.18 : 0.28; ctx.fillStyle = '#000';
    const shW = def.pexy ? 9 * SC / S : (def.fly ? 9 : (c.name === 'hen' ? 9 : 15)), shH = def.pexy ? 2.6 * SC / S : (def.fly ? 3 : 5);
    ctx.beginPath(); ctx.ellipse(cx, (c.fly ? c.groundY : by) + 1, shW, shH, 0, 0, 7); ctx.fill(); ctx.restore();
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
    if (isPx && ps.fx) drawFx(ctx, ps.fx, cx, by - (def.h + 1) * SC, SC, c.still ? 0 : t);
    return true;
  }
  // Efectos sobre la cabeza: zzz al dormir, corazones con caricias, estrellas al celebrar, comida y nubecita triste.
  function drawFx(ctx, fx, x, y, SC, t) {
    const em = { zzz: ['💤'], hearts: ['💗', '💜'], stars: ['✨', '⭐'], food: ['🎋'], sad: ['💧'] }[fx]; if (!em) return;
    ctx.save(); ctx.textAlign = 'center'; ctx.font = Math.round(SC * 3.2) + 'px serif';
    em.forEach((e, i) => { const k = (t * 0.6 + i * 0.5) % 1; ctx.globalAlpha = 1 - k * 0.7; ctx.fillText(e, x + (i ? 1 : -1) * SC * (2.5 + i), y - k * SC * 4); });
    ctx.restore();
  }
  window.NovaMob3D = { draw, names: Object.keys(MOBS), unit: S, acts: ACTS.slice(), designs: Object.keys(DESIGNS), accessories: Object.keys(ACC3D), pose };
}());
