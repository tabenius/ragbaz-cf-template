import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSiteWorker } from '../src/worker.js';
import { validateSite, renderPage } from '../src/site.js';

const site = JSON.parse(await readFile(new URL('../sites/weftmark/site.json', import.meta.url)));
const request = (path = '/', options) => new Request(`https://preview.example${path}`, options);
const worker = createSiteWorker(site);

test('canonical URLs come from project configuration, not request host', async () => {
  const response = await worker.fetch(request('/'));
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.ok(html.includes('href="https://weftmark.ragbaz.cc/"'));
  assert.ok(!html.includes('preview.example'));
  assert.ok(html.includes('Prototype'));
});
test('text and attributes are escaped and executable links refused', () => {
  const copy = structuredClone(site);
  copy.name = '<script>alert("x")</script>';
  assert.ok(renderPage(copy).includes('&lt;script&gt;'));
  copy.links[0].href = 'javascript:alert(1)';
  assert.throws(() => createSiteWorker(copy), /Unsupported link/);
  copy.links[0].href = 'https://user:secret@example.com';
  assert.throws(() => validateSite(copy), /Unsupported link/);
});
test('all response paths have security headers and HEAD has no body', async () => {
  for (const path of ['/', '/healthz', '/robots.txt', '/sitemap.xml', '/index.html', '/missing', '/assets/missing.css']) {
    for (const method of ['GET', 'HEAD']) {
      const response = await worker.fetch(request(path, { method }));
      assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
      assert.ok(response.headers.get('Content-Security-Policy').includes("frame-ancestors 'none'"));
      assert.equal(response.headers.get('Set-Cookie'), null);
      if (method === 'HEAD') assert.equal(await response.text(), '');
    }
  }
});
test('unknown URLs return a real styled 404, never a home-page fallback', async () => {
  const response = await worker.fetch(request('/not-a-page'));
  assert.equal(response.status, 404);
  assert.ok((await response.text()).includes('noindex'));
});
test('website core refuses writes and arbitrary proxy paths', async () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const response = await worker.fetch(request('/api/run', { method }));
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('Allow'), 'GET, HEAD');
  }
  assert.equal((await worker.fetch(request('/api/run'))).status, 404);
});
test('asset responses receive headers; absent, failed and missing assets stay distinct', async () => {
  assert.equal((await worker.fetch(request('/assets/site.css'))).status, 503);
  assert.equal((await worker.fetch(request('/assets/site.css'), { ASSETS: { fetch() { throw new Error('private detail'); } } })).status, 503);
  const missing = await worker.fetch(request('/assets/no.css'), { ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } });
  assert.equal(missing.status, 404);
  const good = await worker.fetch(request('/assets/site.css'), { ASSETS: { fetch: async () => new Response('body{}', { headers: { 'Content-Type': 'text/css', 'Set-Cookie': 'unexpected=1' } }) } });
  assert.equal(good.headers.get('Content-Type'), 'text/css');
  assert.equal(good.headers.get('Set-Cookie'), null);
  assert.equal(good.headers.get('X-Frame-Options'), 'DENY');
});
test('redirects preserve query and do not use untrusted host', async () => {
  const response = await worker.fetch(request('/index.html?from=old'));
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('Location'), '/?from=old');
});
test('health is explicitly website-only and never cached', async () => {
  const response = await worker.fetch(request('/healthz'));
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal((await response.json()).scope, 'website-only');
});
test('configuration rejects path origins, duplicate ids and unsupported schemas', () => {
  for (const patch of [{ origin: 'https://example.com/path' }, { schema: 'unknown' }, { slug: '../bad' }, { sections: [...site.sections, site.sections[0]] }]) {
    assert.throws(() => validateSite({ ...site, ...patch }));
  }
});
test('all project configurations render factual status and only first-party scripts', async () => {
  for (const slug of ['weftmark', 'nostoi', 'sylvae', 'rebekah']) {
    const config = JSON.parse(await readFile(new URL(`../sites/${slug}/site.json`, import.meta.url)));
    const response = await createSiteWorker(config).fetch(request());
    const html = await response.text();
    assert.ok(html.includes(config.name));
    assert.ok(!/<script[^>]+src="https?:/.test(html));
    assert.ok(!html.includes('fonts.googleapis.com'));
  }
});
