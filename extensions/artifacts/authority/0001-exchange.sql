-- Application-owned D1/SQLite state. The template core does not bind this DB.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS exchange_collections (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS exchange_items (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES exchange_collections(id),
  direction TEXT NOT NULL CHECK(direction IN ('inbound','outbound')),
  envelope_json TEXT NOT NULL CHECK(json_valid(envelope_json)),
  public_json TEXT NOT NULL CHECK(json_valid(public_json)),
  required_scopes_json TEXT NOT NULL CHECK(json_valid(required_scopes_json)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision = 1),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','approved','rejected','withdrawn')),
  received_at TEXT NOT NULL,
  published_at TEXT,
  reviewed_by TEXT,
  revocation_hash TEXT NOT NULL,
  CHECK (state != 'approved' OR (published_at IS NOT NULL AND reviewed_by IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS exchange_consents (
  item_id TEXT PRIMARY KEY REFERENCES exchange_items(id),
  revision INTEGER NOT NULL,
  scopes_json TEXT NOT NULL CHECK(json_valid(scopes_json)),
  evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json)),
  recorded_by TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('recorded','withdrawn'))
);
CREATE INDEX IF NOT EXISTS exchange_public ON exchange_items(collection_id,state,published_at);
CREATE INDEX IF NOT EXISTS exchange_inbox ON exchange_items(state,received_at);

-- Pending intake cannot bypass the approval transition by inserting public rows.
CREATE TRIGGER IF NOT EXISTS exchange_insert_pending
BEFORE INSERT ON exchange_items WHEN NEW.state != 'pending'
BEGIN SELECT RAISE(ABORT, 'intake_must_be_pending'); END;

-- Content, routing, required scopes and receipt capabilities are immutable.
-- A changed quote/photo is a new item needing new permission and review.
CREATE TRIGGER IF NOT EXISTS exchange_immutable_content
BEFORE UPDATE ON exchange_items
WHEN NEW.envelope_json != OLD.envelope_json OR NEW.public_json != OLD.public_json
  OR NEW.required_scopes_json != OLD.required_scopes_json OR NEW.revision != OLD.revision
  OR NEW.collection_id != OLD.collection_id OR NEW.direction != OLD.direction
  OR NEW.id != OLD.id OR NEW.received_at != OLD.received_at
  OR NEW.revocation_hash != OLD.revocation_hash
BEGIN SELECT RAISE(ABORT, 'immutable_submission'); END;

CREATE TRIGGER IF NOT EXISTS exchange_approval_requires_permission
BEFORE UPDATE OF state ON exchange_items WHEN NEW.state = 'approved'
BEGIN
  SELECT CASE WHEN OLD.state != 'pending' THEN RAISE(ABORT, 'invalid_review_transition') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM exchange_consents c
    WHERE c.item_id = NEW.id AND c.revision = NEW.revision AND c.state = 'recorded'
      AND NOT EXISTS (
        SELECT 1 FROM json_each(NEW.required_scopes_json) required
        WHERE NOT EXISTS (SELECT 1 FROM json_each(c.scopes_json) granted WHERE granted.value = required.value)
      )
  ) THEN RAISE(ABORT, 'permission_required') END;
END;

CREATE TRIGGER IF NOT EXISTS exchange_withdraw_permission
AFTER UPDATE OF state ON exchange_consents WHEN NEW.state = 'withdrawn'
BEGIN UPDATE exchange_items SET state = 'withdrawn' WHERE id = NEW.item_id; END;
CREATE TRIGGER IF NOT EXISTS exchange_delete_permission
AFTER DELETE ON exchange_consents
BEGIN UPDATE exchange_items SET state = 'withdrawn' WHERE id = OLD.item_id; END;
CREATE TRIGGER IF NOT EXISTS exchange_consent_immutable
BEFORE UPDATE ON exchange_consents
WHEN NEW.item_id != OLD.item_id OR NEW.revision != OLD.revision
  OR NEW.scopes_json != OLD.scopes_json OR NEW.evidence_json != OLD.evidence_json
  OR NEW.recorded_by != OLD.recorded_by OR NEW.recorded_at != OLD.recorded_at
  OR (OLD.state = 'withdrawn' AND NEW.state != 'withdrawn')
BEGIN SELECT RAISE(ABORT, 'immutable_permission'); END;

-- Public queries use this view, not the inbox table.
CREATE VIEW IF NOT EXISTS exchange_public_items AS
SELECT i.id, i.collection_id, i.public_json, i.published_at
FROM exchange_items i JOIN exchange_consents c ON c.item_id = i.id
WHERE i.state = 'approved' AND c.state = 'recorded' AND c.revision = i.revision
  AND NOT EXISTS (
    SELECT 1 FROM json_each(i.required_scopes_json) required
    WHERE NOT EXISTS (SELECT 1 FROM json_each(c.scopes_json) granted WHERE granted.value = required.value)
  );
