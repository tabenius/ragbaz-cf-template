import { readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSite } from '../src/site.js';
import { buildProject } from './build-single.mjs';

export const root = fileURLToPath(new URL('../', import.meta.url));
export async function siteNames() {
  return (await readdir(join(root, 'sites'), { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name).sort();
}
export async function buildSite(slug) {
  if (!/^[a-z][a-z0-9-]*$/.test(slug)) throw new Error('Invalid site name');
  const site = validateSite(JSON.parse(await readFile(join(root, 'sites', slug, 'site.json'), 'utf8')));
  if (site.slug !== slug) throw new Error('Site slug must match its directory');
  return buildProject(join(root, 'sites', slug, 'site.json'), join(root, 'build', slug));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const slug of process.argv[2] ? [process.argv[2]] : await siteNames()) {
    console.log(`Built ${slug}: ${await buildSite(slug)}`);
  }
}
