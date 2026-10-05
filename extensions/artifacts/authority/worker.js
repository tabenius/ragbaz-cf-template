import { submissionModel, requiredScopes, publicArtifact, SCOPES, identifier, text } from '../model.js';
import { renderEmail } from '../render.js';
import { withSecurityHeaders } from '../../../src/http.js';
import { validateSite } from '../../../src/site.js';
import { readPeerInterest, submissionFromPeerInterest } from '../peer-bridge.js';

const reply = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
async function digest(value, key) {
  const data = new TextEncoder().encode(value);
  if (!key) return [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(b => b.toString(16).padStart(2, '0')).join('');
  const secret = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', secret, data))].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function readJson(request, limit = 65536) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new Error('content_type');
  if (!request.body) throw new Error('invalid_json');
  const reader = request.body.getReader(), chunks = []; let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.length;
      if (length > limit) { await reader.cancel(); throw new Error('too_large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
async function actor(request, env, origin) {
  if (!env.EXCHANGE_IDENTITY?.fetch) return { error: 'identity_unavailable', status: 503 };
  const headers = new Headers();
  for (const name of ['Cookie', 'Authorization']) if (request.headers.has(name)) headers.set(name, request.headers.get(name));
  let response;
  try { response = await env.EXCHANGE_IDENTITY.fetch(new Request(origin + '/api/auth/session', { headers, redirect: 'manual', signal: AbortSignal.timeout(5000) })); }
  catch { return { error: 'identity_unavailable', status: 503 }; }
  if (response.status === 401) return { error: 'login_required', status: 401 };
  if (!response.ok) return { error: 'identity_unavailable', status: 503 };
  let session;
  try { session = await response.json(); } catch { return { error: 'identity_unavailable', status: 503 }; }
  if (!session.actor || typeof session.actor.id !== 'string' || !session.actor.id || session.actor.id.length > 160) return { error: 'login_required', status: 401 };
  if (!Array.isArray(session.actor.roles) || !session.actor.roles.includes('artifact-editor')) return { error: 'editor_required', status: 403 };
  return { id: session.actor.id };
}
export function createExchangeAuthority({ allowedOrigins, identityOrigin, collections, site, publicIntake = false }) {
  site = validateSite(site);
  for (const origin of [...allowedOrigins, identityOrigin]) if (new URL(origin).protocol !== 'https:' || new URL(origin).origin !== origin) throw new Error('Use exact HTTPS authority/caller origins');
  const collectionIds = new Set(collections.map(c => identifier(c.id)));
  const responsePolicy = request => !new URL(request.url).pathname.startsWith('/public/');
  return {
    async fetch(request, env = {}) {
      const finish = response => withSecurityHeaders(response, request, { authenticated: responsePolicy(request) });
      try { return finish(await handle(request, env)); }
      catch { return finish(reply({ error: 'exchange_unavailable' }, 503)); }
    },
  };
  async function handle(request, env) {
    const url = new URL(request.url), route = url.pathname;
    const publicMatch = route.match(/^\/public\/([a-z][a-z0-9-]{0,79})$/);
    const itemMatch = route.match(/^\/items\/([a-z][a-z0-9-]{0,79})(?:\/(permission|publish|reject|withdraw|email))?$/);
    const method = ['GET', 'HEAD'].includes(request.method) ? 'GET' : request.method;
    const isPublic = Boolean(publicMatch || route === '/submit' || route === '/revoke');
    const methods = publicMatch || route === '/inbox' || itemMatch?.[2] === 'email' || (itemMatch && !itemMatch[2]) ? ['GET'] : ['/submit', '/import', '/import-interest', '/revoke'].includes(route) || itemMatch ? ['POST'] : [];
    if (!methods.length) return reply({ error: 'not_found' }, 404);
    if (!methods.includes(method)) return new Response(null, { status: 405, headers: { Allow: methods.includes('GET') ? 'GET, HEAD' : methods.join(', '), 'Cache-Control': 'no-store' } });
    if (method !== 'GET' && !allowedOrigins.includes(request.headers.get('Origin'))) return reply({ error: 'origin_not_allowed' }, 403);
    if (!env.EXCHANGE_DB?.prepare) return reply({ error: 'storage_unavailable' }, 503);
    let editor;
    if (!isPublic) {
      editor = await actor(request, env, identityOrigin);
      if (editor.error) return reply({ error: editor.error }, editor.status);
    }
    if (publicMatch) {
      if (!collectionIds.has(publicMatch[1])) return reply({ error: 'not_found' }, 404);
      // Only this view crosses the public boundary; no envelope/contact/evidence.
      const before = url.searchParams.get('before') || '';
      if (before.length > 200 || (before && !/^[0-9TZ:.-]+\|[a-z][a-z0-9-]*$/.test(before))) return reply({ error: 'invalid_cursor' }, 400);
      const [date, id] = before.split('|');
      const query = before ? 'SELECT id,public_json,published_at FROM exchange_public_items WHERE collection_id = ? AND (published_at < ? OR (published_at = ? AND id > ?)) ORDER BY published_at DESC,id LIMIT 201' : 'SELECT id,public_json,published_at FROM exchange_public_items WHERE collection_id = ? ORDER BY published_at DESC,id LIMIT 201';
      const rows = await (before ? env.EXCHANGE_DB.prepare(query).bind(publicMatch[1], date, date, id) : env.EXCHANGE_DB.prepare(query).bind(publicMatch[1])).all();
      const last = rows.results[199];
      return reply({ schema: 'ragbaz.artifact-publication/v1', collection: publicMatch[1], artifacts: rows.results.slice(0, 200).map(row => publicArtifact(JSON.parse(row.public_json))), next_cursor: rows.results.length > 200 ? `${last.published_at}|${last.id}` : null });
    }
    if (route === '/inbox') {
      const before = url.searchParams.get('before') || '';
      if (before.length > 200 || (before && !/^[0-9TZ:.-]+\|[a-z][a-z0-9-]*$/.test(before))) return reply({ error: 'invalid_cursor' }, 400);
      const [date, id] = before.split('|');
      const query = before ? 'SELECT * FROM exchange_items WHERE received_at < ? OR (received_at = ? AND id > ?) ORDER BY received_at DESC,id LIMIT 51' : 'SELECT * FROM exchange_items ORDER BY received_at DESC,id LIMIT 51';
      const statement = env.EXCHANGE_DB.prepare(query);
      const rows = await (before ? statement.bind(date, date, id) : statement).all();
      const items = [];
      for (const row of rows.results.slice(0, 50)) items.push(await inboxItem(row, env));
      const last = rows.results[49];
      return reply({ schema: 'ragbaz.artifact-inbox/v1', actor: editor.id, items, next_cursor: rows.results.length > 50 ? `${last.received_at}|${last.id}` : null });
    }
    if (route === '/submit' || route === '/revoke') {
      if (!publicIntake) return reply({ error: 'public_intake_disabled' }, 403);
      if (!env.EXCHANGE_RATE_LIMITER?.limit || !env.EXCHANGE_HASH_KEY) return reply({ error: 'intake_unavailable' }, 503);
      const key = await digest(request.headers.get('CF-Connecting-IP') || 'unknown', env.EXCHANGE_HASH_KEY);
      if (!(await env.EXCHANGE_RATE_LIMITER.limit({ key })).success) return reply({ error: 'rate_limited' }, 429);
    }
    let payload;
    if (method === 'POST') {
      try { payload = await readJson(request); }
      catch (error) { return reply({ error: error.message === 'too_large' ? 'payload_too_large' : 'invalid_json' }, error.message === 'too_large' ? 413 : 400); }
    }
    if (route === '/import-interest') {
      if (!env.EXCHANGE_PEERS_DB?.prepare) return reply({ error: 'peer_directory_unavailable' }, 503);
      if (typeof payload?.interest_id !== 'string' || !/^[a-f0-9-]{36}$/.test(payload.interest_id)) return reply({ error: 'invalid_interest_import' }, 400);
      let row;
      try { row = await readPeerInterest(env.EXCHANGE_PEERS_DB, payload.interest_id); }
      catch { return reply({ error: 'peer_directory_unavailable' }, 503); }
      if (!row) return reply({ error: 'interest_not_found' }, 404);
      try {
        payload = submissionFromPeerInterest(row, payload.artifact, payload.collection);
      } catch { return reply({ error: 'invalid_interest_import' }, 400); }
    }
    if (route === '/submit' || route === '/import' || route === '/import-interest') {
      let submission;
      try {
        submission = submissionModel(payload);
        if (!collectionIds.has(submission.collection) || (route === '/submit' && submission.direction !== 'inbound')) throw new Error('Unknown destination');
        if (route === '/submit' && submission.source) throw new Error('Source correlations are editor-owned');
      } catch { return reply({ error: 'invalid_submission' }, 400); }
      const id = submission.artifact.id;
      const existing = await env.EXCHANGE_DB.prepare('SELECT id FROM exchange_items WHERE id = ?').bind(id).first();
      if (existing) return reply({ error: 'duplicate_id' }, 409);
      const receipt = crypto.randomUUID() + crypto.randomUUID();
      const now = new Date().toISOString();
      try {
        await env.EXCHANGE_DB.batch([
          env.EXCHANGE_DB.prepare('INSERT OR IGNORE INTO exchange_collections(id,created_at) VALUES(?,?)').bind(submission.collection, now),
          env.EXCHANGE_DB.prepare('INSERT INTO exchange_items(id,collection_id,direction,envelope_json,public_json,required_scopes_json,received_at,revocation_hash) VALUES(?,?,?,?,?,?,?,?)').bind(id, submission.collection, submission.direction, JSON.stringify(submission), JSON.stringify(publicArtifact(submission.artifact)), JSON.stringify(requiredScopes(submission.artifact)), now, await digest(receipt)),
        ]);
      } catch { return reply({ error: 'submission_conflict' }, 409); }
      return reply({ id, state: 'pending', receipt_token: receipt, permission: 'not_yet_recorded', schema: 'ragbaz.artifact-receipt/v1' }, 202);
    }
    if (route === '/revoke') {
      if (!payload || typeof payload.receipt_token !== 'string' || payload.receipt_token.length > 128 || !/^[a-z][a-z0-9-]{0,79}$/.test(payload.id)) return reply({ error: 'invalid_receipt' }, 400);
      const row = await env.EXCHANGE_DB.prepare('SELECT id FROM exchange_items WHERE id = ? AND revocation_hash = ?').bind(payload.id, await digest(payload.receipt_token)).first();
      if (!row) return reply({ error: 'invalid_receipt' }, 403);
      await withdraw(row.id, env);
      return reply({ id: row.id, state: 'withdrawn' });
    }
    const id = itemMatch[1], action = itemMatch[2];
    const row = await env.EXCHANGE_DB.prepare('SELECT * FROM exchange_items WHERE id = ?').bind(id).first();
    if (!row) return reply({ error: 'not_found' }, 404);
    if (!action) return reply(await inboxItem(row, env));
    if (action === 'email') {
      const collection = collections.find(c => c.id === row.collection_id);
      return reply(renderEmail(site, collection, JSON.parse(row.public_json), { ready: row.state === 'approved' }));
    }
    if (action === 'withdraw') {
      await withdraw(id, env);
      return reply({ id, state: 'withdrawn' });
    }
    if (row.state !== 'pending') return reply({ error: 'not_pending' }, 409);
    if (action === 'permission') {
      if (!payload || payload.revision !== row.revision || !Array.isArray(payload.scopes) || payload.scopes.some(s => !SCOPES.includes(s)) || !['email', 'form', 'signed', 'self-authored'].includes(payload.evidence?.kind)) return reply({ error: 'invalid_permission' }, 400);
      let reference;
      try { reference = text(payload.evidence.reference, 'evidence reference', 2000); } catch { return reply({ error: 'invalid_permission' }, 400); }
      const required = JSON.parse(row.required_scopes_json);
      if (required.some(scope => !payload.scopes.includes(scope))) return reply({ error: 'incomplete_permission' }, 409);
      if (payload.evidence.kind === 'self-authored' && (row.direction !== 'outbound' || JSON.parse(row.public_json).person)) return reply({ error: 'peer_permission_required' }, 409);
      try {
        await env.EXCHANGE_DB.prepare("INSERT INTO exchange_consents(item_id,revision,scopes_json,evidence_json,recorded_by,recorded_at,state) VALUES(?,?,?,?,?,?,'recorded')").bind(id, row.revision, JSON.stringify([...new Set(payload.scopes)]), JSON.stringify({ kind: payload.evidence.kind, reference }), editor.id, new Date().toISOString()).run();
      } catch { return reply({ error: 'permission_already_recorded' }, 409); }
      return reply({ id, permission: 'recorded', state: 'pending' });
    }
    if (payload?.revision !== row.revision) return reply({ error: 'stale_revision' }, 409);
    if (action === 'publish') {
      try {
        const result = await env.EXCHANGE_DB.prepare("UPDATE exchange_items SET state = 'approved',published_at = ?,reviewed_by = ? WHERE id = ? AND revision = ? AND state = 'pending'").bind(new Date().toISOString(), editor.id, id, payload.revision).run();
        if (!result.meta.changes) return reply({ error: 'not_pending' }, 409);
      } catch { return reply({ error: 'permission_required' }, 409); }
      return reply({ id, state: 'approved' });
    }
    await env.EXCHANGE_DB.prepare("UPDATE exchange_items SET state = 'rejected',reviewed_by = ? WHERE id = ? AND state = 'pending'").bind(editor.id, id).run();
    return reply({ id, state: 'rejected' });
  }
}
async function inboxItem(row, env) {
  const permission = await env.EXCHANGE_DB.prepare('SELECT revision,scopes_json,evidence_json,recorded_at,state FROM exchange_consents WHERE item_id = ?').bind(row.id).first();
  return { id: row.id, collection: row.collection_id, direction: row.direction, revision: row.revision, state: row.state, received_at: row.received_at, published_at: row.published_at, submission: JSON.parse(row.envelope_json), required_scopes: JSON.parse(row.required_scopes_json), permission: permission ? { revision: permission.revision, scopes: JSON.parse(permission.scopes_json), evidence: JSON.parse(permission.evidence_json), state: permission.state, recorded_at: permission.recorded_at } : null };
}
async function withdraw(id, env) {
  await env.EXCHANGE_DB.batch([
    env.EXCHANGE_DB.prepare("UPDATE exchange_consents SET state = 'withdrawn' WHERE item_id = ?").bind(id),
    env.EXCHANGE_DB.prepare("UPDATE exchange_items SET state = 'withdrawn' WHERE id = ?").bind(id),
  ]);
}
