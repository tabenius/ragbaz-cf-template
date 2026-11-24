// Vendor the shared content layer from @ragbaz/common.
//
// Same pattern as vendor-tokens.mjs and vendor-project-marks.mjs: copy the bytes,
// record where they came from, and pin a digest. The digest is what makes the
// copy auditable -- it identifies the exact source revision independently of the
// repository it was taken from, which matters because these files are committed
// and therefore outlive whatever branch they were copied from.
//
//   node scripts/vendor-content.mjs /path/to/ragbaz-common
//   node scripts/vendor-content.mjs --check /path/to/ragbaz-common
//
// --check is the important mode. It fails when the vendored copy has drifted from
// its source, so a change to the shared layer cannot reach some products and
// silently miss others.

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const check = args[0] === '--check';
const source = resolve(args[check ? 1 : 0] || join(root, '..', 'ragbaz-common'));
const from = join(source, 'src/content');

const files = ['index.js', 'markdoc.js', 'compat.js', 'llms-txt.js', 'link-relations.js'];
const to = join(root, 'src/content');

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

if (check) {
  const drifted = [];
  for (const file of files) {
    const want = await readFile(join(from, file));
    let have;
    try {
      have = await readFile(join(to, file));
    } catch {
      drifted.push(`${file}: missing`);
      continue;
    }
    if (digest(have) !== digest(want)) drifted.push(`${file}: ${digest(have).slice(0, 12)} != ${digest(want).slice(0, 12)}`);
  }
  if (drifted.length) {
    for (const line of drifted) console.error(`vendored content drift: ${line}`);
    console.error('Re-run: node scripts/vendor-content.mjs <path to ragbaz-common>');
    process.exitCode = 1;
  } else {
    console.error(`vendored content matches ${source} (${files.length} files)`);
  }
} else {
  await mkdir(to, { recursive: true });
  const provenance = [];
  for (const file of files) {
    const bytes = await readFile(join(from, file));
    await writeFile(join(to, file), bytes);
    provenance.push({ file: `src/content/${file}`, source: `ragbaz-common/src/content/${file}`, sha256: digest(bytes) });
  }
  await mkdir(join(root, 'design'), { recursive: true });
  await writeFile(
    join(root, 'design/content-vendor.json'),
    `${JSON.stringify({ schema: 'ragbaz.content-vendor/v0', source: 'ragbaz-common/src/content', note: 'Shared content layer: Markdoc rendering, llms.txt v2 generation, and llms.txt link relations. Regenerate with scripts/vendor-content.mjs; verify with --check.', files: provenance }, null, 2)}\n`,
  );
  console.error(`vendored ${provenance.length} files from ${source}`);
}

export { files, digest };
