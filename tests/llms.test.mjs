// llms.txt v2 and the Markdown twins.
//
// The properties worth protecting: the map validates against the spec, every link
// in it resolves to a page that actually exists, the twins and the HTML pages
// come from one source, and a draft never appears in either.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { createSiteWorker } from '../src/worker.js';
import { llmsManifest, llmsText, markdownTwin } from '../src/llms.js';
import { validateManifest } from '../src/content/llms-txt.js';

const sitePath = fileURLToPath(new URL('../sites/weftmark/site.json', import.meta.url));
const site = JSON.parse(await readFile(sitePath, 'utf8'));

const get = async (path, worker = createSiteWorker(site)) => worker.fetch(new Request(`https://weftmark.ragbaz.cc${path}`));

test('the manifest is valid against the llms.txt v2 rules', () => {
  assert.deepEqual(validateManifest(llmsManifest(site)), []);
});

test('llms.txt has the required section order', () => {
  const text = llmsText(site);
  const lines = text.split('\n');
  assert.equal(lines[0], '# WeftMark');
  assert.match(lines[2], /^> /, 'a blockquote summary follows the H1');
  const firstH2 = text.indexOf('\n## ');
  assert.ok(firstH2 > 0);
  assert.ok(text.slice(0, firstH2).indexOf('## ') === -1, 'no H2 before the first section');
  assert.match(text, /## Publications\n\n- \[/, 'a blank line separates the heading from its list');
});

test('every link in llms.txt resolves to a real page', async () => {
  const links = [...llmsText(site).matchAll(/^- \[[^\]]+\]\((\/[^)]+)\)/gm)].map((m) => m[1]);
  assert.ok(links.length > 3, `expected several links, got ${links.length}`);
  for (const link of links) {
    if (link.endsWith('.md') === false) continue;
    const response = await get(link);
    assert.equal(response.status, 200, `${link} should resolve`);
    assert.match(response.headers.get('content-type'), /text\/markdown/);
  }
});

test('llms.txt is served at the site root', async () => {
  const response = await get('/llms.txt');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/markdown/);
  assert.match(await response.text(), /^# WeftMark/);
});

test('llms.txt declares itself as describedby', async () => {
  const response = await get('/llms.txt');
  assert.match(response.headers.get('link'), /rel="describedby"/);
});

test('HTML pages advertise both link relations', async () => {
  const response = await get('/');
  const link = response.headers.get('link');
  assert.match(link, /rel="alternate"; type="text\/markdown"/);
  assert.match(link, /rel="describedby"/);
});

test('the advertised alternate matches the twin that is served', async () => {
  const response = await get('/workflow/');
  const link = response.headers.get('link');
  const alternate = link.match(/<([^>]+)>; rel="alternate"/)[1];
  const twin = await get(new URL(alternate).pathname);
  assert.equal(twin.status, 200);
  assert.match(await twin.text(), /^# /);
});

test('a Markdown twin carries the page content', async () => {
  const response = await get('/workflow.md');
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /^# A chain of reasons for an engineering decision/);
  assert.ok(body.includes('Purpose, bounded work'), 'the description is included');
  assert.ok(body.split('## ').length > 2, 'sections are carried over');
});

test('both v2 twin spellings resolve to the same page', async () => {
  const short = await (await get('/workflow.md')).text();
  const long = await (await get('/workflow/index.html.md')).text();
  assert.equal(short, long);
});

test('a twin points back at its HTML page', async () => {
  const response = await get('/workflow.md');
  assert.match(response.headers.get('link'), /rel="alternate"; type="text\/html"/);
});

test('a draft has no twin and no llms.txt entry', async () => {
  const withDraft = { ...site, pages: [...site.pages, { id: 'secret', path: '/secret/', kind: 'article', title: 'Draft', description: 'Not ready.', status: 'draft', created: site.updated, updated: site.updated, sections: [{ id: 'draft', title: 'Private', paragraphs: ['Private draft body'] }] }] };
  assert.equal(markdownTwin(withDraft, '/secret/'), null);
  assert.ok(!llmsText(withDraft).includes('Draft'));
  const response = await get('/secret.md', createSiteWorker(withDraft));
  assert.equal(response.status, 404);
});

test('an unknown path has no twin', async () => {
  assert.equal(markdownTwin(site, '/nothing-here/'), null);
  assert.equal((await get('/nothing-here.md')).status, 404);
});

test('a traversal attempt in a twin path is not served', async () => {
  for (const path of ['/../package.md', '/workflow/../../package.md', '/%2e%2e/package.md']) {
    const response = await get(path);
    assert.ok(response.status === 404 || response.status === 400, `${path} -> ${response.status}`);
  }
});

test('HEAD returns the headers and no body', async () => {
  const worker = createSiteWorker(site);
  const response = await worker.fetch(new Request('https://weftmark.ragbaz.cc/workflow.md', { method: 'HEAD' }));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '');
  assert.match(response.headers.get('content-type'), /text\/markdown/);
});

