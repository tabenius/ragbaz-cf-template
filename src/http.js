export function view(site, name, data) {
  return { schema: `ragbaz.${name}/v0`, source: site.slug, observed_at: new Date().toISOString(), ...data };
}
export function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}
export function withSecurityHeaders(response, request, { scripts = false, contact = false, authenticated = false, scriptOrigins = [], connectOrigins = [], frameOrigins = [] } = {}) {
  for (const value of [...scriptOrigins, ...connectOrigins, ...frameOrigins]) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.origin !== value) throw new Error('CSP extensions require exact HTTPS origins');
  }
  const sources = (enabled, origins) => [enabled ? "'self'" : '', ...origins].filter(Boolean).join(' ') || "'none'";
  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy', `default-src 'none'; style-src 'self'; img-src 'self'; font-src 'self'; script-src ${sources(scripts, scriptOrigins)}; connect-src ${sources(scripts || contact, connectOrigins)}; frame-src ${sources(false, frameOrigins)}; base-uri 'none'; form-action ${contact ? "'self'" : "'none'"}; frame-ancestors 'none'; object-src 'none'`);
  for (const [key, value] of Object.entries({
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()', 'Cross-Origin-Opener-Policy': 'same-origin',
  })) headers.set(key, value);
  if (new URL(request.url).protocol === 'https:') headers.set('Strict-Transport-Security', 'max-age=31536000');
  if (authenticated) headers.set('Cache-Control', 'private, no-store');
  else headers.delete('Set-Cookie');
  return new Response(request.method === 'HEAD' ? null : response.body, { status: response.status, headers });
}
