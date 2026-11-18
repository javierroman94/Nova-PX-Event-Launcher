'use strict';
const assert = require('assert');
const s = require('../lib/social');

(async () => {
  const good = 'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyzABCDEF_-1234';
  assert.ok(s.validWebhook(good));
  assert.ok(s.validWebhook(good.replace('discord.com', 'discordapp.com')));
  for (const bad of ['', 'http://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz', 'https://evil.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz', 'https://discord.com.evil.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz', 'https://discord.com/api/webhooks/12/abc']) assert.ok(!s.validWebhook(bad), bad);
  const p = s.buildPayload({ title: 'T'.repeat(400), text: '@everyone hola', image: 'http://x/i.png', link: 'https://nova.px/a' });
  assert.deepStrictEqual(p.allowed_mentions, { parse: [] });
  assert.strictEqual(p.embeds[0].title.length, 250);
  assert.strictEqual(p.embeds[0].image, undefined, 'solo imágenes https');
  assert.strictEqual(p.embeds[0].url, 'https://nova.px/a');
  let sent;
  assert.ok(await s.post(async (u, o) => { sent = [u, JSON.parse(o.body)]; return { ok: true }; }, good, p));
  assert.strictEqual(sent[0], good);
  await assert.rejects(s.post(async () => ({ ok: false, status: 404 }), good, p), /no reconoce/);
  await assert.rejects(s.post(async () => ({ ok: true }), 'https://evil.com/x', p), /no es válida/);
  const x = s.xShareUrl('Hola Nova PX', 'https://nova.px');
  assert.ok(x.startsWith('https://x.com/intent/post?') && x.includes('text=Hola+Nova+PX') && x.includes('url=https%3A%2F%2Fnova.px'));
  console.log('social.test OK');
})().catch((e) => { console.error(e); process.exit(1); });
