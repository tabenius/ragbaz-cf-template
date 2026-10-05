import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { root,siteNames } from './build.mjs';

const email='deployment-'+crypto.randomUUID()+'@example.invalid',ids=[];
function query(sql){
  const output=execFileSync(join(root,'node_modules/.bin/wrangler'),['d1','execute','detcordon-marketing-leads','--remote','--json','--command',sql],{cwd:root,encoding:'utf8'});
  return JSON.parse(output)[0].results;
}
try{
  for(const slug of await siteNames()){
    const site=JSON.parse(await readFile(join(root,'sites',slug,'site.json'))),id=crypto.randomUUID();ids.push(id);
    const response=await fetch(site.origin+'/api/contact',{method:'POST',headers:{Origin:site.origin,'Content-Type':'application/json',...(slug==='sylvae'?{'Sec-GPC':'1'}:{})},body:JSON.stringify({request_id:id,email,name:'Deployment verification — synthetic record',message:'Automated contact-path verification; removed immediately after validation.',interest:'support',consent:true,attribution_consent:true,link_account:false,page_path:'/',referrer:'https://www.google.com/search?q=not-to-be-retained',utm:{utm_source:'release-verification'}}),signal:AbortSignal.timeout(20000)});
    assert.equal(response.status,202,`${slug}: ${await response.clone().text()}`);const result=await response.json();assert.equal(result.peer_id,undefined);
  }
  const rows=query(`SELECT i.id,i.peer_id,i.source_domain,i.source_page,i.received_at,i.privacy_signal,i.attribution_json FROM ragbaz_interests i JOIN ragbaz_peers p ON p.id=i.peer_id WHERE p.email_normalized='${email}' ORDER BY i.source_domain;`);
  assert.equal(rows.length,4);assert.equal(new Set(rows.map(r=>r.peer_id)).size,1);
  assert.ok(rows.every(r=>r.source_page==='/'&&r.received_at.endsWith('Z')));
  assert.equal(rows.find(r=>r.source_domain==='sylvae.ragbaz.cc').attribution_json,'[]');
  assert.ok(rows.every(r=>!r.attribution_json.includes('not-to-be-retained')));
  console.log('Four live forms stored distinct source/date records with one shared contact UUID; GPC and attribution minimization verified.');
}finally{
  query(`DELETE FROM ragbaz_interests WHERE peer_id IN(SELECT id FROM ragbaz_peers WHERE email_normalized='${email}'); DELETE FROM ragbaz_peer_profile_claims WHERE peer_id IN(SELECT id FROM ragbaz_peers WHERE email_normalized='${email}'); DELETE FROM ragbaz_peer_account_candidates WHERE peer_id IN(SELECT id FROM ragbaz_peers WHERE email_normalized='${email}'); DELETE FROM ragbaz_peers WHERE email_normalized='${email}';`);
  console.log('Only the synthetic deployment-check contact records were removed.');
}
