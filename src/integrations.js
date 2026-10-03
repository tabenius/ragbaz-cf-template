import { json } from './http.js';

// Each family is a replaceable boundary around an existing authority, not a
// second account database, editor, checkout engine or cryptographic verifier.
export const INTEGRATIONS = {
  identity: { prefix: '/api/auth', root: '/api/auth', policy: 'authenticated', routes: [
    ['GET', '/session'], ['POST', '/logout'], ['POST', '/email/start'], ['POST', '/email/verify'],
    ['POST', '/passkey/login/options'], ['POST', '/passkey/login/verify'],
    ['POST', '/passkey/register/options'], ['POST', '/passkey/register/verify'],
    ['GET', '/passkeys'], ['DELETE', '/passkeys/:id'],
  ] },
  editorial: { prefix: '/api/editorial', root: '/api', policy: 'authenticated', routes: [
    ['POST', '/drafts/:id/autosave'], ['POST', '/drafts/:id/checkpoint'],
    ['POST', '/drafts/:id/restore/version/:id'], ['POST', '/articles/:id/publish'],
    ['POST', '/articles/:id/proposals'], ['POST', '/import/markdown/preview'],
    ['POST', '/import/html/preview'], ['POST', '/import/notion/preview'],
    ['POST', '/import/commit'], ['POST', '/zines/:id/requests/:id/decision'],
  ] },
  newsletter: { prefix: '/api/newsletter', root: '/api', policy: 'public', routes: [
    ['POST', '/subscribe'], ['POST', '/unsubscribe'],
  ] },
  push: { prefix: '/api/push', root: '/api/push', policy: 'public', routes: [
    ['POST', '/subscribe'], ['POST', '/unsubscribe'],
  ] },
  commerce: { prefix: '/api/commerce', root: '/api', policy: 'authenticated', routes: [
    ['GET', '/prices'], ['POST', '/create-checkout'],
  ] },
  provenance: { prefix: '/api/provenance', root: '/api/v1', policy: 'public', routes: [
    ['GET', '/system'], ['GET', '/scrolls'], ['GET', '/scrolls/:id'],
    ['GET', '/scrolls/:id/evidence'], ['GET', '/attestations'], ['GET', '/attestations/:id'],
    ['GET', '/chain/head'], ['GET', '/chain/status'],
  ] },
  catalog: { prefix: '/api/catalog', root: '/api', policy: 'public', routes: [['POST', '/graphql']] },
};

export function validateIntegration(name, config) {
  if (!INTEGRATIONS[name]) throw new Error('Unknown integration family');
  if (!/^[A-Z][A-Z0-9_]*$/.test(config.binding)) throw new Error('Use an explicit service binding');
  const url = new URL(config.origin);
  if (url.protocol !== 'https:' || url.origin !== config.origin) throw new Error('Use an exact HTTPS authority origin');
  if (!['omit', 'forward'].includes(config.credentials)) throw new Error('Choose an explicit credential policy');
  if (config.callerOrigin !== undefined && typeof config.callerOrigin !== 'boolean') throw new Error('Caller-origin flag must be boolean');
  if (config.callerOrigin && name !== 'identity') throw new Error('Caller-origin dispatch is only supported by the shared identity authority');
  if (config.maxBytes !== undefined && (!Number.isInteger(config.maxBytes) || config.maxBytes < 1 || config.maxBytes > 2 * 1024 * 1024)) throw new Error('Invalid integration request limit');
}
function matches(template, path) {
  const expression = template.split('/').map(part => part === ':id' ? '[a-zA-Z0-9_.-]{1,128}' : part).join('/');
  return new RegExp('^' + expression + '$').test(path);
}
async function readBounded(request, max) {
  if (!request.body) return null;
  const reader = request.body.getReader(); const chunks = []; let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > max) { await reader.cancel(); throw new Error('too_large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  chunks.forEach(chunk => { bytes.set(chunk, offset); offset += chunk.byteLength; });
  return bytes;
}
export function integrationAdapters(site) {
  return Object.entries(site.integrations || {}).map(([name, config]) => {
    validateIntegration(name, config);
    const family = INTEGRATIONS[name];
    return {
      prefix: family.prefix, policy: family.policy,
      async fetch(request, env) {
        const url = new URL(request.url);
        const route = url.pathname.slice(site.basePath.length + family.prefix.length);
        const allowed = family.routes.filter(([, template]) => matches(template, route));
        if (!allowed.length) return json({ error: 'not_found' }, 404);
        if (!allowed.some(([method]) => method === request.method || (request.method === 'HEAD' && method === 'GET'))) return new Response(null, { status: 405, headers: { Allow: [...new Set(allowed.map(([method]) => method))].join(', '), 'Cache-Control': 'no-store' } });
        const writes = !['GET', 'HEAD'].includes(request.method);
        if (writes && ![site.origin, ...site.aliases].includes(request.headers.get('Origin'))) return json({ error: 'origin_not_allowed' }, 403);
        // Never send credentials or request data to an unknown preview origin.
        if (config.callerOrigin && ![site.origin, ...site.aliases].includes(url.origin)) return json({ error: 'origin_not_allowed' }, 403);
        if (!env[config.binding]?.fetch) return json({ error: 'authority_unavailable' }, 503);
        let body;
        try { body = writes ? await readBounded(request, config.maxBytes || 65536) : null; }
        catch { return json({ error: 'payload_too_large' }, 413); }
        if (name === 'catalog') {
          try {
            const query = JSON.parse(new TextDecoder().decode(body)).query;
            if (typeof query !== 'string' || !/^\s*(?:query\b|\{)/.test(query) || /\bmutation\b/.test(query)) return json({ error: 'read_only_catalog' }, 403);
          } catch { return json({ error: 'invalid_query' }, 400); }
        }
        const headers = new Headers();
        for (const key of ['Accept', 'Content-Type', 'Origin', 'If-Match', 'Idempotency-Key']) {
          if (request.headers.has(key)) headers.set(key, request.headers.get(key));
        }
        if (config.credentials === 'forward') for (const key of ['Cookie', 'Authorization']) {
          if (request.headers.has(key)) headers.set(key, request.headers.get(key));
        }
        // The receiver validates its own identity, permissions, challenge/RP,
        // consent and state. Origin is preserved, never forged for the receiver.
        const target = new URL(family.root + route + url.search, config.callerOrigin ? url.origin : config.origin);
        try {
          const response = await env[config.binding].fetch(new Request(target, { method: request.method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(10_000) }));
          if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('Location');
            // Identity verification can issue a local 303 together with the
            // session cookie. Preserve that result; never follow its redirect.
            if (name !== 'identity' || !location?.startsWith('/') || location.startsWith('//') || /[\r\n\\]/.test(location)) return json({ error: 'authority_redirect_refused' }, 502);
          }
          const resultHeaders = new Headers(response.headers);
          for (const key of ['Access-Control-Allow-Origin', 'Access-Control-Allow-Credentials', 'Access-Control-Allow-Headers', 'Access-Control-Allow-Methods']) resultHeaders.delete(key);
          resultHeaders.set('Cache-Control', 'no-store');
          return new Response(response.body, { status: response.status, headers: resultHeaders });
        } catch { return json({ error: 'authority_unavailable' }, 503); }
      },
    };
  });
}
