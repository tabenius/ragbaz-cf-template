import { json } from './http.js';
import { homePage, pagePath } from './model.js';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const INTERESTS = ['question','workflow','collaboration','support','privacy'];
const UTM = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'];
const iso = value => new Date(value).toISOString();
const later = (now, days) => iso(Date.parse(now) + days * 86400000);
async function hash(bytes) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2,'0')).join(''); }

export function peerSubmission(body, request, site, now) {
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || name.length > 160 || !message || message.length > 4000 || body.consent !== true) throw new Error('invalid_submission');
  const id = body.request_id || crypto.randomUUID();
  if (!UUID.test(id)) throw new Error('invalid_request_id');
  const interest = body.interest || 'question'; if (!INTERESTS.includes(interest)) throw new Error('invalid_interest');
  const paths = new Set([site.basePath+'/contact/',site.basePath+'/publications/']);
  for (const page of [homePage(site), ...site.pages.filter(p => p.status !== 'draft')]) for (const locale of site.locales) paths.add(pagePath(site,page,locale.code));
  let page = site.basePath + '/contact/', pageBasis = 'contact-endpoint';
  try { const ref = new URL(request.headers.get('Referer')); if (ref.origin === site.origin && paths.has(ref.pathname)) { page=ref.pathname; pageBasis='http-referer'; } } catch { /* Referrer can be absent. */ }
  if (typeof body.page_path === 'string' && paths.has(body.page_path)) { page=body.page_path; pageBasis='validated-client-claim'; }
  const privacySignal = request.headers.get('Sec-GPC') === '1' || body.gpc === true ? 'gpc' : request.headers.get('DNT') === '1' || body.dnt === true ? 'dnt' : 'none';
  const attributionConsent = body.attribution_consent === true && privacySignal === 'none';
  const observations = [];
  if (attributionConsent) {
    const campaign = {};
    for (const key of UTM) {
      const value = body.utm?.[key];
      if (typeof value === 'string' && /^[\p{L}\p{N} ._:/-]{1,120}$/u.test(value)) campaign[key] = value;
    }
    if (Object.keys(campaign).length) observations.push({ kind:'campaign-tags', basis:'client-declared', values:campaign, observed_at:now });
    try {
      const ref = new URL(body.referrer);
      if (['https:','http:'].includes(ref.protocol) && !ref.username && !ref.password) {
        observations.push({ kind:'referrer-origin', basis:'client-declared', value:ref.origin, observed_at:now });
        if (/^(?:www\.)?google\.[a-z.]+$/.test(ref.hostname)) observations.push({ kind:'discovery-candidate', basis:'inferred-from-declared-referrer', value:'google-search-or-google-navigation', observed_at:now });
      }
    } catch { /* No referrer is a valid privacy-preserving outcome. */ }
    const country = request.cf?.country;
    if (typeof country === 'string' && /^[A-Z]{2}$/.test(country)) observations.push({ kind:'network-country', basis:'cloudflare-edge-inference', value:country, observed_at:now });
  }
  return { id,email,name,message,interest,page,pageBasis,privacySignal,attributionConsent,observations,
    accountLink:body.link_account===true,
    clientTime:typeof body.submitted_at==='string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(body.submitted_at) && Number.isFinite(Date.parse(body.submitted_at)) ? iso(body.submitted_at) : null };
}

