'use strict';
const assert = require('assert');
const P = require('../lib/permisos');
const admin = require('../lib/admin');

const owners = ['Javier'];
const uuid = (n) => String(n).repeat(32).slice(0, 32);
const admins = [
  { nick: 'Admin1', uuid: uuid(1) },
  { nick: 'Mod1', uuid: uuid(2), rol: 'moderador' },
  { nick: 'Custom', uuid: uuid(3), rol: 'moderador', permisos: ['plugins', 'permisos', 'inventado'] }
];
const ses = (name, u) => ({ mode: 'premium', name, uuid: u });

// Dueño: todo
const o = P.permisosDeSesion(ses('javier', uuid(9)), owners, admins);
assert.strictEqual(o.rol, 'dueno');
assert.ok(P.TODOS.every((p) => o.permisos.has(p)));

// Administrador sin rol guardado: todo menos permisos
const a = P.permisosDeSesion(ses('Admin1', uuid(1)), owners, admins);
assert.strictEqual(a.rol, 'administrador');
assert.ok(a.permisos.has('eventos') && !a.permisos.has('permisos'));

// Moderador
const m = P.permisosDeSesion(ses('Mod1', uuid(2)), owners, admins);
assert.deepStrictEqual([...m.permisos].sort(), ['moderacion', 'noticias', 'usuarios']);

// Permisos propios reemplazan al rol; "permisos" y valores inventados se descartan
const c = P.permisosDeSesion(ses('Custom', uuid(3)), owners, admins);
assert.deepStrictEqual([...c.permisos], ['plugins']);

// Cuentas que no son admin, o no premium
assert.strictEqual(P.permisosDeSesion(ses('Otro', uuid(7)), owners, admins), null);
assert.strictEqual(P.permisosDeSesion({ mode: 'offline', name: 'Javier', uuid: uuid(9) }, owners, admins), null);
assert.strictEqual(P.permisosDeSesion(null, owners, admins), null);
// Un nick igual al de un dueño pero offline no cuenta (ya cubierto), y el uuid del admin con otro nick sí
assert.ok(P.permisosDeSesion(ses('OtroNombre', uuid(1)), owners, admins));

// Permisos requeridos por canal
assert.ok(P.permite(m.permisos, P.CANALES['admin:warningAct']));
assert.ok(!P.permite(m.permisos, P.CANALES['admin:publishEvent']));
assert.ok(P.permite(m.permisos, P.CANALES['admin:uploadImage']), 'moderador sube imágenes de noticias');
assert.ok(!P.permite(a.permisos, P.CANALES['admin:saveAdmins']));
assert.ok(!P.permite(a.permisos, P.CANALES['admin:signKeyImport']));
assert.ok(P.permite(o.permisos, P.CANALES['admin:saveAdmins']));

// Todas las pestañas y canales apuntan a permisos que existen
for (const v of Object.values(P.PESTANAS)) assert.ok(P.TODOS.includes(v), v);
for (const v of Object.values(P.CANALES).flat()) assert.ok(P.TODOS.includes(v), v);
for (const v of Object.values(P.ARCHIVOS)) assert.ok(P.TODOS.includes(v), v);

// El filtro de ipc deja pasar o rechaza
(async () => {
  const handlers = {};
  const ipc = { handle: (ch, fn) => { handlers[ch] = fn; } };
  let who = m;
  P.gatePermisos(ipc, async () => who);
  ipc.handle('admin:publishEvent', async () => 'ok');
  ipc.handle('admin:warningAct', async () => 'ok');
  ipc.handle('admin:status', async () => 'ok');
  await assert.rejects(() => handlers['admin:publishEvent']({}), /no tiene permiso/);
  assert.strictEqual(await handlers['admin:warningAct']({}), 'ok');
  assert.strictEqual(await handlers['admin:status']({}), 'ok', 'lo que no tiene permiso asignado no se filtra');
  who = null;
  await assert.rejects(() => handlers['admin:warningAct']({}), /no tiene permiso/);

  // sanitizeAdmins conserva rol y permisos válidos
  const clean = admin.sanitizeAdmins([
    { nick: 'Mod1', uuid: uuid(2), rol: 'moderador' },
    { nick: 'Cus', uuid: uuid(3), permisos: ['eventos', 'permisos', 'x', 'eventos'] },
    { nick: 'Raro', uuid: uuid(4), rol: 'dios' }
  ]);
  assert.deepStrictEqual(clean[0], { nick: 'Mod1', uuid: uuid(2), rol: 'moderador' });
  assert.deepStrictEqual(clean[1], { nick: 'Cus', uuid: uuid(3), permisos: ['eventos'] });
  assert.deepStrictEqual(clean[2], { nick: 'Raro', uuid: uuid(4) }, 'un rol desconocido vuelve a administrador');
  console.log('permisos.test OK');
})().catch((e) => { console.error(e); process.exit(1); });
