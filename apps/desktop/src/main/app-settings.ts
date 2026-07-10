import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * CA-015 (AI-IMP-237): pure, electron-free app-settings-file logic so
 * it unit-tests without an Electron `app` instance. `main/index.ts`
 * owns the IPC/electron wiring (cross-window broadcast, the in-memory
 * cache, the once-only "recovered" consumption); this module owns
 * only "what does the file on disk look like, and how do we change it
 * without ever leaving it half-written."
 *
 * Previously the file was rewritten whole, in place — a crash or
 * full disk mid-write left truncated JSON that the next launch's
 * `JSON.parse` failure silently turned into empty settings (theme,
 * library designation, first-run state, navigation scheme all reset,
 * unexplained). Two fixes:
 *  - Writes go through a pid-suffixed temp file in the same
 *    directory, fsync'd before an atomic rename over the target, so
 *    the file on disk is always either the complete old value or the
 *    complete new one.
 *  - A load that finds a file present but unparseable (the only way
 *    a truncated write can still surface — e.g. a file from a build
 *    that predates this fix) preserves it beside itself as
 *    `<path>.corrupt-<ts>` for inspection and reports the recovery
 *    instead of quietly discarding the distinction between "no file"
 *    and "broken file."
 */

export interface LoadedAppSettings {
  settings: Record<string, unknown>
  /** True only when a file existed but failed to parse as a settings
   * object. False for "no file at all" (fresh install/env override) —
   * that is not a failure and must not announce itself. */
  recovered: boolean
}

/** Load the settings object at `path`. */
export function loadAppSettingsFile(path: string): LoadedAppSettings {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return { settings: {}, recovered: false }
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('app-settings.json did not contain an object')
    }
    return { settings: parsed as Record<string, unknown>, recovered: false }
  } catch {
    try {
      renameSync(path, `${path}.corrupt-${Date.now()}`)
    } catch {
      // Best-effort preservation only; proceeding with defaults is
      // still strictly better than staying on unreadable settings.
    }
    return { settings: {}, recovered: true }
  }
}

/**
 * Persist `settings` to `path` atomically: write a pid-suffixed temp
 * file in the same directory, fsync it, then rename over the target.
 * A crash or full disk during the write leaves the OLD file at `path`
 * intact — the rename is the only step that touches it, and rename is
 * atomic on the same filesystem.
 */
export function writeAppSettingsFile(path: string, settings: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmpPath = `${path}.tmp-${process.pid}`
  const data = JSON.stringify(settings, null, 2)
  const fd = openSync(tmpPath, 'w')
  try {
    writeSync(fd, data)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(tmpPath, path)
}
