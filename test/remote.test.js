'use strict';
const assert = require('assert');
const r = require('../lib/remote');

const empty = r.sanitize(null);
assert.strictEqual(empty.features.nonPremium, true);
assert.strictEqual(empty.maintenance.enabled, false);

const c = r.sanitize({
  brand: { name: ' Nova PX ', subtitle: 'x'.repeat(200) },
  theme: { preset: 'hack', accent: 'red', season: 'navidad' },
  announcement: { enabled: true, level: 'bad', text: 'Hola', url: 'javascript:alert(1)' },
  links: { discord: 'https://discord.gg/abc', x: 'http://x.com', youtube: '"><script>' },
  defaults: { ramGb: 99 }, minVersion: '1.0', features: { nonPremium: false }
});
assert.strictEqual(c.brand.name, 'Nova PX');
assert.strictEqual(c.brand.subtitle.length, 60);
assert.strictEqual(c.theme.preset, '');
assert.strictEqual(c.theme.accent, '');
assert.strictEqual(c.theme.season, 'navidad');
assert.strictEqual(c.announcement.level, 'info');
assert.strictEqual(c.announcement.url, '');
assert.strictEqual(c.links.discord, 'https://discord.gg/abc');
assert.strictEqual(c.links.x, '');
assert.strictEqual(c.links.youtube, '');
assert.strictEqual(c.defaults.ramGb, 0);
assert.strictEqual(c.minVersion, '');
assert.strictEqual(c.features.nonPremium, false);
assert.strictEqual(r.sanitize({ theme: { accent: '#AABBCC' }, defaults: { ramGb: 6 } }).theme.accent, '#aabbcc');
assert.strictEqual(r.sanitize({ defaults: { ramGb: 6 } }).defaults.ramGb, 6);

assert.ok(r.versionLt('1.0.9', '1.0.10'));
assert.ok(!r.versionLt('1.2.0', '1.1.9'));
assert.ok(!r.versionLt('1.0.40', '1.0.40'));

const m = r.sanitize({ maintenance: { enabled: true, text: 'Vuelvo luego' }, minVersion: '1.0.50' });
assert.ok(/ya no se puede/.test(r.blockReason(m, '1.0.40')));
assert.strictEqual(r.blockReason(r.sanitize({ maintenance: { enabled: true, text: 'Vuelvo luego' } }), '1.0.40'), 'Vuelvo luego');
assert.strictEqual(r.blockReason(r.sanitize({ maintenance: { enabled: true } }), '1.0.40', { admin: true }), '');
assert.strictEqual(r.blockReason(empty, '1.0.40'), '');

const rec = r.sanitizeRecommended([{ id: 'Fabulously-Optimized', note: 'ok' }, { id: 'fabulously-optimized' }, { id: '../x' }, { id: 'a' }, null]);
assert.deepStrictEqual(rec.map((x) => x.id), ['fabulously-optimized']);
console.log('remote.test OK');
