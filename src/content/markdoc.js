// A small, fail-closed Markdoc layer.
//
// Markdoc is a superset of CommonMark with a tag language. That makes it a good
// authoring format for content we host on behalf of other people: the tag set is
// an allowlist, so there is no "import a component and execute it" path the way
// MDX has. See RFC 0003 in RAGBAZ/RAGBAZ.
//
// Three behaviours of Markdoc 0.5.10 were verified by experiment rather than
// taken from the docs, because each one loses or distorts content *silently*:
//
//   1. A tag with no registered schema is dropped from the output. Not an error,
//      not a placeholder - gone.
//   2. Setext headings (`Title\n=====`) are not recognised. The rule becomes a
//      paragraph containing the literal `=====`.
//   3. `@[annotation](url)` renders as a literal `@` followed by a normal link
//      unless the tokenizer was built with `allowAnnotations: true`.
//
// `renderMarkdoc` therefore returns diagnostics alongside the HTML. A caller
// that ignores them can still lose content, but it has to have been told.

import Markdoc from '@markdoc/markdoc';

/** Tokenizer flags that change meaning rather than merely allowing more. */
export const TOKENIZER_DEFAULTS = Object.freeze({
  // HTML comments are an authoring convenience and can hide content from a
  // reader; without this they are parsed as text and visibly break the page.
  allowComments: false,
  // Indentation-sensitive content inside nested tags requires turning off
  // indent-based code blocks, which is a worse trade. Off by default.
  allowIndentation: false,
  // Annotations are part of the Markdoc language, so they are on. Without this
  // they degrade to a stray `@` in front of a link.
  allowAnnotations: true,
});

/**
 * Build the Markdoc config for a tag allowlist.
 *
 * Markdoc 0.5.x requires *two* declarations per custom element: a tag schema
 * whose `transform` returns a `Markdoc.Tag`, and a node schema for the HTML
 * element name whose `render` is that name as a string. Declaring only the tag
 * silently discards the wrapper element. `defineTags` emits both so a product
 * never has to learn that the hard way.
 *
 * @param {Record<string, string | {element: string, attributes?: object, selfClosing?: boolean}>} tags
 *   Map of tag name to HTML element name, or to an options object.
 * @param {Record<string, unknown>} [variables]
 * @returns {object} a Markdoc config
 */
export function defineTags(tags, variables = {}) {
  const schemas = {};
  const nodes = {};

  for (const [name, spec] of Object.entries(tags || {})) {
    const options = typeof spec === 'string' ? { element: spec } : { ...spec };
    const element = options.element || name;

    schemas[name] = {
      ...(options.selfClosing ? { selfClosing: true } : {}),
      transform(node, config) {
        const children = (node.children || []).map((child) => Markdoc.transform(child, config)).flat();
        const attributes = {};
        for (const [key, value] of Object.entries(node.attributes || {})) {
          if (key === 'type') continue; // `type` selects behaviour, not output
          attributes[key] = value;
        }
        for (const [key, value] of Object.entries(options.attributes || {})) {
          attributes[key] = typeof value === 'function' ? value(node) : value;
        }
        return [new Markdoc.Tag(element, attributes, children)];
      },
    };

    nodes[element] = { render: element };
  }

  return { tags: schemas, nodes, variables };
}

const TAG_NAME = /\{%\s*\/?\s*([A-Za-z][\w-]*)/g;

/**
 * Collect diagnostics for constructs Markdoc handles badly or silently.
 *
 * @param {string} source
 * @param {Record<string, unknown>} [registered] tag names that have a schema
 * @returns {{unregisteredTags: string[], setextHeadings: number, htmlBlocks: number, esmImports: number}}
 */
export function diagnose(source, registered = {}) {
  const text = String(source || '');

  const unregistered = new Set();
  for (const match of text.matchAll(TAG_NAME)) {
    const name = match[1];
    if (!Object.prototype.hasOwnProperty.call(registered, name)) unregistered.add(name);
  }

  // A setext heading is an ATX-looking line followed by a run of `=` under it.
  // Counting the `=`/`-` underlines is enough; `-` alone is a thematic break,
  // which is why a run of three or more *with a non-empty line above* is used.
  let setextHeadings = 0;
  const lines = text.split('\n');
  for (let i = 1; i < lines.length; i += 1) {
    const above = lines[i - 1].trim();
    const rule = lines[i].trim();
    if (above && /^(={2,}|-{2,})$/.test(rule) && !/^[-*+]{3,}$/.test(rule)) setextHeadings += 1;
  }

  const htmlBlocks = (text.match(/^\s*<([A-Za-z][\w-]*)\b/gm) || []).length;
  const esmImports = (text.match(/^\s*(import|export)\s.*\bfrom\b/gm) || []).length;

  return {
    unregisteredTags: [...unregistered].sort(),
    setextHeadings,
    htmlBlocks,
    esmImports,
  };
}

/**
 * Render Markdoc source to HTML.
 *
 * Raw HTML in the source is escaped, not passed through. That is the point of
 * this layer: content authors cannot inject elements, and a page that renders
 * untrusted text does not need a sanitiser to stay safe.
 *
 * @param {string} source
 * @param {object} [options]
 * @param {Record<string, string|object>} [options.tags] tag allowlist
 * @param {Record<string, unknown>} [options.variables]
 * @param {object} [options.tokenizer] overrides for TOKENIZER_DEFAULTS
 * @returns {{html: string, diagnostics: object, clean: boolean}}
 */
export function renderMarkdoc(source, options = {}) {
  const text = String(source == null ? '' : source);
  const { tags = {}, variables = {}, tokenizer: tokenizerOverrides } = options;

  const config = defineTags(tags, variables);
  const tokenizerOptions = { ...TOKENIZER_DEFAULTS, ...(tokenizerOverrides || {}) };
  const diagnostics = diagnose(text, config.tags);

  const ast = Markdoc.parse(new Markdoc.Tokenizer(tokenizerOptions).tokenize(text));
  const tree = Markdoc.transform(Markdoc.resolve(ast, config), config);
  const html = Markdoc.renderers.html(tree);

  return {
    html,
    diagnostics,
    clean: !diagnostics.unregisteredTags.length && !diagnostics.setextHeadings && !diagnostics.htmlBlocks && !diagnostics.esmImports,
  };
}
