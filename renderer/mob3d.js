/* Mobs 3D de bloques (diseños propios) para acompañar a Pexy. Mini motor 3D en canvas 2D: cajas con sombreado plano,
   vista isométrica suave, caminan, giran hacia donde van y se mueven con animación de patas, alas y saltos. Sin librerías. */
(function () {
  const S = 4;               // píxeles por unidad de bloque
  const PITCH = 0.42;        // inclinación de la cámara (mira un poco desde arriba)
  const LIGHT = (() => { const v = [-0.45, 0.8, 0.5]; const l = Math.hypot(...v); return v.map((n) => n / l); })();
  const P = (x, y, z, w, h, d, c, o) => Object.assign({ p: [x, y, z], s: [w, h, d], c }, o || {});
  const eye = (x, y, z) => P(x, y, z, 1, 1, 0.2, '#15151d');

  const MOBS = {
    pig: { h: 10, parts: [
      P(0, 5.5, 0, 6, 5, 9, '#f2a0b8'), P(0, 6.5, 5.5, 5, 5, 5, '#f6b0c4', { a: 'head', piv: [0, 6.5, 3] }),
      P(0, 5.6, 8.2, 3, 2, 1, '#e07f9c', { a: 'head', piv: [0, 6.5, 3] }), eye(-1.5, 7.6, 8.05), eye(1.5, 7.6, 8.05),
      ...[[-2, 3], [2, 3], [-2, -3], [2, -3]].map(([x, z], i) => P(x, 1.5, z, 2, 3, 2, '#e58aa6', { a: i % 3 === 0 ? 'legA' : 'legB', piv: [x, 3, z] }))] },
    sheep: { h: 11, parts: [
      P(0, 6, 0, 7, 6, 9, '#f4f0e8'), P(0, 9.4, 3.2, 5, 1.2, 5.5, '#ffffff'), P(0, 7.2, 5.6, 4, 4, 4, '#d9c7b0', { a: 'head', piv: [0, 7, 3] }),
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
    bat: { h: 6, fly: true, parts: [
      P(0, 1.5, 0, 3, 3, 3, '#2d2b3c'), P(-1, 3.4, 0, 1, 1, 1, '#2d2b3c'), P(1, 3.4, 0, 1, 1, 1, '#2d2b3c'),
      P(-0.8, 2, 1.55, 0.8, 0.8, 0.2, '#ff3b3b'), P(0.8, 2, 1.55, 0.8, 0.8, 0.2, '#ff3b3b'),
      P(-3.5, 2, 0, 5, 0.6, 3, '#3a3750', { a: 'wingL', piv: [-1.5, 2, 0] }), P(3.5, 2, 0, 5, 0.6, 3, '#3a3750', { a: 'wingR', piv: [1.5, 2, 0] })] }
  };

  const FACES = [
    { n: [0, 0, 1], v: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] }, { n: [0, 0, -1], v: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
    { n: [1, 0, 0], v: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] }, { n: [-1, 0, 0], v: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
    { n: [0, 1, 0], v: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] }, { n: [0, -1, 0], v: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] }
  ];
  const rotX = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]; };
  const rotZ = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]]; };
  const rotY = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; };
  const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.max(0, Math.min(255, Math.round(v * k))); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };

  function anim(part, t, moving, kind) {
    const swing = moving ? Math.sin(t) * 0.75 : 0;
    switch (part.a) {
      case 'legA': return { rx: swing }; case 'legB': return { rx: -swing };
      case 'head': return { rx: Math.sin(t * 0.5) * (moving ? 0.1 : 0.05) };
      case 'wingL': return { rz: kind === 'bat' ? 0.25 + Math.sin(t * 1.6) * 0.6 : (moving ? 0.5 + Math.sin(t * 1.4) * 0.25 : 0.1) };
      case 'wingR': return { rz: kind === 'bat' ? -0.25 - Math.sin(t * 1.6) * 0.6 : -(moving ? 0.5 + Math.sin(t * 1.4) * 0.25 : 0.1) };
      default: return {};
    }
  }

  // c: criatura (x, dir, ph, moving, vy, yaw). by: y de pantalla donde están los pies. Devuelve nada; dibuja en ctx.
  function draw(ctx, c, cx, by) {
    const def = MOBS[c.name]; if (!def) return false;
    const want = (c.dir >= 0 ? 1 : -1) * 1.0;
    c.yaw = c.yaw == null ? want : c.yaw + (want - c.yaw) * 0.18;
    const yaw = c.yaw, t = c.ph || 0;
    const moving = !!c.moving || !!def.fly;
    // squash & stretch del cubo de gelatina según su salto
    const sq = c.name === 'jelly' ? (c.vy && c.y < -1 ? 1.12 : 0.92 + 0.05 * Math.sin(t)) : 1;
    const polys = [];
    for (const part of def.parts) {
      const an = anim(part, t, moving, c.name);
      const [w, h, d] = part.s; const hw = w / 2, hh = h / 2, hd = d / 2;
      const norms = FACES.map((f) => f.n);
      FACES.forEach((f, i) => {
        const pts = f.v.map(([vx, vy, vz]) => {
          let q = [part.p[0] + vx * hw, part.p[1] + vy * hh, part.p[2] + vz * hd];
          if (part.piv && (an.rx || an.rz)) { q = [q[0] - part.piv[0], q[1] - part.piv[1], q[2] - part.piv[2]]; if (an.rx) q = rotX(q, an.rx); if (an.rz) q = rotZ(q, an.rz); q = [q[0] + part.piv[0], q[1] + part.piv[1], q[2] + part.piv[2]]; }
          q[1] *= sq; q = rotY(q, yaw);
          return { x: q[0], y: q[1], z: q[2] };
        });
        let n = norms[i]; if (part.piv && (an.rx || an.rz)) { if (an.rx) n = rotX(n, an.rx); if (an.rz) n = rotZ(n, an.rz); }
        const nw = rotY(n, yaw);
        const facing = nw[2] * Math.cos(PITCH) + nw[1] * Math.sin(PITCH);
        if (facing <= 0.001) return;
        const lit = 0.52 + 0.48 * Math.max(0, nw[0] * LIGHT[0] + nw[1] * LIGHT[1] + nw[2] * LIGHT[2]);
        let depth = 0; pts.forEach((p) => { depth += p.z * Math.cos(PITCH) + p.y * Math.sin(PITCH); });
        polys.push({ pts, depth: depth / 4 + (part.alpha ? 0.3 : 0), col: shade(part.c, lit), alpha: part.alpha || 1 });
      });
    }
    polys.sort((a, b) => a.depth - b.depth);
    // sombra en el suelo
    const lift = c.name === 'bat' ? 0 : 0;
    ctx.save(); ctx.globalAlpha = c.name === 'bat' ? 0.18 : 0.28; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(cx, (c.fly ? c.groundY : by) + 1, def.fly ? 9 : (c.name === 'hen' ? 9 : 15), def.fly ? 3 : 5, 0, 0, 7); ctx.fill(); ctx.restore();
    ctx.save(); ctx.lineJoin = 'round';
    for (const f of polys) {
      ctx.globalAlpha = f.alpha; ctx.fillStyle = f.col; ctx.strokeStyle = f.col; ctx.lineWidth = 0.6;
      ctx.beginPath();
      f.pts.forEach((p, i) => { const X = cx + p.x * S, Y = by - lift - (p.y * Math.cos(PITCH) - p.z * Math.sin(PITCH)) * S; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); });
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
    return true;
  }
  window.NovaMob3D = { draw, names: Object.keys(MOBS), unit: S };
}());
