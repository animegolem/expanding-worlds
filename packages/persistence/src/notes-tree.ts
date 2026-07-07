import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { shortCode } from '@ew/domain'
import type { Db } from './db'
import { refreshNoteMetadataBlock } from './note-metadata-db'

/**
 * Readable notes tree writer (RFC-0001 §16, AI-IMP-120). A session
 * snapshot ALWAYS carries a human-readable `notes/` tree beside the
 * binary project.sqlite so `git log -p` reads as the poor-man's event
 * log: one title-named `.md` per active note, its body INCLUDING the
 * §7.8 system metadata block (refreshed here — backup is one of the
 * block's lazy-refresh moments).
 *
 * This is the MINIMAL writer the ticket scopes: prose bodies plus the
 * metadata block, no vault-mirror `![[...]]` embeds or JSON Canvas
 * boards (those are the standing vault mirror, §16, a later ticket).
 * It reuses the shared read model rather than reimplementing §7.8.
 */

const NOTES_DIR = 'notes'
const MD_EXT = '.md'
/** Windows caps a path component at 255; stay well under and leave
 * room for a collision suffix and the extension. */
const MAX_BASE_LENGTH = 120
/** Windows reserved device names — a note literally titled "CON"
 * would otherwise write an unopenable file. */
const RESERVED = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
])

/** The read-model context the metadata refresh needs (a command
 * context minus `now`). */
interface NotesTreeCtx {
  db: Db
  projectId: string
  rootNodeId: string
  rootCanvasId: string
}

export interface NotesTreeResult {
  /** Count of `.md` files present after the write (one per active note). */
  notes: number
  /** Count of active managed assets — a commit-message fact only. */
  assets: number
}

/**
 * Sanitize a note title into a filesystem-safe base name (no extension,
 * no collision suffix). Strips path separators, the Windows-reserved
 * characters, and control codes; collapses whitespace; trims trailing
 * dots and spaces (which Windows silently drops); caps the length.
 * Returns '' when nothing printable survives — the caller substitutes a
 * stable fallback so a note is never dropped from the tree.
 */
export function safeNoteBaseName(title: string): string {
  let name = title
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex -- control chars are exactly what we strip
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (name.length > MAX_BASE_LENGTH) name = name.slice(0, MAX_BASE_LENGTH).trim()
  // Trailing dots/spaces are illegal component endings on Windows.
  name = name.replace(/[. ]+$/, '')
  if (RESERVED.has(name.toLowerCase())) name = `${name}_`
  return name
}

/**
 * Assign a collision-free `.md` filename for a note. `used` maps the
 * lowercased chosen name → the count already taken, so a case-folding
 * filesystem (macOS, Windows) never overwrites. On collision a
 * ` (n)` suffix is appended deterministically; callers MUST iterate
 * notes in a stable order so the suffix a note receives is stable
 * across runs (round-trip stability — an unchanged note keeps its file
 * name and therefore produces no git diff).
 */
export function assignNoteFilename(
  base: string,
  fallback: string,
  used: Map<string, number>,
): string {
  const root = base.length > 0 ? base : fallback
  let candidate = root
  let key = candidate.toLowerCase()
  let n = 1
  while (used.has(key)) {
    n += 1
    candidate = `${root} (${n})`
    key = candidate.toLowerCase()
  }
  used.set(key, n)
  return candidate + MD_EXT
}

/**
 * Regenerate the readable `notes/` tree for the project, refreshing
 * each active note's §7.8 metadata block in the DB first (backup is a
 * lazy-refresh moment) so the on-disk body matches the persisted one.
 * Files whose content is unchanged are left untouched (stable mtime,
 * no needless IO); `.md` files for notes that no longer exist are
 * removed so the tree stays a faithful mirror. Returns the note and
 * asset counts for the commit message.
 *
 * Runs entirely on the service's single writer connection — the
 * caller (utility process) owns the only handle, honoring §11.4
 * single-writer discipline.
 */
export function writeNotesTree(ctx: NotesTreeCtx, dir: string): NotesTreeResult {
  const notesDir = join(dir, NOTES_DIR)
  mkdirSync(notesDir, { recursive: true })

  // Stable order: title_key then id, so collision suffixes are
  // deterministic across runs.
  const notes = ctx.db.all<{ id: string; title: string }>(
    `SELECT id, title FROM note
     WHERE project_id = ? AND lifecycle_state = 'active'
     ORDER BY title_key, id`,
    ctx.projectId,
  )

  // Refresh every metadata block in one transaction (each is a raw
  // body UPDATE that never bumps updated_at, never enters undo).
  ctx.db.transaction(() => {
    for (const note of notes) refreshNoteMetadataBlock(ctx, note.id)
  })

  const used = new Map<string, number>()
  const written = new Set<string>()
  for (const note of notes) {
    const filename = assignNoteFilename(safeNoteBaseName(note.title), shortCode(note.id), used)
    written.add(filename)
    const row = ctx.db.get<{ body: string }>('SELECT body FROM note WHERE id = ?', note.id)
    const body = row?.body ?? ''
    // A single trailing newline — POSIX-friendly and diff-stable.
    const content = body.endsWith('\n') ? body : `${body}\n`
    const path = join(notesDir, filename)
    // Skip identical writes so unchanged notes leave the file (and its
    // git blob) untouched.
    if (existsSync(path) && readFileSync(path, 'utf8') === content) continue
    writeFileSync(path, content, 'utf8')
  }

  // Orphan sweep: drop `.md` files for notes that were renamed away or
  // trashed since the last snapshot, so the tree mirrors the project.
  for (const entry of readdirSync(notesDir)) {
    if (entry.endsWith(MD_EXT) && !written.has(entry)) {
      rmSync(join(notesDir, entry), { force: true })
    }
  }

  const assets =
    ctx.db.get<{ n: number }>(
      `SELECT count(*) AS n FROM asset
       WHERE project_id = ? AND lifecycle_state = 'active'`,
      ctx.projectId,
    )?.n ?? 0

  return { notes: notes.length, assets }
}
