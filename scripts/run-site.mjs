import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { root, buildSite } from './build.mjs';

const [action, slug, mode] = process.argv.slice(2);
if (!['dev', 'deploy'].includes(action) || !slug || (mode && mode !== '--production')) {
  throw new Error('Usage: npm run dev -- <site> | npm run deploy -- <site> [--production]');
}
const output = await buildSite(slug);
execFileSync(join(root, 'node_modules/.bin/wrangler'), [action, '--config', join(output, mode === '--production' ? 'wrangler.production.json' : 'wrangler.json')], { stdio: 'inherit', cwd: root });
