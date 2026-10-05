import { json } from './http.js';
import { peerContact } from './peers.js';
const MAX_BYTES = 8192;
async function boundedText(request) {
  if (!request.body) throw new Error('invalid');
  const reader = request.body.getReader();
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error('too_large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}
export async function contactRequest(request, env, site) {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } });
  if (![site.origin, ...site.aliases].includes(request.headers.get('Origin'))) return json({ error: 'origin_not_allowed' }, 403);
  const contentType=request.headers.get('Content-Type')?.toLowerCase()||'';
  const form=contentType.startsWith('application/x-www-form-urlencoded');
  if (!contentType.startsWith('application/json') && !form) return json({ error: 'content_type_required' }, 415);
  if (!env.PEERS_DB && (!env.CONTACT_SERVICE || !env.CONTACT_RATE_LIMITER || !env.CONTACT_HASH_KEY)) return json({ error: 'contact_unavailable' }, 503);
  if (Number(request.headers.get('Content-Length')) > MAX_BYTES) return json({ error: 'payload_too_large' }, 413);
  let body;
  try {
    if (form) {
      // Reuse the streaming size limiter before parsing a native HTML form.
      const text=await boundedText(request);
      const data=new URLSearchParams(text); body=Object.fromEntries(data);
      for(const key of ['consent','attribution_consent','link_account']) body[key]=data.get(key)==='on';
    } else body = JSON.parse(await boundedText(request));
  } catch (error) { return json({ error: error.message === 'too_large' ? 'payload_too_large' : 'invalid_json' }, error.message === 'too_large' ? 413 : 400); }
  if (env.PEERS_DB) {
    try {
      const response=await peerContact(request,env,site,body);
      if (form && response.ok) return new Response(null,{status:303,headers:{Location:site.basePath+'/contact/?sent=1','Cache-Control':'no-store'}});
      return response;
    } catch { return json({error:'contact_unavailable'},503); }
  }
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !message || message.length > 4000 || body?.consent !== true) return json({ error: 'invalid_submission' }, 422);
  try {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.CONTACT_HASH_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const hash = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${site.slug}:${request.headers.get('CF-Connecting-IP') || 'missing'}`));
    const bucket = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
    if (!(await env.CONTACT_RATE_LIMITER.limit({ key: bucket })).success) return json({ error: 'rate_limited' }, 429);
    // A fixed service binding, not a user-selected URL. Storage/retention and
    // email delivery are the receiving service's explicitly documented policy.
    const response = await env.CONTACT_SERVICE.fetch(new Request('https://contact.internal/messages', {
      method: 'POST', signal: AbortSignal.timeout(10_000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schema: 'ragbaz.contact-submission/v0', source: site.slug, id: crypto.randomUUID(), email, message, consent: true }),
    }));
    if (!response.ok) return json({ error: 'delivery_unavailable' }, 503);
    return json({ ok: true }, 202);
  } catch { return json({ error: 'delivery_unavailable' }, 503); }
}
