import { publicProduct } from './domains.js';
import { json } from './http.js';

const PREFIX = '/api/v1/catalog';
const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;

// Only explicitly published product records belong here, never workspace state.
export async function catalogSnapshot(input, { now = Date.now(), maxAgeSeconds = 86400 } = {}) {
  if (!input || input.schema !== 'ragbaz.public-catalog/v1') throw new Error('Invalid catalog schema');
  const { schema, observed_at: observedAt, digest: expectedDigest } = input;
  const source = new URL(input.source);
  if (source.protocol !== 'https:' || source.username || source.password || source.search || source.hash || !text(input.source, 2048)) throw new Error('Invalid public catalog source');
  if (!timestamp(observedAt) || !Number.isFinite(now) || Date.parse(observedAt) > now) throw new Error('Invalid catalog observation time');
  if (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds < 1) throw new Error('Invalid catalog freshness limit');
  if (!Array.isArray(input.products) || input.products.length > 200) throw new Error('Invalid catalog products');
  const ids = new Set();
  const products = Array.from(input.products, product => {
    if (!product || !text(product.id, 128) || !text(product.name, 256) || !Array.isArray(product.capabilities) || product.capabilities.length > 64 || Array.from(product.capabilities).some(c => !text(c, 256))) throw new Error('Invalid public product');
    const projected = publicProduct(product);
    if (ids.has(projected.id)) throw new Error('Duplicate product identity');
    ids.add(projected.id);
    return projected;
  });
  const bytes = new TextEncoder().encode(JSON.stringify(products));
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  if (expectedDigest !== undefined && expectedDigest !== digest) throw new Error('Catalog projection digest mismatch');
  const ageSeconds = Math.floor((now - Date.parse(observedAt)) / 1000);
  return { schema, source: source.href, observed_at: observedAt, digest, digest_scope: 'projected-products-json', freshness: { state: ageSeconds <= maxAgeSeconds ? 'fresh' : 'stale', age_seconds: ageSeconds, max_age_seconds: maxAgeSeconds }, search_scope: 'none', products };
}

// Opt-in local snapshot adapter; no crawling, remote fetching or search service.
export function catalogSnapshotAdapter(site, loadSnapshot, options = {}) {
  if (typeof loadSnapshot !== 'function') throw new Error('Catalog loader required');
  return {
    prefix: PREFIX, policy: 'public',
    async fetch(request) {
      const respond = response => request.method === 'HEAD' ? new Response(null, { status: response.status, headers: response.headers }) : response;
      const url = new URL(request.url);
      if (url.pathname !== (site.basePath || '') + PREFIX) return respond(json({ error: 'not_found' }, 404));
      if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' } });
      if (url.search) return respond(json({ error: 'catalog_search_unavailable' }, 400));
      try {
        const snapshot = await catalogSnapshot(await loadSnapshot(), options);
        return respond(json(snapshot));
      } catch { return respond(json({ error: 'catalog_snapshot_unavailable' }, 503)); }
    },
  };
}
