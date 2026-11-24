// llms.txt v2 for a project site.
//
// The llms.txt proposal asks for a curated Markdown map of a site for agents:
// an H1, a blockquote summary, prose, then H2 sections of `- [title](url): notes`.
// Two things about this site shape the notes.
//
// The site's content is authored as structured JSON (ragbaz.project-site/v1),
// not as Markdown, so every entry is "Markdoc-compatible" in the sense that
// matters to an agent: it is clean prose reachable as plain text, with no build
// step and no component boundary. There is no MDX here, so there is nothing to
// warn about -- which is the point of choosing a structured content format.
//
// Markdown twins are served at the same URL with `.md` appended, and every HTML
// response advertises both link relations, so an agent that starts from a page
// finds the map and the text version without being told where to look.
//
// Imported narrowly rather than through the content barrel. `content/index.js`
// re-exports the Markdoc renderer, which would pull @markdoc/markdoc into this
// Worker's bundle for no benefit: generating llms.txt and computing link
// relations are pure string work. Only a site that *renders* Markdoc needs it.
import { renderLlmsTxt } from './content/llms-txt.js';
import { markdownVariantPath } from './content/link-relations.js';
import { homePage, publications, edition } from './model.js';

const TEXT_MIME = 'text/markdown; charset=utf-8';

/** Pages an agent may see. Drafts are excluded, as they are from the sitemap. */
function publishedPages(site) {
  return site.pages.filter((page) => ['published', 'revised'].includes(page.status));
}

/** The status of a page is the first thing an agent should know about it. */
function statusNote(page) {
  if (page.status === 'revised') return 'Revised since publication.';
  if (page.kind === 'article') return 'Published article.';
  return 'Reference page.';
}

/** Build the manifest for a site's llms.txt.
 *
 * @param {object} site a validated site config
 * @returns {object} a manifest for renderLlmsTxt
 */
export function llmsManifest(site) {
  const basePath = site.basePath || '';
  const home = homePage(site);
  const articles = publications(site);
  const others = publishedPages(site).filter((page) => page.kind !== 'article');

  // Helper to check if a page exists for a given path (for module routes)
  const hasPage = (path) => site.pages.some(p => p.path === path && p.status !== 'draft');

  const entry = (page) => {
    const url = markdownVariantPath(basePath + page.path);
    return {
      title: page.title,
      url,
      note: [page.description, statusNote(page)].filter(Boolean).join(' '),
    };
  };

  const homeUrl = markdownVariantPath(basePath + '/');
  const contactUrl = (site.modules?.contact && hasPage('/contact/')) ? markdownVariantPath(basePath + '/contact/') : null;
  const demoUrl = (site.modules?.demonstration && hasPage('/demonstration/')) ? markdownVariantPath(basePath + '/demonstration/') : null;
  const pubUrl = (site.modules?.publications && hasPage('/publications/')) ? markdownVariantPath(basePath + '/publications/') : null;

  const locales = (site.locales || []).map((locale) => locale.code).filter((code) => code !== site.defaultLocale);

  return {
    name: site.name,
    summary: site.description || site.tagline || '',
    details: [
      'Every link points to the Markdown version of the page at the same path with `.md` appended, so an agent can read it without parsing navigation or scripts.',
      'Content is structured JSON rendered server-side rather than MDX, so there is no component boundary and nothing to build before reading.',
      locales.length
        ? `Available in ${[site.defaultLocale, ...locales].join(' and ')}. A localized page adds its locale to the path; the default locale is unprefixed.`
        : '',
      'Status words are deliberate: a prototype is described as a prototype, and a passing test is not a claim of production readiness.',
    ].filter(Boolean),
    sections: {
      Overview: {
        entries: [
          { title: home.title, url: homeUrl, note: home.description },
          ...(contactUrl ? [{ title: 'Contact', url: contactUrl, note: 'Contact form for this project.' }] : []),
          ...(demoUrl ? [{ title: 'Demonstration', url: demoUrl, note: 'An interactive example that runs locally in the page. No server state.' }] : []),
          ...(pubUrl ? [{ title: 'All publications', url: pubUrl, note: `${articles.length} article(s), newest first.` }] : []),
        ].filter((e) => e.url),
      },
      Publications: { entries: articles.map(entry) },
      Reference: { entries: others.map(entry) },
      Optional: {
        entries: (site.links || []).map((link) => ({
          title: link.label,
          url: link.href,
          note: 'Linked by the project.',
        })),
      },
    },
  };
}

/** Render the llms.txt markdown for a site. */
export function llmsText(site) {
  return renderLlmsTxt(llmsManifest(site));
}

/** Return the Markdown twin for a page route, or null if not found / is a draft. */
export function markdownTwin(site, route, locale = site.defaultLocale) {
  // Normalize route to always have trailing slash for lookup
  const norm = route.endsWith('/') ? route : route + '/';
  // Handle home page specially (not in site.pages)
  const page = norm === '/' ? homePage(site) : site.pages.find(p => p.path === norm && p.status !== 'draft');
  if (!page) return null;
  if (!site.locales.some(l => l.code === locale) || (locale !== site.defaultLocale && !page.translations?.[locale])) return null;
  const content = edition(site, page, locale);
  const escape = value => String(value).replace(/[\\`*_{}\[\]<>]/g, '\\$&');
  const sections = content.sections.map(section => {
    const blocks = [`## ${escape(section.title)}`, ...section.paragraphs.map(escape)];
    if (section.code !== undefined) {
      const fence = '`'.repeat(Math.max(3, ...Array.from(section.code.matchAll(/`+/g), m => m[0].length + 1)));
      blocks.push(`${fence}${section.language || ''}\n${section.code}\n${fence}`);
    }
    for (const link of section.links || []) blocks.push(`- [${escape(link.label)}](${link.href.replace(/[()]/g, c => c === '(' ? '%28' : '%29')})`);
    return blocks.join('\n\n');
  }).join('\n\n');
  return {
    markdown: `# ${escape(content.title)}\n\n${escape(content.description)}\n\n${sections}\n`,
    page, locale,
  };
}

export { TEXT_MIME };
