import { createSiteWorker } from '../../src/worker.js';
import { validateSite, escapeHtml } from '../../src/site.js';
import { withSecurityHeaders } from '../../src/http.js';
import { collectionModel, publicArtifact, localUrl, text } from './model.js';
import { renderCollection, renderArtifact, renderArtifactCard, renderInbox, renderShare, artifactPath } from './render.js';

export function createArtifactSiteWorker(input, { collections, source = 'inline', inline = {}, placements = [], assetManifest, release } = {}) {
  const site = validateSite(input), registry = collections.map(collectionModel);
  if (!registry.length) throw new Error('Supply collections');
  if (!['inline', 'service'].includes(source)) throw new Error('Unknown artifact source');
  if (new Set(registry.map(c => c.id)).size !== registry.length || new Set(registry.map(c => c.path)).size !== registry.length) throw new Error('Duplicate collection');
  for (const placement of placements) {
    localUrl(placement.path); text(placement.title, 'placement title', 240);
    if (!registry.some(c => c.id === placement.collection) || (placement.path !== '/' && !site.pages.some(p => p.status !== 'draft' && p.path === placement.path))) throw new Error('Placement needs a public core page and known collection');
  }
  for (const collection of registry) {
    if (site.pages.some(p => p.path === collection.path)) throw new Error('Collection overlaps a core page');
    if (registry.some(other => other !== collection && (other.path.startsWith(collection.path) || collection.path.startsWith(other.path)))) throw new Error('Overlapping collection routes');
    inline[collection.id] = (inline[collection.id] || []).map(publicArtifact);
    if (new Set(inline[collection.id].map(a => a.id)).size !== inline[collection.id].length) throw new Error('Duplicate artifact ID');
  }
  const core = createSiteWorker(site, { assetManifest, release, adapters: [{
    prefix: '/api/exchange', policy: 'authenticated',
    fetch: (request, env) => proxy(request, env, site),
  }] });
  const finish = (request, response, authenticated = false, scripts = authenticated, forms = false) => withSecurityHeaders(response, request, { scripts, contact: forms, authenticated });
  const html = (request, body, status = 200, authenticated = false) => finish(request, new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': source === 'service' || authenticated ? 'no-store' : 'public, max-age=300' } }), authenticated);
  async function corePage(request, env, ctx, route) {
    const response = await core.fetch(request, env, ctx);
    const slots = placements.filter(p => p.path === route);
    if (!slots.length || response.status !== 200 || request.method !== 'GET' || !response.headers.get('Content-Type')?.startsWith('text/html')) return response;
    try {
      const cards = [];
      for (const slot of slots) {
        const collection = registry.find(c => c.id === slot.collection), artifacts = await items(collection, env);
        cards.push(`<section class="artifact-embedded" aria-label="${escapeHtml(slot.title)}"><h2>${escapeHtml(slot.title)}</h2><div class="artifact-grid">${artifacts.map(item => renderArtifactCard(site, collection, item)).join('')}</div></section>`);
      }
      const styles = ['artifact-tokens.css', 'artifact-embeds.css'].map(file => `<link rel="stylesheet" href="${site.basePath}/assets/${file}">`).join('');
      const body = (await response.text()).replace('</head>', styles + '</head>').replace('</main>', cards.join('') + '</main>');
      const headers = new Headers(response.headers);
      if (source === 'service') headers.set('Cache-Control', 'no-store');
      return new Response(body, { status: response.status, headers });
    } catch { return finish(request, Response.json({ error: 'artifact_collection_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })); }
  }
  async function items(collection, env) {
    if (source === 'inline') return inline[collection.id];
    if (!env.ARTIFACT_EXCHANGE?.fetch) throw new Error('exchange_unavailable');
    const result = []; let cursor = null;
    for (let page = 0; page < 20; page++) {
      const response = await env.ARTIFACT_EXCHANGE.fetch(new Request('https://exchange.internal/public/' + collection.id + (cursor ? '?before=' + encodeURIComponent(cursor) : ''), { signal: AbortSignal.timeout(5000) }));
      if (!response.ok) throw new Error('exchange_unavailable');
      const data = await response.json();
      if (data.schema !== 'ragbaz.artifact-publication/v1' || data.collection !== collection.id || !Array.isArray(data.artifacts)) throw new Error('invalid_projection');
      result.push(...data.artifacts.map(publicArtifact));
      if (!data.next_cursor) return result;
      if (typeof data.next_cursor !== 'string' || data.next_cursor.length > 200 || data.next_cursor === cursor) throw new Error('invalid_cursor');
      cursor = data.next_cursor;
    }
    throw new Error('collection_capacity_exceeded');
  }
  return {
    async fetch(request, env = {}, ctx) {
      const url = new URL(request.url);
      if (site.aliases.includes(url.origin) || (site.basePath && !url.pathname.startsWith(site.basePath + '/'))) return core.fetch(request, env, ctx);
      const route = url.pathname.slice(site.basePath.length) || '/';
      if (route === '/share/') {
        if (!['GET', 'HEAD'].includes(request.method)) return finish(request, new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } }));
        return finish(request, new Response(renderShare(site, registry), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }), false, true, true);
      }
      if (['/manifest.json', '/sitemap.xml'].includes(route) && ['GET', 'HEAD'].includes(request.method)) {
        try {
          const projections = [];
          for (const collection of registry) {
            const artifacts = await items(collection, env);
            projections.push({ collection, artifacts: artifacts.map(a => ({ id: a.id, title: a.title, url: site.origin + site.basePath + artifactPath(collection, a) })) });
          }
          const response = await core.fetch(new Request(request.url, { headers: request.headers }), env, ctx);
          if (route === '/manifest.json') return finish(request, Response.json({ ...await response.json(), artifact_collections: projections }, { headers: { 'Cache-Control': source === 'service' ? 'no-store' : 'public, max-age=300' } }));
          const urls = projections.flatMap(p => [p.collection.path === '/' ? null : site.origin + site.basePath + p.collection.path, ...p.artifacts.map(a => a.url)].filter(Boolean));
          const xml = (await response.text()).replace('</urlset>', urls.map(u => `<url><loc>${escapeHtml(u)}</loc></url>`).join('') + '</urlset>');
          return finish(request, new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': source === 'service' ? 'no-store' : 'public, max-age=300' } }));
        } catch { return finish(request, Response.json({ error: 'artifact_collection_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })); }
      }
      if (route === '/inbox/') {
        if (!['GET', 'HEAD'].includes(request.method)) return finish(request, new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } }), true);
        // The same identity/authorization check that protects API reads protects
        // the HTML. Do not ship the inbox to a visitor just because JS is gated.
        const probe = await proxy(new Request(site.origin + site.basePath + '/api/exchange/inbox', { headers: request.headers }), env, site);
        if (!probe.ok) return finish(request, probe, true);
        return html(request, renderInbox(site, registry[0]), 200, true);
      }
      const apiMatch = route.match(/^\/api\/artifacts\/([a-z][a-z0-9-]{0,79})$/);
      const collection = apiMatch ? registry.find(c => c.id === apiMatch[1]) : registry.find(c => route === c.path || route.startsWith(c.path));
      if (!collection) return corePage(request, env, ctx, route);
      // A root collection must not swallow the core's assets, health/API routes.
      if (!apiMatch && route !== collection.path && !/^([a-z][a-z0-9-]{0,79})\/$/.test(route.slice(collection.path.length))) return corePage(request, env, ctx, route);
      if (!['GET', 'HEAD'].includes(request.method)) return finish(request, new Response(null, { status: 405, headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' } }));
      let artifacts;
      try { artifacts = await items(collection, env); }
      catch { return finish(request, Response.json({ error: 'artifact_collection_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })); }
      if (apiMatch) return finish(request, Response.json({ schema: 'ragbaz.artifact-collection/v1', collection, artifacts }, { headers: { 'Cache-Control': source === 'service' ? 'no-store' : 'public, max-age=300' } }));
      if (route === collection.path) return html(request, renderCollection(site, collection, artifacts));
      const item = artifacts.find(a => artifactPath(collection, a) === route);
      return item ? html(request, renderArtifact(site, collection, item)) : corePage(request, env, ctx, route);
    },
  };
}

async function proxy(request, env, site) {
  const url = new URL(request.url), prefix = site.basePath + '/api/exchange';
  const route = url.pathname.slice(prefix.length);
  if (!/^\/(?:inbox|submit|import|import-interest|revoke|public\/[a-z][a-z0-9-]{0,79}|items\/[a-z][a-z0-9-]{0,79}(?:\/(?:permission|publish|reject|withdraw|email))?)$/.test(route)) return Response.json({ error: 'not_found' }, { status: 404 });
  if (!env.ARTIFACT_EXCHANGE?.fetch) return Response.json({ error: 'exchange_unavailable' }, { status: 503 });
  const headers = new Headers();
  const isPublic = route.startsWith('/public/') || ['/submit', '/revoke'].includes(route);
  for (const key of ['Content-Type', 'Origin', ...(!isPublic ? ['Cookie', 'Authorization'] : [])]) if (request.headers.has(key)) headers.set(key, request.headers.get(key));
  // Rate-limit input is received from Cloudflare, never stored in a submission.
  if (isPublic && request.headers.has('CF-Connecting-IP')) headers.set('CF-Connecting-IP', request.headers.get('CF-Connecting-IP'));
  try {
    const response = await env.ARTIFACT_EXCHANGE.fetch(new Request('https://exchange.internal' + route + url.search, { method: request.method, headers, body: ['GET', 'HEAD'].includes(request.method) ? null : request.body, duplex: 'half', redirect: 'manual', signal: AbortSignal.timeout(10_000) }));
    if (response.status >= 300 && response.status < 400) return Response.json({ error: 'exchange_redirect_refused' }, { status: 502 });
    const clean = new Headers(response.headers);
    for (const name of ['Set-Cookie', 'Access-Control-Allow-Origin', 'Access-Control-Allow-Credentials']) clean.delete(name);
    clean.set('Cache-Control', 'private, no-store');
    return new Response(response.body, { status: response.status, headers: clean });
  } catch { return Response.json({ error: 'exchange_unavailable' }, { status: 503 }); }
}
