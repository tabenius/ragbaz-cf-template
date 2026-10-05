import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteD1 } from './support.mjs';
import { artifactModel, submissionModel, requiredScopes, inlineJson } from '../model.js';
import { renderArtifactCard, renderEmail, renderCollection } from '../render.js';
import { createExchangeAuthority } from '../authority/worker.js';
import { createArtifactSiteWorker } from '../worker.js';
import { buildArtifactSite } from '../build.mjs';
import { validateSite } from '../../../src/site.js';
import { submissionFromPeerInterest } from '../peer-bridge.js';

const configPath = new URL('../examples/maria/config.json', import.meta.url);
const config = JSON.parse(await readFile(configPath));
const site = validateSite(config.site), collection = config.collections[0];
const gift = config.inline.maria[0];
const quoted = () => ({ ...structuredClone(gift), id: 'peer-thanks', kind: 'quote', title: 'A peer contribution', quote: 'A carefully quoted opinion <not executable>.', person: { name: 'Example peer', profile_url: 'https://example.org/person', photo: { src: '/assets/person.jpg', alt: 'Consented portrait' } } });
const envelope = artifact => ({ schema: 'ragbaz.artifact-submission/v1', collection: 'maria', direction: 'inbound', artifact, sender: { name: 'Example peer', email: 'private@example.org', photo_source_url: 'https://example.org/photo.jpg' }, permission: { offered_scopes: ['artifact', 'quote', 'name', 'photo', 'profile'], note: 'Private permission offer.' } });

const sql = await readFile(new URL('../authority/0001-exchange.sql', import.meta.url), 'utf8');
function environment() {
  return {
    EXCHANGE_DB: new SqliteD1(sql), EXCHANGE_HASH_KEY: 'test-key', EXCHANGE_RATE_LIMITER: { limit: async () => ({ success: true }) },
    EXCHANGE_IDENTITY: { fetch: async request => request.headers.get('Cookie') === 'session=editor' ? Response.json({ actor: { id: 'editor', roles: ['artifact-editor'] } }) : new Response(null, { status: 401 }) },
  };
}
function authority() { return createExchangeAuthority({ allowedOrigins: [site.origin], identityOrigin: 'https://identity.example.org', collections: [collection], site, publicIntake: true }); }
function request(path, payload, { editor = true, origin = site.origin, method } = {}) {
  const headers = { Origin: origin };
  if (editor) headers.Cookie = 'session=editor';
  if (payload !== undefined) headers['Content-Type'] = 'application/json';
  return new Request('https://exchange.internal' + path, { method: method || (payload !== undefined ? 'POST' : 'GET'), headers, body: payload === undefined ? undefined : JSON.stringify(payload) });
}
async function call(service, env, path, payload, options) { return service.fetch(request(path, payload, options), env); }
async function submit(service, env, artifact = quoted()) {
  const response = await call(service, env, '/submit', envelope(artifact), { editor: false });
  assert.equal(response.status, 202); return response.json();
}
async function permission(service, env, id = 'peer-thanks') {
  const response = await call(service, env, `/items/${id}/permission`, { revision: 1, scopes: requiredScopes(quoted()), evidence: { kind: 'email', reference: 'Private mailbox message with exact field permission' } });
  assert.equal(response.status, 200);
}

