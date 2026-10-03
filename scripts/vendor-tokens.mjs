import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
if (!process.argv[2]) throw new Error('Usage: node scripts/vendor-tokens.mjs /path/to/library');
const source = resolve(process.argv[2]);
const bytes = await readFile(join(source, 'public/assets/tokens.css'));
const revision = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
await mkdir(join(root, 'design'), { recursive: true });
await writeFile(join(root, 'assets/tokens.css'), bytes);
await writeFile(join(root, 'design/provenance.json'), JSON.stringify({
  schema: 'ragbaz.design-vendor/v0', source: 'library/public/assets/tokens.css',
  revision, sha256: createHash('sha256').update(bytes).digest('hex'),
  note: 'Library deployment assets are generated; digest identifies the exact bytes independently of repository revision. Current build source: school-scarcity-wireless-hacking/001-opencode-draft/design/tokens.css.',
}, null, 2) + '\n');
