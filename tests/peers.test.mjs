import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { validateSite } from '../src/site.js';
import { peerSubmission,savePeerInterest,peerContact,reconcilePeerAccounts,maintainPeers } from '../src/peers.js';
import { createSiteWorker } from '../src/worker.js';

const base=validateSite(JSON.parse(await readFile(new URL('../sites/weftmark/site.json',import.meta.url))));
const schema=await readFile(new URL('../migrations/peers/0001_peers.sql',import.meta.url),'utf8');
const now='2026-10-03T12:00:00.000Z';
function store(sql=schema){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON;'+sql);
  const statement=(query,bindings=[])=>({bind(...values){return statement(query,values);},async first(){return sqlite.prepare(query).get(...bindings)||null;},async all(){return {results:sqlite.prepare(query).all(...bindings)};},async run(){return sqlite.prepare(query).run(...bindings);},query,bindings});
  return {sqlite,prepare:query=>statement(query),async batch(statements){sqlite.exec('BEGIN');try{const results=statements.map(s=>sqlite.prepare(s.query).run(...s.bindings));sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
}
function request(headers={}){return new Request(base.origin+'/api/contact',{method:'POST',headers:{Origin:base.origin,'Content-Type':'application/json','Referer':base.origin+'/',...headers}});}
function body(extra={}){return {email:'Someone@Example.com',name:'A name I chose',message:'I would like to help.',consent:true,interest:'support',request_id:crypto.randomUUID(),page_path:'/',...extra};}

test('two project interests share one UUID and preserve every source and receipt time',async()=>{
  const db=store();try{
    const first=peerSubmission(body(),request(),base,now);
    await savePeerInterest(db,first,base,now);
    const sylvae=validateSite({...base,slug:'sylvae',origin:'https://sylvae.ragbaz.cc'});
    const second=peerSubmission(body({email:'someone@example.com'}),request(),sylvae,'2026-10-04T12:00:00.000Z');
    await savePeerInterest(db,second,sylvae,'2026-10-04T12:00:00.000Z');
    const peers=db.sqlite.prepare('SELECT * FROM ragbaz_peers').all(),events=db.sqlite.prepare('SELECT * FROM ragbaz_interests ORDER BY received_at').all();
    assert.equal(peers.length,1);assert.match(peers[0].id,/^[a-f0-9-]{36}$/);assert.equal(events.length,2);
    assert.equal(events[0].peer_id,events[1].peer_id);assert.deepEqual(events.map(e=>e.source_domain),['weftmark.ragbaz.cc','sylvae.ragbaz.cc']);
    assert.equal(peers[0].first_seen_at,now);assert.equal(peers[0].last_seen_at,'2026-10-04T12:00:00.000Z');
  }finally{db.sqlite.close();}
});
test('retries are idempotent, changed payload conflicts, and no phantom peer is created',async()=>{
  const db=store();try{
    const input=body({attribution_consent:true,utm:{utm_source:'newsletter'}});
    const first=peerSubmission(input,request(),base,now);
    await savePeerInterest(db,first,base,now);
    const retry=peerSubmission(input,request(),base,'2026-10-04T12:00:00.000Z');
    assert.equal((await savePeerInterest(db,retry,base,'2026-10-04T12:00:00.000Z')).duplicate,true);
    const changed={...retry,email:'different@example.com'};
    assert.equal((await savePeerInterest(db,changed,base,now)).conflict,true);
    assert.equal(db.sqlite.prepare('SELECT count(*) n FROM ragbaz_peers').get().n,1);
    assert.equal(db.sqlite.prepare('SELECT count(*) n FROM ragbaz_interests').get().n,1);
  }finally{db.sqlite.close();}
});
test('referrers/UTMs are qualified observations, query strings excluded, privacy signals win',()=>{
  const input=body({attribution_consent:true,referrer:'https://www.google.com/search?q=private+question',utm:{utm_source:'google',utm_campaign:'kind-work',unknown:'never-store'}});
  const data=peerSubmission(input,request(),base,now);
  assert.ok(data.observations.some(c=>c.kind==='discovery-candidate'));
  assert.ok(!JSON.stringify(data.observations).includes('private+question'));
  assert.ok(!JSON.stringify(data.observations).includes('never-store'));
  for(const headers of [{'Sec-GPC':'1'},{DNT:'1'}])assert.deepEqual(peerSubmission(input,request(headers),base,now).observations,[]);
  assert.equal(data.pageBasis,'validated-client-claim');
  assert.equal(peerSubmission(body({page_path:'https://evil.example'}),request(),base,now).pageBasis,'http-referer');
});
test('contact response does not expose identity; rate limits use HMAC buckets, not raw IP',async()=>{
  const db=store();try{
    const env={PEERS_DB:db,PEER_HASH_KEY:'test-only-secret'};
    const response=await peerContact(request({'CF-Connecting-IP':'192.0.2.1'}),env,base,body(),now);
    assert.equal(response.status,202);const result=await response.json();assert.equal(result.peer_id,undefined);
    assert.ok(!JSON.stringify(db.sqlite.prepare('SELECT * FROM ragbaz_peer_rate_limits').all()).includes('192.0.2.1'));
    for(let i=0;i<9;i++)await peerContact(request({'CF-Connecting-IP':'192.0.2.1'}),env,base,body(),now);
    assert.equal((await peerContact(request({'CF-Connecting-IP':'192.0.2.1'}),env,base,body(),now)).status,429);
  }finally{db.sqlite.close();}
});
test('future verified-account matches require requested linkage and remain explicitly candidate relations',async()=>{
  const db=store(),accounts=store('CREATE TABLE accounts(id INTEGER,email TEXT,created_at INTEGER,email_verified_at INTEGER);');
  try{
    const linked=body({link_account:true});await savePeerInterest(db,peerSubmission(linked,request(),base,now),base,now);
    await reconcilePeerAccounts({PEERS_DB:db,ACCOUNTS_DB:accounts},now);
    assert.equal(db.sqlite.prepare('SELECT count(*) n FROM ragbaz_peer_account_candidates').get().n,0);
    accounts.sqlite.prepare('INSERT INTO accounts VALUES(1,?,?,?)').run('someone@example.com',1791028800,1791028800);
    await reconcilePeerAccounts({PEERS_DB:db,ACCOUNTS_DB:accounts},'2026-10-04T12:00:00.000Z');
    const match=db.sqlite.prepare('SELECT * FROM ragbaz_peer_account_candidates').get();
    assert.equal(match.account_id,'1');assert.ok(match.relation_basis.includes('authorship-unverified'));assert.ok(match.account_email_verified_at.endsWith('Z'));
    accounts.sqlite.exec('ALTER TABLE accounts ADD COLUMN display_name TEXT; ALTER TABLE accounts ADD COLUMN updated_at INTEGER;');
    accounts.sqlite.prepare('UPDATE accounts SET display_name=?,updated_at=? WHERE id=1').run('A fuller account name',1791115200);
    await reconcilePeerAccounts({PEERS_DB:db,ACCOUNTS_DB:accounts},'2026-10-05T12:00:00.000Z');
    const claim=db.sqlite.prepare('SELECT * FROM ragbaz_peer_profile_claims').get();
    assert.equal(claim.peer_id,match.peer_id);assert.equal(claim.value,'A fuller account name');assert.equal(claim.source_field,'accounts.display_name');
  }finally{db.sqlite.close();accounts.sqlite.close();}
});
test('maintenance expires records in dependency order',async()=>{
  const db=store();try{
    await savePeerInterest(db,peerSubmission(body(),request(),base,now),base,now);
    await maintainPeers({PEERS_DB:db},'2028-01-01T00:00:00.000Z');
    assert.equal(db.sqlite.prepare('SELECT count(*) n FROM ragbaz_interests').get().n,0);assert.equal(db.sqlite.prepare('SELECT count(*) n FROM ragbaz_peers').get().n,0);
  }finally{db.sqlite.close();}
});
test('native forms work without scripts and return a safe post/redirect/get result',async()=>{
  const db=store();try{
    const response=await createSiteWorker(base).fetch(new Request(base.origin+'/api/contact',{method:'POST',headers:{Origin:base.origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:'native@example.com',message:'Hello',consent:'on'})}),{PEERS_DB:db,PEER_HASH_KEY:'test-only'});
    assert.equal(response.status,303);assert.equal(response.headers.get('Location'),'/contact/?sent=1');
    assert.equal(db.sqlite.prepare('SELECT count(*) n FROM ragbaz_interests').get().n,1);
  }finally{db.sqlite.close();}
});
test('active legacy interests import once, preserving expiry without new consent',async()=>{
  const db=store();try{
    db.sqlite.exec('CREATE TABLE leads(id TEXT PRIMARY KEY,email TEXT,context TEXT,cta TEXT,created_at INTEGER,expires_at INTEGER,organization TEXT);');
    const current=Math.floor(Date.now()/1000);
    db.sqlite.prepare('INSERT INTO leads VALUES(?,?,?,?,?,?,?)').run('active','LEGACY@EXAMPLE.COM','Pilot context','pilot-request',current-100,current+10000,'Original studio');
    db.sqlite.prepare('INSERT INTO leads VALUES(?,?,?,?,?,?,?)').run('expired','old@example.com','Old context','pilot-request',current-100000,current-100,null);
    const migration=await readFile(new URL('../migrations/peers/0002_detcordon_import.sql',import.meta.url),'utf8');
    db.sqlite.exec(migration);db.sqlite.exec(migration);
    const peers=db.sqlite.prepare('SELECT * FROM ragbaz_peers').all(),events=db.sqlite.prepare('SELECT * FROM ragbaz_interests').all();
    assert.equal(peers.length,1);assert.equal(events.length,1);assert.equal(peers[0].email_normalized,'legacy@example.com');
    assert.equal(events[0].expires_at,new Date((current+10000)*1000).toISOString());
    assert.equal(events[0].attribution_consent,0);assert.equal(events[0].account_link_requested,0);
    assert.equal(events[0].organization_claim,'Original studio');assert.equal(events[0].source_cta,'pilot-request');
  }finally{db.sqlite.close();}
});
