import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { root, buildSite } from './build.mjs';

const browserBinary = process.env.CHROMIUM || 'chromium';
const output = await buildSite('weftmark');
const listener = createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
const profile = await mkdtemp(join(tmpdir(), 'ragbaz-cf-browser-'));
const server = spawn(join(root, 'node_modules/.bin/wrangler'), ['dev', '--local', '--ip', '127.0.0.1', '--port', String(port), '--config', join(output, 'wrangler.json')], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false', BROWSER: 'none' } });
let browser, socket, log = '', endpoint;
server.stderr.on('data', data => { log += data; }); server.stdout.on('data', data => { log += data; });
const base = `http://127.0.0.1:${port}`;
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(base + '/healthz', { signal: AbortSignal.timeout(500) })).ok) { ready = true; break; } } catch { /* Wait for workerd. */ }
    await delay(200);
  }
  assert.ok(ready, log);
  browser = spawn(browserBinary, ['--headless', '--no-sandbox', '--disable-gpu', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  browser.on('error', error => { log += error.message; });
  browser.stderr.on('data', data => { const match = String(data).match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) endpoint = match[1]; });
  for (let attempt = 0; !endpoint && attempt < 100; attempt++) await delay(100);
  assert.ok(endpoint, 'Chromium did not start: ' + log);
  socket = new WebSocket(endpoint); await once(socket, 'open');
  let nextId = 0; const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data); const promise = pending.get(message.id);
    if (promise) { pending.delete(message.id); message.error ? promise.reject(new Error(message.error.message)) : promise.resolve(message.result); }
  });
  function command(method, params = {}, sessionId) {
    const id = ++nextId;
    return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  }
  const { targetId } = await command('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await command('Target.attachToTarget', { targetId, flatten: true });
  await command('Page.enable', {}, sessionId);
  const evaluate = async expression => {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true }, sessionId);
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  async function navigate(path) {
    await command('Page.navigate', { url: base + path }, sessionId);
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(`location.pathname === ${JSON.stringify(path)} && document.readyState === 'complete'`)) return;
      await delay(100);
    }
    throw new Error('Browser navigation timeout');
  }
  await navigate('/');
  assert.equal(await evaluate(`document.querySelector('h1').textContent`), 'WeftMark');
  assert.equal(await evaluate(`document.querySelector('link[rel=canonical]').href`), 'https://weftmark.ragbaz.cc/');
  await evaluate(`(() => { const select = document.querySelector('[data-reader=theme]'); select.value = 'night'; select.dispatchEvent(new Event('change')); })()`);
  assert.equal(await evaluate(`document.documentElement.dataset.readerTheme`), 'night');
  await navigate('/publications/');
  assert.equal(await evaluate(`document.documentElement.dataset.readerTheme`), 'night');
  await evaluate(`(() => { const select = document.querySelector('[data-catalog-layout]'); select.value = 'list'; select.dispatchEvent(new Event('change')); })()`);
  assert.equal(await evaluate(`document.querySelector('[data-catalog]').dataset.layout`), 'list');
  await navigate('/sv/');
  assert.equal(await evaluate(`document.documentElement.lang`), 'sv');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false }, sessionId);
  assert.ok(await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`), 'Mobile layout overflows');
  const shot = await command('Page.captureScreenshot', { format: 'png' }, sessionId);
  await writeFile(join(output, 'browser-mobile.png'), Buffer.from(shot.data, 'base64'));
  console.log('Chromium: rendering, preferences, catalog layout, Swedish edition and mobile width passed');
} finally {
  socket?.close();
  for (const child of [browser, server].filter(Boolean)) {
    if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); const timer = setTimeout(() => child.kill('SIGKILL'), 5000); timer.unref(); await exited; clearTimeout(timer); }
  }
  await rm(profile, { recursive: true, force: true });
}
