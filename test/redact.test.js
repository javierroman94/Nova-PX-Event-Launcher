'use strict';
const assert = require('assert');
const { redactSecrets } = require('../lib/redact');

const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const line = `[MCLC]: Launching with arguments java -Xmx4G net.minecraft.client.main.Main --username Pepe --uuid abc --accessToken ${jwt} --clientId abc123 --xuid 2535 --userType msa --version 1.21.1`;
const out = redactSecrets(line);
assert.ok(!out.includes(jwt), 'el token no debe aparecer');
assert.ok(!out.includes('2535') && !out.includes('abc123'), 'xuid y clientId tampoco');
assert.ok(out.includes('--username Pepe') && out.includes('--version 1.21.1'), 'el resto se conserva');
assert.ok(!redactSecrets(`Authorization: Bearer ${jwt}`).includes(jwt));
assert.ok(!redactSecrets('{"access_token":"abcdefghijklmnop1234"}').includes('abcdefghijklmnop1234'));
assert.strictEqual(redactSecrets('Saved screenshot 2025-01-01.png'), 'Saved screenshot 2025-01-01.png');
console.log('redact.test.js ok');
