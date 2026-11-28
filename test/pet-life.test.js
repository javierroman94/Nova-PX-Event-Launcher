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
// Dar de comer sube el hambre y da xp; sin esperas, pero con la barra llena ya no quiere más (como Talking Tom).
let r = L.act({ ...s, hunger: 30 }, 'feed', T);
assert.ok(r.ok && r.state.hunger >= 60 && r.state.xp > 0);
const r2 = L.act({ ...r.state, hunger: 98 }, 'feed', T + 1000);
assert.ok(!r2.ok && r2.full && r2.state.xp === r.state.xp);
assert.ok(L.act({ ...r.state, hunger: 50 }, 'feed', T + 1000).ok);
assert.ok(!L.act({ ...s, energy: 95 }, 'sleep', T).ok && L.act({ ...s, energy: 40 }, 'sleep', T).ok);
// Acariciar sin parar sube cariño pero no da xp de más cuando ya está al máximo.
assert.strictEqual(L.act({ ...s, love: 100 }, 'pet', T).state.xp, s.xp);
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
assert.strictEqual(L.sanitize(null, T).name, 'Pexy');
assert.strictEqual(L.sanitize({ name: 'PX' }, T).name, 'Pexy'); // nombre antiguo por defecto
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
// Autoclic: repetir la misma acción enseguida no cuenta.
const p1 = L.act({ ...s, love: 50 }, 'pet', T); assert.ok(p1.ok);
assert.ok(!L.act(p1.state, 'pet', T + 100).ok);
assert.ok(L.act(p1.state, 'pet', T + 700).ok);
// Tope diario de XP por cuidados: el bucle jugar/dormir ya no da XP infinita.
let loop = { ...s, energy: 60 }; let tt = T;
for (let i = 0; i < 200; i++) { tt += 2000; const a = L.act(loop, i % 2 ? 'sleep' : 'play', tt); if (a.ok) loop = a.state; }
assert.ok(loop.xp - s.xp <= L.XP_CAP.care, 'los cuidados no pasan del tope diario');
assert.strictEqual(L.xpLeft(loop, tt).care, 0);
// Al día siguiente vuelve a haber XP.
const next = L.act({ ...loop, hunger: 40 }, 'feed', T + 24 * H + 5000);
assert.ok(next.ok && next.state.xp > loop.xp);
// Tope diario de XP por minijuegos, y sin energía el resultado no cuenta.
let mgS = { ...s, energy: 100 }; let gx = 0;
for (let i = 0; i < 30; i++) { const m = L.minigame({ ...mgS, energy: 100 }, 40, T + i); gx += m.state.xp - mgS.xp; mgS = m.state; }
assert.ok(gx <= L.XP_CAP.game);
assert.ok(L.minigame({ ...s, energy: 5 }, 40, T).tired);
assert.strictEqual(L.minigame({ ...s, energy: 5 }, 40, T).state.xp, s.xp);
// Diseño de Pexy: rosa (oficial) o sudadera; cualquier otro valor vuelve al rosa.
assert.strictEqual(L.fresh(T).design, 'rosa');
assert.strictEqual(L.setDesign(s, 'sudadera').design, 'sudadera');
assert.strictEqual(L.setDesign(s, 'dragon').design, 'rosa');
assert.strictEqual(L.sanitize({ design: '<img>' }, T).design, 'rosa');
assert.strictEqual(L.sanitize({ design: 'sudadera' }, T).design, 'sudadera');
// Personalidad: se elige una vez y se conserva; la favorita le sienta mejor.
const ps = L.withPersonality(s, 0.99); assert.ok(L.PERSONALITIES.some((x) => x.id === ps.pers));
assert.strictEqual(L.withPersonality(ps, 0).pers, ps.pers);
assert.strictEqual(L.sanitize({ pers: 'malvado' }, T).pers, '');
const fav = L.act({ ...s, pers: 'carinoso', love: 50 }, 'pet', T); const plain = L.act({ ...s, pers: 'gloton', love: 50 }, 'pet', T);
assert.ok(fav.fav && fav.state.love > plain.state.love);
// Felicidad entre 0 y 100.
assert.strictEqual(L.happiness({ hunger: 100, energy: 100, love: 100 }), 100);
assert.strictEqual(L.happiness({ hunger: 0, energy: 0, love: 0 }), 0);
// Contadores diarios manipulados se limpian.
assert.ok(L.sanitize({ xpd: { day: '2026-11-19', care: 9999, game: -5 } }, T).xpd.care <= L.XP_CAP.care);
console.log('pet-life.test OK');
