/* Minijuegos extra de Pexy. Cada uno llama a onDone(puntos 0–40) al terminar; "Salir" no da nada. */
(function () {
  if (typeof document === 'undefined') return;
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  const W = 360, H = 260;

  function shell(title, help, hudText, withCanvas) {
    const d = document.createElement('dialog'); d.className = 'event-modal pl-modal';
    const b = el('div', 'event-modal-body'); const hud = el('p', 'pl-mood', hudText);
    const x0 = el('button', 'ghost', 'Salir'); x0.type = 'button';
    let cv = null; if (withCanvas) { cv = el('canvas', 'crop-canvas'); cv.width = W; cv.height = H; cv.style.width = W + 'px'; cv.style.height = H + 'px'; cv.style.touchAction = 'none'; }
    const area = el('div'); if (cv) area.append(cv);
    b.append(el('h3', '', title), el('small', 'muted', help), hud, area, x0); d.append(b); document.body.append(d);
    let over = false; const cleanups = [];
    const end = (report, score, onDone) => { if (over) return; over = true; cleanups.forEach((f) => { try { f(); } catch {} }); try { d.close(); } catch {} d.remove(); if (report) onDone(Math.max(0, Math.min(40, Math.round(score)))); };
    return { d, hud, cv, area, x0, isOver: () => over, end, onClean: (f) => cleanups.push(f) };
  }

  /* 🎋 Bambú saltarín: salen bambús de 9 agujeros; toca los bambús y evita las bombas. 20 s. */
  function whack(onDone) {
    const S = shell('🎋 Bambú saltarín', 'Toca los bambús 🎋 cuando salgan. ¡Cuidado con las bombas 💣!', '🎋 0 · 20 s', true);
    const x = S.cv.getContext('2d'); let score = 0, last = 0, spawn = 300; const t0 = performance.now(); const holes = []; const up = {};
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) holes.push({ x: 70 + c * 110, y: 70 + r * 75 });
    S.x0.addEventListener('click', () => S.end(false)); S.d.addEventListener('cancel', (e) => { e.preventDefault(); S.end(false); });
    S.cv.addEventListener('pointerdown', (e) => {
      const r = S.cv.getBoundingClientRect(); const px = (e.clientX - r.left) * (W / r.width), py = (e.clientY - r.top) * (H / r.height);
      holes.forEach((h, i) => { const m = up[i]; if (m && Math.hypot(px - h.x, py - h.y + 6) < 30) { score = Math.max(0, score + (m.bad ? -3 : 2)); m.hit = m.bad ? '💥' : '✨'; m.life = Math.min(m.life, 160); } });
    });
    function frame(now) {
      if (S.isOver()) return;
      const dt = Math.min(50, now - (last || now)); last = now; const left = 20000 - (now - t0);
      if (left <= 0) { S.end(true, score, onDone); return; }
      spawn -= dt;
      if (spawn <= 0) { spawn = 420 + Math.random() * 380 - (1 - left / 20000) * 150; const i = Math.floor(Math.random() * 9); if (!up[i]) up[i] = { bad: Math.random() < 0.22, life: 950 - (1 - left / 20000) * 250 }; }
      x.fillStyle = '#10201a'; x.fillRect(0, 0, W, H); x.textAlign = 'center';
      holes.forEach((h, i) => {
        x.fillStyle = '#2a1a10'; x.beginPath(); x.ellipse(h.x, h.y + 14, 30, 11, 0, 0, 7); x.fill();
        const m = up[i]; if (m) { m.life -= dt; x.font = '34px serif'; x.fillText(m.hit || (m.bad ? '💣' : '🎋'), h.x, h.y + 6); if (m.life <= 0) delete up[i]; }
      });
      S.hud.textContent = `🎋 ${score} · ${Math.ceil(left / 1000)} s`; requestAnimationFrame(frame);
    }
    S.d.showModal(); requestAnimationFrame(frame);
  }

  /* 🧠 Memoria: Pexy enseña una secuencia de frutas y tú la repites. Cada ronda suma puntos. */
  function memory(onDone) {
    const S = shell('🧠 Memoria de Pexy', 'Mira la secuencia y repítela tocando las frutas en el mismo orden.', 'Ronda 1', false);
    const ICONS = ['🍎', '🍌', '🍇', '🍓']; const grid = el('div'); grid.style.cssText = 'display:grid;grid-template-columns:repeat(2,96px);gap:10px;justify-content:center;margin:12px 0';
    const btns = ICONS.map((ic, i) => { const b = el('button', '', ic); b.type = 'button'; b.style.cssText = 'font-size:40px;height:96px;border-radius:16px;transition:transform .12s,filter .12s'; b.dataset.i = i; grid.append(b); return b; });
    S.area.append(grid);
    let seq = [], pos = 0, accepting = false, rounds = 0; const timers = [];
    const later = (f, ms) => { const t = setTimeout(f, ms); timers.push(t); };
    S.onClean(() => timers.forEach(clearTimeout));
    const flash = (i) => { const b = btns[i]; b.style.transform = 'scale(1.15)'; b.style.filter = 'brightness(1.8)'; later(() => { b.style.transform = ''; b.style.filter = ''; }, 320); };
    function round() {
      accepting = false; pos = 0; seq.push(Math.floor(Math.random() * 4)); S.hud.textContent = `Ronda ${seq.length} · mira…`;
      seq.forEach((v, k) => later(() => flash(v), 700 + k * 600));
      later(() => { accepting = true; S.hud.textContent = `Ronda ${seq.length} · ¡tu turno!`; }, 700 + seq.length * 600);
    }
    btns.forEach((b) => b.addEventListener('click', () => {
      if (!accepting || S.isOver()) return; const i = +b.dataset.i; flash(i);
      if (i !== seq[pos]) { accepting = false; S.hud.textContent = `¡Fallaste en la ronda ${seq.length}!`; later(() => S.end(true, rounds * 4, onDone), 900); return; }
      pos++;
      if (pos === seq.length) { rounds++; accepting = false; if (rounds >= 10) { later(() => S.end(true, 40, onDone), 500); return; } later(round, 700); }
    }));
    S.x0.addEventListener('click', () => S.end(false)); S.d.addEventListener('cancel', (e) => { e.preventDefault(); S.end(false); });
    S.d.showModal(); later(round, 500);
  }

  /* 🏃 Corre Pexy: toca, haz clic o pulsa espacio para saltar las rocas. Sigue mientras no choques (máx. 40 s). */
  function runner(onDone) {
    const S = shell('🏃 Corre, Pexy', 'Haz clic, toca o pulsa espacio para saltar las rocas 🪨. Dura hasta que choques.', '0 saltadas', true);
    const x = S.cv.getContext('2d'); const G = H - 40; let py = G, vy = 0, last = 0, spawn = 900, score = 0, speed = 0.2, dead = false; const t0 = performance.now(); const rocks = [];
    const jump = () => { if (py >= G - 1 && !dead) vy = -0.62; };
    S.cv.addEventListener('pointerdown', jump); const key = (e) => { if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); jump(); } };
    document.addEventListener('keydown', key); S.onClean(() => document.removeEventListener('keydown', key));
    S.x0.addEventListener('click', () => S.end(false)); S.d.addEventListener('cancel', (e) => { e.preventDefault(); S.end(false); });
    function frame(now) {
      if (S.isOver()) return;
      const dt = Math.min(40, now - (last || now)); last = now;
      if (!dead) {
        vy += 0.0021 * dt; py = Math.min(G, py + vy * dt); if (py >= G) vy = 0;
        speed = 0.2 + Math.min(0.2, (now - t0) / 100000); spawn -= dt;
        if (spawn <= 0) { spawn = 750 + Math.random() * 700 - speed * 600; rocks.push({ x: W + 20 }); }
        for (let i = rocks.length - 1; i >= 0; i--) { const r = rocks[i]; r.x -= speed * dt; if (!r.p && r.x < 40) { r.p = true; score++; } if (r.x > 38 && r.x < 70 && py > G - 22) dead = true; if (r.x < -30) rocks.splice(i, 1); }
        if (now - t0 > 40000) dead = true;
        if (dead) { S.hud.textContent = `¡Choque! ${score} rocas saltadas`; setTimeout(() => S.end(true, score * 2, onDone), 900); }
      }
      x.fillStyle = '#12182e'; x.fillRect(0, 0, W, H); x.fillStyle = '#2d3a5c'; x.fillRect(0, G + 6, W, H - G);
      x.textAlign = 'center'; x.font = '28px serif'; rocks.forEach((r) => x.fillText('🪨', r.x, G + 6));
      x.font = '34px serif'; x.fillText(dead ? '😵' : '🐼', 54, py + 6);
      if (!dead) S.hud.textContent = `${score} saltadas`;
      requestAnimationFrame(frame);
    }
    S.d.showModal(); requestAnimationFrame(frame);
  }

  window.NovaPetGames = {
    list: [
      { id: 'whack', label: '🎋 Bambú saltarín', unit: 'puntos', run: whack },
      { id: 'memory', label: '🧠 Memoria de Pexy', unit: 'puntos', run: memory },
      { id: 'runner', label: '🏃 Corre, Pexy', unit: 'puntos', run: runner }
    ]
  };
}());
