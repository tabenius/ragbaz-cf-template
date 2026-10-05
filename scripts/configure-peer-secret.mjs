import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { join } from 'node:path';
import { root,siteNames } from './build.mjs';
const secret=process.env.PEER_HASH_KEY||randomBytes(32).toString('base64url');
for(const slug of await siteNames()){
  const child=spawn(join(root,'node_modules/.bin/wrangler'),['secret','put','PEER_HASH_KEY','--name',`ragbaz-${slug}-site`],{cwd:root,stdio:['pipe','inherit','inherit']});
  child.stdin.end(secret);
  const [code]=await once(child,'exit');if(code!==0)throw new Error(`Secret configuration failed for ${slug}`);
}
console.log('Shared abuse-protection secret configured without writing its value to disk or logs.');
