'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { classifyNetworkError } = require('../lib/errors');
const { repairInstance } = require('../lib/repair');

assert.strictEqual(classifyNetworkError(new Error('getaddrinfo ENOTFOUND github.com')), 'offline');
assert.strictEqual(classifyNetworkError({ code: 'ETIMEDOUT', message: 'x' }), 'offline');
assert.strictEqual(classifyNetworkError(new Error('Cannot find latest.yml in the latest release artifacts (404)')), 'notfound');
assert.strictEqual(classifyNetworkError(new Error('HttpError: 403 rate limit exceeded')), 'ratelimit');
assert.strictEqual(classifyNetworkError(new Error('503 Service Unavailable')), 'server');
assert.strictEqual(classifyNetworkError(new Error('algo raro')), 'other');
console.log('  ok  errores: la causa de red se clasifica');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rep-'));
const dir = path.join(root, 'instancias', 'ev');
fs.mkdirSync(path.join(dir, 'mods'), { recursive: true });
fs.mkdirSync(path.join(dir, 'saves'), { recursive: true });
fs.writeFileSync(path.join(dir, 'mods', 'a.jar'), 'x');
fs.writeFileSync(path.join(dir, '.pack-state.json'), '{}');
fs.writeFileSync(path.join(dir, 'saves', 'mundo.txt'), 'x');
assert.strictEqual(repairInstance(dir), 2);
assert.ok(!fs.existsSync(path.join(dir, 'mods', 'a.jar')));
assert.ok(fs.existsSync(path.join(dir, 'saves', 'mundo.txt')), 'los mundos no se tocan');
assert.throws(() => repairInstance(root));
fs.rmSync(root, { recursive: true, force: true });
console.log('  ok  reparar: borra mods y marcas, respeta mundos y rutas ajenas');
