import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSiteWorker } from '../src/worker.js';
import { validateSite } from '../src/site.js';
import { provenanceModel, verificationModel, offerModel } from '../src/domains.js';
import { socialCard } from '../scripts/social-card.mjs';

const base = JSON.parse(await readFile(new URL('../sites/weftmark/site.json', import.meta.url)));
const integration = { binding: 'AUTH', origin: 'https://ragbaz.cc', credentials: 'forward', callerOrigin: true };
const request = (path, init) => new Request(base.origin + path, init);
test('identity forwards only allowed routes to a named binding and preserves authority refusals', async () => {
  const worker = createSiteWorker({ ...base, integrations: { identity: integration } }); let seen;
  const env = { AUTH: { fetch: async r => { seen = r; return Response.json({ error: 'authentication_required' }, { status: 401, headers: { 'Set-Cookie': 'session=; Secure; HttpOnly' } }); } } };
  const response = await worker.fetch(request('/api/auth/session', { headers: { Cookie: 'session=opaque', 'CF-Connecting-IP': '192.0.2.1', 'X-Internal-Secret': 'not-forwarded' } }), env);
  assert.equal(response.status, 401); assert.ok(response.headers.has('Set-Cookie'));
  assert.equal(seen.url, base.origin + '/api/auth/session'); assert.equal(seen.headers.get('Cookie'), 'session=opaque');
  assert.equal(seen.headers.get('X-Internal-Secret'), null); assert.equal(seen.headers.get('CF-Connecting-IP'), null);
  assert.equal((await worker.fetch(request('/api/auth/arbitrary'), env)).status, 404);
  assert.equal((await worker.fetch(request('/api/auth/session', { method: 'DELETE' }), env)).status, 405);
  assert.equal((await worker.fetch(request('/api/auth/session'))).status, 503);
});
test('integration mutation checks origins, streamed limits, redirects and missing authority', async () => {
  const worker = createSiteWorker({ ...base, integrations: { identity: { ...integration, maxBytes: 10 } } });
  const post = (body, origin = base.origin) => request('/api/auth/logout', { method: 'POST', headers: { Origin: origin }, body });
  const env = { AUTH: { fetch: async () => new Response(null, { status: 302, headers: { Location: 'https://evil.example' } }) } };
  assert.equal((await worker.fetch(post('{}', 'https://evil.example'), env)).status, 403);
  assert.equal((await worker.fetch(post('x'.repeat(11)), env)).status, 413);
  assert.equal((await worker.fetch(post('{}'), env)).status, 502);
  assert.equal((await worker.fetch(new Request('https://preview.example/api/auth/session'), env)).status, 403);
  const local = await worker.fetch(post('{}'), { AUTH: { fetch: async () => new Response(null, { status: 303, headers: { Location: '/publications/', 'Set-Cookie': 'session=issued; HttpOnly' } }) } });
  assert.equal(local.status, 303); assert.equal(local.headers.get('Location'), '/publications/'); assert.ok(local.headers.has('Set-Cookie'));
});
test('editorial, notifications, commerce and provenance preserve selected authorities and credential policy', async () => {
  for (const [family, path, method] of [['editorial', '/api/editorial/drafts/art_1/autosave', 'POST'], ['newsletter', '/api/newsletter/subscribe', 'POST'], ['push', '/api/push/subscribe', 'POST'], ['commerce', '/api/commerce/prices', 'GET'], ['provenance', '/api/provenance/scrolls', 'GET']]) {
    const worker = createSiteWorker({ ...base, integrations: { [family]: { binding: 'OWNER', origin: 'https://authority.example', credentials: 'omit' } } });
    const response = await worker.fetch(request(path, { method, headers: { Origin: base.origin, Cookie: 'session=private' }, ...(method === 'POST' ? { body: '{}' } : {}) }), { OWNER: { fetch: async r => {
      assert.equal(new URL(r.url).origin, 'https://authority.example'); assert.equal(r.headers.get('Cookie'), null);
      assert.equal(r.headers.get('Origin'), base.origin); return Response.json({ source: family });
    } } });
    assert.equal(response.status, 200); assert.equal((await response.json()).source, family);
  }
});
test('public catalog integration refuses GraphQL mutations', async () => {
  const worker = createSiteWorker({ ...base, integrations: { catalog: { binding: 'CATALOG', origin: 'https://ragbaz.cc', credentials: 'omit' } } });
  const post = query => request('/api/catalog/graphql', { method: 'POST', headers: { Origin: base.origin }, body: JSON.stringify({ query }) });
  const env = { CATALOG: { fetch: async () => Response.json({ data: {} }) } };
  assert.equal((await worker.fetch(post('mutation { replaceWorkspaceSnapshot }'), env)).status, 403);
  assert.equal((await worker.fetch(post('query { publicCatalog { name } }'), env)).status, 200);
});
test('education is a published local sequence; its completion is not assessment evidence', async () => {
  const site = { ...base, modules: { ...base.modules, education: true }, lessons: ['workflow'] };
  const html = await (await createSiteWorker(site).fetch(request('/workflow/'))).text();
  assert.ok(html.includes('data-education')); assert.ok(html.includes('/assets/education.js')); assert.ok(html.includes('Mark as read'));
  assert.throws(() => validateSite({ ...site, lessons: ['nonexistent'] }));
});
test('domain contracts keep configured/served models and independent verification states distinct', () => {
  const model = provenanceModel({ models: [{ id: 'model-a', provider: 'example', configured_model: 'model-a', served_model: 'model-b' }] });
  assert.notEqual(model.models[0].configured_model, model.models[0].served_model);
  const verification = verificationModel({ integrity: 'verified', signature: 'failed', signer_trust: 'unknown', external_observation: 'unavailable' });
  assert.equal(verification.integrity, 'verified'); assert.equal(verification.signature, 'failed');
  assert.throws(() => verificationModel({ integrity: 'approved' }));
  assert.throws(() => offerModel({ id: 'plan', currency: 'USD', minor_units: 1.2, interval: 'month' }));
  assert.equal(provenanceModel({ models: [{ id: 'm', provider: 'p' }], harness: { name: 'runner', private_prompt: 'do not project this' } }).harness.private_prompt, undefined);
});
test('social PNG is deterministic, correctly sized and derives colors from vendored tokens', async () => {
  const root = new URL('../', import.meta.url);
  const first = await socialCard(base, root), second = await socialCard(base, root);
  assert.deepEqual(first, second); assert.deepEqual([...first.subarray(0, 8)], [137,80,78,71,13,10,26,10]);
  assert.equal(first.readUInt32BE(16), 1200); assert.equal(first.readUInt32BE(20), 630);
});
