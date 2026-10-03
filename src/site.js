import { normalizeSite, homePage, mounted, pagePath, availableLocales, edition, publications } from './model.js';
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
export function safeLink(value) {
  if (typeof value !== 'string') throw new Error('Link must be a string');
  const url = new URL(value);
  if (!['https:', 'mailto:'].includes(url.protocol) || url.username || url.password) throw new Error(`Unsupported link: ${value}`);
  return value;
}
export function validateSite(site) { return normalizeSite(site, safeLink); }

export function renderPage(input, { missing = false, page, locale, listing = false, contact = false } = {}) {
  const site = validateSite(input);
  page ??= homePage(site); locale ??= site.defaultLocale;
  const content = edition(site, page, locale);
  const e = escapeHtml;
  const title = missing ? `Page not found · ${site.name}` : listing ? `Publications · ${site.name}` : contact ? `Contact · ${site.name}` : `${content.title} · RAGBAZ`;
  const canonical = site.origin + (listing ? mounted(site, '/publications/') : contact ? mounted(site, '/contact/') : pagePath(site, page, content.locale));
  const links = site.links.map(l => `<a class="button" href="${e(l.href)}">${e(l.label)}</a>`).join('');
  const sectionHtml = content.sections.map(s => `<section id="${e(s.id)}"><h2>${e(s.title)}</h2>${s.paragraphs.map(p => `<p>${e(p)}</p>`).join('')}</section>`).join('');
  const navigation = site.pages.filter(p => p.kind === 'page' && p.status !== 'draft').map(p => `<a href="${e(pagePath(site, p, locale))}">${e(edition(site, p, locale).title)}</a>`).join('');
  const locales = availableLocales(site, page).map(l => `<a lang="${e(l.code)}" dir="${l.dir}" href="${e(pagePath(site, page, l.code))}"${l.code === content.locale ? ' aria-current="page"' : ''}>${e(l.label)}</a>`).join('');
  const reader = site.modules.reader ? `<details class="reader-controls"><summary>Reading preferences</summary><label>Theme <select data-reader="theme"><option value="paper">Paper</option><option value="sepia">Sepia</option><option value="white">White</option><option value="night">Night</option></select></label><label>Text <select data-reader="font"><option value="serif">Serif</option><option value="sans">Sans</option><option value="mono">Monospace</option></select></label><label>Print <select data-reader="paper"><option value="a4">A4</option><option value="a5">A5</option></select></label><button type="button" data-reader-print>Print</button><button type="button" data-reader-reset>Reset</button></details>` : '';
  const cards = publications(site).map(p => `<article class="publication-card" data-date="${e(p.published)}" data-title="${e(p.title)}"><p class="status">${e(p.status)} · <time>${e(p.published)}</time></p><h2><a href="${e(pagePath(site, p, locale))}">${e(edition(site, p, locale).title)}</a></h2><p class="card-description">${e(edition(site, p, locale).description)}</p><p>${p.tags.map(e).join(' · ')}</p></article>`).join('');
  const form = `<form data-contact action="${e(mounted(site, '/api/contact'))}" method="post"><label>Email <input name="email" type="email" maxlength="254" required></label><label>Message <textarea name="message" maxlength="4000" required></textarea></label><label><input name="consent" type="checkbox" required> I consent to sending this message so the project can respond.</label><button type="submit">Send message</button><p role="status" aria-live="polite" data-contact-status></p></form><p>You can also <a href="mailto:ragbaz@proton.me">contact RAGBAZ by email</a>.</p>`;
  let body;
  if (missing) body = `<section class="hero"><p class="eyebrow">404 · Page not found</p><h1>This page is missing.</h1><a href="${e(mounted(site))}">Return to ${e(site.name)}</a></section>`;
  else if (listing) body = `<h1>Publications</h1><div class="catalog-controls"><label>Layout <select data-catalog-layout><option value="grid">Grid</option><option value="list">List</option></select></label><label>Sort <select data-catalog-sort><option value="date">Publication date</option><option value="name">Name</option></select></label></div><div class="publications" data-catalog>${cards || '<p>No published documents yet.</p>'}</div>`;
  else if (contact) body = `<h1>Contact ${e(site.name)}</h1>${form}`;
  else body = `<section class="hero"><p class="eyebrow">RAGBAZ / ${e(site.slug)}</p><p class="status">${e(page.id === 'home' ? site.status : page.status)}</p><h1>${e(content.title)}</h1>${page.id === 'home' ? `<p class="tagline">${e(site.tagline)}</p>` : `<p>Published ${e(page.published)} · Updated ${e(page.updated)}</p>`}<p>${e(content.description)}</p>${page.id === 'home' ? `<div class="actions">${links}</div>` : ''}</section>${content.fallback ? '<p class="translation-note">This document is not translated into the requested language. Showing the original edition.</p>' : ''}<nav class="contents" aria-label="On this page">${content.sections.map(s => `<a href="#${e(s.id)}">${e(s.title)}</a>`).join('')}</nav>${sectionHtml}`;
  const scripts = [...(site.modules.reader ? ['reader.js'] : []), ...(listing ? ['catalog.js'] : []), ...(contact ? ['contact.js'] : [])];
  let education = '';
  if (site.modules.education && !missing && !listing && !contact) {
    const lessons = site.lessons.map(id => site.pages.find(p => p.id === id));
    const position = lessons.findIndex(p => p.id === page.id);
    education = `<aside class="reader-controls" data-education data-project="${e(site.slug)}" data-lessons="${e(site.lessons.join(','))}" data-lesson="${e(page.id)}"><nav aria-label="Lesson sequence">${position > 0 ? `<a href="${e(pagePath(site, lessons[position - 1], locale))}">Previous lesson</a>` : ''}${position >= 0 && position < lessons.length - 1 ? `<a href="${e(pagePath(site, lessons[position + 1], locale))}">Next lesson</a>` : ''}</nav>${position >= 0 ? '<button type="button">Mark as read</button>' : ''}<p role="status" aria-live="polite">Progress is recorded only on this device.</p></aside>`;
    scripts.push('education.js');
  }
  return `<!doctype html>
<html lang="${e(content.locale)}" dir="${content.dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title)}</title><meta name="description" content="${e(content.description)}">
${missing || page.status === 'archived' ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${e(canonical)}"><meta property="og:url" content="${e(canonical)}"><meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(content.description)}"><meta property="og:type" content="${page.kind === 'article' ? 'article' : 'website'}">${site.socialImage ? `<meta property="og:image" content="${e(site.origin + mounted(site, site.socialImage))}"><meta name="twitter:card" content="summary_large_image">` : ''}${!listing && !contact ? availableLocales(site, page).map(l => `<link rel="alternate" hreflang="${e(l.code)}" href="${e(site.origin + pagePath(site, page, l.code))}">`).join('') : ''}`}
${['tokens.css', 'site-tokens.css', 'site.css', ...(site.modules.reader ? ['reader.css'] : [])].map(a => `<link rel="stylesheet" href="${e(mounted(site, '/assets/' + a))}">`).join('')}
${scripts.map(s => `<script src="${e(mounted(site, '/assets/' + s))}" defer></script>`).join('')}
</head><body><a class="skip" href="#main">Skip to content</a>
<header><a class="brand" href="https://ragbaz.cc">RAGBAZ</a><nav aria-label="Project navigation"><a href="${e(mounted(site))}">${e(site.name)}</a>${navigation}${site.modules.publications ? `<a href="${e(mounted(site, '/publications/'))}">Publications</a>` : ''}${site.modules.contact ? `<a href="${e(mounted(site, '/contact/'))}">Contact</a>` : ''}<a href="https://ragbaz.cc/thinktank/en">Thinktank</a><a href="https://mouseion.ragbaz.cc">Mouseion</a></nav></header>
${!listing && !contact && !missing && availableLocales(site, page).length > 1 ? `<nav class="language-nav" aria-label="Languages">${locales}</nav>` : ''}${reader}
<main id="main">${body}${education}${site.modules.reader ? '<button type="button" data-reader-fullscreen>Toggle fullscreen</button>' : ''}</main><footer><p>${e(site.name)} · Part of <a href="https://ragbaz.cc">RAGBAZ</a></p><p>Content updated ${e(site.updated)} · <a href="mailto:ragbaz@proton.me">Contact</a></p></footer>
</body></html>`;
}
