/**
 * Migration 0007 (AI-IMP-126, EPIC-017 §4.9): frame membership, plus
 * the last node-table rebuild.
 *
 * Two parts, one migration:
 *
 * 1. DROP the node.appearance_kind CHECK. Appearance kinds are a
 *    GROWING domain (EPIC-022 meta-analysis): SQLite cannot ALTER a
 *    CHECK, so every added value (0006 added 'card') became a full
 *    FK-aware node rebuild. This is the last one — appearance_kind
 *    becomes an unconstrained TEXT column, validated in command
 *    handlers, so 'frame' and every future kind need no schema change.
 *    The rebuild dance mirrors 0006 exactly (minus the CHECK); it
 *    REQUIRES connection-level foreign_keys OFF (disableForeignKeys):
 *    DROP TABLE's implicit DELETE of a populated node table would
 *    otherwise count deferred-FK violations that never decrement.
 *    migrate.ts runs foreign_key_check afterward.
 *
 * 2. CREATE frame_member. A frame is an ordinary node with a 'frame'
 *    appearance whose board presence is a drawn region other content
 *    sits inside (§4.9 rev 0.38/0.54). Membership is RECORDED here,
 *    never inferred from geometry. The PRIMARY KEY on
 *    member_placement_id IS the single-parent invariant: a placement
 *    belongs to at most one frame (its innermost capturing frame).
 *    Both FKs cascade on delete, so a purged placement — or a purged
 *    frame node, whose placements are hard-deleted — drops its
 *    membership rows automatically. Same-canvas, frame-appearance,
 *    and no-cycle rules are enforced in handlers, not the schema.
 *    frame_member is created under foreign_keys OFF but starts empty,
 *    so the post-migration foreign_key_check is clean.
 *
 * The index and both root-protection triggers die with the old node
 * table and are recreated verbatim from 0001/0006.
 */
export const id = 7
export const name = 'frame-membership'
export const disableForeignKeys = true
export const sql = /* sql */ `

CREATE TABLE node_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id),
  note_id TEXT REFERENCES note(id),
  appearance_kind TEXT,
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

CREATE TABLE frame_member (
  member_placement_id TEXT PRIMARY KEY
    REFERENCES placement(id) ON DELETE CASCADE,
  frame_placement_id TEXT NOT NULL
    REFERENCES placement(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES project(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX ix_frame_member_frame ON frame_member(frame_placement_id);
`
