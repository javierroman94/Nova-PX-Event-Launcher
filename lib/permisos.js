'use strict';
/*
 * Permisos del modo administrador. Cada acción del panel pertenece a un permiso; cada persona tiene un rol
 * (administrador o moderador) y, si el dueño lo quiere, una lista propia de permisos que reemplaza la del rol.
 * El dueño (config.adminOwners) siempre lo tiene todo. El permiso "permisos" es solo del dueño.
 *
 * Esto limita lo que se puede hacer desde el launcher. No cambia lo que GitHub deja hacer a quien tenga
 * un token con escritura: por eso los archivos críticos de data/ van firmados y solo el dueño tiene la llave (lib/firma.js).
 */
const PERMISOS = {
  eventos: 'Eventos y modpack del evento',
  noticias: 'Noticias',
  contenido: 'Equipo y publicidad',
  plugins: 'Plugins',
  moderacion: 'Advertencias de nicks',
  usuarios: 'Usuarios (contador)',
  ajustes: 'Ajustes, apariencia, Discord y estado',
  permisos: 'Permisos de administradores'
};
const TODOS = Object.keys(PERMISOS);
const ROLES = {
  administrador: TODOS.filter((p) => p !== 'permisos'),
  moderador: ['moderacion', 'usuarios', 'noticias']
};
const ROL_NOMBRE = { dueno: 'Dueño', administrador: 'Administrador', moderador: 'Moderador' };

// Pestaña del panel -> permiso
const PESTANAS = {
  event: 'eventos', events: 'eventos', reco: 'eventos',
  news: 'noticias', team: 'contenido', ads: 'contenido', plugins: 'plugins',
  warnings: 'moderacion', users: 'usuarios',
  look: 'ajustes', config: 'ajustes', control: 'ajustes', status: 'ajustes',
  perms: 'permisos'
};

// Canal IPC -> permiso (o lista: basta con uno). Lo que no está aquí solo pide ser administrador.
const IMAGENES = ['eventos', 'noticias', 'contenido'];
const CANALES = {
  'admin:publishEvent': 'eventos', 'admin:evlibList': 'eventos', 'admin:evlibSave': 'eventos', 'admin:saveEvents': 'eventos', 'admin:setEventState': 'eventos', 'admin:saveRecommended': 'eventos',
  'admin:packSummary': 'eventos', 'admin:passwordCheck': 'eventos', 'admin:passwordSaved': 'eventos', 'admin:passwordRemember': 'eventos',
  'admin:pickImage': IMAGENES, 'admin:uploadImage': IMAGENES,
  'admin:saveNews': 'noticias',
  'admin:saveTeam': 'contenido', 'admin:saveAds': 'contenido', 'admin:adsStats': 'contenido',
  'admin:pluginPick': 'plugins', 'admin:pluginList': 'plugins', 'admin:pluginPublish': 'plugins', 'admin:pluginSetLock': 'plugins',
  'admin:pluginSaveInfo': 'plugins', 'admin:pluginRemove': 'plugins',
  'admin:warnings': 'moderacion', 'admin:nickScan': 'moderacion', 'admin:warningAct': 'moderacion', 'admin:resolveNick': ['moderacion', 'permisos'],
  'admin:usersKey': 'usuarios', 'admin:users': 'usuarios', 'admin:userDelete': 'usuarios',
  'admin:saveLauncher': 'ajustes',
  'admin:saveAdmins': 'permisos', 'admin:invite': 'permisos', 'admin:signKeyImport': 'permisos', 'admin:signKeyStatus': 'permisos'
};

// Archivo de data/ -> permiso (para historial y restaurar versiones)
const ARCHIVOS = {
  launcher: 'ajustes', recommended: 'eventos', news: 'noticias', events: 'eventos', team: 'contenido', ads: 'contenido',
  nicks: 'moderacion', warnings: 'moderacion', admins: 'permisos', manifest: 'eventos', plugins: 'plugins'
};

const norm = (u) => String(u || '').replace(/-/g, '').toLowerCase();

// Permisos de una entrada de data/admins.json
function permisosDe(entry) {
  if (entry && Array.isArray(entry.permisos)) return entry.permisos.filter((p) => TODOS.includes(p) && p !== 'permisos');
  return ROLES[entry && ROLES[entry.rol] ? entry.rol : 'administrador'];
}

// { rol, permisos: Set } de la sesión, o null si no es administrador.
function permisosDeSesion(session, owners, admins) {
  if (!session || session.mode !== 'premium') return null;
  const name = String(session.name || '').toLowerCase();
  if ((owners || []).some((o) => String(o).toLowerCase() === name)) return { rol: 'dueno', permisos: new Set(TODOS) };
  const entry = (admins || []).find((a) => a && norm(a.uuid) === norm(session.uuid));
  if (!entry) return null;
  return { rol: ROLES[entry.rol] ? entry.rol : 'administrador', permisos: new Set(permisosDe(entry)) };
}

function permite(permisos, necesita) {
  const lista = Array.isArray(necesita) ? necesita : [necesita];
  return lista.some((p) => permisos && permisos.has(p));
}

// Envuelve ipc.handle: los canales de CANALES solo se atienden si la persona tiene el permiso.
function gatePermisos(ipc, resolver) {
  const handle = ipc.handle.bind(ipc);
  ipc.handle = (channel, fn) => {
    const necesita = CANALES[channel];
    if (!necesita) return handle(channel, fn);
    return handle(channel, async (e, ...args) => {
      const info = await resolver();
      if (!info || !permite(info.permisos, necesita)) throw new Error('Tu rol no tiene permiso para esto.');
      return fn(e, ...args);
    });
  };
}

module.exports = { PERMISOS, TODOS, ROLES, ROL_NOMBRE, PESTANAS, CANALES, ARCHIVOS, permisosDe, permisosDeSesion, permite, gatePermisos };
