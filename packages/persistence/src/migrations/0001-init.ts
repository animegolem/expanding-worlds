/**
 * Migration 0001: full RFC-0001 §4 schema.
 *
 * Migrations are TS modules exporting SQL strings (not .sql files) so
 * tsc emits them into dist without an asset-copy step. Applied
 * migrations are immutable — schema changes get a new numbered file.
 *
 * Conventions: STRICT tables; TEXT UUIDs; ISO-8601 TEXT timestamps;
 * JSON in TEXT columns; lifecycle_state per §9.1 on every record type
 * that supports recoverable deletion; booleans as INTEGER 0/1.
 */
export const id = 1
export const name = 'init'
export const sql = /* sql */ `

CREATE TABLE project (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  project_revision INTEGER NOT NULL DEFAULT 0,
  root_node_id TEXT NOT NULL REFERENCES node(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

-- §4.2. title_key unique across active AND trashed notes: a trashed
-- note keeps its reservation until purge (invariant 5); purge deletes
-- the row, which ends the reservation.
CREATE TABLE note (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id),
  title TEXT NOT NULL CHECK (length(title) > 0),
  title_key TEXT NOT NULL CHECK (length(title_key) > 0),
  body TEXT NOT NULL DEFAULT '',
  lifecycle_state TEXT NOT NULL DEFAULT 'active'
    CHECK (lifecycle_state IN ('active', 'trashed')),
  trashed_at TEXT,
  trashed_by_command_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE UNIQUE INDEX ux_note_title_key ON note(project_id, title_key);

-- §4.3, §4.6. Appearance is flattened into queryable columns so GC
-- mark-and-sweep can find asset references without JSON scanning.
CREATE TABLE node (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id),
  note_id TEXT REFERENCES note(id),
  appearance_kind TEXT
    CHECK (appearance_kind IN ('dot', 'icon', 'image')),
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
CREATE INDEX ix_node_note ON node(note_id);

-- §4.7. Several Asset rows may share one content_hash (dedupe never
-- merges metadata), so the hash is indexed but not unique.
CREATE TABLE asset (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id),
  kind TEXT NOT NULL CHECK (kind IN ('image', 'web-reference')),
  content_hash TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  storage_path TEXT NOT NULL,
  source_url TEXT,
  attribution TEXT,
  lifecycle_state TEXT NOT NULL DEFAULT 'active'
    CHECK (lifecycle_state IN ('active', 'trashed')),
  trashed_at TEXT,
  trashed_by_command_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX ix_asset_hash ON asset(content_hash);

-- §4.4. UNIQUE(node_id) is invariant 10: one canvas per node.
CREATE TABLE canvas (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id),
  node_id TEXT NOT NULL UNIQUE REFERENCES node(id),
  background_asset_id TEXT REFERENCES asset(id),
  background_settings TEXT,
  background_color TEXT,
  camera TEXT NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}',
  lifecycle_state TEXT NOT NULL DEFAULT 'active'
    CHECK (lifecycle_state IN ('active', 'trashed')),
  trashed_at TEXT,
  trashed_by_command_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

-- §4.5. render_order is a REAL key shared with decorations per
-- canvas; UUID order breaks ties (§4.4).
CREATE TABLE placement (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id),
  canvas_id TEXT NOT NULL REFERENCES canvas(id),
  node_id TEXT NOT NULL REFERENCES node(id),
  x REAL NOT NULL DEFAULT 0,
  y REAL NOT NULL DEFAULT 0,
  width REAL,
  height REAL,
  scale REAL NOT NULL DEFAULT 1,
  rotation REAL NOT NULL DEFAULT 0,
  flip_x INTEGER NOT NULL DEFAULT 0 CHECK (flip_x IN (0, 1)),
  flip_y INTEGER NOT NULL DEFAULT 0 CHECK (flip_y IN (0, 1)),
  render_order REAL NOT NULL,
  label_visible INTEGER NOT NULL DEFAULT 1 CHECK (label_visible IN (0, 1)),
  lifecycle_state TEXT NOT NULL DEFAULT 'active'
    CHECK (lifecycle_state IN ('active', 'trashed')),
  trashed_at TEXT,
  trashed_by_command_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX ix_placement_canvas ON placement(canvas_id);
CREATE INDEX ix_placement_node ON placement(node_id);

-- §4.8.
CREATE TABLE tag (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id),
  name TEXT NOT NULL CHECK (length(name) > 0),
  name_key TEXT NOT NULL CHECK (length(name_key) > 0),
  color TEXT,
  icon TEXT,
  lifecycle_state TEXT NOT NULL DEFAULT 'active'
    CHECK (lifecycle_state IN ('active', 'trashed')),
  trashed_at TEXT,
  trashed_by_command_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE UNIQUE INDEX ux_tag_name_key ON tag(project_id, name_key);

CREATE TABLE tag_assignment (
  tag_id TEXT NOT NULL REFERENCES tag(id),
  node_id TEXT NOT NULL REFERENCES node(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (tag_id, node_id)
) STRICT;
CREATE INDEX ix_tag_assignment_node ON tag_assignment(node_id);

-- §4.9. Groups are canvas-local movement aids, not containment.
CREATE TABLE decoration_group (
  id TEXT PRIMARY KEY,
  canvas_id TEXT NOT NULL REFERENCES canvas(id),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE decoration (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id),
  canvas_id TEXT NOT NULL REFERENCES canvas(id),
  kind TEXT NOT NULL CHECK (kind IN
    ('text', 'path', 'shape', 'line', 'arrow', 'connector', 'guide')),
  data TEXT NOT NULL DEFAULT '{}',
  render_order REAL NOT NULL,
  locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
  hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
  group_id TEXT REFERENCES decoration_group(id),
  anchor_start_placement_id TEXT REFERENCES placement(id),
  anchor_end_placement_id TEXT REFERENCES placement(id),
  lifecycle_state TEXT NOT NULL DEFAULT 'active'
    CHECK (lifecycle_state IN ('active', 'trashed')),
  trashed_at TEXT,
  trashed_by_command_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX ix_decoration_canvas ON decoration(canvas_id);

-- §7.1. Exactly one state per record, with per-state payload columns
-- enforced by CHECKs (invariant 26's schema half).
CREATE TABLE link (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id),
  source_note_id TEXT NOT NULL REFERENCES note(id),
  source_revision INTEGER NOT NULL,
  range_start INTEGER NOT NULL,
  range_end INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('bound', 'unresolved', 'broken')),
  target_note_id TEXT REFERENCES note(id),
  target_title_key TEXT,
  display_text TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (state <> 'bound' OR target_note_id IS NOT NULL),
  CHECK (state <> 'unresolved'
    OR (target_title_key IS NOT NULL AND display_text IS NOT NULL)),
  CHECK (state <> 'broken'
    OR (display_text IS NOT NULL AND target_note_id IS NULL))
) STRICT;
CREATE INDEX ix_link_source ON link(source_note_id);
CREATE INDEX ix_link_target ON link(target_note_id);
CREATE INDEX ix_link_unresolved ON link(target_title_key)
  WHERE state = 'unresolved';

-- §8.1.
CREATE TABLE bookmark (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id),
  canvas_id TEXT NOT NULL REFERENCES canvas(id),
  name TEXT NOT NULL,
  viewport TEXT,
  created_at TEXT NOT NULL
) STRICT;

-- §10.2 metadata log: provenance and diagnostics, never replayable.
CREATE TABLE command_log (
  command_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id),
  command_type TEXT NOT NULL,
  command_version INTEGER NOT NULL,
  issued_at TEXT NOT NULL,
  resulting_revision INTEGER NOT NULL
) STRICT;

-- §11.5 project-tier settings (JSON values).
CREATE TABLE settings (
  project_id TEXT NOT NULL REFERENCES project(id),
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (project_id, key)
) STRICT;

-- §4.10 root protection, enforced below any handler bug: the root
-- node and root canvas can be neither trashed nor deleted.
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

CREATE TRIGGER trg_root_canvas_no_trash
BEFORE UPDATE OF lifecycle_state ON canvas
WHEN NEW.lifecycle_state = 'trashed'
  AND NEW.node_id = (SELECT root_node_id FROM project WHERE id = NEW.project_id)
BEGIN
  SELECT RAISE(ABORT, 'EW_ROOT_CANVAS_PROTECTED');
END;

CREATE TRIGGER trg_root_canvas_no_delete
BEFORE DELETE ON canvas
WHEN OLD.node_id = (SELECT root_node_id FROM project WHERE id = OLD.project_id)
BEGIN
  SELECT RAISE(ABORT, 'EW_ROOT_CANVAS_PROTECTED');
END;
`
