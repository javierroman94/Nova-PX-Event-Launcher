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
  return { geometry, outputSize, clamp };
}));

(function () {
  if (typeof document === 'undefined') return;
  const core = window.NovaCropCore;
  const MAX_BYTES = 2.8 * 1024 * 1024;

  function open(src, aspect, kind) {
    return new Promise((resolve) => {
      const FH = 280; const FW = Math.round(FH * aspect);
      const dlg = document.createElement('dialog');
      dlg.className = 'event-modal crop-modal';
      const body = document.createElement('div'); body.className = 'event-modal-body';
      const h = document.createElement('h3'); h.textContent = 'Acomoda la imagen';
      const hint = document.createElement('p'); hint.className = 'muted'; hint.textContent = 'Arrastra para moverla y usa la barra (o la rueda del ratón) para acercarla. Se subirá solo lo que ves dentro del cuadro.';
      const cv = document.createElement('canvas'); cv.width = FW; cv.height = FH; cv.className = 'crop-canvas'; cv.style.width = FW + 'px'; cv.style.height = FH + 'px';
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
      function draw() {
        const q = g(); ox = q.ox; oy = q.oy;
        const x = cv.getContext('2d');
        x.clearRect(0, 0, FW, FH);
        x.drawImage(img, q.sx, q.sy, q.sw, q.sh, 0, 0, FW, FH);
        x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 1; x.beginPath();
        for (let i = 1; i < 3; i++) { x.moveTo((FW / 3) * i, 0); x.lineTo((FW / 3) * i, FH); x.moveTo(0, (FH / 3) * i); x.lineTo(FW, (FH / 3) * i); }
        x.stroke();
      }
      const finish = (v) => { if (done) return; done = true; try { dlg.close(); } catch {} dlg.remove(); resolve(v); };
      function result() {
        const q = g();
        const o = core.outputSize(q.sw, aspect);
        const out = document.createElement('canvas'); out.width = o.w; out.height = o.h;
        const x = out.getContext('2d'); x.imageSmoothingQuality = 'high';
        x.drawImage(img, q.sx, q.sy, q.sw, q.sh, 0, 0, o.w, o.h);
        const mime = kind === 'png' ? 'image/png' : 'image/jpeg';
        let url = out.toDataURL(mime, 0.92);
        let w = o.w;
        while (url.length * 0.75 > MAX_BYTES && w > 320) { w = Math.round(w * 0.8); out.width = w; out.height = Math.round(w / aspect); out.getContext('2d').drawImage(img, q.sx, q.sy, q.sw, q.sh, 0, 0, out.width, out.height); url = out.toDataURL(mime, 0.88); }
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
  window.NovaCrop = { open };
}());