export async function savePeerInterest(db, data, site, now) {
  // Attribution observations carry a changing server timestamp; they are not
  // part of the stable retry digest. Source/page and declared values are.
  const digestInput = { ...data, observations:data.observations.map(({ observed_at, ...claim })=>claim) };
  const payloadHash = await hash(new TextEncoder().encode(JSON.stringify(digestInput)));
  const matches = row => row?.payload_hash===payloadHash && row.project===site.slug && row.source_domain===new URL(site.origin).hostname;
  const existing = await db.prepare('SELECT payload_hash,project,source_domain FROM ragbaz_interests WHERE id=?1').bind(data.id).first();
  if (existing) return matches(existing) ? { ok:true,id:data.id,duplicate:true } : { conflict:true };
  const proposedPeer = crypto.randomUUID();
  await db.batch([
    db.prepare(`INSERT INTO ragbaz_peers(id,email_normalized,first_seen_at,last_seen_at,expires_at)
      SELECT ?1,?2,?3,?3,?4 WHERE NOT EXISTS(SELECT 1 FROM ragbaz_interests WHERE id=?5)
      ON CONFLICT(email_normalized) DO UPDATE SET first_seen_at=MIN(ragbaz_peers.first_seen_at,excluded.first_seen_at),last_seen_at=MAX(ragbaz_peers.last_seen_at,excluded.last_seen_at),expires_at=MAX(ragbaz_peers.expires_at,excluded.expires_at)`)
      .bind(proposedPeer,data.email,now,later(now,365),data.id),
    db.prepare(`INSERT OR IGNORE INTO ragbaz_interests(id,peer_id,payload_hash,project,source_domain,source_page,source_page_basis,name_claim,message,interest_type,received_at,client_submitted_at,contact_consent,attribution_consent,account_link_requested,privacy_signal,attribution_json,expires_at)
      SELECT ?1,id,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,1,?12,?13,?14,?15,?16 FROM ragbaz_peers WHERE email_normalized=?17`)
      .bind(data.id,payloadHash,site.slug,new URL(site.origin).hostname,data.page,data.pageBasis,data.name||null,data.message,data.interest,now,data.clientTime,Number(data.attributionConsent),Number(data.accountLink),data.privacySignal,JSON.stringify(data.observations),later(now,180),data.email),
  ]);
  const saved = await db.prepare('SELECT payload_hash,project,source_domain FROM ragbaz_interests WHERE id=?1').bind(data.id).first();
  return matches(saved) ? { ok:true,id:data.id } : { conflict:true };
}

