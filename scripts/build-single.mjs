import { readFile, writeFile, mkdir, copyFile, readdir, lstat, rm } from 'node:fs/promises';
import { resolve, join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { validateSite } from '../src/site.js';
import { verifyApprovals } from './approvals.mjs';
import { mounted } from '../src/model.js';
import { socialCard } from './social-card.mjs';
import { execFileSync } from 'node:child_process';

const templateRoot = fileURLToPath(new URL('../', import.meta.url));
export async function buildProject(configPath, outputPath) {
  const site = validateSite(JSON.parse(await readFile(configPath, 'utf8')));
  verifyApprovals(site);
  const output = resolve(outputPath);
  const projectRoot = dirname(resolve(configPath));
  for (const source of [projectRoot, templateRoot]) {
    const rel = relative(output, source);
    if (!rel || (!rel.startsWith('..') && !rel.startsWith('/'))) throw new Error('Build output cannot contain the source directory');
  }
  // Remove only generated static assets, never user source or the whole build.
  await rm(join(output, 'public'), { recursive: true, force: true });
  await mkdir(join(output, 'public/assets'), { recursive: true });
  const provenance = JSON.parse(await readFile(join(templateRoot, 'design/provenance.json'), 'utf8'));
  const tokens = await readFile(join(templateRoot, 'assets/tokens.css'));
  if (createHash('sha256').update(tokens).digest('hex') !== provenance.sha256) throw new Error('Vendored token digest mismatch');
  const assets = ['tokens.css', 'site-tokens.css', 'site.css', 'mark.svg', ...(site.schema === 'ragbaz.project-site/v1' ? ['chrome.js'] : []), ...(site.modules.reader ? ['reader.css', 'reader.js'] : []), ...(site.modules.publications ? ['catalog.js'] : []), ...(site.modules.contact ? ['contact.js'] : []), ...(site.modules.education ? ['education.js'] : []), ...(site.modules.demonstration ? ['demonstration.js'] : [])];
  for (const asset of assets) await copyFile(join(templateRoot, 'assets', asset), join(output, 'public/assets', asset));
  if (site.socialCard && !site.socialImage) {
    await writeFile(join(output, 'public/assets/social-card.png'), await socialCard(site, new URL('../', import.meta.url)));
    site.socialImage = '/assets/social-card.png';
    assets.push('social-card.png');
  }
  const projectAssets = join(dirname(resolve(configPath)), 'public/assets');
  const copied = new Set();
  async function copyPublic(directory, prefix = '') {
    for (const name of await readdir(directory)) {
      if (!/^[a-zA-Z0-9_-][a-zA-Z0-9._-]*$/.test(name)) throw new Error('Invalid public asset name');
      const source = join(directory, name), rel = prefix + name, stat = await lstat(source);
      if (stat.isSymbolicLink()) throw new Error('Public asset symlinks are refused');
      if (stat.isDirectory()) { await mkdir(join(output, 'public/assets', rel), { recursive: true }); await copyPublic(source, rel + '/'); }
      else if (stat.isFile()) {
        if (assets.includes(rel) || !/\.(?:svg|png|webp|jpg|jpeg|gif|ico|woff2|pdf)$/.test(name)) throw new Error('Unsupported or reserved public asset');
        const digest = createHash('sha256').update(await readFile(source)).digest('hex');
        const assetPath = '/assets/' + rel;
        if (site.publicationPolicy === 'approved-only' && site.assetApprovals?.[assetPath] !== digest) throw new Error(`Asset approval missing or stale: ${assetPath}`);
        copied.add(assetPath);
        await copyFile(source, join(output, 'public/assets', rel));
      }
    }
  }
  try {
    const publicDirectory = await lstat(join(projectRoot, 'public'));
    const stat = await lstat(projectAssets);
    if (publicDirectory.isSymbolicLink() || stat.isSymbolicLink()) throw new Error('Public asset symlinks are refused');
    await copyPublic(projectAssets);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (site.publicationPolicy === 'approved-only' && Object.keys(site.assetApprovals || {}).some(p => !copied.has(p))) throw new Error('Unknown asset approval');
  if (site.socialImage) await readFile(join(output, 'public', site.socialImage));
  if (site.logo) await readFile(join(output,'public',site.logo));
  if (site.featuredPublication?.image) await readFile(join(output, 'public', site.featuredPublication.image));
  const inventory = [];
  async function inventoryAssets(directory, prefix = '') {
    for (const name of (await readdir(directory)).sort()) {
      const file = join(directory, name), rel = prefix + name;
      if ((await lstat(file)).isDirectory()) await inventoryAssets(file, rel + '/');
      else { const bytes = await readFile(file); inventory.push({ path: mounted(site, '/assets/' + rel), sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length }); }
    }
  }
  await inventoryAssets(join(output, 'public/assets'));
  let entry = relative(output, join(templateRoot, 'src/worker.js')).split('\\').join('/');
  if (!entry.startsWith('.')) entry = `./${entry}`;
  const deployable = { ...site, pages: site.pages.filter(p => p.status !== 'draft') };
  delete deployable.approvals; delete deployable.assetApprovals;
  const release = { version: JSON.parse(await readFile(join(templateRoot, 'package.json'))).version, source_revision: null, source_dirty: true };
  try {
    const top = execFileSync('git', ['-C', templateRoot, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (resolve(top) === resolve(templateRoot)) {
      release.source_revision = execFileSync('git', ['-C', templateRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      release.source_dirty = Boolean(execFileSync('git', ['-C', templateRoot, 'status', '--porcelain'], { encoding: 'utf8' }).trim());
    }
  } catch { /* Uncommitted or portable snapshot: do not invent a source commit. */ }
  await writeFile(join(output, 'worker.mjs'), `import { createSiteWorker } from ${JSON.stringify(entry)};\nexport default createSiteWorker(${JSON.stringify(deployable)}, {assetManifest:${JSON.stringify(inventory)}, release:${JSON.stringify(release)}});\n`);
  const base = {
    name: `ragbaz-${site.slug}-site`, main: './worker.mjs', compatibility_date: '2026-10-01',
    workers_dev: true, preview_urls: false,
    assets: { directory: './public', binding: 'ASSETS', run_worker_first: true, html_handling: 'none', not_found_handling: 'none' },
    observability: { enabled: true, logs:{enabled:true,invocation_logs:false} },
  };
  const bindings = [...new Set(Object.values(site.integrations).map(c => c.binding))];
  if (bindings.length) {
    // A configuration must explicitly map bindings to deployed Worker names.
    // Do not guess authority names or create a resource as a side effect.
    base.services = bindings.map(binding => {
      const service = site.serviceBindings?.[binding];
      if (typeof service !== 'string' || !/^[a-z][a-z0-9-]*$/.test(service)) throw new Error(`Missing Worker name for binding ${binding}`);
      return { binding, service };
    });
  }
  await writeFile(join(output, 'wrangler.json'), JSON.stringify(base, null, 2) + '\n');
  const routes = [site.origin, ...site.aliases].flatMap(value => site.basePath ? [site.basePath, site.basePath + '/*'].map(route => ({ pattern: new URL(value).hostname + route, zone_name: site.routeZones[value] })) : [{ pattern: new URL(value).hostname, custom_domain: true }]);
  const production={...base,workers_dev:false,routes};
  if(site.modules.contact&&process.env.RAGBAZ_PEERS_D1_ID){
    production.d1_databases=[{binding:'PEERS_DB',database_name:'detcordon-marketing-leads',database_id:process.env.RAGBAZ_PEERS_D1_ID,migrations_dir:relative(output,join(templateRoot,'migrations/peers'))}];
    if(site.peerAccountReconciliation&&process.env.RAGBAZ_ACCOUNTS_D1_ID){
      production.d1_databases.push({binding:'ACCOUNTS_DB',database_name:'ragbaz-cc-accounts',database_id:process.env.RAGBAZ_ACCOUNTS_D1_ID});
    }
    if(site.peerMaintenance) production.triggers={crons:['17 3 * * *']};
  }
  await writeFile(join(output, 'wrangler.production.json'), JSON.stringify(production, null, 2) + '\n');
  return output;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Usage: node scripts/build-single.mjs site.json [build-directory]');
  console.log(await buildProject(resolve(process.argv[2]), process.argv[3] || join(dirname(resolve(process.argv[2])), 'build')));
}
