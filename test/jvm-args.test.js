'use strict';
const assert = require('assert');
const { defaultJvmArgs, initialMemoryGb } = require('../lib/jvm-args');

assert.ok(defaultJvmArgs({ javaMajor: 21 }).includes('-XX:+UseG1GC'));
assert.ok(defaultJvmArgs({ javaMajor: 17 }).length > 5);
assert.deepStrictEqual(defaultJvmArgs({ javaMajor: 8 }), []); // Java 8 (Minecraft viejo): no se tocan los argumentos
assert.deepStrictEqual(defaultJvmArgs({ javaMajor: null }), []);
assert.deepStrictEqual(defaultJvmArgs({ javaMajor: 21, customArgs: ['-Xss1M'] }), []); // lo que escribe el jugador manda
assert.ok(!defaultJvmArgs({ javaMajor: 21 }).some((a) => /^-Xm[sx]/.test(a))); // la memoria la pone el launcher
assert.strictEqual(initialMemoryGb(2), 2);
assert.strictEqual(initialMemoryGb(8), 4);
assert.strictEqual(initialMemoryGb(undefined), 2);
console.log('jvm-args.test OK');
