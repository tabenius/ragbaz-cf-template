// Classify a content source so an agent can be told what it is about to read.
//
// The fleet has three authoring formats in active use: plain CommonMark,
// Markdoc, and MDX. They are not interchangeable, and the failure is usually
// silent - a CommonMark file with a setext heading renders with a literal
// `=====`, and an MDX file rendered as Markdoc drops every component.
//
// So every published document is classified, and the classification is carried
// into llms.txt as a note on the link. An agent that follows the link should
// not have to discover the format by trial.

import { diagnose } from './markdoc.js';

export const FORMAT = Object.freeze({
  MARKDOC: 'markdoc',
  MARKDOC_TAGGED: 'markdoc-tagged',
  MARKDOC_UNSAFE: 'markdoc-unsafe',
  COMMONMARK: 'commonmark',
  SETEXT: 'commonmark-setext',
  MDX: 'mdx',
  HTML: 'html',
  EMPTY: 'empty',
});

/** Formats whose bytes are valid Markdoc input and render without a build step. */
export const DIRECTLY_RENDERABLE = Object.freeze([FORMAT.MARKDOC, FORMAT.MARKDOC_TAGGED, FORMAT.MARKDOC_UNSAFE]);

/**
 * Classify one source document.
 *
 * @param {string} source
 * @param {object} [options]
 * @param {string} [options.filename] used only in error-free hints
 * @param {Record<string, unknown>} [options.registeredTags] tags the surface renders
 * @returns {{format: string, renderable: boolean, notes: string[], hint: string}}
 */
export function classifySource(source, options = {}) {
  const text = String(source == null ? '' : source);
  const { registeredTags = {} } = options;

  if (!text.trim()) {
    return { format: FORMAT.EMPTY, renderable: true, notes: [], hint: 'Empty document.' };
  }

  // MDX first: an ESM import or a capitalised JSX element is the strongest
  // signal, and it outranks the Markdown that surrounds it.
  const hasEsm = /^\s*(import|export)\s.*\bfrom\b/m.test(text);
  const hasJsx = /<[A-Z][\w.]*[\s/>]/.test(text) || /\{?\/\*\s*.*\*\/\s*\}?/.test(text);
  if (hasEsm || hasJsx) {
    return {
      format: FORMAT.MDX,
      renderable: false,
      notes: [
        hasEsm ? 'Contains ESM imports.' : null,
        hasJsx ? 'Contains JSX components.' : null,
      ].filter(Boolean),
      hint:
        'MDX with JSX components: not Markdoc-compatible and not renderable without a build step. ' +
        'Read the surrounding prose, or fetch the built HTML.',
    };
  }

  if (/^\s*<!doctype html/i.test(text) || /^\s*<html[\s>]/i.test(text)) {
    return {
      format: FORMAT.HTML,
      renderable: false,
      notes: ['HTML source.'],
      hint: 'HTML source rather than Markdown: not Markdoc-compatible. Request the rendered page instead.',
    };
  }

  const found = diagnose(text, registeredTags);

  if (found.unregisteredTags.length) {
    return {
      format: FORMAT.MARKDOC_UNSAFE,
      renderable: false,
      notes: [`Tags not registered by this surface: ${found.unregisteredTags.join(', ')}. They are dropped on render.`],
      hint:
        `Markdown using Markdoc tags this surface does not register (${found.unregisteredTags.join(', ')}). ` +
        'Tags are dropped on render, so treat those sections as missing rather than as intentional gaps.',
    };
  }

  if (found.htmlBlocks) {
    return {
      format: FORMAT.MARKDOC_UNSAFE,
      renderable: false,
      notes: [`${found.htmlBlocks} raw HTML block(s), escaped on render.`],
      hint:
        'Markdown with raw HTML blocks: Markdoc escapes rather than passes HTML through, so these appear as visible text. ' +
        'The rendered page shows the intended markup.',
    };
  }

  const usesTags = /\{%\s*\/?\s*[A-Za-z]/.test(text);
  if (found.setextHeadings) {
    return {
      format: FORMAT.SETEXT,
      renderable: false,
      notes: [`${found.setextHeadings} setext heading(s), which Markdoc does not support and renders as literal underlines.`],
      hint:
        'CommonMark with setext headings (`Title` underlined with `===`). Markdoc does not support setext headings and ' +
        'renders the underline literally; rewrite as ATX (`# Title`) to make this Markdoc-compatible.',
    };
  }

  return {
    format: usesTags ? FORMAT.MARKDOC_TAGGED : FORMAT.MARKDOC,
    renderable: true,
    notes: usesTags ? ['Uses Markdoc tags registered by this surface.'] : [],
    hint: 'Markdoc-compatible: renders as-is with no build step.',
  };
}

/**
 * Build an llms.txt note for a document, combining classification with any
 * product-supplied context.
 *
 * @param {{title: string, url: string, format?: string, hint?: string}} entry
 * @param {object} [options]
 * @param {string} [options.context] e.g. "Requires a Workers plan upgrade to deploy."
 * @returns {{title: string, url: string, note: string, format: string, renderable: boolean}}
 */
export function describeEntry(entry, options = {}) {
  const { title, url, format = FORMAT.MARKDOC, hint } = entry || {};
  const { context } = options;
  const parts = [hint || `Format: ${format}.`];
  if (context) parts.push(context);
  return {
    title,
    url,
    note: parts.join(' '),
    format,
    renderable: DIRECTLY_RENDERABLE.includes(format),
  };
}
