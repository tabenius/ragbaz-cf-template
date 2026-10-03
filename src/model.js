const SLUG = /^[a-z][a-z0-9-]*$/;
const LOCALE = /^[a-z]{2}(?:-[A-Z]{2})?$/;
const STATUSES = ['draft', 'published', 'revised', 'archived'];
const RESERVED = ['/assets', '/api', '/healthz', '/manifest.json', '/robots.txt', '/sitemap.xml', '/publications', '/contact'];
import { validateIntegration } from './integrations.js';
import { publicProduct } from './domains.js';

export function requireText(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${name}`);
}
export function date(value, name) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error(`Invalid ${name} date`);
}
export function origin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.origin !== value) throw new Error('Use an HTTPS origin without path');
  return value;
}
export function path(value) {
  if (typeof value !== 'string' || !/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(value)) throw new Error('Use a clean trailing-slash page path');
  return value;
}
export function sections(value) {
  if (!Array.isArray(value) || !value.length) throw new Error('Supply sections');
  const ids = new Set();
  for (const section of value) {
    if (!SLUG.test(section.id) || ids.has(section.id)) throw new Error('Invalid or duplicate section id');
    ids.add(section.id);
    requireText(section.title, 'section title');
    if (!Array.isArray(section.paragraphs) || !section.paragraphs.length) throw new Error('Supply paragraphs');
    section.paragraphs.forEach(p => requireText(p, 'paragraph'));
  }
}
function translations(value, locales) {
  for (const [code, edition] of Object.entries(value || {})) {
    if (!locales.some(l => l.code === code)) throw new Error('Translation locale is not configured');
    requireText(edition.title, 'translated title');
    requireText(edition.description, 'translated description');
    sections(edition.sections);
  }
}

export function normalizeSite(input, safeLink) {
  const site = structuredClone(input);
  if (!['ragbaz.project-site/v0', 'ragbaz.project-site/v1'].includes(site.schema)) throw new Error('Unsupported site schema');
  if (!SLUG.test(site.slug)) throw new Error('Invalid site slug');
  for (const key of ['name', 'tagline', 'description', 'status', 'updated']) requireText(site[key], key);
  date(site.updated, 'content');
  origin(site.origin);
  site.basePath ??= '';
  if (site.basePath && !/^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+$/.test(site.basePath)) throw new Error('Invalid base path');
  site.aliases ??= [];
  if (!Array.isArray(site.aliases)) throw new Error('Aliases must be an array');
  site.aliases.forEach(origin);
  if (new Set([site.origin, ...site.aliases]).size !== site.aliases.length + 1) throw new Error('Duplicate origins');
  if (site.basePath) {
    for (const value of [site.origin, ...site.aliases]) {
      const zone = site.routeZones?.[value];
      const host = new URL(value).hostname;
      if (typeof zone !== 'string' || !/^[a-z0-9.-]+$/.test(zone) || !(host === zone || host.endsWith('.' + zone))) throw new Error('Path mounts need an explicit route zone for each origin');
    }
  }
  site.defaultLocale ??= 'en';
  site.locales ??= [{ code: 'en', label: 'English', dir: 'ltr' }];
  const codes = new Set();
  for (const locale of site.locales) {
    if (!LOCALE.test(locale.code) || codes.has(locale.code) || !['ltr', 'rtl'].includes(locale.dir)) throw new Error('Invalid locale');
    requireText(locale.label, 'locale label');
    codes.add(locale.code);
  }
  if (!codes.has(site.defaultLocale)) throw new Error('Default locale not configured');
  if (!Array.isArray(site.links) || !site.links.length) throw new Error('Supply project links');
  for (const link of site.links) { requireText(link.label, 'link label'); safeLink(link.href); }
  sections(site.sections);
  translations(site.translations, site.locales);
  site.modules ??= {};
  if (Object.keys(site.modules).some(k => !['reader', 'contact', 'publications', 'education'].includes(k)) || Object.values(site.modules).some(v => typeof v !== 'boolean')) throw new Error('Unknown module or non-boolean capability');
  site.integrations ??= {};
  for (const [name, config] of Object.entries(site.integrations)) validateIntegration(name, config);
  site.products = (site.products || []).map(publicProduct);
  if (new Set(site.products.map(p => p.id)).size !== site.products.length) throw new Error('Duplicate public product');
  site.pages ??= [];
  const paths = new Set(['/']);
  const ids = new Set(['home']);
  for (const page of site.pages) {
    path(page.path);
    if (RESERVED.some(p => page.path === p + '/' || page.path.startsWith(p + '/')) || site.locales.some(l => page.path.startsWith(`/${l.code}/`))) throw new Error('Reserved page path');
    if (paths.has(page.path) || !SLUG.test(page.id) || ids.has(page.id)) throw new Error('Duplicate page path or id');
    paths.add(page.path); ids.add(page.id);
    requireText(page.title, 'page title'); requireText(page.description, 'page description');
    if (!STATUSES.includes(page.status)) throw new Error('Invalid publication status');
    date(page.created, 'created'); date(page.updated, 'updated');
    if (page.status !== 'draft') date(page.published, 'published');
    if (page.updated < page.created || (page.published && (page.published < page.created || page.published > page.updated))) throw new Error('Inconsistent publication dates');
    page.kind ??= 'page';
    if (!['page', 'article'].includes(page.kind)) throw new Error('Invalid page kind');
    page.tags ??= [];
    if (!Array.isArray(page.tags) || page.tags.some(t => typeof t !== 'string' || !t.trim())) throw new Error('Invalid tags');
    sections(page.sections); translations(page.translations, site.locales);
  }
  site.redirects ??= {};
  for (const [from, to] of Object.entries(site.redirects)) {
    if (!/^\/[a-zA-Z0-9_./-]*$/.test(from) || from.includes('..') || from.startsWith('//') || paths.has(from) || site.locales.some(l => from === `/${l.code}` || from.startsWith(`/${l.code}/`)) || RESERVED.some(p => from === p || from.startsWith(p + '/'))) throw new Error('Invalid redirect source');
    if (!paths.has(to) && !['/publications/', '/contact/'].includes(to)) throw new Error('Redirect target must be a registered page');
    if (site.pages.some(p => p.path === to && p.status === 'draft')) throw new Error('Redirect cannot expose a draft');
  }
  if (site.socialImage) {
    if (!/^\/assets\/[a-zA-Z0-9._/-]+$/.test(site.socialImage) || site.socialImage.includes('..')) throw new Error('Use a first-party social image');
  }
  if (site.socialCard !== undefined && typeof site.socialCard !== 'boolean') throw new Error('Social card flag must be boolean');
  if (site.publicationPolicy && site.publicationPolicy !== 'approved-only') throw new Error('Unknown publication policy');
  if (site.modules.education) {
    if (!Array.isArray(site.lessons) || !site.lessons.length || new Set(site.lessons).size !== site.lessons.length || site.lessons.some(id => !site.pages.some(p => p.id === id && p.status !== 'draft'))) throw new Error('Education needs a unique published lesson sequence');
  }
  return site;
}

export function mounted(site, route = '/') { return site.basePath + route; }
export function pagePath(site, page, locale = site.defaultLocale) {
  return mounted(site, (locale === site.defaultLocale ? '' : `/${locale}`) + page.path);
}
export function homePage(site) {
  return { id: 'home', path: '/', title: site.name, description: site.description, sections: site.sections, translations: site.translations, status: 'published', updated: site.updated };
}
export function availableLocales(site, page) {
  return site.locales.filter(l => l.code === site.defaultLocale || page.translations?.[l.code]);
}
export function edition(site, page, requested) {
  const translated = page.translations?.[requested];
  const locale = translated ? requested : site.defaultLocale;
  return { ...page, ...translated, locale, dir: site.locales.find(l => l.code === locale).dir, fallback: locale !== requested };
}
export function publications(site) {
  return site.pages.filter(p => ['published', 'revised'].includes(p.status)).sort((a, b) => b.published.localeCompare(a.published) || a.id.localeCompare(b.id));
}
