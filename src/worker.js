import { renderPage, validateSite, escapeHtml } from './site.js';
import { homePage, mounted, pagePath, availableLocales, edition, publications } from './model.js';
import { json, view, withSecurityHeaders } from './http.js';
import { contactRequest } from './contact.js';
import { integrationAdapters } from './integrations.js';
import { maintainPeers } from './peers.js';
export { withSecurityHeaders } from './http.js';

export function createSiteWorker(config, { adapters = [], assetManifest = null, release = null } = {}) {
  const site = validateSite(config);
  adapters = [...integrationAdapters(site), ...adapters];
  const reservedApi = ['/api/contact', '/api/v1/site', '/api/v1/publications', '/api/v1/products'];
  const overlaps = (a, b) => a === b || a.startsWith(b + '/') || b.startsWith(a + '/');
  for (const adapter of adapters) {
    if (!/^\/api\/[a-z][a-z0-9/-]*$/.test(adapter.prefix) || typeof adapter.fetch !== 'function' || !['public', 'authenticated'].includes(adapter.policy)) throw new Error('Invalid API adapter contract');
    if (reservedApi.some(p => overlaps(adapter.prefix, p)) || adapters.some(other => other !== adapter && overlaps(other.prefix, adapter.prefix))) throw new Error('Overlapping API adapter prefixes');
  }
  const home = homePage(site);
  const missing = renderPage(site, { missing: true });
  const projection = page => ({ id: page.id, path: pagePath(site, page), title: page.title, description: page.description, kind: page.kind, status: page.status, created: page.created, published: page.published, updated: page.updated, tags: page.tags, locales: availableLocales(site, page).map(l => l.code), editions: Object.fromEntries(availableLocales(site, page).map(l => [l.code, { title: edition(site, page, l.code).title, description: edition(site, page, l.code).description, url: site.origin + pagePath(site, page, l.code) }])) });
  return {
    async scheduled(event,env,ctx) { ctx.waitUntil(maintainPeers(env)); },
    async fetch(request, env = {}, ctx) {
      const url = new URL(request.url);
      const finish = (response, policy = {}) => withSecurityHeaders(response, request, policy);
      const html = (body, status = 200) => finish(new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' } }), { scripts: Boolean(site.schema === 'ragbaz.project-site/v1' || site.modules.reader || site.modules.publications || site.modules.contact || site.modules.education), contact: Boolean(site.modules.contact) });
      if (site.basePath && url.pathname === site.basePath) return finish(new Response(null, { status: 308, headers: { Location: mounted(site) + url.search } }));
      if (site.basePath && !url.pathname.startsWith(site.basePath + '/')) return html(missing, 404);
      const route = url.pathname.slice(site.basePath.length) || '/';
      // A stripped locale must never become a protocol-relative Location.
      // Reject ambiguous paths before redirects or adapter dispatch.
      if (route.includes('//') || route.includes('\\')) return html(missing, 404);
      if (site.aliases.includes(url.origin)) return finish(new Response(null, { status: 308, headers: { Location: site.origin + url.pathname + url.search } }));
      for (const adapter of adapters) {
        if (route === adapter.prefix || route.startsWith(adapter.prefix + '/')) {
          try { return finish(await adapter.fetch(request, env, ctx), { authenticated: adapter.policy === 'authenticated' }); }
          catch { return finish(json({ error: 'adapter_unavailable' }, 503), { authenticated: adapter.policy === 'authenticated' }); }
        }
      }
      if (route === '/api/contact' && site.modules.contact) return finish(await contactRequest(request, env, site));
      if (!['GET', 'HEAD'].includes(request.method)) return finish(new Response('Method not allowed\n', { status: 405, headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' } }));
      if (route === '/healthz') return finish(json({ schema: 'ragbaz.site-health/v0', source: site.slug, status: 'ok', scope: 'website-only' }));
      if (route === '/api/v1/site') return finish(json(view(site, 'site', { name: site.name, origin: site.origin, base_path: site.basePath, status: site.status, locales: site.locales, modules: site.modules, release })));
      if (route === '/api/v1/publications') return finish(json(view(site, 'publications', { publications: publications(site).map(projection) })));
      if (route === '/api/v1/products') return finish(json(view(site, 'products', { products: site.products })));
      if (route === '/manifest.json') return finish(json(view(site, 'site-manifest', { origin: site.origin, entry: mounted(site), publications: publications(site).map(projection), assets: assetManifest })));
      if (route === '/robots.txt') return finish(new Response(`User-agent: *\nAllow: ${mounted(site)}\nSitemap: ${site.origin + mounted(site, '/sitemap.xml')}\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
      if (route === '/sitemap.xml') {
        const pages = [home, ...site.pages.filter(p => ['published', 'revised'].includes(p.status))];
        const entries = pages.flatMap(p => availableLocales(site, p).map(l => `<url><loc>${escapeHtml(site.origin + pagePath(site, p, l.code))}</loc><lastmod>${p.updated}</lastmod></url>`));
        if (site.modules.publications) entries.push(`<url><loc>${escapeHtml(site.origin + mounted(site, '/publications/'))}</loc></url>`);
        if (site.modules.contact) entries.push(`<url><loc>${escapeHtml(site.origin + mounted(site, '/contact/'))}</loc></url>`);
        return finish(new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join('')}</urlset>`, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } }));
      }
      const redirect = site.redirects[route] || (route === '/index.html' ? '/' : null);
      if (redirect) return finish(new Response(null, { status: 308, headers: { Location: mounted(site, redirect) + url.search } }));
      if (route.startsWith('/assets/')) {
        if (!/^\/assets\/[a-zA-Z0-9._/-]+$/.test(route) || route.includes('..')) return html(missing, 404);
        try {
          if (!env.ASSETS) throw new Error('Missing assets binding');
          const assetUrl = new URL(request.url); assetUrl.pathname = route;
          const response = await env.ASSETS.fetch(new Request(assetUrl, request));
          return response.status === 404 ? html(missing, 404) : finish(response);
        } catch { return finish(new Response('Assets unavailable\n', { status: 503, headers: { 'Cache-Control': 'no-store' } })); }
      }
      if (route === '/publications/' && site.modules.publications) return html(renderPage(site, { listing: true }));
      if (route === '/contact/' && site.modules.contact) return html(renderPage(site, { contact: true,sent:url.searchParams.get('sent')==='1' }));
      if (!route.endsWith('/') && (site.pages.some(p => p.path === route + '/' && p.status !== 'draft') || (route === '/publications' && site.modules.publications) || (route === '/contact' && site.modules.contact))) return finish(new Response(null, { status: 308, headers: { Location: mounted(site, route + '/') + url.search } }));
      let locale = site.defaultLocale, pageRoute = route;
      const first = route.split('/')[1];
      if (site.locales.some(l => l.code === first)) {
        locale = first; pageRoute = route.slice(first.length + 1) || '/';
        if (locale === site.defaultLocale) return finish(new Response(null, { status: 308, headers: { Location: mounted(site, pageRoute) + url.search } }));
      }
      const page = pageRoute === '/' ? home : site.pages.find(p => p.path === pageRoute && p.status !== 'draft');
      if (page) return html(renderPage(site, { page, locale }));
      return html(missing, 404);
    },
  };
}
