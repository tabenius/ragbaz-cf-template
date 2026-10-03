import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { root, siteNames } from './build.mjs';

const revision = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const result = [];
const names = await siteNames();
if (process.argv[2] && !names.includes(process.argv[2])) throw new Error('Unknown project site');
for (const slug of process.argv[2] ? [process.argv[2]] : names) {
  const site = JSON.parse(await readFile(join(root, 'sites', slug, 'site.json')));
  const request = (path, init = {}) => fetch(site.origin + path, { redirect: 'manual', signal: AbortSignal.timeout(20000), ...init });
  let lastError;
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      const response = await request('/api/v1/site');
      assert.equal(response.status, 200); const info = await response.json();
      assert.equal(info.source, slug); assert.equal(info.release.source_revision, revision); assert.equal(info.release.source_dirty, false);
      lastError = null; break;
    } catch (error) { lastError = error; await new Promise(resolve => setTimeout(resolve, 5000)); }
  }
  if (lastError) throw lastError;
  for (const [path, expected] of [['/', 200], ['/healthz', 200], ['/publications/', 200], [site.pages[0].path, 200], ['/sitemap.xml', 200], ['/assets/social-card.png', 200], ['/missing-publication', 404], ['/index.html?legacy=1', 308]]) {
    const response = await request(path); assert.equal(response.status, expected, slug + path);
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff'); assert.ok(response.headers.get('Content-Security-Policy'));
    if (path === '/') assert.ok((await response.text()).includes(`href="${site.origin}/"`));
  }
  assert.equal((await request('/api/run', { method: 'POST' })).status, 405);
  const manifest = await (await request('/manifest.json')).json();
  for (const asset of manifest.assets) {
    const response = await request(asset.path); assert.equal(response.status, 200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, asset.path);
  }
  if (slug === 'weftmark') assert.ok((await (await request('/sv/')).text()).includes('lang="sv"'));
  result.push({ source: slug, origin: site.origin, source_revision: revision, assets_verified: manifest.assets.length, status: 'passed' });
  console.log(`${site.origin}: exact release, routes, headers and ${manifest.assets.length} asset hashes verified`);
}
console.log(JSON.stringify({ schema: 'ragbaz.website-deployment-evidence/v0', observed_at: new Date().toISOString(), sites: result }, null, 2));
