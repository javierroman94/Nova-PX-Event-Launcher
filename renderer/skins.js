/* Pestaña de Skins: muestra la skin en 2D (frente y espalda), cambia skin y capa (solo cuentas premium). */
(function () {
  const g = (id) => document.getElementById(id);
  const S = 8; // cada píxel de la skin se dibuja de 8x8

  let stage = null;
  try {
    stage = window.SkinViewer.create(g('skin3d'), { static: true });
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
    // Si hay una skin elegida sin aplicar, no se pisa su vista previa (por ejemplo al cambiar de capa).
    const keepPreview = !!pickedImage;
    const url = !keepPreview && skin && onlyMojang(skin.url);
    if (url) {
      try {
        // La imagen se descarga desde el programa (no desde la página) para poder usarla en WebGL.
        const tex = await window.api.skinFetch(url);
        const img = await loadImage(tex.dataUrl);
        if (seq !== loadSeq) return;
        drawBoth(img, skin.variant === 'slim');
        g('skin-name').textContent = `${p.name} · modelo ${skin.variant === 'slim' ? 'Slim' : 'Default'}`;
      } catch {
        g('skin-name').textContent = 'No se pudo cargar tu skin ahora mismo.';
      }
    } else if (!keepPreview) {
      g('skin-name').textContent = p.name;
    }
    const slimRadio = keepPreview ? null : document.querySelector('input[name="skin-variant"][value="' + (skin && skin.variant === 'slim' ? 'slim' : 'classic') + '"]');
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

  // Capas: fila horizontal plegada; la flecha del extremo la despliega con todas las capas.
  function setCapesOpen(open) {
    g('capes').classList.toggle('collapsed', !open);
    g('capes-toggle').setAttribute('aria-expanded', open ? 'true' : 'false');
    g('capes-toggle').classList.toggle('open', open);
    try { localStorage.setItem('px.capesOpen', open ? '1' : '0'); } catch {}
  }
  g('capes-toggle').addEventListener('click', () => setCapesOpen(g('capes').classList.contains('collapsed')));
  try { if (localStorage.getItem('px.capesOpen') === '1') setCapesOpen(true); } catch {}

  async function renderCapes(p, seq) {
    if (!p || !Array.isArray(p.capes)) p = { ...(p || {}), capes: [] };
    const box = g('capes');
    g('capes-current').textContent = p.activeCape ? `Capa: ${p.activeCape.alias}` : `Capas (${p.capes.length})`;
    g('capes-toggle').hidden = p.capes.length === 0;
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
        'Sin cuenta de Microsoft no se puede cambiar la skin en Mojang. Aquí eliges una skin que se guarda en este equipo: ' +
        'la ves en el launcher y, en Fabric y Forge, el launcher añade un mod pequeño para verla también dentro del juego (solo tú). ' +
        'Para que todos la vean, el servidor debe usar SkinsRestorer o similar.';
      g('skins-grid').hidden = false;
      g('skin-apply').textContent = 'Usar esta skin';
      await renderLocal();
      return;
    }
    g('cape-box').hidden = false;
    g('skin-apply').textContent = 'Aplicar skin';
    notice.hidden = true;
    g('skins-grid').hidden = false;
    msg('Cargando tu perfil…');
    try {
      await renderProfile(await window.api.skinsProfile());
      msg('');
      window.api.skinsSavedAuto().then((added) => { if (added) paintSaved(); }).catch(() => {});
    } catch (err) {
      failure(err);
    }
  }

  // Cuentas no premium: la skin se guarda en este equipo (launcher y, con mod, dentro del juego).
  async function renderLocal() {
    const seq = ++loadSeq;
    g('cape-box').hidden = true;
    let local = null;
    try { local = await window.api.skinsLocalGet(); } catch {}
    if (local && !pickedImage) {
      try {
        const img = await loadImage(local.dataUrl);
        if (seq !== loadSeq) return;
        drawBoth(img, local.slim);
        g('skin-name').textContent = `${user.name} · tu skin local · ${local.slim ? 'Slim' : 'Default'}`;
        const r = document.querySelector('input[name="skin-variant"][value="' + (local.slim ? 'slim' : 'classic') + '"]');
        if (r) r.checked = true;
      } catch {}
    } else if (!pickedImage) {
      g('skin-name').textContent = `${user.name} · sin skin elegida (se ve Steve)`;
      drawBoth(null, false);
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
      g('skin-save').disabled = false;
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
      if (!user || user.mode !== 'premium') {
        await window.api.skinsLocalSet(variant);
        pickedImage = null;
        await renderLocal();
        window.dispatchEvent(new Event('nova-skin-changed'));
        msg('Skin guardada en este equipo. La verás en el launcher y en el juego (Fabric/Forge).');
        return;
      }
      const applied = await window.api.skinsApply(variant);
      pickedImage = null;
      await renderProfile(applied);
      window.dispatchEvent(new Event('nova-skin-changed'));
      msg('Skin cambiada. Puede tardar un momento en verse en el juego.');
    } catch (err) {
      btn.disabled = false;
      failure(err);
    }
  });

  /* --- skins guardadas: cambio con un clic --- */
  // Skins guardadas: cuerpo completo en 3D (con su capa si la tenía), nombre editable y botón para usarla.
  let savedEnv = null;
  let savedViewers = [];
  async function paintSaved() {
    const box = g('saved-skins');
    savedViewers.forEach((v) => v.destroy());
    savedViewers = [];
    box.replaceChildren();
    let list = [];
    try { list = await window.api.skinsSavedList(); } catch {}
    if (!list.length) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = 'Elige un archivo y pulsa "Guardar en mi lista" para tenerlo aquí.'; box.append(p); return; }
    savedEnv = savedEnv || (window.SkinViewer && window.SkinViewer.createEnv());
    list.forEach((s, i) => {
      const card = document.createElement('div');
      card.className = 'saved-skin';
      const stageBox = document.createElement('div'); stageBox.className = 'saved-stage';
      const cv = document.createElement('canvas'); cv.className = 'member-3d';
      cv.setAttribute('aria-label', `Skin 3D: ${s.name}`);
      stageBox.append(cv);
      let viewer = null;
      try { viewer = window.SkinViewer.create(cv, { env: savedEnv, static: true, distance: 106 }); } catch {}
      if (viewer) {
        savedViewers.push(viewer);
        setTimeout(async () => {
          try {
            const im = await loadImage(s.dataUrl);
            viewer.setSkin(im, s.variant === 'slim');
            if (s.capeUrl && onlyMojang(s.capeUrl)) {
              const ct = await window.api.skinFetch(s.capeUrl, 'cape');
              viewer.setCape(await loadImage(ct.dataUrl));
            } else viewer.setCape(null);
          } catch {}
        }, 80 * i);
      } else {
        cv.remove();
        const img = document.createElement('img'); img.alt = s.name; img.src = s.dataUrl; stageBox.append(img);
      }
      const name = document.createElement('div'); name.className = 'saved-name'; name.textContent = s.name;
      const meta = document.createElement('div'); meta.className = 'saved-meta muted';
      meta.textContent = `${s.variant === 'slim' ? 'Slim' : 'Default'}${s.cape === '' ? ' · sin capa' : s.cape ? ` · capa${s.capeName ? `: ${s.capeName}` : ''}` : ''}`;
      const use = document.createElement('button'); use.type = 'button'; use.className = 'primary'; use.textContent = 'Usar';
      use.addEventListener('click', async () => {
        use.disabled = true; msg('Cambiando tu skin…');
        try {
          pickedImage = null; g('skin-apply').disabled = true; g('skin-save').disabled = true;
          const res = await window.api.skinsSavedUse(s.id);
          if (res && res.local) await renderLocal(); else await renderProfile(res);
          window.dispatchEvent(new Event('nova-skin-changed'));
          msg('Skin cambiada. Puede tardar un momento en verse en el juego.');
        } catch (err) { failure(err); }
        use.disabled = false;
      });
      const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Editar nombre';
      edit.addEventListener('click', async () => {
        const nn = await askName('Cambiar nombre', s.name);
        if (nn !== null) { await window.api.skinsSavedRename(s.id, nn); paintSaved(); }
      });
      const del = document.createElement('button'); del.type = 'button'; del.className = 'saved-del'; del.textContent = '×'; del.setAttribute('aria-label', 'Quitar skin guardada');
      del.addEventListener('click', async () => { await window.api.skinsSavedRemove(s.id); paintSaved(); });
      const actions = document.createElement('div'); actions.className = 'saved-actions';
      actions.append(use, edit);
      card.append(stageBox, name, meta, actions, del);
      box.append(card);
    });
  }
  // Cuadro para ponerle nombre a una skin (con la estética del launcher).
  function askName(title, initial) {
    return new Promise((resolve) => {
      const dlg = document.createElement('dialog');
      dlg.className = 'event-modal';
      dlg.setAttribute('aria-label', title);
      const body = document.createElement('form');
      body.className = 'event-modal-body';
      const h = document.createElement('h3'); h.textContent = title;
      const inp = document.createElement('input'); inp.type = 'text'; inp.maxLength = 40; inp.value = initial || ''; inp.placeholder = 'Nombre de la skin';
      const row = document.createElement('div'); row.className = 'mp-actions';
      const no = document.createElement('button'); no.type = 'button'; no.textContent = 'Cancelar';
      const ok = document.createElement('button'); ok.type = 'submit'; ok.className = 'primary'; ok.textContent = 'Guardar';
      row.append(no, ok);
      body.append(h, inp, row);
      dlg.append(body);
      let done = false;
      const finish = (v) => { if (done) return; done = true; dlg.close(); dlg.remove(); resolve(v); };
      body.addEventListener('submit', (e) => { e.preventDefault(); finish(inp.value.trim() || initial || 'Mi skin'); });
      no.addEventListener('click', () => finish(null));
      dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(null); });
      document.body.append(dlg);
      dlg.showModal();
      inp.focus(); inp.select();
    });
  }

  g('skin-save').addEventListener('click', async () => {
    try {
      const variant = document.querySelector('input[name="skin-variant"]:checked').value;
      const label = (g('skin-name').textContent || '').replace(/^Vista previa: /, '').replace(/\.png$/i, '');
      const name = await askName('Nombre de la skin', label);
      if (name === null) return;
      const premiumNow = user && user.mode === 'premium' && profile;
      await window.api.skinsSavedAdd({
        name, variant,
        ...(premiumNow ? { capeId: profile.activeCape ? profile.activeCape.id : '', capeName: profile.activeCape ? profile.activeCape.alias : '' } : {})
      });
      g('skin-save').disabled = true;
      msg('Skin guardada en tu lista.');
      paintSaved();
    } catch (err) { failure(err); }
  });
  paintSaved();

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