test('portable artifact separates semantics, transport, media and private contact', () => {
  assert.equal(artifactModel(gift).schema, 'ragbaz.artifact/v1');
  assert.deepEqual(requiredScopes(quoted()), ['artifact', 'quote', 'name', 'photo', 'profile']);
  assert.equal(submissionModel(envelope(quoted())).sender.email, 'private@example.org');
  for (const patch of [{ id: undefined }, { title: ' ' }, { image: { src: 'https://example.org/photo.jpg', alt: 'remote' } }, { quote: 'No attribution' }, { resources: [{ type: 'external', url: 'javascript:alert(1)' }] }, { resources: [{ type: 'oci', identifier: 'registry.example.org/name:latest' }] }, { email: 'leak@example.org' }]) assert.throws(() => artifactModel({ ...gift, ...patch }));
  const artifact = artifactModel({ ...gift, resources: [{ type: 'oci', identifier: 'registry.example.org/name', digest: 'sha256:' + 'a'.repeat(64), media_type: 'application/vnd.oci.image.manifest.v1+json', bytes: 42 }, { type: 'mouseion', identifier: 'scroll:example' }] });
  assert.equal(artifact.resources[0].bytes, 42);
  assert.equal(artifact.resources[1].type, 'mouseion');
});
test('cards, inline JSON and email escape imported strings and use canonical links', () => {
  const item = quoted(); item.quote = '</script><img src=x onerror=alert(1)>';
  const card = renderArtifactCard(site, collection, item);
  assert.ok(card.includes('&lt;/script&gt;')); assert.ok(!card.includes('onerror=alert(1)>'));
  assert.ok(!inlineJson(item).includes('</script>'));
  const email = renderEmail(site, collection, item);
  assert.ok(email.html.includes(site.origin + '/peer-thanks/'));
  assert.ok(email.html.includes('role="presentation"'));
  assert.ok(!email.html.includes('private@example.org'));
  assert.ok(!email.html.includes('<script'));
  assert.ok(!renderEmail(site, collection, item, { ready: false }).html.includes('href="' + site.origin + '/peer-thanks/'));
  assert.ok(renderCollection(site, { ...collection, mode: 'singleton' }, [gift]).includes('The history leaves a question.'));
});
test('SQL-backed approval is separate from permission and does not leak contacts', async () => {
  const service = authority(), env = environment();
  await submit(service, env);
  assert.equal((await call(service, env, '/items/peer-thanks/publish', { revision: 1 })).status, 409);
  assert.throws(() => env.EXCHANGE_DB.db.prepare("UPDATE exchange_items SET state='approved',published_at='now',reviewed_by='bypass' WHERE id='peer-thanks'").run(), /permission_required/);
  assert.equal((await (await call(service, env, '/public/maria')).json()).artifacts.length, 0);
  await permission(service, env);
  assert.equal((await call(service, env, '/items/peer-thanks/publish', { revision: 2 })).status, 409);
  assert.equal((await call(service, env, '/items/peer-thanks/publish', { revision: 1 })).status, 200);
  const publicData = await (await call(service, env, '/public/maria')).text();
  assert.ok(publicData.includes('Example peer'));
  for (const secret of ['private@example.org', 'Private mailbox', 'photo_source_url', 'receipt_token', 'offered_scopes']) assert.ok(!publicData.includes(secret));
  assert.equal((await call(service, env, '/items/peer-thanks/publish', { revision: 1 })).status, 409);
  assert.throws(() => env.EXCHANGE_DB.db.prepare("UPDATE exchange_items SET public_json='{}' WHERE id='peer-thanks'").run(), /immutable_submission/);
  env.EXCHANGE_DB.db.prepare("UPDATE exchange_consents SET state='withdrawn' WHERE item_id='peer-thanks'").run();
  assert.equal((await (await call(service, env, '/public/maria')).json()).artifacts.length, 0);
});
test('the sender can withdraw with its private receipt; wrong receipt is refused', async () => {
  const service = authority(), env = environment(), receipt = await submit(service, env);
  await permission(service, env);
  await call(service, env, '/items/peer-thanks/publish', { revision: 1 });
  assert.equal((await call(service, env, '/revoke', { id: receipt.id, receipt_token: 'wrong' }, { editor: false })).status, 403);
  assert.equal((await call(service, env, '/revoke', { id: receipt.id, receipt_token: receipt.receipt_token }, { editor: false })).status, 200);
  assert.equal((await (await call(service, env, '/public/maria')).json()).artifacts.length, 0);
  assert.equal((await call(service, env, '/items/peer-thanks/publish', { revision: 1 })).status, 409);
});
test('HTTP refusals preserve missing infrastructure, authorization, origin and size distinctions', async () => {
  const service = authority(), env = environment();
  assert.equal((await call(service, env, '/inbox', undefined, { editor: false })).status, 401);
  assert.equal((await call(service, { ...env, EXCHANGE_IDENTITY: undefined }, '/inbox')).status, 503);
  assert.equal((await call(service, { ...env, EXCHANGE_DB: undefined }, '/public/maria')).status, 503);
  assert.equal((await call(service, env, '/submit', envelope(quoted()), { origin: 'https://evil.example' })).status, 403);
  assert.equal((await call(service, env, '/public/maria', {}, { method: 'POST' })).status, 405);
  assert.equal((await call(service, env, '/unknown')).status, 404);
  assert.equal((await call(service, { ...env, EXCHANGE_RATE_LIMITER: undefined }, '/submit', envelope(quoted()))).status, 503);
  assert.equal((await call(service, { ...env, EXCHANGE_RATE_LIMITER: { limit: async () => ({ success: false }) } }, '/submit', envelope(quoted()))).status, 429);
  assert.equal((await call(service, env, '/submit', { padding: 'a'.repeat(70000) })).status, 413);
  assert.equal((await call(service, env, '/submit', { ...envelope(quoted()), collection: 'unknown' })).status, 400);
  const head = await call(service, env, '/public/maria', undefined, { method: 'HEAD' }); assert.equal(await head.text(), '');
});
test('inbox can handle both directions and distinguishes self-authorship from peer permission', async () => {
  const service = authority(), env = environment();
  const outbound = { ...envelope(gift), direction: 'outbound' };
  assert.equal((await call(service, env, '/import', outbound)).status, 202);
  assert.equal((await call(service, env, '/items/maria-name/permission', { revision: 1, scopes: ['artifact'], evidence: { kind: 'self-authored', reference: 'Author-created gift requested by Tobias' } })).status, 200);
  assert.equal((await call(service, env, '/items/maria-name/publish', { revision: 1 })).status, 200);
  await submit(service, env);
  assert.equal((await call(service, env, '/items/peer-thanks/permission', { revision: 1, scopes: requiredScopes(quoted()), evidence: { kind: 'self-authored', reference: 'Not a valid peer grant' } })).status, 409);
  const inbox = await (await call(service, env, '/inbox')).json();
  assert.deepEqual(new Set(inbox.items.map(i => i.direction)), new Set(['inbound', 'outbound']));
  assert.ok(inbox.items.some(i => i.submission.sender.email === 'private@example.org'));
  const email = await (await call(service, env, '/items/maria-name/email')).json(); assert.ok(email.text.includes('/maria-name/'));
});
test('site wrapper composes with the core, mounts links once, and protects inbox HTML', async () => {
  const worker = createArtifactSiteWorker(site, { collections: [collection], inline: config.inline });
  const request = path => new Request(site.origin + path);
  const page = await worker.fetch(request('/')); assert.equal(page.status, 200); assert.ok((await page.text()).includes('artifact-card'));
  assert.equal((await worker.fetch(request('/maria-name/'))).status, 200);
  assert.equal((await worker.fetch(request('/no-such-artifact/'))).status, 404);
  assert.equal((await worker.fetch(request('/healthz'))).status, 200);
  assert.equal((await worker.fetch(request('/inbox/'))).status, 503);
  const sitemap = await (await worker.fetch(request('/sitemap.xml'))).text(); assert.ok(sitemap.includes(site.origin + '/maria-name/')); assert.ok(!sitemap.includes('/inbox/'));
  const manifest = await (await worker.fetch(request('/manifest.json'))).json(); assert.equal(manifest.artifact_collections[0].artifacts[0].id, 'maria-name');
  const mountedSite = { ...site, basePath: '/thanks', routeZones: { [site.origin]: 'ragbaz.cc' } };
  const mountedWorker = createArtifactSiteWorker(mountedSite, { collections: [collection], inline: config.inline });
  const mountedPage = await (await mountedWorker.fetch(request('/thanks/maria-name/'))).text();
  assert.ok(mountedPage.includes(site.origin + '/thanks/maria-name/')); assert.ok(!mountedPage.includes('/thanks/thanks/'));
  assert.equal((await worker.fetch(new Request(site.origin + '/share/'))).status, 200);
});
test('dynamic site publication follows SQL immediately, with no-store and no private serialization', async () => {
  const service = authority(), env = environment();
  const binding = { fetch: request => service.fetch(request, env) };
  const worker = createArtifactSiteWorker(site, { collections: [collection], source: 'service' });
  const request = path => new Request(site.origin + path, { headers: { Cookie: 'session=editor' } });
  const frontEnv = { ARTIFACT_EXCHANGE: binding };
  await submit(service, env);
  assert.equal((await worker.fetch(request('/peer-thanks/'), frontEnv)).status, 404);
  await permission(service, env); await call(service, env, '/items/peer-thanks/publish', { revision: 1 });
  const response = await worker.fetch(request('/peer-thanks/'), frontEnv);
  assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.ok(!(await response.text()).includes('private@example.org'));
  const inbox = await worker.fetch(request('/inbox/'), frontEnv); assert.equal(inbox.status, 200); assert.equal(inbox.headers.get('Cache-Control'), 'private, no-store');
  assert.equal((await worker.fetch(new Request(site.origin + '/inbox/'), frontEnv)).status, 401);
  await call(service, env, '/items/peer-thanks/withdraw', {});
  assert.equal((await worker.fetch(request('/peer-thanks/'), frontEnv)).status, 404);
});
test('page placements render only the selected public collection and do not restyle core chrome', async () => {
  const voiceCollection = { ...collection, id: 'voices', path: '/voices/' };
  const worker = createArtifactSiteWorker(site, { collections: [voiceCollection], inline: { voices: [quoted()] }, placements: [{ path: '/', collection: 'voices', title: 'What peers say' }] });
  const response = await worker.fetch(new Request(site.origin + '/'));
  const html = await response.text();
  assert.ok(html.includes('class="site-header"'));
  assert.ok(html.includes('class="artifact-embedded"'));
  assert.ok(html.includes('What peers say'));
  assert.ok(html.includes('/assets/artifact-embeds.css'));
  assert.ok(!html.includes('/assets/artifacts.css'));
  assert.ok(!html.includes('photo_source_url'));
  assert.throws(() => createArtifactSiteWorker(site, { collections: [voiceCollection], placements: [{ path: '/not-a-page/', collection: 'voices', title: 'No' }] }));
});
test('existing studio interests bridge to the inbox without upgrading contact consent or exposing correlation IDs', async () => {
  const item = quoted(), row = { id: '11111111-1111-4111-8111-111111111111', peer_id: '22222222-2222-4222-8222-222222222222', email_normalized: 'private@example.org', name_claim: 'Example peer', message: item.quote, received_at: '2026-10-05T00:00:00Z' };
  const imported = submissionFromPeerInterest(row, item, 'maria');
  assert.equal(imported.source.person_reference, row.peer_id);
  assert.deepEqual(imported.permission.offered_scopes, []);
  assert.throws(() => submissionFromPeerInterest(row, { ...item, quote: 'An invented endorsement' }, 'maria'));
  const service = authority(), env = environment();
  assert.equal((await call(service, env, '/import-interest', { interest_id: row.id, collection: 'maria', artifact: item })).status, 503);
  let selected;
  env.EXCHANGE_PEERS_DB = { prepare: query => { selected = query; return { bind: () => ({ first: async () => row }) }; } };
  assert.equal((await call(service, env, '/import-interest', { interest_id: row.id, collection: 'maria', artifact: item })).status, 202);
  assert.ok(selected.includes('ragbaz_interests'));
  assert.equal((await call(service, env, '/items/peer-thanks/publish', { revision: 1 })).status, 409);
  await permission(service, env); await call(service, env, '/items/peer-thanks/publish', { revision: 1 });
  const published = await (await call(service, env, '/public/maria')).text();
  assert.ok(!published.includes(row.id)); assert.ok(!published.includes(row.peer_id));
});
test('extension build preserves the template boundary and strips private records and core drafts', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'artifact-build-'));
  try {
    const configRoot = join(temp, 'source'); await mkdir(configRoot);
    const custom = structuredClone(config);
    custom.inline.maria[0].image = undefined; custom.inline.maria[0].social_image = undefined;
    custom.site.pages = [{ id: 'private-draft', path: '/private-draft/', kind: 'article', title: 'PRIVATE_DRAFT_SENTINEL', description: 'Do not deploy this.', status: 'draft', created: '2026-10-05', updated: '2026-10-05', sections: [{ id: 'private', title: 'Private', paragraphs: ['PRIVATE_DRAFT_SENTINEL'] }] }];
    await writeFile(join(configRoot, 'config.json'), JSON.stringify(custom));
    const output = await buildArtifactSite(join(configRoot, 'config.json'), join(temp, 'build'));
    const worker = await readFile(join(output, 'worker.mjs'), 'utf8');
    assert.ok(!worker.includes('PRIVATE_DRAFT_SENTINEL'));
    assert.ok(!worker.includes('Author-requested name gift'));
    assert.ok(worker.includes('createArtifactSiteWorker'));
    const wrangler = JSON.parse(await readFile(join(output, 'wrangler.json'))); assert.ok(!wrangler.routes);
    assert.ok((await readFile(join(output, 'previews/maria-name.email.html'), 'utf8')).includes('Marija'));
    await assert.rejects(readFile(join(output, 'public/maria-name.html')));
  } finally { await rm(temp, { recursive: true, force: true }); }
});
