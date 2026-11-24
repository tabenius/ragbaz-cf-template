// llms.txt v2 generation.
//
// Format per llmstxt.org, modified 2026-08-10. The section order is normative:
//
//   optional BOM -> H1 (the only required section) -> blockquote summary ->
//   zero or more sections that are *not* headings -> zero or more H2-delimited
//   "file lists" of `- [name](url)` with optional `: notes`
//
// The file is meant to stay small enough to sit in a context window, with the
// detail behind the links. Generating it from a manifest rather than by hand is
// what keeps that true: a hand-maintained list drifts, and the first thing to
// drift is a link that no longer resolves.

/** Conventional heading for links an agent can skip when context is tight. */
export const OPTIONAL_SECTION = 'Optional';

const HEADING = /^#{1,6}\s/;

/**
 * Escape a link title so it cannot break out of `- [title](url)`.
 */
function escapeTitle(title) {
  return String(title == null ? '' : title)
    .replace(/([\\[\]()])/g, '\\$1')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

/**
 * Collapse a note to a single line. A newline in a note silently ends the list
 * item and turns the remainder into loose prose, which is the one corruption
 * this format cannot recover from.
 */
function oneLine(note) {
  return String(note == null ? '' : note).replace(/\s*[\r\n]+\s*/g, ' ').trim();
}

function renderList(entries) {
  return entries.map((entry) => {
    const line = `- [${escapeTitle(entry.title)}](${entry.url})`;
    const note = oneLine(entry.note);
    return note ? `${line}: ${note}` : line;
  });
}

/**
 * Validate a manifest and report what would produce a broken file.
 *
 * @param {object} manifest
 * @returns {string[]} problems; empty means the file is well-formed
 */
export function validateManifest(manifest) {
  const problems = [];
  const doc = manifest || {};

  if (!doc.name || !String(doc.name).trim()) problems.push('name is required: it is the only required section.');
  if (doc.summary && /[\r\n]/.test(doc.summary)) problems.push('summary must be a single line (it is a blockquote).');

  const prose = doc.details || [];
  if (!Array.isArray(prose)) {
    problems.push('details must be an array of strings.');
  } else {
    prose.forEach((block, i) => {
      if (HEADING.test(String(block).trim())) {
        problems.push(`details[${i}] starts a heading; only H2 sections may carry headings.`);
      }
    });
  }

  for (const [name, section] of Object.entries(doc.sections || {})) {
    if (name === OPTIONAL_SECTION) continue; // allowed, just conventional
    if (!Array.isArray(section?.entries)) {
      problems.push(`sections.${name} must be an object with an entries array.`);
      continue;
    }
    section.entries.forEach((entry, i) => {
      if (!entry?.title) problems.push(`sections.${name}.entries[${i}] is missing a title.`);
      if (!entry?.url) problems.push(`sections.${name}.entries[${i}] is missing a url.`);
      else if (!/^(https?:\/\/|\/)/.test(entry.url)) {
        problems.push(`sections.${name}.entries[${i}] url must be absolute or root-relative: ${entry.url}`);
      }
    });
  }

  return problems;
}

/**
 * Render an llms.txt v2 document.
 *
 * @param {object} manifest
 * @param {string} manifest.name H1, the only required field
 * @param {string} [manifest.summary] blockquote
 * @param {string[]} [manifest.details] prose sections, no headings
 * @param {Record<string, {title?: string, entries: Array<{title: string, url: string, note?: string}>}>} [manifest.sections]
 * @param {{bom?: boolean}} [options]
 * @returns {string}
 */
export function renderLlmsTxt(manifest, options = {}) {
  const problems = validateManifest(manifest);
  if (problems.length) {
    throw new Error(`llms.txt manifest is invalid:\n- ${problems.join('\n- ')}`);
  }

  const doc = manifest || {};
  const out = [];

  if (options.bom) out.push('﻿');
  out.push(`# ${escapeTitle(doc.name)}`);
  if (doc.summary) out.push('', `> ${oneLine(doc.summary)}`);

  for (const block of doc.details || []) {
    const text = String(block).trim();
    if (text) out.push('', text);
  }

  for (const [name, section] of Object.entries(doc.sections || {})) {
    const entries = section?.entries || [];
    if (!entries.length) continue;
    out.push('', `## ${escapeTitle(section.title || name)}`, '', ...renderList(entries));
  }

  return `${out.join('\n')}\n`;
}

/**
 * Group entries by their declared format, so a reader can see at a glance which
 * parts of a site need a build step. Sections are emitted in a fixed order so
 * two runs of the generator produce identical bytes.
 */
export function sectionsByFormat(entries, options = {}) {
  const { primary, renderable } = options;
  const groups = new Map();
  for (const entry of entries) {
    const bucket = entry.renderable ? renderable : primary;
    if (!groups.has(bucket)) groups.set(bucket, []);
    groups.get(bucket).push(entry);
  }
  return groups;
}
