/**
 * Migration 0003: FTS5 search corpora (RFC-0001 §8.3, §11.1).
 *
 * Four corpora: note titles+bodies, tag names, asset original
 * filenames, and canvas text decorations. The STRICT convention does
 * not apply to fts5 virtual tables.
 *
 * Architecture (decision recorded in AI-IMP-015):
 * - note_fts / tag_fts / asset_fts are external-content fts5 tables
 *   over their base table's implicit rowid (content_rowid defaults to
 *   'rowid'), so text is never duplicated and snippet()/highlight()
 *   read the live row. UUIDs are recovered by joining the base table
 *   on rowid at query time.
 * - canvas_text_fts cannot use external content because its source is
 *   an expression (json_extract(decoration.data, '$.text')), which
 *   fts5 content tables cannot declare; it stores its own copy of the
 *   text, keyed by decoration.rowid.
 *
 * Maintenance is via triggers on the base tables so EVERY write path
 * (handlers, lifecycle/purge work, raw recovery SQL) keeps the index
 * consistent without cooperation. Trashing is NOT an index event:
 * trashed rows stay indexed and are filtered at query time by joining
 * lifecycle_state (§8.3), so restore needs no re-index. Purge
 * (DELETE) drops index rows through the delete triggers.
 *
 * Caveat: base tables have TEXT primary keys, so their implicit
 * rowids are not VACUUM-stable. Nothing in the codebase VACUUMs; if
 * that ever changes, rebuildSearchIndex() (search.ts) must run
 * afterwards. Recovery (AI-IMP-016) uses the same primitive.
 */
export const id = 3
export const name = 'fts'
export const sql = /* sql */ `

CREATE VIRTUAL TABLE note_fts USING fts5(title, body, content='note');

CREATE TRIGGER trg_note_fts_ai AFTER INSERT ON note BEGIN
  INSERT INTO note_fts(rowid, title, body)
    VALUES (NEW.rowid, NEW.title, NEW.body);
END;

-- External-content 'delete' must replay the exact values previously
-- indexed; title/body are the only indexed columns and this trigger
-- fires on every statement that sets either, so OLD always matches.
CREATE TRIGGER trg_note_fts_au AFTER UPDATE OF title, body ON note BEGIN
  INSERT INTO note_fts(note_fts, rowid, title, body)
    VALUES ('delete', OLD.rowid, OLD.title, OLD.body);
  INSERT INTO note_fts(rowid, title, body)
    VALUES (NEW.rowid, NEW.title, NEW.body);
END;

CREATE TRIGGER trg_note_fts_ad AFTER DELETE ON note BEGIN
  INSERT INTO note_fts(note_fts, rowid, title, body)
    VALUES ('delete', OLD.rowid, OLD.title, OLD.body);
END;

CREATE VIRTUAL TABLE tag_fts USING fts5(name, content='tag');

CREATE TRIGGER trg_tag_fts_ai AFTER INSERT ON tag BEGIN
  INSERT INTO tag_fts(rowid, name) VALUES (NEW.rowid, NEW.name);
END;

CREATE TRIGGER trg_tag_fts_au AFTER UPDATE OF name ON tag BEGIN
  INSERT INTO tag_fts(tag_fts, rowid, name)
    VALUES ('delete', OLD.rowid, OLD.name);
  INSERT INTO tag_fts(rowid, name) VALUES (NEW.rowid, NEW.name);
END;

CREATE TRIGGER trg_tag_fts_ad AFTER DELETE ON tag BEGIN
  INSERT INTO tag_fts(tag_fts, rowid, name)
    VALUES ('delete', OLD.rowid, OLD.name);
END;

CREATE VIRTUAL TABLE asset_fts
  USING fts5(original_filename, content='asset');

CREATE TRIGGER trg_asset_fts_ai AFTER INSERT ON asset BEGIN
  INSERT INTO asset_fts(rowid, original_filename)
    VALUES (NEW.rowid, NEW.original_filename);
END;

CREATE TRIGGER trg_asset_fts_au
AFTER UPDATE OF original_filename ON asset BEGIN
  INSERT INTO asset_fts(asset_fts, rowid, original_filename)
    VALUES ('delete', OLD.rowid, OLD.original_filename);
  INSERT INTO asset_fts(rowid, original_filename)
    VALUES (NEW.rowid, NEW.original_filename);
END;

CREATE TRIGGER trg_asset_fts_ad AFTER DELETE ON asset BEGIN
  INSERT INTO asset_fts(asset_fts, rowid, original_filename)
    VALUES ('delete', OLD.rowid, OLD.original_filename);
END;

-- Content-stored (see header): rowid = decoration.rowid, only
-- kind='text' rows are indexed, over the JSON $.text payload.
CREATE VIRTUAL TABLE canvas_text_fts USING fts5(text);

CREATE TRIGGER trg_canvas_text_fts_ai AFTER INSERT ON decoration
WHEN NEW.kind = 'text' BEGIN
  INSERT INTO canvas_text_fts(rowid, text)
    VALUES (NEW.rowid, coalesce(json_extract(NEW.data, '$.text'), ''));
END;

-- kind is immutable through UpdateDecoration today; the OLD/NEW guard
-- keeps this correct even if that changes.
CREATE TRIGGER trg_canvas_text_fts_au AFTER UPDATE OF data, kind ON decoration
WHEN OLD.kind = 'text' OR NEW.kind = 'text' BEGIN
  DELETE FROM canvas_text_fts WHERE rowid = OLD.rowid;
  INSERT INTO canvas_text_fts(rowid, text)
    SELECT NEW.rowid, coalesce(json_extract(NEW.data, '$.text'), '')
    WHERE NEW.kind = 'text';
END;

CREATE TRIGGER trg_canvas_text_fts_ad AFTER DELETE ON decoration
WHEN OLD.kind = 'text' BEGIN
  DELETE FROM canvas_text_fts WHERE rowid = OLD.rowid;
END;

-- Index any rows that predate this migration.
INSERT INTO note_fts(note_fts) VALUES ('rebuild');
INSERT INTO tag_fts(tag_fts) VALUES ('rebuild');
INSERT INTO asset_fts(asset_fts) VALUES ('rebuild');
INSERT INTO canvas_text_fts(rowid, text)
  SELECT rowid, coalesce(json_extract(data, '$.text'), '')
  FROM decoration WHERE kind = 'text';
`
