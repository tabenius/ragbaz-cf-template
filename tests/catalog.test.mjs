import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createSiteWorker } from '../src/worker.js';
import { catalogSnapshot, catalogSnapshotAdapter } from '../src/catalog.js';

const now = Date.parse('2026-10-11T12:00:00.000Z');
const fixture = () => ({ schema: 'ragbaz.public-catalog/v1', source: 'https://ragbaz.cc/catalog', observed_at: '2026-10-11T11:00:00.000Z', products: [{ id: 'frog', name: '<script>Frog</script>', lifecycle: 'development', capabilities: ['coordination'], private_path: '/private', credentials: 'secret' }], workspace: 'private' });

test('catalog projects only public fields and labels digest, origin, observation and search scope', async () => {
  const result = await catalogSnapshot(fixture(), { now });
  assert.deepEqual(result.products, [{ id: 'frog', name: '<script>Frog</script>', lifecycle: 'development', capabilities: ['coordination'] }]);
  assert.equal(result.source, 'https://ragbaz.cc/catalog');
  assert.equal(result.digest, createHash('sha256').update(JSON.stringify(result.products)).digest('hex'));
  assert.equal(result.digest_scope, 'projected-products-json');
  assert.equal(result.search_scope, 'none');
  assert.deepEqual(result.freshness, { state: 'fresh', age_seconds: 3600, max_age_seconds: 86400 });
  assert.ok(!JSON.stringify(result).includes('private'));
  assert.equal((await catalogSnapshot({ ...fixture(), digest: result.digest }, { now })).digest, result.digest);
});

test('stale is separate from malformed or missing and observation is not refreshed on read', async () => {
  const input = fixture();
  const result = await catalogSnapshot(input, { now, maxAgeSeconds: 60 });
  assert.equal(result.freshness.state, 'stale');
  assert.equal(result.observed_at, input.observed_at);
  assert.deepEqual((await catalogSnapshot({ ...input, products: [] }, { now })).products, []);
});

test('malformed, oversized, duplicate and wrong-digest catalogs fail closed', async () => {
  for (const change of [
    { schema: 'future' }, { source: 'file:///private' }, { source: 'https://user:secret@ragbaz.cc/' },
    { source: 'https://ragbaz.cc/?token=secret' }, { observed_at: '2026-10-12T12:00:00.000Z' },
    { observed_at: '2026-02-30T12:00:00.000Z' }, { digest: '0'.repeat(64) },
    { products: Array(201).fill(fixture().products[0]) }, { products: Array(2).fill(fixture().products[0]) },
    { products: [null] }, { products: [{ ...fixture().products[0], capabilities: [42] }] },
    { products: [{ ...fixture().products[0], name: 'x'.repeat(257) }] },
  ]) await assert.rejects(catalogSnapshot({ ...fixture(), ...change }, { now }));
  await assert.rejects(catalogSnapshot(fixture(), { now, maxAgeSeconds: 0 }));
});

test('snapshot HTTP adapter supports exact mounted GET/HEAD and refuses writes, search and subpaths', async () => {
  let reads = 0;
  const adapter = catalogSnapshotAdapter({ basePath: '/docs' }, () => { reads++; return fixture(); }, { now });
  const request = (path = '', method = 'GET') => new Request('https://site.ragbaz.cc/docs/api/v1/catalog' + path, { method });
  const response = await adapter.fetch(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).search_scope, 'none');
  assert.equal(await (await adapter.fetch(request('', 'HEAD'))).text(), '');
  assert.equal((await adapter.fetch(request('', 'POST'))).status, 405);
  assert.equal((await adapter.fetch(request('?q=secret'))).status, 400);
  assert.equal((await adapter.fetch(request('/private'))).status, 404);
  assert.equal(reads, 2);
});

test('loader and validation failures have bounded actionable responses without private details', async () => {
  for (const load of [() => { throw new Error('secret'); }, () => null]) {
    const adapter = catalogSnapshotAdapter({}, load, { now });
    const response = await adapter.fetch(new Request('https://site.ragbaz.cc/api/v1/catalog'));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'catalog_snapshot_unavailable' });
  }
});

test('snapshot integrates with the mounted Worker and retains security headers and no-store', async () => {
  const base = JSON.parse(await readFile(new URL('../sites/weftmark/site.json', import.meta.url)));
  const site = { ...base, basePath: '/docs', routeZones: Object.fromEntries([base.origin, ...(base.aliases || [])].map(origin => [origin, 'ragbaz.cc'])) };
  const worker = createSiteWorker(site, { adapters: [catalogSnapshotAdapter(site, fixture, { now })] });
  for (const [suffix, method, status] of [['', 'GET', 200], ['', 'HEAD', 200], ['', 'POST', 405], ['?q=x', 'GET', 400], ['/search', 'GET', 404]]) {
    const response = await worker.fetch(new Request(base.origin + '/docs/api/v1/catalog' + suffix, { method }));
    assert.equal(response.status, status);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.ok(response.headers.has('Content-Security-Policy'));
    assert.ok(!response.headers.has('Set-Cookie'));
  }
});
