/*
 * Visor 3D de skins con WebGL puro (sin librerías). Muestra el muñeco de Minecraft con su skin,
 * se gira arrastrando y hace animaciones: caminar, saludar, picar un bloque, saltar y girar.
 * Si WebGL no está disponible, create() devuelve null y la interfaz usa la vista 2D.
 */
(function () {
  /* ---------- matemáticas mínimas (matrices 4x4 en columnas) ---------- */
  const I = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  function mul(a, b) {
    const o = new Array(16);
    for (let c = 0; c < 4; c++)
      for (let r = 0; r < 4; r++)
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  }
  const T = (x, y, z) => { const m = I(); m[12] = x; m[13] = y; m[14] = z; return m; };
  const S = (x, y, z) => { const m = I(); m[0] = x; m[5] = y; m[10] = z; return m; };
  const RX = (a) => { const m = I(), c = Math.cos(a), s = Math.sin(a); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; };
  const RY = (a) => { const m = I(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; };
  const RZ = (a) => { const m = I(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; };
  function persp(fovy, aspect, n, f) {
    const t = 1 / Math.tan(fovy / 2), m = new Array(16).fill(0);
    m[0] = t / aspect; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = (2 * f * n) / (n - f);
    return m;
  }

  /* ---------- mallas ---------- */
  const SHADE = { front: 0.92, back: 0.8, right: 0.78, left: 0.86, top: 1, bottom: 0.55 };

  function boxRects(u, v, w, h, d) {
    return {
      right: [u, v + d, d, h], front: [u + d, v + d, w, h], left: [u + d + w, v + d, d, h],
      back: [u + 2 * d + w, v + d, w, h], top: [u + d, v, w, d], bottom: [u + d + w, v, w, d]
    };
  }

  // Devuelve { verts, idx }: posición(3) + uv(2) + sombra(1) por vértice.
  function buildBox(hx, hy, hz, rects, tw, th, mirror) {
    const faces = {
      front: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]],
      back: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]],
      right: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]],
      left: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]],
      top: [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]],
      bottom: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]]
    };
    const verts = [];
    const idx = [];
    let n = 0;
    for (const name of Object.keys(faces)) {
      let src = name;
      if (mirror && name === 'right') src = 'left';
      else if (mirror && name === 'left') src = 'right';
      const [x, y, w, h] = rects[src];
      let u0 = x / tw, u1 = (x + w) / tw;
      const v0 = y / th, v1 = (y + h) / th;
      if (mirror) [u0, u1] = [u1, u0];
      const uv = [[u0, v1], [u1, v1], [u1, v0], [u0, v0]];
      faces[name].forEach((p, i) => verts.push(p[0], p[1], p[2], uv[i][0], uv[i][1], SHADE[name]));
      idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
      n += 4;
    }
    return { verts: new Float32Array(verts), idx: new Uint16Array(idx) };
  }

  /* ---------- texturas generadas (bloque y skin por defecto) ---------- */
  function rng(seed) { let s = seed; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

  function blockAtlas() {
    const c = document.createElement('canvas');
    c.width = 48; c.height = 16;
    const x = c.getContext('2d');
    const r = rng(7);
    for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) {
      const n = (r() - 0.5) * 26;
      const grass = j < 4 || (j === 4 && r() < 0.5);
      x.fillStyle = grass ? `rgb(${86 + n | 0},${160 + n | 0},${60 + n | 0})` : `rgb(${134 + n | 0},${96 + n | 0},${60 + n | 0})`;
      x.fillRect(i, j, 1, 1);
      x.fillStyle = `rgb(${90 + n | 0},${166 + n | 0},${64 + n | 0})`;
      x.fillRect(16 + i, j, 1, 1);
    }
    x.fillStyle = 'rgba(0,0,0,0.38)';
    x.fillRect(32, 0, 16, 16);
    return c;
  }

  function defaultSkin() {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const x = c.getContext('2d');
    const fill = (col, a, b, w, h) => { x.fillStyle = col; x.fillRect(a, b, w, h); };
    fill('#b98a68', 0, 0, 32, 16);            // cabeza
    fill('#4a3222', 8, 0, 16, 8);             // pelo arriba y abajo
    fill('#4a3222', 0, 8, 32, 3);             // pelo alrededor
    fill('#ffffff', 10, 12, 2, 1); fill('#ffffff', 14, 12, 2, 1);
    fill('#4b3fb8', 11, 12, 1, 1); fill('#4b3fb8', 14, 12, 1, 1);
    fill('#7a4a3a', 11, 14, 4, 1);
    fill('#2fb0b0', 16, 16, 24, 16);          // camiseta
    fill('#b98a68', 40, 16, 16, 16);          // brazos
    fill('#2fb0b0', 40, 16, 16, 4);
    fill('#3d3db0', 0, 16, 16, 16);           // piernas
    fill('#b98a68', 32, 48, 16, 16);
    fill('#2fb0b0', 32, 48, 16, 4);
    fill('#3d3db0', 16, 48, 16, 16);
    return c;
  }

  /* ---------- animaciones ---------- */
  // Cada estado devuelve el ángulo objetivo de cada parte (radianes). t = segundos dentro del estado.
  const STATES = [
    { name: 'idle', len: 2.2 },
    { name: 'walk', len: 3.6 },
    { name: 'wave', len: 2.6 },
    { name: 'mine', len: 4.4 },
    { name: 'jump', len: 2.4 },
    { name: 'spin', len: 3.0 }
  ];

  function targetPose(name, t) {
    const p = { cape: 0.08, headY: 0, headX: 0, rax: 0, raz: 0, lax: 0, laz: 0, rlx: 0, llx: 0, twist: 0, bob: 0, spin: 0 };
    switch (name) {
      case 'idle':
        p.rax = Math.sin(t * 2.2) * 0.12; p.lax = -p.rax;
        p.raz = -0.04; p.laz = 0.04;
        p.headY = Math.sin(t * 1.4) * 0.6; p.headX = Math.sin(t * 2.0) * 0.1;
        p.bob = Math.abs(Math.sin(t * 3.0)) * 0.5;
        break;
      case 'walk': {
        const s = Math.sin(t * 6.5);
        p.rlx = s * 0.75; p.llx = -s * 0.75; p.rax = -s * 0.6; p.lax = s * 0.6;
        p.bob = Math.abs(Math.cos(t * 6.5)) * 0.6;
        p.headY = Math.sin(t * 1.2) * 0.2;
        p.cape = 0.18 + Math.abs(Math.sin(t * 6.5)) * 0.3;
        break;
      }
      case 'wave':
        p.raz = -2.55 + Math.sin(t * 11) * 0.28;
        p.rax = 0; p.lax = 0.05; p.laz = 0.05;
        p.headY = -0.25; p.headX = -0.1; p.bob = Math.sin(t * 3) * 0.2;
        break;
      case 'mine': {
        const s = Math.sin(t * 9);
        p.rax = -0.9 + 0.9 * s;
        p.lax = 0.1;
        p.twist = -0.25 + s * -0.12;
        p.headX = 0.25; p.headY = 0;
        p.rlx = -0.12; p.llx = 0.12;
        p.bob = Math.max(0, -s) * -0.2;
        break;
      }
      case 'jump': {
        const k = (t % 1.2) / 1.2;
        const h = Math.sin(Math.min(1, k * 1.4) * Math.PI);
        p.bob = h * 7;
        p.cape = 0.1 + h * 0.6;
        p.raz = -2.5 * (0.2 + h * 0.8); p.laz = 2.5 * (0.2 + h * 0.8);
        p.rlx = -0.3 * h; p.llx = 0.3 * h;
        p.headX = -0.2 * h;
        break;
      }
      case 'spin':
        p.spin = (t / 3.0) * Math.PI * 2;
        p.cape = 0.45;
        p.raz = -0.9; p.laz = 0.9;
        p.rax = Math.sin(t * 5) * 0.3; p.lax = -p.rax;
        p.bob = Math.abs(Math.sin(t * 4)) * 0.8;
        break;
    }
    return p;
  }

  /* ---------- visor ---------- */
  const VS = `attribute vec3 p;attribute vec2 uv;attribute float sh;uniform mat4 m;varying vec2 v_uv;varying float v_sh;
void main(){gl_Position=m*vec4(p,1.0);v_uv=uv;v_sh=sh;}`;
  const FS = `precision mediump float;uniform sampler2D tex;uniform float cut;uniform float light;varying vec2 v_uv;varying float v_sh;
void main(){vec4 c=texture2D(tex,v_uv);if(c.a<cut)discard;gl_FragColor=vec4(c.rgb*mix(1.0,v_sh,light),c.a);}`;

  function create(canvas, opts = {}) {
    const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false });
    if (!gl) return null;

    function compile(type, src) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      return sh;
    }
    let prog;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
    } catch {
      return null;
    }
    gl.useProgram(prog);
    const loc = {
      p: gl.getAttribLocation(prog, 'p'), uv: gl.getAttribLocation(prog, 'uv'), sh: gl.getAttribLocation(prog, 'sh'),
      m: gl.getUniformLocation(prog, 'm'), cut: gl.getUniformLocation(prog, 'cut'), light: gl.getUniformLocation(prog, 'light')
    };
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    function makeTexture(source) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return tex;
    }
    function makeMesh(box) {
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, box.verts, gl.STATIC_DRAW);
      const ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, box.idx, gl.STATIC_DRAW);
      return { vbo, ibo, count: box.idx.length };
    }
    function drawMesh(mesh, tex, matrix, cut, light) {
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
      gl.enableVertexAttribArray(loc.p); gl.vertexAttribPointer(loc.p, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(loc.uv); gl.vertexAttribPointer(loc.uv, 2, gl.FLOAT, false, 24, 12);
      gl.enableVertexAttribArray(loc.sh); gl.vertexAttribPointer(loc.sh, 1, gl.FLOAT, false, 24, 20);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniformMatrix4fv(loc.m, false, new Float32Array(matrix));
      gl.uniform1f(loc.cut, cut);
      gl.uniform1f(loc.light, light);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    }

    // escenario: bloque, partículas y sombra (todo del atlas)
    const atlas = makeTexture(blockAtlas());
    const tile = (i) => [i * 16, 0, 16, 16];
    const blockMesh = makeMesh(buildBox(0.5, 0.5, 0.5, { front: tile(0), back: tile(0), left: tile(0), right: tile(0), top: tile(1), bottom: tile(0) }, 48, 16, false));
    const shadowMesh = makeMesh(buildBox(7, 0.05, 7, { front: tile(2), back: tile(2), left: tile(2), right: tile(2), top: tile(2), bottom: tile(2) }, 48, 16, false));

    let skinTex = null;
    let capeTex = null;
    let capeMesh = null;
    let parts = [];
    let slim = false;

    function setSkin(img, isSlim) {
      slim = !!isSlim;
      let source = img || defaultSkin();
      let tex;
      try {
        tex = makeTexture(source);
      } catch {
        source = defaultSkin();
        tex = makeTexture(source);
      }
      if (skinTex) gl.deleteTexture(skinTex);
      skinTex = tex;
      // Las coordenadas se calculan sobre 64 de ancho: así también sirven skins HD (128x128, etc.).
      const tw = 64;
      const th = ((source.height || 64) * 64) / (source.width || 64);
      const legacy = Math.round(th) === 32;
      const aw = slim ? 3 : 4;
      const spec = [
        { id: 'head', size: [8, 8, 8], center: [0, 28, 0], pivot: [0, 24, 0], base: [0, 0], over: [32, 0], inf: 0.5 },
        { id: 'body', size: [8, 12, 4], center: [0, 18, 0], pivot: [0, 18, 0], base: [16, 16], over: [16, 32], inf: 0.25 },
        { id: 'rArm', size: [aw, 12, 4], center: [-(4 + aw / 2), 18, 0], pivot: [-(4 + aw / 2), 24, 0], base: [40, 16], over: [40, 32], inf: 0.25 },
        { id: 'lArm', size: [aw, 12, 4], center: [4 + aw / 2, 18, 0], pivot: [4 + aw / 2, 24, 0], base: legacy ? [40, 16] : [32, 48], over: [48, 48], inf: 0.25, mirror: legacy },
        { id: 'rLeg', size: [4, 12, 4], center: [-2, 6, 0], pivot: [-2, 12, 0], base: [0, 16], over: [0, 32], inf: 0.25 },
        { id: 'lLeg', size: [4, 12, 4], center: [2, 6, 0], pivot: [2, 12, 0], base: legacy ? [0, 16] : [16, 48], over: [0, 48], inf: 0.25, mirror: legacy }
      ];
      parts.forEach((p) => { if (p.baseMesh) gl.deleteBuffer(p.baseMesh.vbo); if (p.overMesh) gl.deleteBuffer(p.overMesh.vbo); });
      parts = spec.map((s) => {
        const [w, h, d] = s.size;
        const base = makeMesh(buildBox(w / 2, h / 2, d / 2, boxRects(s.base[0], s.base[1], w, h, d), tw, th, !!s.mirror));
        const hasOverlay = !legacy || s.id === 'head';
        const over = hasOverlay
          ? makeMesh(buildBox(w / 2 + s.inf, h / 2 + s.inf, d / 2 + s.inf, boxRects(s.over[0], s.over[1], w, h, d), tw, th, false))
          : null;
        return { id: s.id, center: s.center, pivot: s.pivot, baseMesh: base, overMesh: over };
      });
      requestDraw();
    }

    // La capa es una caja de 10x16x1 colgada de la espalda. Su cara exterior (la que se ve) está en x=1, y=1.
    function setCape(img) {
      if (capeTex) { gl.deleteTexture(capeTex); capeTex = null; }
      if (!img) { requestDraw(); return; }
      try {
        capeTex = makeTexture(img);
      } catch {
        capeTex = null;
        return;
      }
      if (!capeMesh) {
        const r = boxRects(0, 0, 10, 16, 1);
        // la cara exterior de la capa mira hacia atrás (-z): usa el rectángulo "frente" de la textura
        const swapped = { ...r, back: r.front, front: r.back, left: r.right, right: r.left };
        capeMesh = makeMesh(buildBox(5, 8, 0.5, swapped, 64, 32, false));
      }
      requestDraw();
    }

    /* ---------- estado de la animación ---------- */
    const pose = targetPose('idle', 0);
    let stateIdx = 2; // al abrir, el muñeco saluda
    let stateT = 0;
    let override = null; // { name, t, len } al hacer clic
    let yawUser = 0;
    let lastDrag = 0;
    let dragging = false;
    let moved = 0;
    let lastX = 0;
    let animated = opts.animated !== false;
    let blockScale = 0;
    let particles = [];
    let lastHitPhase = 0;
    let raf = 0;
    let lastT = 0;
    let clock = 0;
    let alive = true;

    function visible() {
      return alive && !document.hidden && canvas.offsetParent !== null;
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    function update(dt) {
      let cur = STATES[stateIdx];
      let name = cur.name;
      let t = stateT;
      if (override) { name = override.name; t = override.t; }
      const target = targetPose(name, t);
      const k = 1 - Math.exp(-dt * 14);
      for (const key of Object.keys(pose)) {
        if (key === 'spin') pose.spin = target.spin;
        else pose[key] += (target[key] - pose[key]) * k;
      }
      if (animated) {
        if (override) {
          override.t += dt;
          if (override.t >= override.len) override = null;
        } else {
          stateT += dt;
          if (stateT >= cur.len) { stateT = 0; stateIdx = (stateIdx + 1) % STATES.length; }
        }
      }
      // bloque y partículas durante "mine"
      const mining = name === 'mine';
      blockScale += ((mining ? 1 : 0) - blockScale) * (1 - Math.exp(-dt * 9));
      if (mining) {
        const phase = Math.floor((t * 9 + Math.PI / 2) / (Math.PI * 2));
        if (phase !== lastHitPhase) {
          lastHitPhase = phase;
          for (let i = 0; i < 5; i++) {
            particles.push({
              x: (Math.random() - 0.5) * 6, y: 6 + Math.random() * 4, z: 14 + Math.random() * 3,
              vx: (Math.random() - 0.5) * 26, vy: 18 + Math.random() * 20, vz: 8 + Math.random() * 16,
              life: 0.9, rx: Math.random() * 6, ry: Math.random() * 6
            });
          }
        }
      } else lastHitPhase = 0;
      particles = particles.filter((p) => {
        p.life -= dt;
        p.vy -= 70 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.rx += dt * 5; p.ry += dt * 6;
        return p.life > 0 && p.y > -1;
      });
      if (!dragging && performance.now() - lastDrag > 2500) yawUser *= Math.exp(-dt * 1.6);
    }

    function draw() {
      resize();
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (!skinTex) return;
      const aspect = canvas.width / canvas.height;
      const proj = persp((28 * Math.PI) / 180, aspect, 10, 400);
      const dist = aspect < 0.85 ? 108 : 92; // en pantallas estrechas se aleja para que quepan los saltos
      const view = mul(proj, mul(T(0, -2, -dist), RX(0.18)));
      const sway = Math.sin(clock * 0.5) * 0.12;
      const world = mul(view, mul(RY(0.5 + sway + yawUser + pose.spin), T(0, -14, 0)));

      drawMesh(shadowMesh, atlas, mul(world, T(0, 0.05, 0)), 0.02, 0);

      const lift = T(0, Math.max(0, pose.bob), 0);
      const root = mul(world, lift);
      for (const part of parts) {
        const [cx, cy, cz] = part.center;
        const [px, py, pz] = part.pivot;
        let rot = I();
        let upper = false;
        switch (part.id) {
          case 'head': rot = mul(RY(pose.headY), RX(pose.headX)); upper = true; break;
          case 'body': upper = true; break;
          case 'rArm': rot = mul(RX(pose.rax), RZ(pose.raz)); upper = true; break;
          case 'lArm': rot = mul(RX(pose.lax), RZ(pose.laz)); upper = true; break;
          case 'rLeg': rot = RX(pose.rlx); break;
          case 'lLeg': rot = RX(pose.llx); break;
        }
        let m = mul(upper ? mul(root, RY(pose.twist)) : root, mul(T(px, py, pz), mul(rot, T(cx - px, cy - py, cz - pz))));
        drawMesh(part.baseMesh, skinTex, m, 0.05, 1);
        if (part.overMesh) drawMesh(part.overMesh, skinTex, m, 0.5, 1);
      }

      if (capeTex && capeMesh) {
        // cuelga de los hombros (y=24), pegada a la espalda (z=-2)
        const m = mul(mul(root, RY(pose.twist)), mul(T(0, 24, -2.3), mul(RX(pose.cape), T(0, -8, -0.55))));
        drawMesh(capeMesh, capeTex, m, 0.5, 1);
      }

      if (blockScale > 0.01) {
        const s = 10 * blockScale;
        drawMesh(blockMesh, atlas, mul(world, mul(T(0, s / 2, 15), S(s, s, s))), 0.5, 1);
      }
      for (const p of particles) {
        const s = 1.8;
        drawMesh(blockMesh, atlas, mul(world, mul(T(p.x, p.y, p.z), mul(RX(p.rx), mul(RY(p.ry), S(s, s, s))))), 0.5, 1);
      }
    }

    function frame(now) {
      raf = 0;
      if (!alive) return;
      if (!visible()) { lastT = 0; raf = -1; setTimeout(() => { raf = 0; requestDraw(); }, 400); return; }
      const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0.016;
      lastT = now;
      clock += dt;
      update(dt);
      draw();
      if (animated || dragging || particles.length || Math.abs(yawUser) > 0.01 || override) raf = requestAnimationFrame(frame);
      else lastT = 0;
    }
    function requestDraw() {
      if (!raf && alive) raf = requestAnimationFrame(frame);
    }

    /* ---------- interacción ---------- */
    canvas.addEventListener('pointerdown', (e) => {
      dragging = true; moved = 0; lastX = e.clientX;
      canvas.setPointerCapture(e.pointerId);
      requestDraw();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      moved += Math.abs(dx);
      yawUser += dx * 0.012;
      lastDrag = performance.now();
    });
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      lastDrag = performance.now();
      if (moved < 5) trigger(Math.random() < 0.5 ? 'wave' : 'jump');
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', () => { dragging = false; });

    function trigger(name) {
      const st = STATES.find((s) => s.name === name);
      if (!st) return;
      override = { name, t: 0, len: Math.min(st.len, 2.4) };
      requestDraw();
    }

    document.addEventListener('visibilitychange', () => { lastT = 0; requestDraw(); });
    if (window.ResizeObserver) new ResizeObserver(() => requestDraw()).observe(canvas);

    setSkin(null, false);
    requestDraw();

    return {
      setSkin,
      setCape,
      setAnimated(v) { animated = !!v; requestDraw(); },
      trigger,
      destroy() { alive = false; cancelAnimationFrame(raf); }
    };
  }

  window.SkinViewer = { create };
})();
