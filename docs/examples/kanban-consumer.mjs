#!/usr/bin/env node
// A minimal modular consumer of a WeftMark kanban projection.
//
// Reads one `weftmark.kanban-projection.v0` document (file or stdin) and
// prints a board digest. It demonstrates the integration rules from
// `docs/contracts/kanban-projection-v0.md`:
//
//   - lanes are presentation, never authority or transition requests;
//   - attention flags are hints; unknown flags pass through for forward
//     compatibility, and unknown fields are ignored;
//   - task cards and Change Set cards are joined by identifier only;
//   - producer namespaces resolve to links through a consumer-owned map,
//     because WeftMark keeps producer ids opaque on purpose.
//
// Fetching is the caller's job: point this at a file you saved from
// `GET /v0/kanban`, a pipe, or your own gateway. This script never writes,
// never mutates, and never phones home.
//
// Usage:
//   node kanban-consumer.mjs projection.json [--json]
//   node kanban-consumer.mjs --link 'sylvae:run/=https://runs.example/' < projection.json
//
// Exit: 0 digest printed; 2 unusable input (not a projection, unreadable).

import { readFile } from 'node:fs/promises';

const SCHEMA = 'weftmark.kanban-projection.v0';
const LANES = Object.freeze(['backlog', 'active', 'review', 'ready', 'done']);

const color = process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== 'dumb';
const paint = (code, text) => (color ? `\x1b[${code}m${text}\x1b[0m` : text);
const red = text => paint('31', text);
const yellow = text => paint('33', text);
const green = text => paint('32', text);
const dim = text => paint('2', text);

export function readProjection(text) {
  let document;
  try {
    document = JSON.parse(text);
  } catch {
    throw new Error('not a JSON document');
  }
  if (!document || document.schema !== SCHEMA) throw new Error(`expected schema ${SCHEMA}`);
  if (document.authority?.projection !== 'read_only') throw new Error('projection must be read_only');
  if (!Array.isArray(document.cards)) throw new Error('projection has no cards array');
  return document;
}

/** Join plan cards to their Change Sets by identifier; never infer across. */
export function joinLinks(document) {
  const sets = new Map((document.cards || []).map(card => [card.id, card]));
  return {
    cards: document.cards || [],
    planCards: (document.plan_cards || []).map(task => ({
      ...task,
      linked: (task.change_set_ids || []).map(id => sets.get(id)).filter(Boolean),
    })),
  };
}

/** Resolve an opaque producer id to a link through the consumer's own map. */
export function resolveProducer(producerId, resolvers = {}) {
  if (typeof producerId !== 'string') return null;
  for (const [prefix, base] of Object.entries(resolvers)) {
    if (producerId.startsWith(prefix)) return base + producerId.slice(prefix.length);
  }
  return null;
}

export function digest(document, { resolvers = {} } = {}) {
  const { cards, planCards } = joinLinks(document);
  const rows = [...planCards, ...cards];
  const lanes = Object.fromEntries(LANES.map(lane => [lane, []]));
  const overflow = [];
  for (const row of rows) {
    const lane = typeof row.lane === 'string' && LANES.includes(row.lane) ? row.lane : null;
    // A missing or unknown lane fails safe to review: never render new or
    // absent states as complete, and never drop the card silently.
    (lane ? lanes[lane] : (overflow.push(row), lanes.review)).push(row);
  }
  return { lanes, overflow, counts: document.counts ?? null, generatedAt: document.generated_at ?? null };
}

function cardLine(row, resolvers) {
  const kind = row.kind === 'task' ? 'task' : 'change';
  const attention = [...(row.attention || [])];
  const flag = attention.length ? ` ${yellow('!' + attention.join(' !'))}` : '';
  const state = row.lifecycle_state || row.task_state || '';
  const link = row.producer?.id ? resolveProducer(row.producer.id, resolvers) : null;
  const producer = row.producer?.id ? ` ${dim(`via ${row.producer.id}${link ? ` <${link}>` : ''}`)}` : '';
  return `  [${kind}] ${row.title || row.id}${state ? dim(` (${state})`) : ''}${producer}${flag}`;
}

export function renderText(document, options = {}) {
  const { lanes } = digest(document, options);
  const lines = [`board ${document.generated_at ?? '(undated)'} — lanes are presentation, not authority`];
  for (const lane of LANES) {
    const rows = lanes[lane];
    const head = lane === 'ready' ? green(lane) : lane === 'review' ? yellow(lane) : lane;
    lines.push(`${head} (${rows.length})`);
    for (const row of rows) lines.push(cardLine(row, options.resolvers));
  }
  return lines.join('\n') + '\n';
}

function parseArgs(argv) {
  const args = { file: null, json: false, resolvers: {} };
  for (const token of argv) {
    if (token === '--json') args.json = true;
    else if (token.startsWith('--link=')) {
      const [prefix, base] = token.slice(7).split('=', 2);
      if (!prefix || !base) throw new Error('use --link=PREFIX=BASE_URL');
      args.resolvers[prefix] = base;
    } else if (!token.startsWith('-') && !args.file) args.file = token;
    else throw new Error(`unknown argument ${token}`);
  }
  return args;
}

async function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error(red(`usage: kanban-consumer.mjs [file] [--json] [--link=PREFIX=BASE_URL]\n${error.message}`));
    return 2;
  }
  let text;
  try {
    text = args.file ? await readFile(args.file, 'utf8') : await new Promise((resolve, reject) => {
      let data = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', chunk => { data += chunk; });
      process.stdin.on('end', () => resolve(data));
      process.stdin.on('error', reject);
    });
  } catch {
    console.error(red('cannot read input'));
    return 2;
  }
  let document;
  try {
    document = readProjection(text);
  } catch (error) {
    console.error(red(error.message));
    return 2;
  }
  if (args.json) {
    const { lanes } = digest(document, args);
    console.log(JSON.stringify({ schema: SCHEMA, lanes: Object.fromEntries(Object.entries(lanes).map(([lane, rows]) => [lane, rows.map(r => r.id)])) }, null, 2));
  } else {
    process.stdout.write(renderText(document, args));
  }
  // Attention flags never change the exit code: they are hints, not verdicts.
  return 0;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  process.exitCode = await main();
}
