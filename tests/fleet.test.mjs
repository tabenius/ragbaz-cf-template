import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSiteWorker } from '../src/worker.js';
import { validateSite, escapeHtml } from '../src/site.js';
import { approvedDocuments, publicationDigest, verifyApprovals } from '../scripts/approvals.mjs';
import { buildProject } from '../scripts/build-single.mjs';
import { withSecurityHeaders } from '../src/http.js';

const example = JSON.parse(await readFile(new URL('../sites/weftmark/site.json', import.meta.url)));
// Keep the contract fixture small and stable as real editorial content grows.
// Optional feature/demo behavior has dedicated tests below.
const base = { ...example, modules: { ...example.modules, demonstration: false }, demonstration: undefined, featuredPublication: undefined, pages: [example.pages[0]] };
const get = (url, init) => new Request(url, init);
const request = (path, init) => get('https://weftmark.ragbaz.cc' + path, init);

test('v0 configurations retain the single-page contract', async () => {
  const config = { ...base, schema: 'ragbaz.project-site/v0', modules: {}, pages: [], translations: {} };
  const response = await createSiteWorker(config).fetch(request('/'));
  assert.equal(response.status, 200);
  assert.ok(!(await response.text()).includes('<script'));
});
test('page routes, aliases and localized fallback have stable canonical identity', async () => {
  const worker = createSiteWorker({ ...base, aliases: ['https://alias.example'] });
  const alias = await worker.fetch(get('https://alias.example/workflow/?a=1'));
  assert.equal(alias.status, 308);
  assert.equal(alias.headers.get('Location'), 'https://weftmark.ragbaz.cc/workflow/?a=1');
  const translated = await worker.fetch(request('/sv/'));
  const html = await translated.text();
  assert.ok(html.includes('lang="sv"'));
  assert.ok(html.includes('https://weftmark.ragbaz.cc/sv/'));
  const fallback = await (await worker.fetch(request('/sv/workflow/'))).text();
  assert.ok(fallback.includes('not translated'));
  assert.ok(fallback.includes('href="https://weftmark.ragbaz.cc/workflow/"'));
  assert.ok(!fallback.includes('hreflang="sv"'));
});
test('locale redirects reject protocol-relative paths and preserve ordinary queries', async () => {
  const worker=createSiteWorker(base);
  for(const path of ['/en//example.invalid','/en///example.invalid','/sv//example.invalid']) {
    const response=await worker.fetch(request(path));
    assert.equal(response.status,404);assert.equal(response.headers.get('Location'),null);
  }
  const response=await worker.fetch(request('/en/?next=https://example.invalid/'));
  assert.equal(response.status,308);assert.equal(response.headers.get('Location'),'/?next=https://example.invalid/');
});
test('the menu lists up to five publications and the button carries no redundant label', async () => {
  const html = await (await createSiteWorker(example).fetch(request('/'))).text();
  assert.ok(html.includes('<summary aria-label="Menu">'));
  assert.ok(!html.includes('>Explore<'));
  const menu = html.match(/<nav aria-label="This project">([\s\S]*?)<\/nav>/)[1];
  for (const page of example.pages.filter(p => p.id !== 'privacy')) assert.ok(menu.includes(`>${escapeHtml(page.title)}</a>`), page.id);
  assert.ok(menu.includes('>Publications</a>'));
  assert.ok(!menu.includes('More in Publications'));
});
test('menus beyond five publications link onward with a count', async () => {
  const extras = [1, 2, 3].map(n => ({ ...example.pages[0], id: `extra-${n}`, path: `/extra-${n}/`, title: `Extra ${n}` }));
  const html = await (await createSiteWorker({ ...example, pages: [...example.pages, ...extras] }).fetch(request('/'))).text();
  const menu = html.match(/<nav aria-label="This project">([\s\S]*?)<\/nav>/)[1];
  assert.ok(menu.includes('>Extra 1</a>'));
  assert.ok(!menu.includes('>Extra 2</a>'));
  assert.ok(!menu.includes('>Extra 3</a>'));
  assert.ok(menu.includes('More in Publications (8) →'));
});
test('nested mounts prefix all links and strip only that prefix for assets', async () => {
  const config = { ...base, basePath: '/docs/project', routeZones: { [base.origin]: 'ragbaz.cc' } };
  const worker = createSiteWorker(config);
  const html = await (await worker.fetch(request('/docs/project/sv/'))).text();
  assert.ok(html.includes('src="/docs/project/assets/reader.js"'));
  assert.ok(html.includes('https://weftmark.ragbaz.cc/docs/project/sv/'));
  assert.equal((await worker.fetch(request('/docs/project'))).headers.get('Location'), '/docs/project/');
  assert.equal((await worker.fetch(request('/docs/project-other/'))).status, 404);
  let seen;
  const response = await worker.fetch(request('/docs/project/assets/site.css'), { ASSETS: { fetch: async r => { seen = new URL(r.url).pathname; return new Response('body{}'); } } });
  assert.equal(response.status, 200); assert.equal(seen, '/assets/site.css');
  const sitemap = await (await worker.fetch(request('/docs/project/sitemap.xml'))).text();
  assert.ok(sitemap.includes('/docs/project/sv/'));
});
test('drafts are absent from routes, catalogs, manifests and sitemap; archives stay addressable', async () => {
  const draft = { ...base.pages[0], id: 'secret', path: '/secret/', status: 'draft', title: 'Private draft' };
  const archived = { ...base.pages[0], id: 'retired', path: '/retired/', status: 'archived' };
  const worker = createSiteWorker({ ...base, pages: [...base.pages, draft, archived] });
  assert.equal((await worker.fetch(request('/secret/'))).status, 404);
  for (const route of ['/publications/', '/api/v1/publications', '/manifest.json', '/sitemap.xml']) {
    const text = await (await worker.fetch(request(route))).text();
    assert.ok(!text.includes('Private draft')); assert.ok(!text.includes('/secret/'));
  }
  const response = await worker.fetch(request('/retired/'));
  assert.equal(response.status, 200); assert.ok((await response.text()).includes('noindex'));
});
test('versioned projections have source and UTC observation time, not private config', async () => {
  const response = await createSiteWorker(base).fetch(request('/api/v1/publications'));
  const body = await response.json();
  assert.equal(body.schema, 'ragbaz.publications/v0'); assert.equal(body.source, 'weftmark');
  assert.ok(body.observed_at.endsWith('Z')); assert.equal(body.publications[0].id, 'workflow');
  assert.equal(body.publications[0].sections, undefined);
});
test('authenticated adapters retain cookies and force no-store; overlap is refused', async () => {
  const worker = createSiteWorker(base, { adapters: [{ prefix: '/api/auth', policy: 'authenticated', fetch: async () => new Response('session', { headers: { 'Set-Cookie': 'session=x; Secure; HttpOnly', 'Cache-Control': 'public' } }) }] });
  const response = await worker.fetch(request('/api/auth/session', { method: 'POST' }));
  assert.equal(response.status, 200); assert.ok(response.headers.get('Set-Cookie').includes('session='));
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.throws(() => createSiteWorker(base, { adapters: [{ prefix: '/api/v1/site', policy: 'public', fetch() {} }] }), /Overlapping/);
  assert.throws(() => createSiteWorker(base, { adapters: [{ prefix: '/api/contact/submissions', policy: 'public', fetch() {} }] }), /Overlapping/);
  const failed = createSiteWorker(base, { adapters: [{ prefix: '/api/auth', policy: 'authenticated', fetch() { throw new Error('secret detail'); } }] });
  assert.equal((await failed.fetch(request('/api/auth'))).status, 503);
});
test('peer maintenance is explicit and requires contact to be enabled', () => {
  for(const patch of [{peerMaintenance:'true'},{peerMaintenance:true,modules:{...base.modules,contact:false}}]) assert.throws(()=>validateSite({...base,...patch}),/Peer maintenance/);
  assert.equal(validateSite({...base,peerMaintenance:true}).peerMaintenance,true);
  assert.throws(()=>validateSite({...base,peerAccountReconciliation:true}),/Account reconciliation/);
  assert.throws(()=>validateSite({...base,peerMaintenance:true,peerAccountReconciliation:'true'}),/Account reconciliation/);
  assert.equal(validateSite({...base,peerMaintenance:true,peerAccountReconciliation:true}).peerAccountReconciliation,true);
});
test('demonstration cases are escaped, visible without scripts, and marked illustrative', async () => {
  const demo=structuredClone(example.demonstration);
  demo.cases[0].fields[0].value='<img src=x onerror=alert(1)>';
  const worker=createSiteWorker({...base,modules:{...base.modules,demonstration:true},demonstration:demo});
  const html=await (await worker.fetch(request('/'))).text();
  assert.ok(html.includes('Presentation-only illustrations'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!html.includes('<img src=x'));
  assert.equal((html.match(/data-demo-case=/g)||[]).length,4);
  assert.ok(html.includes('src="/assets/demonstration.js"'));
  assert.ok(!html.includes('data-demo-case="stale" hidden'));
});
test('demonstration data refuses duplicate identities, empty fields and implicit capability', () => {
  const demo=structuredClone(example.demonstration);
  const enabled={...base,modules:{...base.modules,demonstration:true}};
  assert.throws(()=>validateSite({...base,demonstration:demo}),/Enable/);
  assert.throws(()=>validateSite({...enabled,demonstration:{...demo,cases:[demo.cases[0],demo.cases[0]]}}),/identity/);
  assert.throws(()=>validateSite({...enabled,demonstration:{...demo,cases:[{...demo.cases[0],fields:[]}]}}),/fields/);
});
test('shared header helper supports exact provider origins but refuses CSP injection', () => {
  const policy = { scripts: true, contact: true, scriptOrigins: ['https://challenges.cloudflare.com'], frameOrigins: ['https://challenges.cloudflare.com'] };
  const response = withSecurityHeaders(new Response('form'), request('/'), policy);
  assert.ok(response.headers.get('Content-Security-Policy').includes("script-src 'self' https://challenges.cloudflare.com"));
  assert.throws(() => withSecurityHeaders(new Response(), request('/'), { scriptOrigins: ["https://example.com; script-src *"] }));
});
test('model refuses duplicate routes, impossible dates, unknown modules and missing zone declarations', () => {
  for (const patch of [
    { pages: [base.pages[0], base.pages[0]] }, { modules: { mystery: true } },
    { basePath: '/docs' }, { updated: '2026-02-30' },
    { redirects: { '/old/': '//evil.example/' } },
    { pages: [{ ...base.pages[0], path: '/api/secret/' }] },
  ]) assert.throws(() => validateSite({ ...base, ...patch }));
});
test('featured publications use a real public edition and mounted first-party image', async () => {
  const page = { ...base.pages[0], title: 'A local <brief>' };
  const config = { ...base, pages: [page], basePath: '/research', routeZones: { [base.origin]: 'ragbaz.cc' }, featuredPublication: { id: page.id, label: 'Evidence & custody', linkLabel: 'Read the brief', image: '/assets/diagram.svg', imageAlt: 'Three <questions>' } };
  const worker = createSiteWorker(config);
  for (const route of ['/research/', '/research/publications/']) {
    const html = await (await worker.fetch(request(route))).text();
    assert.ok(html.includes('A local &lt;brief&gt;'));
    assert.ok(html.includes('src="/research/assets/diagram.svg"'));
    assert.ok(html.includes('alt="Three &lt;questions&gt;"'));
    assert.ok(html.includes('href="/research' + page.path + '"'));
    assert.ok(!html.includes('Read the illustrated field guide'));
  }
});
test('featured publication configuration refuses private references and unsafe media', () => {
  const feature = { id: base.pages[0].id, label: 'Brief', linkLabel: 'Read' };
  for (const patch of [
    { featuredPublication: { ...feature, id: 'missing' } },
    { pages: [{ ...base.pages[0], status: 'draft' }], featuredPublication: feature },
    { featuredPublication: { ...feature, image: 'https://example.org/diagram.svg', imageAlt: 'Diagram' } },
    { featuredPublication: { ...feature, image: '/assets/../secret.svg', imageAlt: 'Diagram' } },
    { featuredPublication: { ...feature, image: '/assets/diagram.svg' } },
  ]) assert.throws(() => validateSite({ ...base, ...patch }));
});
test('initial publication date controls ordering even when an older page is revised', async () => {
  const older = { ...base.pages[0], id: 'older', path: '/older/', created: '2026-01-01', published: '2026-01-02', updated: '2026-10-03', status: 'revised' };
  const worker = createSiteWorker({ ...base, pages: [older, ...base.pages] });
  const body = await (await worker.fetch(request('/api/v1/publications'))).json();
  assert.deepEqual(body.publications.map(p => p.id), ['workflow', 'older']);
  assert.equal((await worker.fetch(request('/workflow'))).headers.get('Location'), '/workflow/');
});
test('approved-only publishing refuses stale, unknown and private-shaped content', () => {
  const site = validateSite({ ...base, publicationPolicy: 'approved-only' });
  assert.throws(() => verifyApprovals(site), /missing or stale/);
  site.approvals = Object.fromEntries(approvedDocuments(site).map(p => [p.id, publicationDigest(p)]));
  verifyApprovals(site);
  site.pages[0].title = 'Changed'; assert.throws(() => verifyApprovals(site), /stale/);
  site.pages[0].title = '/srv/private/source';
  site.approvals = Object.fromEntries(approvedDocuments(site).map(p => [p.id, publicationDigest(p)]));
  assert.throws(() => verifyApprovals(site), /Private-shaped/);
});
test('build inventories exact served assets and generates precise path-zone routes', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'cf-build-'));
  try {
    const config = { ...base, logo:undefined, basePath: '/docs', routeZones: { [base.origin]: 'ragbaz.cc' } };
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(temp, 'site.json'), JSON.stringify(config));
    await buildProject(join(temp, 'site.json'), join(temp, 'build'));
    const production = JSON.parse(await readFile(join(temp, 'build/wrangler.production.json')));
    assert.deepEqual(production.routes.map(r => r.pattern), ['weftmark.ragbaz.cc/docs', 'weftmark.ragbaz.cc/docs/*']);
    const worker = (await import(`file://${temp}/build/worker.mjs`)).default;
    const body = await (await worker.fetch(request('/docs/manifest.json'))).json();
    assert.ok(body.assets.every(a => a.path.startsWith('/docs/assets/') && /^[a-f0-9]{64}$/.test(a.sha256)));
    assert.ok(body.assets.some(a => a.path.endsWith('reader.js')));
  } finally { await rm(temp, { recursive: true, force: true }); }
});
test('peer maintenance schedules production expiration without account binding or preview cron', async () => {
  const temp=await mkdtemp(join(tmpdir(),'cf-retention-'));
  const previous=process.env.RAGBAZ_PEERS_D1_ID;
  const previousAccounts=process.env.RAGBAZ_ACCOUNTS_D1_ID;
  try {
    process.env.RAGBAZ_PEERS_D1_ID='00000000-0000-0000-0000-000000000000';
    const {writeFile}=await import('node:fs/promises');
    const site={...base,slug:'retention-check',logo:undefined,peerMaintenance:true};
    await writeFile(join(temp,'site.json'),JSON.stringify(site));
    await buildProject(join(temp,'site.json'),join(temp,'build'));
    const production=JSON.parse(await readFile(join(temp,'build/wrangler.production.json')));
    const preview=JSON.parse(await readFile(join(temp,'build/wrangler.json')));
    assert.deepEqual(production.triggers,{crons:['17 3 * * *']});
    assert.deepEqual(production.d1_databases.map(d=>d.binding),['PEERS_DB']);
    assert.equal(preview.triggers,undefined);assert.equal(preview.d1_databases,undefined);
    process.env.RAGBAZ_ACCOUNTS_D1_ID='00000000-0000-0000-0000-000000000001';
    await writeFile(join(temp,'site.json'),JSON.stringify({...site,peerAccountReconciliation:true}));
    await buildProject(join(temp,'site.json'),join(temp,'build'));
    const owner=JSON.parse(await readFile(join(temp,'build/wrangler.production.json')));
    assert.deepEqual(owner.d1_databases.map(d=>d.binding),['PEERS_DB','ACCOUNTS_DB']);
    assert.deepEqual(owner.triggers,{crons:['17 3 * * *']});
    await writeFile(join(temp,'site.json'),JSON.stringify({...site,slug:'weftmark',peerMaintenance:false}));
    await buildProject(join(temp,'site.json'),join(temp,'build'));
    const consumer=JSON.parse(await readFile(join(temp,'build/wrangler.production.json')));
    assert.deepEqual(consumer.d1_databases.map(d=>d.binding),['PEERS_DB']);
    assert.equal(consumer.triggers,undefined);
  }finally{
    if(previous===undefined)delete process.env.RAGBAZ_PEERS_D1_ID;else process.env.RAGBAZ_PEERS_D1_ID=previous;
    if(previousAccounts===undefined)delete process.env.RAGBAZ_ACCOUNTS_D1_ID;else process.env.RAGBAZ_ACCOUNTS_D1_ID=previousAccounts;
    await rm(temp,{recursive:true,force:true});
  }
});
test('build refuses unapproved assets and source-directory output; excludes draft text from Worker bundle', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'cf-approval-'));
  const { writeFile, mkdir } = await import('node:fs/promises');
  try {
    const draft = { ...base.pages[0], id: 'private-draft', path: '/private-draft/', title: 'DO_NOT_DEPLOY_THIS_DRAFT', status: 'draft' };
    const site = validateSite({ ...base, logo:undefined, pages: [...base.pages, draft], publicationPolicy: 'approved-only' });
    site.approvals = Object.fromEntries(approvedDocuments(site).map(p => [p.id, publicationDigest(p)]));
    const configPath = join(temp, 'site.json');
    await writeFile(configPath, JSON.stringify(site));
    await assert.rejects(buildProject(configPath, temp), /cannot contain/);
    await mkdir(join(temp, 'public/assets'), { recursive: true });
    await writeFile(join(temp, 'public/assets/cover.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await assert.rejects(buildProject(configPath, join(temp, 'build')), /Asset approval missing/);
    const { createHash } = await import('node:crypto');
    site.assetApprovals = { '/assets/cover.svg': createHash('sha256').update(await readFile(join(temp, 'public/assets/cover.svg'))).digest('hex') };
    await writeFile(configPath, JSON.stringify(site));
    await buildProject(configPath, join(temp, 'build'));
    assert.ok(!(await readFile(join(temp, 'build/worker.mjs'), 'utf8')).includes('DO_NOT_DEPLOY_THIS_DRAFT'));
  } finally { await rm(temp, { recursive: true, force: true }); }
});
