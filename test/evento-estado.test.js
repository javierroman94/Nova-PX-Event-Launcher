'use strict';
const assert = require('assert');
const { estadoEfectivo } = require('../lib/evento-estado');
const admin = require('../lib/admin');

const ahora = Date.parse('2026-12-01T12:00:00Z');
const futuro = '2026-12-02T12:00:00Z';
const pasado = '2026-11-30T12:00:00Z';

assert.strictEqual(estadoEfectivo({ status: 'active' }, ahora), 'active');
assert.strictEqual(estadoEfectivo({ status: 'ended' }, ahora), 'ended');
assert.strictEqual(estadoEfectivo({ status: 'soon', startsAt: pasado }, ahora), 'soon', 'sin autoStart no se abre solo');
assert.strictEqual(estadoEfectivo({ status: 'soon', autoStart: true, startsAt: futuro }, ahora), 'soon');
assert.strictEqual(estadoEfectivo({ status: 'soon', autoStart: true, startsAt: pasado }, ahora), 'active', 'programado: se abre a la hora');
assert.strictEqual(estadoEfectivo({ status: 'soon', autoStart: true, startsAt: '' }, ahora), 'soon');
assert.strictEqual(estadoEfectivo({ status: 'ended', autoStart: true, startsAt: pasado }, ahora), 'ended');
assert.strictEqual(estadoEfectivo({ active: false }, ahora), 'soon');
assert.strictEqual(estadoEfectivo({ active: true }, ahora), 'active');
assert.strictEqual(estadoEfectivo(null, ahora), 'active');

// mergeManifest: programar y volver a publicar
const base = { event: { name: 'X', status: 'ended' }, minecraftVersion: '1.21.1' };
const prog = admin.mergeManifest(base, { status: 'soon', active: false, autoStart: true, startsAt: futuro });
assert.strictEqual(prog.event.autoStart, true);
assert.strictEqual(prog.event.status, 'soon');
const ya = admin.mergeManifest(prog, { status: 'active', active: true, autoStart: false });
assert.strictEqual(ya.event.autoStart, false);
const fin = admin.mergeManifest(prog, { status: 'ended' });
assert.strictEqual(fin.event.autoStart, false, 'al finalizar deja de ser programado');
const sinBandera = admin.mergeManifest(prog, { name: 'Otro nombre' });
assert.strictEqual(sinBandera.event.autoStart, true, 'editar otros datos no cambia la programación');
const noSoon = admin.mergeManifest(base, { status: 'active', autoStart: true });
assert.strictEqual(noSoon.event.autoStart, false, 'autoStart solo vale para próximamente');

// La biblioteca guarda a qué evento publicado corresponde cada tarjeta
const lib = admin.sanitizeEventLibrary([{ id: 'a', name: 'A', publishedId: 'backrooms-2026-11-22' }, { id: 'b', name: 'B', publishedId: '<x>' }]);
assert.strictEqual(lib[0].publishedId, 'backrooms-2026-11-22');
assert.strictEqual(lib[1].publishedId, 'x');

console.log('evento-estado.test OK');
