/* Recortador de fotos para el panel de administración: después de elegir la imagen se acomoda el cuadro
   (mover y acercar, como Instagram o X) y solo entonces se sube. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NovaCropCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  // iw/ih: tamaño de la imagen; fw/fh: marco; zoom >= 1 sobre el ajuste "cubrir"; ox/oy: desplazamiento del centro de la imagen.
  function geometry({ iw, ih, fw, fh, zoom, ox, oy }) {
    const z = clamp(Number(zoom) || 1, 1, 6);
    const scale = Math.max(fw / iw, fh / ih) * z;
    const maxX = Math.max(0, (iw * scale - fw) / 2);
    const maxY = Math.max(0, (ih * scale - fh) / 2);
    const x = clamp(Number(ox) || 0, -maxX, maxX);
    const y = clamp(Number(oy) || 0, -maxY, maxY);
    const sw = fw / scale; const sh = fh / scale;
    return { scale, ox: x, oy: y, maxX, maxY, sw, sh, sx: iw / 2 - x / scale - sw / 2, sy: ih / 2 - y / scale - sh / 2 };
  }
  // Tamaño de salida: lo recortado, sin pasar de 1600 px de ancho y con la proporción pedida.
  function outputSize(sw, aspect, max = 1600) {
    const w = Math.max(16, Math.round(Math.min(sw, max)));
    return { w, h: Math.max(16, Math.round(w / aspect)) };
  }
  // Retícula: el mayor rectángulo de esa proporción que cabe en el escenario (con margen).
  function reticle(sw, sh, aspect, pad = 0.9) {
    let w = sw * pad; let h = w / aspect;
    if (h > sh * pad) { h = sh * pad; w = h * aspect; }
    return { w: Math.round(w), h: Math.round(h) };
  }
  // Dónde se muestra cada imagen y con qué proporción real. mw/mh: tamaño del área principal del launcher
  // (la portada de Inicio ocupa todo ese ancho y alto). Las guías marcan otros sitios donde sale la misma imagen.
  function slotSpec(key, mw = 880, mh = 640) {
    const portada = clamp((mw + 64) / Math.max(320, mh), 1.2, 3.2);
    const S = {
      banner: { title: 'Banner del evento', where: 'la portada de Inicio', aspect: portada, guides: [
        { label: 'Cabecera de la pestaña Evento', aspect: clamp(mw / 350, 1.5, 4) },
        { label: 'Fila de la lista de eventos', aspect: clamp((mw - 64) / 80, 3, 12) }] },
      logo: { title: 'Logo del evento', where: 'Inicio y las tarjetas del evento (cuadrado)', aspect: 1 },
      sponsor: { title: 'Foto del hosting, patrocinador o crédito', where: 'una foto redonda, como una foto de perfil', aspect: 1, circle: true },
      noticia: { title: 'Imagen de la noticia', where: 'la tarjeta de la noticia', aspect: 16 / 9 },
      historial: { title: 'Imagen del evento pasado', where: 'el historial de eventos', aspect: 4 / 3, guides: [
        { label: 'Vista en cuadrícula', aspect: 1 }, { label: 'Ventana de detalle', aspect: 16 / 9 }] },
      'historial-fondo': { title: 'Fondo del evento pasado', where: 'el fondo del detalle', aspect: 16 / 9 },
      anuncio: { title: 'Imagen del anuncio', where: 'el anuncio', aspect: 16 / 9 },
      plugin: { title: 'Imagen del plugin', where: 'la tarjeta del plugin', aspect: 16 / 9 },
      modpack: { title: 'Imagen del modpack', where: 'la tarjeta y el encabezado del modpack (cuadrado)', aspect: 1 },
      perfil: { title: 'Foto de perfil', where: 'el equipo (cuadrado)', aspect: 1 }
    };
    return S[key] || null;
  }
  return { geometry, outputSize, clamp, reticle, slotSpec };
}));

(function () {
  if (typeof document === 'undefined') return;
  const core = window.NovaCropCore;
  const MAX_BYTES = 2.8 * 1024 * 1024;

  // slot: número (proporción suelta) o clave de slotSpec ("banner", "logo"…).
  function resolve(slot) {
    if (typeof slot === 'number') return { aspect: slot, title: 'Acomoda la imagen', where: '', guides: [] };
    const m = document.querySelector('main');
    const spec = core.slotSpec(slot, m ? m.clientWidth : 880, m ? m.clientHeight : 640);
    return spec ? { guides: [], ...spec } : { aspect: 16 / 9, title: 'Acomoda la imagen', where: '', guides: [] };
  }
  const ratioText = (a) => (a >= 1 ? `${(Math.round(a * 10) / 10)}:1` : `1:${Math.round((1 / a) * 10) / 10}`);

  function open(src, slot, kind) {
    return new Promise((resolve_) => {
      const spec = resolve(slot);
      const aspect = spec.aspect;
      // Escenario con la imagen entera; la retícula es el marco real (misma proporción que donde se mostrará).
      const SW = 640; const SH = 380;
      const R = core.reticle(SW, SH, aspect);
      const FW = R.w; const FH = R.h; const RX = Math.round((SW - FW) / 2); const RY = Math.round((SH - FH) / 2);
      const dlg = document.createElement('dialog');
      dlg.className = 'event-modal crop-modal';
      const body = document.createElement('div'); body.className = 'event-modal-body';
      const h = document.createElement('h3'); h.textContent = spec.title;
      const hint = document.createElement('p'); hint.className = 'muted';
      hint.textContent = `${spec.where ? `Se muestra en ${spec.where} · ` : ''}proporción ${ratioText(aspect)}. Arrastra la imagen y usa la barra (o la rueda) para acercarla: lo que queda dentro del marco es lo que se verá.`;
      const cv = document.createElement('canvas'); cv.width = SW; cv.height = SH; cv.className = 'crop-canvas'; cv.style.width = SW + 'px'; cv.style.height = SH + 'px';
      const zoom = document.createElement('input'); zoom.type = 'range'; zoom.min = '1'; zoom.max = '4'; zoom.step = '0.01'; zoom.value = '1'; zoom.setAttribute('aria-label', 'Acercar');
      const row = document.createElement('div'); row.className = 'mp-actions';
      const ok = document.createElement('button'); ok.type = 'button'; ok.className = 'primary'; ok.textContent = 'Usar recorte';
      const orig = document.createElement('button'); orig.type = 'button'; orig.textContent = 'Subir sin recortar';
      const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancelar';
      row.append(ok, orig, cancel);
      body.append(h, hint, cv, zoom, row); dlg.append(body); document.body.append(dlg);

      const img = new Image();
      let ox = 0; let oy = 0; let drag = null; let done = false;
      const g = () => core.geometry({ iw: img.naturalWidth, ih: img.naturalHeight, fw: FW, fh: FH, zoom: zoom.value, ox, oy });
      // Con la imagen entera visible el desplazamiento puede salir del marco, pero nunca dejar un borde vacío dentro de él.
      function draw() {
        const q = g(); ox = q.ox; oy = q.oy;
        const x = cv.getContext('2d');
        x.clearRect(0, 0, SW, SH);
        const dw = img.naturalWidth * q.scale; const dh = img.naturalHeight * q.scale;
        const dx = SW / 2 + ox - dw / 2; const dy = SH / 2 + oy - dh / 2;
        x.drawImage(img, dx, dy, dw, dh);
        // Lo que queda fuera del marco se oscurece.
        x.fillStyle = 'rgba(6, 8, 14, .66)';
        x.beginPath(); x.rect(0, 0, SW, SH);
        if (spec.circle) x.ellipse(RX + FW / 2, RY + FH / 2, FW / 2, FH / 2, 0, 0, Math.PI * 2); else x.rect(RX, RY, FW, FH);
        x.fill('evenodd');
        // Guías de otros sitios donde sale esta misma imagen.
        (spec.guides || []).forEach((gd, i) => {
          let gw = FW; let gh = gw / gd.aspect;
          if (gh > FH) { gh = FH; gw = gh * gd.aspect; }
          const gx = RX + (FW - gw) / 2; const gy = RY + (FH - gh) / 2;
          x.save(); x.setLineDash([6, 5]); x.strokeStyle = i ? 'rgba(120, 220, 255, .9)' : 'rgba(255, 214, 90, .9)'; x.lineWidth = 1.5; x.strokeRect(gx + .5, gy + .5, gw, gh); x.restore();
          x.font = '11px system-ui, sans-serif'; x.fillStyle = x.strokeStyle; x.fillText(gd.label, gx + 6, gy + 14 + (i % 2) * 0);
        });
        // Marco real
        x.strokeStyle = '#ff3b3b'; x.lineWidth = 2;
        if (spec.circle) { x.beginPath(); x.ellipse(RX + FW / 2, RY + FH / 2, FW / 2, FH / 2, 0, 0, Math.PI * 2); x.stroke(); x.setLineDash([4, 4]); x.strokeStyle = 'rgba(255,255,255,.35)'; x.strokeRect(RX, RY, FW, FH); x.setLineDash([]); } else x.strokeRect(RX, RY, FW, FH);
        x.strokeStyle = 'rgba(255,255,255,.3)'; x.lineWidth = 1; x.beginPath();
        for (let i = 1; i < 3; i++) { x.moveTo(RX + (FW / 3) * i, RY); x.lineTo(RX + (FW / 3) * i, RY + FH); x.moveTo(RX, RY + (FH / 3) * i); x.lineTo(RX + FW, RY + (FH / 3) * i); }
        x.stroke();
      }
      const finish = (v) => { if (done) return; done = true; try { dlg.close(); } catch {} dlg.remove(); resolve_(v); };
      function result() {
        const q = g();
        const o = core.outputSize(q.sw, aspect);
        const out = document.createElement('canvas'); out.width = o.w; out.height = o.h;
        const x = out.getContext('2d'); x.imageSmoothingQuality = 'high';
        x.drawImage(img, q.sx, q.sy, q.sw, q.sh, 0, 0, o.w, o.h);
        const mime = kind === 'png' ? 'image/png' : 'image/jpeg';
        let url = out.toDataURL(mime, 0.92);
        let w = o.w;
        while (url.length * 0.75 > MAX_BYTES && w > 320) { w = Math.round(w * 0.8); out.width = w; out.height = Math.round(w / aspect); out.getContext('2d').drawImage(img, q.sx, q.sy, q.sw, q.sh, 0, 0, w, out.height); url = out.toDataURL(mime, 0.85); }
        return url;
      }
      cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, ox, oy }; cv.setPointerCapture(e.pointerId); });
      cv.addEventListener('pointermove', (e) => { if (!drag) return; ox = drag.ox + (e.clientX - drag.x); oy = drag.oy + (e.clientY - drag.y); draw(); });
      cv.addEventListener('pointerup', () => { drag = null; });
      cv.addEventListener('wheel', (e) => { e.preventDefault(); zoom.value = String(core.clamp(Number(zoom.value) - e.deltaY * 0.002, 1, 4)); draw(); }, { passive: false });
      zoom.addEventListener('input', draw);
      ok.addEventListener('click', () => finish(result()));
      orig.addEventListener('click', () => finish('orig'));
      cancel.addEventListener('click', () => finish(null));
      dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(null); });
      img.onload = () => { dlg.showModal(); draw(); };
      img.onerror = () => finish('orig'); // si no se puede mostrar, se sube tal cual
      img.src = src;
    });
  }
  // Recorta y deja la imagen a su tamaño final (lado en px); devuelve un data URL o null si se cancela.
  async function openSized(src, slot, kind, side) {
    const out = await open(src, slot, kind);
    if (out === null) return null;
    const url = out === 'orig' ? src : out;
    return new Promise((res) => {
      const im = new Image();
      im.onload = () => {
        const c = document.createElement('canvas'); c.width = side; c.height = side;
        const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
        const s = Math.min(im.naturalWidth, im.naturalHeight);
        x.drawImage(im, (im.naturalWidth - s) / 2, (im.naturalHeight - s) / 2, s, s, 0, 0, side, side);
        res(c.toDataURL('image/png'));
      };
      im.onerror = () => res(null);
      im.src = url;
    });
  }
  window.NovaCrop = { open, openSized };
}());
