/* Pestaña de Skins: muestra la skin en 2D (frente y espalda), cambia skin y capa (solo cuentas premium). */
(function () {
  const g = (id) => document.getElementById(id);
  const S = 8; // cada píxel de la skin se dibuja de 8x8

  let stage = null;
  try {
    stage = window.SkinViewer.create(g('skin3d'));
  } catch {}
  if (!stage) {
    g('skin3d').hidden = true;
    document.querySelectorAll('.skin-stage .flat').forEach((f) => (f.hidden = false));
  }
  window.addEventListener('nova-fx', (e) => stage && stage.setAnimated(e.detail));

  let user = null; // { mode, name }
  let profile = null;
  let pickedImage = null;
  let loadSeq = 0;

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('No se pudo cargar la imagen.'));
      img.src = src;
    });
  }

  function msg(text, isError) {
    if (text && window.toast && (isError || /cambiad|quitada/i.test(text))) window.toast(text, isError ? 'error' : undefined);
    const m = g('skins-msg');
    m.textContent = text;
    m.className = isError ? 'msg error' : 'msg';
  }

  // Partes de la skin: [x, y, ancho, alto] en la textura, y dónde se dibujan en el muñeco de 16x32.
  function layout(slim, back) {
    const aw = slim ? 3 : 4;
    const rightArmBackX = slim ? 51 : 52;
    const leftArmBackX = slim ? 43 : 44;
    const rightSleeveBackX = slim ? 51 : 52;
    const leftSleeveBackX = slim ? 59 : 60;
    if (!back) {
      return {
        base: [
          { s: [8, 8, 8, 8], d: [4, 0] },
          { s: [20, 20, 8, 12], d: [4, 8] },
          { s: [44, 20, aw, 12], d: [slim ? 1 : 0, 8] },
          { s: [36, 52, aw, 12], d: [12, 8], mirror: [44, 20, aw, 12] },
          { s: [4, 20, 4, 12], d: [4, 20] },
          { s: [20, 52, 4, 12], d: [8, 20], mirror: [4, 20, 4, 12] }
        ],
        over: [
          { s: [40, 8, 8, 8], d: [4, 0] },
          { s: [20, 36, 8, 12], d: [4, 8] },
          { s: [44, 36, aw, 12], d: [slim ? 1 : 0, 8] },
          { s: [52, 52, aw, 12], d: [12, 8] },
          { s: [4, 36, 4, 12], d: [4, 20] },
          { s: [4, 52, 4, 12], d: [8, 20] }
        ]
      };
    }
    return {
      base: [
        { s: [24, 8, 8, 8], d: [4, 0] },
        { s: [32, 20, 8, 12], d: [4, 8] },
        { s: [rightArmBackX, 20, aw, 12], d: [12, 8] },
        { s: [leftArmBackX, 52, aw, 12], d: [slim ? 1 : 0, 8], mirror: [rightArmBackX, 20, aw, 12] },
        { s: [12, 20, 4, 12], d: [8, 20] },
        { s: [28, 52, 4, 12], d: [4, 20], mirror: [12, 20, 4, 12] }
      ],
      over: [
        { s: [56, 8, 8, 8], d: [4, 0] },
        { s: [32, 36, 8, 12], d: [4, 8] },
        { s: [rightSleeveBackX, 36, aw, 12], d: [12, 8] },
        { s: [leftSleeveBackX, 52, aw, 12], d: [slim ? 1 : 0, 8] },
        { s: [12, 36, 4, 12], d: [8, 20] },
        { s: [12, 52, 4, 12], d: [4, 20] }
      ]
    };
  }

  function drawPart(ctx, img, part, legacy, isOverlay) {
    let src = part.s;
    let flip = false;
    if (legacy) {
      if (isOverlay && src[1] >= 32) return; // las skins 64x32 no tienen segunda capa en el cuerpo
      if (part.mirror) { src = part.mirror; flip = true; }
    }
    if (src[1] + src[3] > img.height) return;
    const [sx, sy, sw, sh] = src;
    const [dx, dy] = part.d;
    if (flip) {
      ctx.save();
      ctx.translate((dx + sw) * S, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, sx, sy, sw, sh, 0, dy * S, sw * S, sh * S);
      ctx.restore();
    } else {
      ctx.drawImage(img, sx, sy, sw, sh, dx * S, dy * S, sw * S, sh * S);
    }
  }

  function drawSkin(canvas, img, slim, back) {
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!img) return;
    const legacy = img.height === 32;
    const l = layout(slim, back);
    l.base.forEach((p) => drawPart(ctx, img, p, legacy, false));
    l.over.forEach((p) => drawPart(ctx, img, p, legacy, true));
  }

  function drawBoth(img, slim) {
    if (stage) stage.setSkin(img, slim);
    drawSkin(g('skin-front'), img, slim, false);
    drawSkin(g('skin-back'), img, slim, true);
  }

  // Vista previa de la capa: la cara exterior de la capa está en x=1, y=1, 10x16.
  function capeCanvas(img) {
    const c = document.createElement('canvas');
    c.width = 10;
    c.height = 16;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 1, 1, 10, 16, 0, 0, 10, 16);
    return c;
  }

  function onlyMojang(url) {
    const https = String(url || '').replace(/^http:\/\//i, 'https://');
    return /^https:\/\/textures\.minecraft\.net\/texture\/[0-9a-f]+$/i.test(https) ? https : null;
  }

  async function renderProfile(p) {
    profile = p;
    const seq = ++loadSeq;
    const skin = p.activeSkin;
    const url = skin && onlyMojang(skin.url);
    if (url) {
      try {
        // La imagen se descarga desde el programa (no desde la página) para poder usarla en WebGL.
        const tex = await window.api.skinFetch(url);
        const img = await loadImage(tex.dataUrl);
        if (seq !== loadSeq) return;
        drawBoth(img, skin.variant === 'slim');
        g('skin-name').textContent = `${p.name} · modelo ${skin.variant === 'slim' ? 'fino' : 'normal'}`;
      } catch {
        g('skin-name').textContent = 'No se pudo cargar tu skin ahora mismo.';
      }
    } else {
      g('skin-name').textContent = p.name;
    }
    const slimRadio = document.querySelector('input[name="skin-variant"][value="' + (skin && skin.variant === 'slim' ? 'slim' : 'classic') + '"]');
    if (slimRadio) slimRadio.checked = true;
    // capa equipada en el visor 3D
    if (stage) {
      const capeUrl = p.activeCape && onlyMojang(p.activeCape.url);
      if (!capeUrl) stage.setCape(null);
      else {
        try {
          const ct = await window.api.skinFetch(capeUrl, 'cape');
          const cimg = await loadImage(ct.dataUrl);
          if (seq === loadSeq) stage.setCape(cimg);
        } catch {
          stage.setCape(null);
        }
      }
    }
    await renderCapes(p, seq);
  }

  async function renderCapes(p, seq) {
    const box = g('capes');
    box.replaceChildren();
    g('capes-empty').hidden = p.capes.length > 0;

    const none = document.createElement('button');
    none.type = 'button';
    none.className = 'cape-opt' + (p.activeCape ? '' : ' active');
    const mark = document.createElement('div');
    mark.className = 'cape-none';
    mark.textContent = '∅';
    const noneLabel = document.createElement('span');
    noneLabel.textContent = 'Sin capa';
    none.append(mark, noneLabel);
    none.addEventListener('click', () => setCape(null));
    box.append(none);

    for (const cape of p.capes) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cape-opt' + (p.activeCape && p.activeCape.id === cape.id ? ' active' : '');
      const label = document.createElement('span');
      label.textContent = cape.alias;
      const url = onlyMojang(cape.url);
      if (url) {
        try {
          const img = await loadImage(url);
          if (seq !== loadSeq) return;
          b.append(capeCanvas(img));
        } catch {}
      }
      b.append(label);
      b.addEventListener('click', () => setCape(cape.id));
      box.append(b);
    }
  }

  function failure(err) {
    const text = window.cleanError ? window.cleanError(err) : String(err.message || err);
    if (text.startsWith('SESSION_EXPIRED:')) {
      msg(text.replace('SESSION_EXPIRED:', '').trim(), true);
    } else {
      msg(text, true);
    }
  }

  async function setCape(id) {
    msg('Cambiando la capa…');
    try {
      await renderProfile(await window.api.skinsCape(id));
      window.dispatchEvent(new Event('nova-skin-changed'));
      msg(id === null ? 'Capa quitada.' : 'Capa cambiada.');
    } catch (err) {
      failure(err);
    }
  }

  async function load() {
    const notice = g('skins-notice');
    const premium = user && user.mode === 'premium';
    g('skins-grid').hidden = !!user && !premium;
    if (!user) {
      notice.hidden = false;
      notice.textContent = 'Inicia sesión con tu cuenta de Microsoft para ver y cambiar tu skin y tu capa.';
      g('skins-grid').hidden = true;
      return;
    }
    if (!premium) {
      notice.hidden = false;
      notice.textContent =
        'Las cuentas no premium no pueden cambiar la skin desde el launcher: Mojang solo lo permite con una cuenta de Microsoft. ' +
        'En los servidores con SkinsRestorer o similar, la skin la define el servidor.';
      return;
    }
    notice.hidden = true;
    g('skins-grid').hidden = false;
    msg('Cargando tu perfil…');
    try {
      await renderProfile(await window.api.skinsProfile());
      msg('');
    } catch (err) {
      failure(err);
    }
  }

  g('skin-pick').addEventListener('click', async () => {
    msg('');
    try {
      const r = await window.api.skinsPick();
      if (!r) return;
      pickedImage = await loadImage(r.dataUrl);
      const slim = document.querySelector('input[name="skin-variant"]:checked').value === 'slim';
      drawBoth(pickedImage, slim);
      g('skin-name').textContent = `Vista previa: ${r.name}`;
      g('skin-apply').disabled = false;
    } catch (err) {
      failure(err);
    }
  });

  document.querySelectorAll('input[name="skin-variant"]').forEach((r) =>
    r.addEventListener('change', () => {
      if (pickedImage) drawBoth(pickedImage, r.value === 'slim' && r.checked);
    })
  );

  g('skin-apply').addEventListener('click', async () => {
    const btn = g('skin-apply');
    btn.disabled = true;
    msg('Subiendo la skin a Mojang…');
    try {
      const variant = document.querySelector('input[name="skin-variant"]:checked').value;
      await renderProfile(await window.api.skinsApply(variant));
      window.dispatchEvent(new Event('nova-skin-changed'));
      pickedImage = null;
      msg('Skin cambiada. Puede tardar un momento en verse en el juego.');
    } catch (err) {
      btn.disabled = false;
      failure(err);
    }
  });

  window.NovaSkins = {
    setUser(info) {
      user = info;
      profile = null;
      pickedImage = null;
      g('skin-apply').disabled = true;
    },
    show: load
  };
})();
