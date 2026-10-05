-- Additive studio tables in the existing marketing database. No audit or
-- account tables are changed. An email match is a contact correlation, not
-- proof that the same human authored every message.
CREATE TABLE IF NOT EXISTS ragbaz_peers (
  id TEXT PRIMARY KEY,
  email_normalized TEXT NOT NULL UNIQUE,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ragbaz_interests (
  id TEXT PRIMARY KEY,
  peer_id TEXT NOT NULL REFERENCES ragbaz_peers(id) ON DELETE CASCADE,
  payload_hash TEXT NOT NULL,
  project TEXT NOT NULL,
  source_domain TEXT NOT NULL,
  source_page TEXT NOT NULL,
  source_page_basis TEXT NOT NULL,
  name_claim TEXT,
  organization_claim TEXT,
  source_cta TEXT,
  message TEXT NOT NULL,
  interest_type TEXT NOT NULL,
  received_at TEXT NOT NULL,
  client_submitted_at TEXT,
  contact_consent INTEGER NOT NULL CHECK(contact_consent=1),
  attribution_consent INTEGER NOT NULL,
  account_link_requested INTEGER NOT NULL,
  privacy_signal TEXT NOT NULL,
  attribution_json TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ragbaz_interest_peer_time ON ragbaz_interests(peer_id, received_at);
CREATE INDEX IF NOT EXISTS ragbaz_interest_source ON ragbaz_interests(project, source_domain, received_at);
CREATE TABLE IF NOT EXISTS ragbaz_peer_account_candidates (
  peer_id TEXT NOT NULL REFERENCES ragbaz_peers(id) ON DELETE CASCADE,
  authority TEXT NOT NULL,
  account_id TEXT NOT NULL,
  relation_basis TEXT NOT NULL,
  account_created_at TEXT,
  account_email_verified_at TEXT,
  first_observed_at TEXT NOT NULL,
  last_observed_at TEXT NOT NULL,
  PRIMARY KEY(peer_id, authority, account_id)
);
CREATE TABLE IF NOT EXISTS ragbaz_peer_rate_limits (
  bucket TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ragbaz_peer_profile_claims (
  peer_id TEXT NOT NULL REFERENCES ragbaz_peers(id) ON DELETE CASCADE,
  authority TEXT NOT NULL,
  account_id TEXT NOT NULL,
  attribute TEXT NOT NULL,
  value TEXT NOT NULL,
  source_field TEXT NOT NULL,
  source_created_at TEXT,
  source_updated_at TEXT,
  first_observed_at TEXT NOT NULL,
  last_observed_at TEXT NOT NULL,
  PRIMARY KEY(peer_id,authority,account_id,attribute,value)
);
CREATE TABLE IF NOT EXISTS ragbaz_peer_sync_state (
  source TEXT PRIMARY KEY,
  last_peer_id TEXT NOT NULL
);
