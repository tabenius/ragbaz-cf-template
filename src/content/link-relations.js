// The two link relations llms.txt v2 asks a site to advertise.
//
//   rel="alternate" type="text/markdown"  -> the clean Markdown of this page
//   rel="describedby"                     -> the llms.txt covering this path
//
// Both may be HTML `<link>` elements or an HTTP `Link:` response header. The
// header form is the useful one for us: it can be added at the CDN or Worker
// without touching a single page template, and it works for the Markdown files
// themselves, which have no HTML to put a <link> in.

const MARKDOWN_TYPE = 'text/markdown';

/**
 * The markdown twin of a URL, following the v2 naming rule: append `.md`, or
 * replace the extension with `.md`. A path with no filename becomes
 * `index.html.md` or `index.md`.
 *
 * @param {string} pathname
 * @param {{replace?: boolean}} [options] `replace` yields `page.md` rather
 *   than `page.html.md`. Appending is the default because it keeps the original
 *   URL recoverable by truncation, which a CDN cache key understands.
 * @returns {string}
 */
export function markdownVariantPath(pathname, options = {}) {
  const { replace = false } = options;
  const path = String(pathname || '/');
  const clean = path.split('?')[0].split('#')[0];
  const endsWithSlash = clean.endsWith('/');

  if (endsWithSlash || /\/$/.test(clean) === false && !clean.slice(clean.lastIndexOf('/') + 1).includes('.')) {
    const last = clean.slice(clean.lastIndexOf('/') + 1);
    if (!last || endsWithSlash) return `${clean}index${replace ? '.md' : '.html.md'}`;
  }

  if (replace) {
    const dot = clean.lastIndexOf('.');
    const slash = clean.lastIndexOf('/');
    return dot > slash ? `${clean.slice(0, dot)}.md` : `${clean}.md`;
  }
  return `${clean}.md`;
}

/**
 * Build one `Link:` header value.
 *
 * @param {string[]} targets already-formatted `<url>; rel="…"` strings
 * @returns {string}
 */
export function linkHeaderValue(targets) {
  return (targets || []).filter(Boolean).join(', ');
}

/**
 * Build the header value advertising a page's Markdown twin and its llms.txt.
 *
 * @param {object} options
 * @param {string} options.pathname the page being served
 * @param {string} [options.origin] absolute origin, if the site has one
 * @param {string} [options.llmsPath] path of the covering llms.txt
 * @param {boolean} [options.markdown] false to omit the alternate (page has no
 *   Markdown twin, e.g. a search endpoint)
 * @param {boolean} [options.replaceExtension] use `page.md` not `page.html.md`
 * @returns {string}
 */
export function contentLinkHeader(options = {}) {
  const { pathname = '/', origin = '', llmsPath = '/llms.txt', markdown = true, replaceExtension = false } = options;
  const targets = [];

  if (markdown) {
    const variant = markdownVariantPath(pathname, { replace: replaceExtension });
    targets.push(`<${origin}${variant}>; rel="alternate"; type="${MARKDOWN_TYPE}"`);
  }
  targets.push(`<${origin}${llmsPath}>; rel="describedby"`);

  return linkHeaderValue(targets);
}

/**
 * The HTML equivalent, for pages that do render HTML and would rather not rely
 * on the CDN to set headers.
 *
 * @param {object} options same shape as contentLinkHeader
 * @returns {string} a `<link …>` fragment
 */
export function contentLinkElements(options = {}) {
  const { pathname = '/', origin = '', llmsPath = '/llms.txt', markdown = true, replaceExtension = false } = options;
  const parts = [];
  if (markdown) {
    parts.push(`<link rel="alternate" type="${MARKDOWN_TYPE}" href="${origin}${markdownVariantPath(pathname, { replace: replaceExtension })}">`);
  }
  parts.push(`<link rel="describedby" href="${origin}${llmsPath}">`);
  return parts.join('\n');
}

/**
 * Copy content-link headers onto a Headers object in place.
 *
 * @param {Headers} headers
 * @param {object} options same shape as contentLinkHeader
 * @returns {Headers} the same object, for chaining
 */
export function applyContentLinks(headers, options = {}) {
  headers.set('Link', contentLinkHeader(options));
  return headers;
}