test('robots.txt still points at the sitemap', async () => {
  const response = await get('/robots.txt');
  assert.match(await response.text(), /Sitemap: https:\/\/weftmark\.ragbaz\.cc\/sitemap\.xml/);
});

test('the security headers still apply to llms.txt', async () => {
  const response = await get('/llms.txt');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
});

test('the vendored content layer matches its source', async () => {
  // A shared layer that reaches some products and misses others is the exact
  // drift this repository's decision index exists to prevent.
  const provenance = JSON.parse(await readFile(fileURLToPath(new URL('../design/content-vendor.json', import.meta.url)), 'utf8'));
  for (const entry of provenance.files) {
    const bytes = await readFile(fileURLToPath(new URL(`../${entry.file}`, import.meta.url)));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, `${entry.file} drifted`);
  }
});

test('twins preserve paragraphs, safe code fences and links rather than undefined content', async () => {
  const config = structuredClone(site);
  config.pages[0].sections = [{ id: 'example', title: 'Example', paragraphs: ['Actual section prose'], code: '```\nnot a closing fence', language: 'shell', links: [{ label: 'Reference', href: 'https://example.org/a(b)' }] }];
  const response = await get(config.pages[0].path + 'index.html.md', createSiteWorker(config));
  const text = await response.text();
  assert.equal(response.status, 200);
  assert.match(text, /Actual section prose/);
  assert.match(text, /````shell/);
  assert.match(text, /https:\/\/example.org\/a%28b%29/);
  assert.ok(!text.includes('undefined'));
});

test('mounted and translated alternates resolve to the actual edition', async () => {
  const config = structuredClone(site);
  config.basePath = '/docs';
  config.routeZones = Object.fromEntries([config.origin, ...(config.aliases || [])].map(origin => [origin, 'ragbaz.cc']));
  config.locales = [{ code: 'en', label: 'English', dir: 'ltr' }, { code: 'sv', label: 'Svenska', dir: 'ltr' }];
  config.defaultLocale = 'en';
  const page = config.pages[0];
  page.translations = { sv: { title: 'Svensk sida', description: 'Svensk beskrivning', sections: [{ id: 'text', title: 'Innehåll', paragraphs: ['Verklig svensk text'] }] } };
  const worker = createSiteWorker(config);
  const html = await get('/docs/sv' + page.path, worker);
  const alternate = html.headers.get('link').match(/<([^>]+)>; rel="alternate"/)[1];
  const twin = await get(new URL(alternate).pathname, worker);
  assert.equal(twin.status, 200);
  assert.match(await twin.text(), /Verklig svensk text/);
  assert.ok(twin.headers.get('link').includes('/docs/sv' + page.path));
});

test('missing and dynamic pages do not advertise nonexistent twins', async () => {
  for (const path of ['/does-not-exist/', '/contact/', '/publications/']) {
    const response = await get(path);
    assert.ok(!response.headers.get('link')?.includes('rel="alternate"'), path);
  }
});

test('publications still require explicit dates', () => {
  const config = structuredClone(site);
  delete config.pages[0].published;
  assert.throws(() => createSiteWorker(config));
});
