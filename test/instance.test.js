'use strict';
const assert = require('assert');
const path = require('path');
const { instanceId, instanceDir } = require('../lib/instance');

assert.strictEqual(instanceId({ event: { id: 'OneBlock-1000' } }), 'oneblock-1000');
assert.strictEqual(instanceId({ event: {} }), 'evento');
assert.strictEqual(instanceId({}), 'evento');
// Un id malicioso no puede salirse de la carpeta de instancias.
for (const bad of ['../../etc', '..', 'a/b', 'a\\b', '', '.hidden', 'x'.repeat(60)]) {
  assert.strictEqual(instanceId({ event: { id: bad } }), 'evento', bad);
}
assert.strictEqual(instanceDir('/g', { event: { id: 'ob' } }), path.join('/g', 'instancias', 'ob'));
console.log('  ok  instancias: cada evento tiene su carpeta y los ids inseguros se descartan');
