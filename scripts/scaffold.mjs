import { readFile, writeFile, mkdir, readdir, lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { validateSite } from '../src/site.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const [slug, destination] = process.argv.slice(2);
if (!slug || !destination || !/^[a-z][a-z0-9-]*$/.test(slug)) throw new Error('Usage: npm run scaffold -- <existing-site> /new/site/directory');
const target = resolve(destination);
const site = validateSite(JSON.parse(await readFile(join(root, 'sites', slug, 'site.json'), 'utf8')));
// Refuse existing targets before creating or copying anything.
try { await lstat(target); throw new Error('Destination already exists'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir(target);
const inventory = {};
const files = ['scripts/build-single.mjs', 'scripts/social-card.mjs', 'scripts/approvals.mjs', 'scripts/approval-digests.mjs', 'package.json', 'AGENTS.md', 'README.md','migrations/peers/0001_peers.sql','migrations/peers/0002_detcordon_import.sql'];
for (const directory of ['src', 'assets', 'design', 'docs']) {
  for (const file of await readdir(join(root, directory))) {
    if (file.startsWith('.') || /(?:\.sw[op]|~)$/.test(file)) continue;
    const name = `${directory}/${file}`;
    if (!(await lstat(join(root, name))).isFile()) throw new Error(`Unsupported template entry ${name}`);
    files.push(name);
  }
}
for (const file of files.sort()) {
  const bytes = await readFile(join(root, file));
  const output = join(target, 'vendor/ragbaz-cf-template', file);
  await mkdir(resolve(output, '..'), { recursive: true });
  await writeFile(output, bytes);
  inventory[file] = createHash('sha256').update(bytes).digest('hex');
}
let revision = null;
try { revision = execFileSync('git', ['-C', root, 'rev-parse', '--verify', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* Initial, uncommitted template. */ }
await writeFile(join(target, 'template.lock.json'), JSON.stringify({
  schema: 'ragbaz.template-snapshot/v0', source: 'ragbaz-cf-template',
  revision, source_kind: 'working-tree-snapshot', files: inventory,
  note: 'Exact bytes are hash-pinned. This is not a Git submodule or automatic inheritance. Convert to a commit-pinned submodule after upstream publication.',
}, null, 2) + '\n');
await writeFile(join(target, 'site.json'), JSON.stringify(site, null, 2) + '\n');
const { cp }=await import('node:fs/promises');
try { await lstat(join(root,'sites',slug,'public')); await cp(join(root,'sites',slug,'public'),join(target,'public'),{recursive:true,dereference:false}); } catch(error){if(error.code!=='ENOENT')throw error;}
const templatePackage = JSON.parse(await readFile(join(root, 'package.json')));
await writeFile(join(target, 'package.json'), JSON.stringify({
  name: `@ragbaz/${slug}-site`, private: true, type: 'module', engines: templatePackage.engines,
  scripts: {
    build: 'node vendor/ragbaz-cf-template/scripts/build-single.mjs site.json build',
    dev: 'npm run build && wrangler dev --config build/wrangler.json',
    bundle: 'npm run build && wrangler deploy --dry-run --config build/wrangler.json --outdir build/bundle',
    deploy: 'npm run build && wrangler deploy --config build/wrangler.production.json',
  }, devDependencies: templatePackage.devDependencies,
}, null, 2) + '\n');
await writeFile(join(target, '.gitignore'), 'node_modules/\nbuild/\n.wrangler/\n.dev.vars*\n.env*\n');
await writeFile(join(target, 'AGENTS.md'), '# Project website\n\nRead ~/AGENTS.md, its MOTD, the workspace instructions and vendor/ragbaz-cf-template/AGENTS.md. Use Frog task claims and locks before edits. Project-owned content is site.json; vendor/ is a pinned snapshot, not an edit surface. See vendor/ragbaz-cf-template/docs/inheritance.md for conversion to a Git submodule. Run npm ci, npm run build and npm run bundle before review.\n');
console.log(`Scaffolded ${target}; initialize Git and install dependencies there. Snapshot hashes are in template.lock.json.`);
