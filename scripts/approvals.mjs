import { createHash } from 'node:crypto';
import { homePage } from '../src/model.js';

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).filter(k => value[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export function publicationDigest(page) { return createHash('sha256').update(canonical(page)).digest('hex'); }
export function approvedDocuments(site) {
  return [{ ...homePage(site), tagline: site.tagline, links: site.links, product_status: site.status, highlights:site.highlights||[],workflow:site.workflow||[],quickstart:site.quickstart||null,motifCaption:site.motifCaption||null }, ...site.pages.filter(p => p.status !== 'draft')];
}
export function verifyApprovals(site) {
  if (site.publicationPolicy !== 'approved-only') return;
  const documents = approvedDocuments(site);
  const ids = documents.map(p => p.id);
  if (Object.keys(site.approvals || {}).some(id => !ids.includes(id))) throw new Error('Unknown publication approval');
  for (const page of documents) {
    if (site.approvals?.[page.id] !== publicationDigest(page)) throw new Error(`Publication approval missing or stale: ${page.id}`);
    if (/(?:\/home\/|\/srv\/|\/data\/|localhost|127\.0\.0\.1|-----BEGIN .*PRIVATE KEY|gh[pousr]_[A-Za-z0-9]{20,})/.test(canonical(page))) throw new Error(`Private-shaped publication material: ${page.id}`);
  }
}
