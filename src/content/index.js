// Public entry point for the shared content layer.
//
// See README.md for the contract, and RFC 0003 in RAGBAZ/RAGBAZ for why the
// fleet settled on Markdoc rather than MDX.

export {
  TOKENIZER_DEFAULTS,
  defineTags,
  diagnose,
  renderMarkdoc,
} from './markdoc.js';

export {
  DIRECTLY_RENDERABLE,
  FORMAT,
  classifySource,
  describeEntry,
} from './compat.js';

export {
  OPTIONAL_SECTION,
  renderLlmsTxt,
  sectionsByFormat,
  validateManifest,
} from './llms-txt.js';

export {
  applyContentLinks,
  contentLinkElements,
  contentLinkHeader,
  linkHeaderValue,
  markdownVariantPath,
} from './link-relations.js';
