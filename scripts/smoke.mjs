import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { root, siteNames, buildSite } from './build.mjs';
import { buildProject } from './build-single.mjs';

const scenarios = [];
for (const slug of await siteNames()) {
  const config = JSON.parse(await readFile(join(root, 'sites', slug, 'site.json')));
  scenarios.push({ slug, output: await buildSite(slug), config });
}
const mountedConfig = JSON.parse(await readFile(join(root, 'sites/weftmark/site.json')));
mountedConfig.basePath = '/docs/fleet';
mountedConfig.routeZones = { [mountedConfig.origin]: 'ragbaz.cc' };
const fixtureRoot = join(root, 'build/mounted-smoke');
await mkdir(fixtureRoot, { recursive: true });
await writeFile(join(fixtureRoot, 'site.json'), JSON.stringify(mountedConfig));
await cp(join(root,'sites/weftmark/public'),join(fixtureRoot,'public'),{recursive:true});
scenarios.push({ slug: 'mounted-localized', output: await buildProject(join(fixtureRoot, 'site.json'), join(fixtureRoot, 'worker')), config: mountedConfig });

for (const { slug, output, config } of scenarios) {
  const mount = config.basePath || '';
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const child = spawn(join(root, 'node_modules/.bin/wrangler'), ['dev', '--local', '--ip', '127.0.0.1', '--port', String(port), '--config', join(output, 'wrangler.json')], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false', BROWSER: 'none' } });
  let log = '';
  child.stdout.on('data', chunk => { log += chunk; });
  child.stderr.on('data', chunk => { log += chunk; });
  const base = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(log);
      try {
        const response = await fetch(`${base}${mount}/healthz`, { signal: AbortSignal.timeout(500) });
        if (response.ok) { ready = true; break; }
      } catch { /* Wait for workerd to start. */ }
      await delay(200);
    }
    assert.ok(ready, `workerd did not start: ${log}`);
    const paths = [['/', 200], ['/healthz', 200], ['/robots.txt', 200], ['/sitemap.xml', 200], ['/assets/tokens.css', 200], ['/assets/site.css', 200], ['/assets/reader.js', 200], ['/publications/', 200], ['/api/v1/publications', 200], ['/manifest.json', 200], [config.pages[0].path, 200], ['/assets/missing.css', 404], ['/missing', 404], ['/index.html?old=1', 308]];
    if (config.locales?.some(l => l.code === 'sv')) paths.push(['/sv/', 200], ['/sv/workflow/', 200]);
    for (const [path, status] of paths) {
      const response = await fetch(base + mount + path, { redirect: 'manual' });
      assert.equal(response.status, status, `${slug} ${path}`);
      assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
      if (path === '/assets/site.css') assert.ok(response.headers.get('Content-Type').includes('text/css'));
    }
    assert.equal((await fetch(base + mount + '/', { method: 'HEAD' })).status, 200);
    assert.equal((await fetch(`${base}${mount}/api/run`, { method: 'POST' })).status, 405);
    if (mount) assert.equal((await fetch(base + '/docs/fleet-other/')).status, 404);
    console.log(`${slug}: workerd pages, assets, headers, HEAD, redirects and refusals passed`);
  } finally {
    const stopped = once(child, 'exit');
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    timer.unref();
    if (child.exitCode === null) await stopped;
    clearTimeout(timer);
  }
}
