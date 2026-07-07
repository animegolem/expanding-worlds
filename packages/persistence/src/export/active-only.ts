import { Db } from '../db'
import { computeGcEligibleBlobs } from '../gc'

/**
 * The §16 active-content-only export variant (AI-IMP-157): strip
 * trashed records from the TEMP database copy — never the live one —
 * in FK-safe child→parent order, then drop assets the filter left
 * unreferenced (the GC mark encodes the real reference rules; reuse
 * it rather than reinvent them). The pass ends with SQLite's own
 * foreign_key_check: an inconsistency fails the export loudly rather
 * than shipping an archive that cannot reimport (§16 — the artist's
 * promise cuts both ways).
 *
 * Semantics mirrors §9.7 purge where trashed records are load-bearing
 * for active ones: a link whose TARGET note drops becomes a broken
 * link (explicit recreate on the other side), an active node whose
 * note drops detaches, connector anchors on dropped placements
 * release. Everything else simply does not travel.
 */
export function filterActiveOnly(tempDbPath: string): void {
  const db = Db.open(tempDbPath)
  try {
    db.exec('BEGIN')

    // Connector anchors on departing placements release first
    // (mirrors releaseConnectorAnchors) so the placement delete
    // cannot orphan an FK.
    db.exec(`
      UPDATE decoration SET anchor_start_placement_id = NULL
        WHERE anchor_start_placement_id IN (
          SELECT p.id FROM placement p
          LEFT JOIN canvas c ON c.id = p.canvas_id
          LEFT JOIN node n ON n.id = p.node_id
          WHERE p.lifecycle_state = 'trashed'
             OR c.lifecycle_state = 'trashed'
             OR n.lifecycle_state = 'trashed');
      UPDATE decoration SET anchor_end_placement_id = NULL
        WHERE anchor_end_placement_id IN (
          SELECT p.id FROM placement p
          LEFT JOIN canvas c ON c.id = p.canvas_id
          LEFT JOIN node n ON n.id = p.node_id
          WHERE p.lifecycle_state = 'trashed'
             OR c.lifecycle_state = 'trashed'
             OR n.lifecycle_state = 'trashed');

      DELETE FROM decoration
        WHERE lifecycle_state = 'trashed'
           OR canvas_id IN (SELECT id FROM canvas WHERE lifecycle_state = 'trashed');
      DELETE FROM decoration_group
        WHERE canvas_id IN (SELECT id FROM canvas WHERE lifecycle_state = 'trashed');

      -- frame_member rows cascade off their placements (0007).
      DELETE FROM placement
        WHERE lifecycle_state = 'trashed'
           OR canvas_id IN (SELECT id FROM canvas WHERE lifecycle_state = 'trashed')
           OR node_id IN (SELECT id FROM node WHERE lifecycle_state = 'trashed');

      DELETE FROM tag_assignment
        WHERE node_id IN (SELECT id FROM node WHERE lifecycle_state = 'trashed')
           OR tag_id IN (SELECT id FROM tag WHERE lifecycle_state = 'trashed');
      DELETE FROM tag WHERE lifecycle_state = 'trashed';

      -- Bookmarks have no canvas FK by design (0005), so their delete
      -- predicate must MATCH the canvas delete predicate below —
      -- including owner-trashed boards — or the export ships bookmarks
      -- to canvases it removed (Codex round 3).
      DELETE FROM bookmark
        WHERE canvas_id IN (
          SELECT c.id FROM canvas c
          LEFT JOIN node owner ON owner.id = c.node_id
          WHERE c.lifecycle_state = 'trashed'
             OR owner.lifecycle_state = 'trashed');

      -- Links FROM a dropped note do not travel; links TO one break
      -- (§9.7 purge semantics: broken keeps its face, offers recreate).
      DELETE FROM link
        WHERE source_note_id IN (SELECT id FROM note WHERE lifecycle_state = 'trashed');
      UPDATE link SET
          state = 'broken',
          display_text = COALESCE(
            display_text,
            (SELECT title FROM note WHERE note.id = link.target_note_id)),
          target_note_id = NULL,
          target_title_key = NULL
        WHERE target_note_id IN (SELECT id FROM note WHERE lifecycle_state = 'trashed');

      DELETE FROM canvas
        WHERE lifecycle_state = 'trashed'
           OR node_id IN (SELECT id FROM node WHERE lifecycle_state = 'trashed');

      -- An active node whose note drops detaches (§9.4's In-Trash
      -- affordance cannot travel without the note).
      UPDATE node SET note_id = NULL
        WHERE note_id IN (SELECT id FROM note WHERE lifecycle_state = 'trashed');

      DELETE FROM node WHERE lifecycle_state = 'trashed';
      DELETE FROM note WHERE lifecycle_state = 'trashed';

      DELETE FROM derivative_jobs
        WHERE asset_id IN (SELECT id FROM asset WHERE lifecycle_state = 'trashed');
      DELETE FROM asset WHERE lifecycle_state = 'trashed';
    `)

    // Assets the filter left unreferenced: the GC mark is the single
    // source of reference truth (appearances, backgrounds, note-body
    // embeds, jobs, leases).
    const project = db.get<{ id: string; root_node_id: string }>(
      'SELECT id, root_node_id FROM project',
    )
    const rootCanvas = db.get<{ id: string }>(
      'SELECT id FROM canvas WHERE node_id = ?',
      project?.root_node_id ?? '',
    )
    if (project && rootCanvas) {
      const eligible = computeGcEligibleBlobs({
        db,
        projectId: project.id,
        rootNodeId: project.root_node_id,
        rootCanvasId: rootCanvas.id,
      })
      for (const hash of eligible) {
        db.run('DELETE FROM derivative_jobs WHERE asset_id IN (SELECT id FROM asset WHERE content_hash = ?)', hash)
        db.run('DELETE FROM asset WHERE content_hash = ?', hash)
      }
    }

    db.exec('COMMIT')
  } catch (err) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // Rollback failure is subsumed by the original error.
    }
    db.close()
    throw err
  }

  // The loud guard: a filtered copy that cannot satisfy its own FKs
  // must never leave the building.
  const violations = db.all('PRAGMA foreign_key_check')
  if (violations.length > 0) {
    db.close()
    throw new Error(
      `active-only filter left ${violations.length} foreign-key violation(s): ` +
        JSON.stringify(violations[0]),
    )
  }
  db.exec('VACUUM')
  db.close()
}
