'use strict';
const assert = require('assert');
const zlib = require('zlib');
const { parseServersDat, parseAddress } = require('../lib/servers');

const str = (s) => { const b = Buffer.from(s); const h = Buffer.alloc(2); h.writeUInt16BE(b.length); return Buffer.concat([h, b]); };
const tagStr = (name, val) => Buffer.concat([Buffer.from([8]), str(name), str(val)]);
const entry = (ip, name) => Buffer.concat([tagStr('ip', ip), tagStr('name', name), Buffer.from([1]), str('hidden'), Buffer.from([0]), Buffer.from([0])]);
const list = (items) => { const n = Buffer.alloc(4); n.writeInt32BE(items.length); return Buffer.concat([Buffer.from([9]), str('servers'), Buffer.from([10]), n, ...items]); };
const dat = Buffer.concat([Buffer.from([10]), str(''), list([entry('play.ejemplo.com', 'Evento'), entry('otro.net:25570', 'Otro')]), Buffer.from([0])]);

assert.deepStrictEqual(parseServersDat(dat), [
  { name: 'Evento', host: 'play.ejemplo.com', port: 25565 },
  { name: 'Otro', host: 'otro.net', port: 25570 }
]);
assert.strictEqual(parseServersDat(zlib.gzipSync(dat)).length, 2, 'también acepta gzip');
assert.deepStrictEqual(parseAddress('MC.Ejemplo.com'), { host: 'mc.ejemplo.com', port: 25565 });
assert.strictEqual(parseAddress('a b'), null);
assert.strictEqual(parseAddress('x:99999'), null);
assert.throws(() => parseServersDat(Buffer.from('basura')));
assert.throws(() => parseServersDat(dat.subarray(0, 20)));
console.log('servers.test OK');
