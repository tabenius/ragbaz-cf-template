import { readFile, writeFile, copyFile, readdir, mkdir } from 'node:fs/promises';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { buildProject } from '../../scripts/build-single.mjs';
import { socialCard } from '../../scripts/social-card.mjs';
import { validateSite } from '../../src/site.js';
import { artifactModel, collectionModel, requiredScopes } from './model.js';
import { renderCollection, renderArtifact, renderEmail, artifactPath } from './render.js';

const root = dirname(fileURLToPath(import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export async function buildArtifactSite(configPath, outputPath) {
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  if (config.schema !== 'ragbaz.artifact-site/v1' || !['inline', 'service'].includes(config.source)) throw new Error('Unsupported artifact-site config');
  const site = validateSite(config.site), collections = config.collections.map(collectionModel);
  if (!collections.length) throw new Error('Supply collections');
  const inline = {};
  for (const collection of collections) {
    inline[collection.id] = config.source === 'inline' ? (config.inline?.[collection.id] || []).map(artifactModel) : [];
    for (const artifact of inline[collection.id]) {
      const permission = config.permissions?.[artifact.id];
      if (!permission?.reference || requiredScopes(artifact).some(scope => !permission.scopes?.includes(scope))) throw new Error(`Missing inline permission: ${artifact.id}`);
      if (site.publicationPolicy === 'approved-only' && config.artifactApprovals?.[artifact.id] !== sha(JSON.stringify(artifact))) throw new Error(`Missing or stale artifact approval: ${artifact.id}`);
    }
  }
  const output = resolve(outputPath), sourceRoot = dirname(resolve(configPath));
  // The core's builder owns source protection, token provenance, custom asset
  // allowlists and project approvals. Feed it only the ordinary site config.
  const tempConfig = join(sourceRoot, '.artifact-site-build.json');
  // This generated file is only a bridge; refuse an existing file to avoid
  // replacing a user's configuration or a concurrent build.
  await writeFile(tempConfig, JSON.stringify(site), { flag: 'wx' });
  try { await buildProject(tempConfig, output); }
  finally { const { unlink } = await import('node:fs/promises'); await unlink(tempConfig); }
  for (const file of ['artifact-tokens.css', 'artifacts.css', 'artifact-embeds.css', 'artifact-inbox.js', 'artifact-share.js']) await copyFile(join(root, 'assets', file), join(output, 'public/assets', file));
  for (const artifacts of Object.values(inline)) for (const artifact of artifacts) {
    if (artifact.social_image?.src === `/assets/${artifact.id}-og.png`) await writeFile(join(output, 'public', artifact.social_image.src), await socialCard({ ...site, name: artifact.title, tagline: artifact.ingress }, new URL('../../', import.meta.url)));
  }
  for (const artifacts of Object.values(inline)) for (const artifact of artifacts) {
    for (const image of [artifact.image, artifact.social_image, artifact.person?.photo].filter(Boolean)) await readFile(join(output, 'public', image.src));
  }
  const inventory = [];
  async function inspect(directory, prefix = '') {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name), name = prefix + entry.name;
      if (entry.isDirectory()) await inspect(path, name + '/');
      else { const bytes = await readFile(path); inventory.push({ path: site.basePath + '/assets/' + name, sha256: sha(bytes), bytes: bytes.length }); }
    }
  }
  await inspect(join(output, 'public/assets'));
  let entry = relative(output, join(root, 'worker.js')).split('\\').join('/'); if (!entry.startsWith('.')) entry = './' + entry;
  const deployable = { ...site, pages: site.pages.filter(p => p.status !== 'draft') };
  delete deployable.approvals; delete deployable.assetApprovals;
  await writeFile(join(output, 'worker.mjs'), `import { createArtifactSiteWorker } from ${JSON.stringify(entry)};\nexport default createArtifactSiteWorker(${JSON.stringify(deployable)},${JSON.stringify({ collections, source: config.source, inline, placements: config.placements || [], assetManifest: inventory })});\n`);
  if (config.source === 'service') {
    if (!/^[a-z][a-z0-9-]*$/.test(config.exchangeService || '')) throw new Error('Explicit exchangeService Worker name required');
    for (const file of ['wrangler.json', 'wrangler.production.json']) {
      const wrangler = JSON.parse(await readFile(join(output, file), 'utf8'));
      wrangler.services = [...(wrangler.services || []), { binding: 'ARTIFACT_EXCHANGE', service: config.exchangeService }];
      await writeFile(join(output, file), JSON.stringify(wrangler, null, 2) + '\n');
    }
  }
  // Portable previews/email exports are local build products, not additional
  // served static HTML files bypassing the Worker's public-content boundary.
  await mkdir(join(output, 'previews'), { recursive: true });
  for (const collection of collections) {
    if (config.source !== 'inline') continue;
    await writeFile(join(output, 'previews', collection.id + '.html'), renderCollection(site, collection, inline[collection.id]));
    for (const artifact of inline[collection.id]) {
      await writeFile(join(output, 'previews', artifact.id + '.html'), renderArtifact(site, collection, artifact));
      const email = renderEmail(site, collection, artifact);
      await writeFile(join(output, 'previews', artifact.id + '.email.html'), email.html);
      await writeFile(join(output, 'previews', artifact.id + '.email.txt'), email.text);
      await writeFile(join(output, 'previews', artifact.id + '.submission.json'), JSON.stringify({ schema: 'ragbaz.artifact-submission/v1', collection: collection.id, direction: 'outbound', artifact }, null, 2));
    }
  }
  await writeFile(join(output, 'artifact-manifest.json'), JSON.stringify({ schema: 'ragbaz.artifact-build/v1', source: config.source, collections, artifacts: Object.entries(inline).flatMap(([id, items]) => items.map(item => ({ id: item.id, collection: id, url: site.origin + site.basePath + artifactPath(collections.find(c => c.id === id), item) }))), assets: inventory }, null, 2));
  return output;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2] || !process.argv[3]) throw new Error('Usage: node extensions/artifacts/build.mjs config.json output-directory');
  console.log(await buildArtifactSite(resolve(process.argv[2]), resolve(process.argv[3])));
}
