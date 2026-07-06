/**
 * Migration 0006: 'card' joins the node.appearance_kind CHECK
 * (RFC rev 0.31 §4.6, AI-IMP-084).
 *
 * SQLite cannot ALTER a CHECK constraint, so this is the documented
 * table-rebuild dance. The runner wraps every migration in one
 * transaction with connection-level foreign_keys ON, which shapes
 * the SQL below:
 *
 * - `PRAGMA foreign_keys = OFF` would be a NO-OP inside the
 *   transaction; `defer_foreign_keys` is the transaction-scoped tool
 *   (same trick project open uses). It postpones enforcement of the
 *   four inbound references (project.root_node_id, canvas.node_id,
 *   placement.node_id, tag_assignment.node_id) to COMMIT, by which
 *   time the rebuilt table holds every row again. It resets itself
 *   at commit.
 * - DROP TABLE's implicit DELETE fires no triggers (so
 *   trg_root_node_no_delete cannot abort the rebuild) and its FK
 *   checks are deferred with the rest.
 * - The index and both root-protection triggers die with the old
 *   table and are recreated verbatim from 0001.
 */
export const id = 6
export const name = 'card-appearance'
export const sql = `
PRAGMA defer_foreign_keys = ON;

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
