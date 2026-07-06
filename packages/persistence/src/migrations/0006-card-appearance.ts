/**
 * Migration 0006: 'card' joins the node.appearance_kind CHECK
 * (RFC rev 0.31 §4.6, AI-IMP-084).
 *
 * SQLite cannot ALTER a CHECK constraint, so this is the documented
 * table-rebuild dance, and it REQUIRES connection-level
 * foreign_keys OFF (the disableForeignKeys flag): deferred FKs are
 * a violation COUNTER, so DROP TABLE's implicit DELETE of a
 * populated node table increments per child reference and nothing
 * ever decrements — the commit can never succeed on real data. The
 * first cut used defer_foreign_keys, passed on fresh (empty-at-
 * migration-time) test projects, and failed on the owner's live
 * project; migrate.ts runs foreign_key_check afterward to repay
 * the integrity debt.
 *
 * - DROP TABLE's implicit DELETE fires no triggers (so
 *   trg_root_node_no_delete cannot abort the rebuild).
 * - The index and both root-protection triggers die with the old
 *   table and are recreated verbatim from 0001.
 */
export const id = 6
export const name = 'card-appearance'
export const disableForeignKeys = true
export const sql = `

CREATE TABLE node_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id),
  note_id TEXT REFERENCES note(id),
  appearance_kind TEXT
    CHECK (appearance_kind IN ('dot', 'icon', 'image', 'card')),
  appearance_color TEXT,
  appearance_icon TEXT,
  appearance_asset_id TEXT REFERENCES asset(id),
  appearance_crop TEXT,
  lifecycle_state TEXT NOT NULL DEFAULT 'active'
    CHECK (lifecycle_state IN ('active', 'trashed')),
  trashed_at TEXT,
  trashed_by_command_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

INSERT INTO node_new SELECT * FROM node;
DROP TABLE node;
ALTER TABLE node_new RENAME TO node;

CREATE INDEX ix_node_note ON node(note_id);

CREATE TRIGGER trg_root_node_no_trash
BEFORE UPDATE OF lifecycle_state ON node
WHEN NEW.lifecycle_state = 'trashed'
  AND NEW.id = (SELECT root_node_id FROM project WHERE id = NEW.project_id)
BEGIN
  SELECT RAISE(ABORT, 'EW_ROOT_NODE_PROTECTED');
END;

CREATE TRIGGER trg_root_node_no_delete
BEFORE DELETE ON node
WHEN OLD.id = (SELECT root_node_id FROM project WHERE id = OLD.project_id)
BEGIN
  SELECT RAISE(ABORT, 'EW_ROOT_NODE_PROTECTED');
END;
`
