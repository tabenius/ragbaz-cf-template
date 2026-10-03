import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { root, siteNames, buildSite } from './build.mjs';

for (const slug of await siteNames()) {
  const output = await buildSite(slug);
  execFileSync(join(root, 'node_modules/.bin/wrangler'), ['deploy', '--dry-run', '--config', join(output, 'wrangler.json'), '--outdir', join(output, 'bundle')], { stdio: 'inherit', cwd: root });
}
