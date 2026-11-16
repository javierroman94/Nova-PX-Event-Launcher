'use strict';
const assert = require('assert');
const { GithubRepo } = require('../lib/github');
const calls = [];
const fetchImpl = async (url) => {
  calls.push(url);
  const ok = (data) => ({ ok: true, status: 200, json: async () => data });
  if (url.includes('/commits?')) return ok([{ sha: 'a'.repeat(40), commit: { message: 'Noticias\n\ncuerpo', author: { name: 'Javier', date: '2026-11-01T10:00:00Z' } } }]);
  if (url.includes('/contents/data/news.json?ref=' + 'b'.repeat(40))) return ok({ content: Buffer.from('[{"title":"x"}]').toString('base64') });
  return { ok: false, status: 404, json: async () => ({ message: 'no' }) };
};
(async () => {
  const r = new GithubRepo({ owner: 'o', repo: 'r', token: 't', fetchImpl });
  const h = await r.history('data/news.json', 5);
  assert.strictEqual(h[0].message, 'Noticias');
  assert.strictEqual(h[0].author, 'Javier');
  assert.ok(calls[0].includes('path=data%2Fnews.json') && calls[0].includes('per_page=5'));
  assert.deepStrictEqual(await r.jsonAt('data/news.json', 'b'.repeat(40)), [{ title: 'x' }]);
  await assert.rejects(r.jsonAt('data/news.json', '../../x'), /no válida/);
  console.log('history.test OK');
})();
