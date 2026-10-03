import { readFile } from 'node:fs/promises';
import { validateSite } from '../src/site.js';
import { approvedDocuments, publicationDigest } from './approvals.mjs';
if (!process.argv[2]) throw new Error('Usage: node scripts/approval-digests.mjs site.json');
const site = validateSite(JSON.parse(await readFile(process.argv[2], 'utf8')));
console.log(JSON.stringify(Object.fromEntries(approvedDocuments(site).map(page => [page.id, publicationDigest(page)])), null, 2));
