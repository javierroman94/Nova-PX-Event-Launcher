'use strict';
const assert = require('assert');
const L = require('../renderer/pet-life.js');
const T = new Date(2026, 10, 19, 12, 0, 0).getTime();
const H = 3600000;

let s = L.fresh(T);
// El tiempo baja las necesidades, con tope de 12 horas.
let t = L.tick(s, T + 2 * H);
assert.ok(t.hunger < s.hunger && t.energy < s.energy && t.love < s.love);
const long = L.tick(s, T + 100 * H);
assert.strictEqual(long.hunger, L.tick(s, T + 12 * H).hunger);
// Dar de comer sube el hambre y da xp; pedirlo otra vez pronto falla con tiempo de espera.
let r = L.act({ ...s, hunger: 30 }, 'feed', T);
assert.ok(r.ok && r.state.hunger >= 60 && r.state.xp > 0);
const r2 = L.act(r.state, 'feed', T + 1000);
assert.ok(!r2.ok && r2.wait > 0);
assert.ok(L.act(r.state, 'feed', T + L.CD.feed + 1).ok);
// Jugar cansa; muy cansado no juega.
assert.ok(!L.act({ ...s, energy: 5 }, 'play', T).ok);
assert.ok(L.act(s, 'play', T).state.energy < s.energy);
// Acción desconocida no hace nada.
assert.ok(!L.act(s, 'volar', T).ok);
// Niveles.
assert.strictEqual(L.level(0), 1);
assert.strictEqual(L.level(30), 2);
assert.strictEqual(L.level(99999), 10);
assert.strictEqual(L.progress(99999).pct, 100);
assert.strictEqual(L.progress(55).level, 2);
// Humor.
assert.strictEqual(L.mood({ hunger: 10, energy: 90, love: 90 }), 'hambre');
assert.strictEqual(L.mood({ hunger: 90, energy: 90, love: 90 }), 'feliz');
// Racha: mismo día no suma, día seguido sí, salto de días reinicia.
let v = L.visit(s, T); assert.ok(v.fresh && v.state.streak === 1);
assert.ok(!L.visit(v.state, T + H).fresh);
v = L.visit(v.state, T + 24 * H); assert.strictEqual(v.state.streak, 2);
v = L.visit(v.state, T + 5 * 24 * H); assert.strictEqual(v.state.streak, 1);
// Datos dañados o manipulados se limpian.
const bad = L.sanitize({ name: '<b>Hack</b>xxxxxxxxxxxxxxxxxxxx', hunger: 'x', energy: 500, love: -4, xp: -9, streak: 'a', last: T + 99 * H, cd: { feed: T + 9e12 } }, T);
assert.ok(!/[<>]/.test(bad.name) && bad.name.length <= 16);
assert.strictEqual(bad.energy, 100); assert.strictEqual(bad.love, 0); assert.strictEqual(bad.xp, 0);
assert.ok(bad.last <= T && bad.cd.feed <= T + L.CD.feed);
assert.strictEqual(L.sanitize(null, T).name, 'PX');
// Tiempo de juego.
const g = L.gameTime(s, 120); assert.ok(g.xp >= 30 && g.energy < s.energy);
// Minijuego: puntos limitados, récord y cansancio.
let mg = L.minigame(s, 999, T); assert.strictEqual(mg.state.best, 40); assert.ok(mg.record);
assert.ok(mg.state.love <= 100 && mg.state.xp <= s.xp + 12 && mg.state.energy < s.energy);
assert.ok(!L.minigame(mg.state, 10, T).record);
assert.strictEqual(L.minigame(s, 'x', T).state.best, 0);
// Accesorios: se desbloquean por nivel/racha, y los bloqueados no se pueden poner.
assert.strictEqual(L.equip(s, 'crown').acc, '');
assert.strictEqual(L.equip({ ...s, xp: 30 }, 'bow').acc, 'bow');
assert.ok(L.canWear({ ...s, streak: 3 }, 'scarf') && !L.canWear(s, 'scarf'));
assert.strictEqual(L.equip({ ...s, acc: 'bow' }, '').acc, '');
assert.strictEqual(L.sanitize({ acc: 'hackeo' }, T).acc, '');
assert.strictEqual(L.sanitize({ acc: 'hat' }, T).acc, 'hat');
console.log('pet-life.test OK');
