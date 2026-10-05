// Loopback-only integration harness with ephemeral SQLite and TEST identity.
// This is not a production login adapter; it never enters a generated Worker.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createExchangeAuthority } from '../authority/worker.js';
import { createArtifactSiteWorker } from '../worker.js';
import { validateSite } from '../../../src/site.js';
import { SqliteD1 } from './support.mjs';

const config = JSON.parse(await readFile(new URL('../examples/maria/config.json', import.meta.url)));
const site = validateSite(config.site);
const port = Number(process.argv[2] || process.env.ARTIFACT_TEST_PORT || 8891);
const db = new SqliteD1(await readFile(new URL('../authority/0001-exchange.sql', import.meta.url), 'utf8'));
const authEnv = {
  EXCHANGE_DB: db, EXCHANGE_HASH_KEY: 'local-browser-test-only', EXCHANGE_RATE_LIMITER: { limit: async () => ({ success: true }) },
  EXCHANGE_IDENTITY: { fetch: async request => request.headers.get('Cookie')?.includes('session=editor') ? Response.json({ actor: { id: 'test-editor', roles: ['artifact-editor'] } }) : new Response(null, { status: 401 }) },
};
const authority = createExchangeAuthority({ allowedOrigins: [site.origin], identityOrigin: 'https://identity.example.org', collections: config.collections, site, publicIntake: true });
async function seed(route, data) {
  const response = await authority.fetch(new Request('https://exchange.internal' + route, { method: 'POST', headers: { Origin: site.origin, Cookie: 'session=editor', 'Content-Type': 'application/json' }, body: JSON.stringify(data) }), authEnv);
  if (!response.ok) throw new Error('Browser fixture seed failed: ' + await response.text());
}
await seed('/import', { schema: 'ragbaz.artifact-submission/v1', collection: 'maria', direction: 'outbound', artifact: config.inline.maria[0] });
await seed('/items/maria-name/permission', { revision: 1, scopes: ['artifact'], evidence: { kind: 'self-authored', reference: 'Ephemeral browser test fixture' } });
await seed('/items/maria-name/publish', { revision: 1 });
const worker = createArtifactSiteWorker(site, { collections: config.collections, source: 'service' });
const assetsRoot = resolve(process.env.ARTIFACT_TEST_ASSETS || 'build/maria-gifts/public');
// Serve the real built asset bytes with the MIME types Cloudflare's static
// assets binding uses. A wrong type here is a test-fixture defect, not an
// application defect: assert exact built bytes so the harness cannot silently
// serve the 404 page as CSS/JS.
const types = {
  css: 'text/css; charset=utf-8', js: 'application/javascript; charset=utf-8',
  svg: 'image/svg+xml', png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg',
  jpeg: 'image/jpeg', gif: 'image/gif', ico: 'image/x-icon', woff2: 'font/woff2',
  pdf: 'application/pdf', json: 'application/json', txt: 'text/plain; charset=utf-8',
  html: 'text/html; charset=utf-8',
};
const contentType = route => types[route.split('.').pop()] || 'application/octet-stream';
const env = {
  ARTIFACT_EXCHANGE: { fetch: request => authority.fetch(request, authEnv) },
  ASSETS: { fetch: async request => {
    const route = new URL(request.url).pathname;
    if (!/^\/assets\/[a-zA-Z0-9._/-]+$/.test(route) || route.includes('..')) return new Response(null, { status: 404 });
    try {
      const bytes = await readFile(join(assetsRoot, route));
      return new Response(bytes, { headers: { 'Content-Type': contentType(route), 'Content-Length': String(bytes.length) } });
    } catch { return new Response(null, { status: 404 }); }
  } },
};
createServer(async (incoming, outgoing) => {
  try {
    const chunks = []; for await (const chunk of incoming) chunks.push(chunk);
    const headers = new Headers(incoming.headers);
    // The browser uses loopback HTTP, while the template's canonical origin is
    // HTTPS. This explicit TEST bridge lets us exercise same-origin UI actions;
    // production origin refusal remains covered by the authority unit tests.
    if (headers.get('Origin') === `http://127.0.0.1:${port}`) headers.set('Origin', site.origin);
    const request = new Request(site.origin + incoming.url, { method: incoming.method, headers, body: ['GET', 'HEAD'].includes(incoming.method) ? null : Buffer.concat(chunks) });
    const response = await worker.fetch(request, env);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) { outgoing.writeHead(500); outgoing.end(String(error)); }
}).listen(port, '127.0.0.1', () => console.log(`Artifact test harness: http://127.0.0.1:${port}`));
