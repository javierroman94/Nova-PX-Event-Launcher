'use strict';
// Pexy 3D: el motor dibuja los dos diseños en todas las animaciones y con cada accesorio, sin coordenadas rotas.
// Además, la web usa copias exactas de los archivos compartidos del launcher.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
for (const f of ['mob3d.js', 'pet-life.js', 'pet-games.js']) {
  const a = fs.readFileSync(path.join(root, 'renderer', f), 'utf8');
  const b = fs.readFileSync(path.join(root, 'docs', 'assets', 'js', f), 'utf8');
  assert.strictEqual(a, b, `docs/assets/js/${f} debe ser igual a renderer/${f} (cópialo tras cada cambio)`);
}

// Canvas falso que registra lo que se dibuja.
function fakeCtx(log) {
  const num = (...v) => v.forEach((n) => { if (typeof n === 'number') assert.ok(Number.isFinite(n), 'coordenada no finita'); });
  return new Proxy({ log }, {
    get(t, k) {
      if (k === 'log') return log;
      if (['moveTo', 'lineTo', 'ellipse', 'transform', 'fillText', 'drawImage', 'fillRect'].includes(k)) return (...a) => { num(...a); log.push(k); };
      return typeof k === 'string' ? (() => {}) : undefined;
    },
    set() { return true; }
  });
}
const sandbox = {
  window: {},
  document: { createElement: () => ({ getContext: () => ({ fillRect() {}, set fillStyle(v) {} }), width: 0, height: 0 }) },
  Math, Map, Object, Array, Number, String, JSON
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'renderer', 'mob3d.js'), 'utf8'), sandbox);
const M = sandbox.window.NovaMob3D;
assert.ok(M && M.names.includes('px'), 'el motor expone a Pexy');
assert.deepStrictEqual([...M.designs], ['rosa', 'sudadera']);
assert.deepStrictEqual([...M.accessories].sort(), ['bow', 'crown', 'glasses', 'hat', 'scarf']);
for (const a of ['idle', 'walk', 'run', 'jump', 'dance', 'sleep', 'eat', 'celebrate', 'pet', 'hungry', 'tired', 'sad', 'happy']) assert.ok(M.acts.includes(a), 'falta la animación ' + a);

let base = 0;
for (const design of M.designs) {
  for (const act of M.acts) {
    for (const acc of [''].concat(M.accessories)) {
      for (const still of [false, true]) {
        const log = [];
        const ok = M.draw(fakeCtx(log), { name: 'px', design, act, acc, dir: act === 'walk' ? -1 : 1, ph: 2.3, secs: 1.7, scale: 0.7, still }, 100, 200);
        assert.ok(ok, `${design}/${act}/${acc}`);
        const polys = log.filter((x) => x === 'drawImage').length;
        assert.ok(polys > 40, `${design}/${act}/${acc}: pocas caras dibujadas (${polys})`);
        if (!acc && act === 'idle' && !still) base = polys;
        if (acc && act === 'idle' && !still) assert.ok(polys > base - 6, `el accesorio ${acc} se dibuja`);
      }
    }
  }
}
// Parpadeo: en algún momento del ciclo cierra los ojos (en reposo y sin movimiento reducido).
const eyesAt = (secs) => M.pose('idle', 1, secs, false).eyes;
assert.ok(['open', 'closed'].every((e) => [0.05, 1, 2, 4.25].map(eyesAt).includes(e)), 'parpadea');
// Movimiento reducido: la pose no cambia con el tiempo.
assert.deepStrictEqual(JSON.stringify(M.pose('walk', 1, 1, true)), JSON.stringify(M.pose('walk', 7, 9, true)));
// Animaciones con gestos propios.
assert.strictEqual(M.pose('sleep', 1, 1, false).eyes, 'closed');
assert.strictEqual(M.pose('celebrate', 1, 1, false).eyes, 'happy');
assert.ok(M.pose('eat', 0.3, 1, false).armA.rx < -1, 'al comer sube la pata a la boca');
// Las demás criaturas siguen dibujándose.
for (const n of M.names) assert.ok(M.draw(fakeCtx([]), { name: n, dir: 1, ph: 1, moving: true, y: 0, groundY: 300 }, 50, 300), n);
console.log('pexy-3d.test OK');
