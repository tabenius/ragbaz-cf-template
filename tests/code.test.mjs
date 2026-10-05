import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { highlightCode, CODE_LANGUAGES } from '../src/code.js';
import { validateSite } from '../src/site.js';
import { createSiteWorker } from '../src/worker.js';

const base = JSON.parse(await readFile(new URL('../sites/weftmark/site.json', import.meta.url)));
const request = path => new Request('https://weftmark.ragbaz.cc' + path);

test('shell highlights comments, strings, flags, prompts and keywords', () => {
  const html = highlightCode('$ sylvae run --backend ollama # choose deliberately', 'shell');
  assert.ok(html.includes('<span class="tok-prompt">$</span>'));
  assert.ok(html.includes('<span class="tok-flag">--backend</span>'));
  assert.ok(html.includes('<span class="tok-com"># choose deliberately</span>'));
  const kw = highlightCode('if [ -f x ]; then echo "hi 0.5"; fi', 'shell');
  assert.ok(kw.includes('<span class="tok-kw">if</span>'));
  assert.ok(kw.includes('<span class="tok-str">&quot;hi 0.5&quot;</span>'));
});

test('hostile source text is escaped before spans are added', () => {
  const html = highlightCode('echo "<script>alert(1)</script>" # <b>no</b>', 'shell');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('<span class="tok-str">'));
});

test('python heredoc bodies highlight as python; other markers stay plain', () => {
  const html = highlightCode("python3 - <<'PY'\nimport json # read\nprint(0x1F)\nPY", 'shell');
  assert.ok(html.includes('<span class="tok-kw">import</span>'));
  assert.ok(html.includes('<span class="tok-num">0x1F</span>'));
  const plain = highlightCode("cat <<'EOF'\nimport json\nEOF", 'shell');
  assert.ok(!plain.includes('tok-kw'));
  assert.ok(plain.includes('import json'));
});

test('python highlights decorators, keywords and numbers', () => {
  const html = highlightCode("@app.route('/x')\ndef f(a=42):\n    return None", 'python');
  assert.ok(html.includes('tok-ann'));
  assert.ok(html.includes('<span class="tok-kw">def</span>'));
  assert.ok(html.includes('<span class="tok-num">42</span>'));
  assert.ok(html.includes('<span class="tok-kw">None</span>'));
});

test('json distinguishes keys, strings, numbers and literals', () => {
  const html = highlightCode('{"seq": 204, "ok": true, "why": null}', 'json');
  assert.ok(html.includes('<span class="tok-key">&quot;seq&quot;</span>'));
  assert.ok(html.includes('<span class="tok-num">204</span>'));
  assert.ok(html.includes('<span class="tok-kw">true</span>'));
  assert.ok(html.includes('<span class="tok-kw">null</span>'));
});

test('unknown languages render escaped and unadorned; non-strings are refused', () => {
  assert.equal(highlightCode('<b>x</b>', 'cobol'), '&lt;b&gt;x&lt;/b&gt;');
  assert.throws(() => highlightCode(null, 'shell'), /must be a string/);
  assert.deepEqual([...CODE_LANGUAGES], ['shell', 'python', 'json']);
});

test('model accepts known code languages and refuses the rest', () => {
  const page = { ...base.pages[0] };
  validateSite({ ...base, quickstart: { ...base.quickstart, commands: [{ label: 'Py', code: 'print(1)', language: 'python' }] } });
  assert.throws(() => validateSite({ ...base, quickstart: { ...base.quickstart, commands: [{ label: 'Bad', code: 'x', language: 'cobol' }] } }), /Unknown command language/);
  assert.throws(() => validateSite({ ...base, pages: [{ ...page, sections: [{ ...page.sections[0], code: 'x', language: 'cobol' }] }] }), /Unknown code language/);
});

test('rendered pages carry highlighted code with a language class', async () => {
  const worker = createSiteWorker({ ...base, quickstart: { ...base.quickstart, commands: [{ label: 'Py', code: 'print("hi") # greet', language: 'python' }] } });
  const html = await (await worker.fetch(request('/'))).text();
  assert.ok(html.includes('<code class="language-python">'));
  assert.ok(html.includes('<span class="tok-kw">print</span>') || html.includes('<span class="tok-str">'));
  assert.ok(html.includes('<span class="tok-com"># greet</span>'));
});
