import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { root, buildSite } from './build.mjs';

const [action, slug, mode] = process.argv.slice(2);
if (!['dev', 'deploy'].includes(action) || !slug || (mode && mode !== '--production')) {
  throw new Error('Usage: npm run dev -- <site> | npm run deploy -- <site> [--production]');
}
if(action==='deploy'&&mode==='--production'){
  const { readFile }=await import('node:fs/promises');
  const config=JSON.parse(await readFile(join(root,'sites',slug,'site.json')));
  if(config.modules?.contact){
    const databases=JSON.parse(execFileSync(join(root,'node_modules/.bin/wrangler'),['d1','list','--json'],{encoding:'utf8',cwd:root}));
    const peers=databases.find(db=>db.name==='detcordon-marketing-leads');
    if(!peers)throw new Error('Existing DetCordon marketing database not found; refusing to create or guess a replacement');
    process.env.RAGBAZ_PEERS_D1_ID=peers.uuid;
    if(config.peerAccountReconciliation){
      const accounts=databases.find(db=>db.name==='ragbaz-cc-accounts');
      if(!accounts)throw new Error('Existing RAGBAZ account database not found');
      process.env.RAGBAZ_ACCOUNTS_D1_ID=accounts.uuid;
    }
  }
}
const output = await buildSite(slug);
execFileSync(join(root, 'node_modules/.bin/wrangler'), [action, '--config', join(output, mode === '--production' ? 'wrangler.production.json' : 'wrangler.json')], { stdio: 'inherit', cwd: root });
