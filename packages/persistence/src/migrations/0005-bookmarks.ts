/**
 * Migration 0005: the §8.1 bookmark table proper (AI-IMP-061).
 *
 * 0001 shipped a placeholder bookmark table (id, canvas_id, name,
 * viewport, created_at) that nothing could write. Rebuild it with:
 *
 * - `target_kind`: the seam for bookmarking graph/query projections
 *   (EPIC-013); only 'canvas' ships, enforced by CHECK.
 * - `sort_key`: user drag order. Row order IS the Mod+1–n shortcut
 *   binding (§8.1), REAL keys with midpoint insertion like
 *   render_order.
 * - `label` replaces `name` (matches the command vocabulary).
 * - NO foreign key on canvas_id: bookmarks address stable ids and are
 *   never deleted automatically (§8.1) — the row must survive its
 *   target's purge to present the broken state instead of silently
 *   vanishing. Target liveness is a query-time join.
 *
 * Any pre-existing rows (there should be none in the wild) carry over
 * with GAP-spaced sort keys in created_at order.
 *
 * Numbered 0005: 0004-placement-lock is being added on a parallel
 * branch.
 */
export const id = 5
export const name = 'bookmarks'
export const sql = /* sql */ `

CREATE TABLE bookmark_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id),
  target_kind TEXT NOT NULL DEFAULT 'canvas' CHECK (target_kind IN ('canvas')),
  canvas_id TEXT NOT NULL,
  label TEXT NOT NULL CHECK (length(label) > 0),
  viewport TEXT,
  sort_key REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

INSERT INTO bookmark_new
  (id, project_id, target_kind, canvas_id, label, viewport, sort_key,
   created_at, updated_at)
  SELECT id, project_id, 'canvas', canvas_id,
         CASE WHEN length(name) > 0 THEN name ELSE 'Board' END,
         viewport,
         1024.0 * (ROW_NUMBER() OVER (ORDER BY created_at, id)),
         created_at, created_at
  FROM bookmark;

DROP TABLE bookmark;
ALTER TABLE bookmark_new RENAME TO bookmark;
CREATE INDEX ix_bookmark_canvas ON bookmark(canvas_id);
`