export async function peerContact(request, env, site, body, now = new Date().toISOString()) {
  if (!env.PEERS_DB || !env.PEER_HASH_KEY) return json({ error:'contact_unavailable' },503);
  let data; try { data=peerSubmission(body,request,site,now); } catch (error) { return json({ error:error.message },422); }
  if (body.website) return json({ ok:true },202);
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(env.PEER_HASH_KEY),{ name:'HMAC',hash:'SHA-256' },false,['sign']);
  const bytes = await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${now.slice(0,10)}:${request.headers.get('CF-Connecting-IP')||'missing'}`));
  const bucket = site.slug+':'+Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
  const window = Math.floor(Date.parse(now)/3600000)*3600;
  const count = await env.PEERS_DB.prepare(`INSERT INTO ragbaz_peer_rate_limits(bucket,window_start,count) VALUES(?1,?2,1)
    ON CONFLICT(bucket) DO UPDATE SET count=CASE WHEN window_start=excluded.window_start THEN count+1 ELSE 1 END,window_start=excluded.window_start
    WHERE ragbaz_peer_rate_limits.window_start<>excluded.window_start OR ragbaz_peer_rate_limits.count<10
    RETURNING count`).bind(bucket,window).first();
  if (!count || count.count>10) return new Response(JSON.stringify({error:'rate_limited'}),{status:429,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Retry-After':String(Math.max(1,window+3600-Math.floor(Date.parse(now)/1000)))}});
  const result=await savePeerInterest(env.PEERS_DB,data,site,now);
  if (result.conflict) return json({ error:'request_id_conflict' },409);
  // Never return a peer UUID: a public form must not become an email-existence
  // or cross-project relationship oracle.
  return json({ ok:true,request_id:result.id },202);
}

export async function reconcilePeerAccounts(env, now = new Date().toISOString()) {
  if (!env.PEERS_DB || !env.ACCOUNTS_DB) return { available:false };
  const state=await env.PEERS_DB.prepare("SELECT last_peer_id FROM ragbaz_peer_sync_state WHERE source='ragbaz.cc'").first();
  const rows=await env.PEERS_DB.prepare(`SELECT p.id,p.email_normalized FROM ragbaz_peers p WHERE p.id>?1 AND EXISTS(SELECT 1 FROM ragbaz_interests i WHERE i.peer_id=p.id AND i.account_link_requested=1) ORDER BY p.id LIMIT 100`).bind(state?.last_peer_id||'').all();
  const columns=await env.ACCOUNTS_DB.prepare("SELECT name FROM pragma_table_info('accounts')").all();
  const names=new Set(columns.results.map(column=>column.name));
  const nameField=['display_name','full_name','name'].find(field=>names.has(field));
  const profileSelect=(nameField?nameField+' AS name_claim':'NULL AS name_claim')+','+(names.has('updated_at')?'updated_at':'NULL AS updated_at');
  for (const peer of rows.results) {
    // Select only needed fields, never passwords, sessions or payment IDs.
    const account=await env.ACCOUNTS_DB.prepare('SELECT id,created_at,email_verified_at,'+profileSelect+' FROM accounts WHERE lower(email)=?1 AND email_verified_at IS NOT NULL').bind(peer.email_normalized).first();
    if (!account) continue;
    await env.PEERS_DB.prepare(`INSERT INTO ragbaz_peer_account_candidates(peer_id,authority,account_id,relation_basis,account_created_at,account_email_verified_at,first_observed_at,last_observed_at)
      VALUES(?1,'ragbaz.cc',?2,'verified-account-email-match; prior-message-authorship-unverified',?3,?4,?5,?5)
      ON CONFLICT(peer_id,authority,account_id) DO UPDATE SET last_observed_at=excluded.last_observed_at`).bind(peer.id,String(account.id),iso(account.created_at*1000),iso(account.email_verified_at*1000),now).run();
    if(nameField&&typeof account.name_claim==='string'&&account.name_claim.trim())await env.PEERS_DB.prepare(`INSERT INTO ragbaz_peer_profile_claims(peer_id,authority,account_id,attribute,value,source_field,source_created_at,source_updated_at,first_observed_at,last_observed_at)
      VALUES(?1,'ragbaz.cc',?2,'account-declared-name',?3,?4,?5,?6,?7,?7)
      ON CONFLICT(peer_id,authority,account_id,attribute,value) DO UPDATE SET last_observed_at=excluded.last_observed_at`).bind(peer.id,String(account.id),account.name_claim.trim().slice(0,160),'accounts.'+nameField,iso(account.created_at*1000),account.updated_at?iso(account.updated_at*1000):null,now).run();
  }
  await env.PEERS_DB.prepare("INSERT INTO ragbaz_peer_sync_state(source,last_peer_id) VALUES('ragbaz.cc',?1) ON CONFLICT(source) DO UPDATE SET last_peer_id=excluded.last_peer_id").bind(rows.results.length===100 ? rows.results.at(-1).id : '').run();
  return { available:true,examined:rows.results.length };
}
export async function maintainPeers(env, now = new Date().toISOString()) {
  if (!env.PEERS_DB) return;
  await env.PEERS_DB.batch([
    env.PEERS_DB.prepare('DELETE FROM ragbaz_interests WHERE expires_at<?1').bind(now),
    env.PEERS_DB.prepare('DELETE FROM ragbaz_peer_profile_claims WHERE peer_id IN(SELECT id FROM ragbaz_peers WHERE expires_at<?1)').bind(now),
    env.PEERS_DB.prepare('DELETE FROM ragbaz_peer_account_candidates WHERE peer_id IN(SELECT id FROM ragbaz_peers WHERE expires_at<?1)').bind(now),
    env.PEERS_DB.prepare('DELETE FROM ragbaz_peers WHERE expires_at<?1').bind(now),
    env.PEERS_DB.prepare('DELETE FROM ragbaz_peer_rate_limits WHERE window_start<?1').bind(Math.floor(Date.parse(now)/1000)-172800),
  ]);
  await reconcilePeerAccounts(env,now);
}
