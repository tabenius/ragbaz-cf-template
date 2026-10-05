import { submissionModel, artifactModel } from './model.js';

// Read-only bridge to the shared studio contact directory. A contact UUID or
// consent to correspond does not establish authorship or consent to publish.
export function submissionFromPeerInterest(row, artifactInput, collection) {
  const artifact = artifactModel(artifactInput);
  if (!row || typeof row.message !== 'string' || !row.id || !row.peer_id || !row.email_normalized) throw new Error('Incomplete peer interest');
  if (artifact.quote && !row.message.includes(artifact.quote)) throw new Error('Quote must be exact wording from the received message');
  return submissionModel({
    schema: 'ragbaz.artifact-submission/v1', collection, direction: 'inbound', artifact,
    sender: { ...(row.name_claim ? { name: row.name_claim } : {}), email: row.email_normalized },
    source: { system: 'ragbaz-peers', reference: row.id, person_reference: row.peer_id, observed_at: row.received_at },
    permission: { offered_scopes: [], note: 'Imported from a studio contact interest. Contact/attribution consent is not permission to publish a quote, name or photograph.' },
  });
}
export async function readPeerInterest(db, id, now = new Date().toISOString()) {
  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid interest reference');
  return db.prepare(`SELECT i.id,i.peer_id,i.name_claim,i.message,i.received_at,p.email_normalized
    FROM ragbaz_interests i JOIN ragbaz_peers p ON p.id=i.peer_id
    WHERE i.id=? AND i.expires_at>? AND p.expires_at>?`).bind(id, now, now).first();
}
