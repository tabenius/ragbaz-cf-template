import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSiteWorker } from '../src/worker.js';
const base = JSON.parse(await readFile(new URL('../sites/nostoi/site.json', import.meta.url)));
const worker = createSiteWorker({ ...base, modules: { ...base.modules, contact: true } });
const payload = { email: 'reader@example.com', message: 'Hello', consent: true };
const request = (body = payload, headers = {}) => new Request(base.origin + '/api/contact', { method: 'POST', headers: { Origin: base.origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1', ...headers }, body: JSON.stringify(body) });
const env = () => ({ CONTACT_HASH_KEY: 'test-only-key', CONTACT_RATE_LIMITER: { limit: async () => ({ success: true }) }, CONTACT_SERVICE: { fetch: async () => new Response(null, { status: 202 }) } });
test('contact validates origin, config, content type, consent and streamed byte limit', async () => {
  assert.equal((await worker.fetch(request(), {})).status, 503);
  assert.equal((await worker.fetch(request(payload, { Origin: 'https://evil.example' }), env())).status, 403);
  assert.equal((await worker.fetch(request(payload, { 'Content-Type': 'text/plain' }), env())).status, 415);
  assert.equal((await worker.fetch(request({ ...payload, consent: false }), env())).status, 422);
  assert.equal((await worker.fetch(request({ ...payload, message: 'x'.repeat(9000) }), env())).status, 413);
});
test('contact forwards minimal data to fixed service, never raw IP; response is no-store', async () => {
  const bindings = env(); let forwarded, bucket;
  bindings.CONTACT_RATE_LIMITER.limit = async input => { bucket = input.key; return { success: true }; };
  bindings.CONTACT_SERVICE.fetch = async r => { forwarded = await r.json(); assert.equal(r.url, 'https://contact.internal/messages'); return new Response(null, { status: 202 }); };
  const response = await worker.fetch(request(), bindings);
  assert.equal(response.status, 202); assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.ok(/^[a-f0-9]{64}$/.test(bucket)); assert.ok(!JSON.stringify(forwarded).includes('192.0.2.1'));
  assert.equal(forwarded.source, 'nostoi'); assert.equal(forwarded.consent, true);
});
test('contact refuses rate limits and delivery failures without leaking internal details', async () => {
  const limited = env(); limited.CONTACT_RATE_LIMITER.limit = async () => ({ success: false });
  assert.equal((await worker.fetch(request(), limited)).status, 429);
  const failed = env(); failed.CONTACT_SERVICE.fetch = async () => { throw new Error('secret'); };
  const response = await worker.fetch(request(), failed);
  assert.equal(response.status, 503); assert.ok(!(await response.text()).includes('secret'));
});
test('contact requires exact media types and a JSON object envelope', async () => {
  for (const type of ['application/jsonp', 'application/json-extra', 'application/x-www-form-urlencoded-extra']) {
    assert.equal((await worker.fetch(request(payload, {'Content-Type':type}),env())).status,415);
  }
  assert.equal((await worker.fetch(request(payload, {'Content-Type':'Application/JSON; charset=utf-8'}),env())).status,202);
  for (const body of [null,[],true,'not an envelope']) assert.equal((await worker.fetch(request(body),env())).status,400);
});
test('contact rejects corrupt UTF-8 and duplicated form fields before forwarding', async () => {
  let forwarded=0;
  const bindings=env();bindings.CONTACT_SERVICE.fetch=async()=>{forwarded++;return new Response(null,{status:202});};
  const bytes=new TextEncoder().encode(JSON.stringify(payload));
  const position=Buffer.from(bytes).indexOf('Hello');bytes[position]=0xc3;bytes[position+1]=0x28;
  const invalid=new Request(base.origin+'/api/contact',{method:'POST',headers:{Origin:base.origin,'Content-Type':'application/json'},body:bytes});
  assert.equal((await worker.fetch(invalid,bindings)).status,400);
  for(const body of ['email=a@example.org&message=Hi&consent=on&consent=off','email=a@example.org&email=b@example.org&message=Hi&consent=on']) {
    const form=new Request(base.origin+'/api/contact',{method:'POST',headers:{Origin:base.origin,'Content-Type':'application/x-www-form-urlencoded'},body});
    const response=await worker.fetch(form,bindings);assert.equal(response.status,400);assert.equal((await response.json()).error,'ambiguous_form');
  }
  assert.equal(forwarded,0);
});
