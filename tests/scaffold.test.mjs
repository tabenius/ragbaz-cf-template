import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { root } from '../scripts/build.mjs';

test('standalone scaffold builds without the original workspace and refuses overwrite', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'ragbaz-cf-scaffold-'));
  const target = join(temp, 'site');
  try {
    execFileSync(process.execPath, [join(root, 'scripts/scaffold.mjs'), 'nostoi', target]);
    const lock = JSON.parse(await readFile(join(target, 'template.lock.json')));
    assert.equal(lock.source_kind, 'working-tree-snapshot');
    assert.ok(Object.keys(lock.files).every(file => !file.split('/').some(part => part.startsWith('.') || /(?:\.sw[op]|~)$/.test(part))));
    for (const [file, hash] of Object.entries(lock.files)) {
      assert.equal(createHash('sha256').update(await readFile(join(target, 'vendor/ragbaz-cf-template', file))).digest('hex'), hash);
    }
    execFileSync(process.execPath, ['vendor/ragbaz-cf-template/scripts/build-single.mjs', 'site.json', 'build'], { cwd: target });
    const generated = await readFile(join(target, 'build/worker.mjs'), 'utf8');
    assert.ok(generated.includes('../vendor/ragbaz-cf-template/src/worker.js'));
    assert.ok(!generated.includes(root));
    const module = await import(`file://${target}/build/worker.mjs`);
    assert.equal((await module.default.fetch(new Request('https://preview.example/'))).status, 200);
    assert.throws(() => execFileSync(process.execPath, [join(root, 'scripts/scaffold.mjs'), 'nostoi', target], { stdio: 'pipe' }), /Command failed/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
