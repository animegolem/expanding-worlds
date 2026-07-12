import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProject, type ProjectHandle } from './project'
import { QueryRegistry, registerCoreQueries } from './queries'
import {
  decodeTrashRetention,
  GC_ELIGIBILITY_KEY,
  getProjectSetting,
  registerSettingsQueries,
  setProjectSetting,
  TRASH_RETENTION_KEY,
} from './settings'

let dir: string
let handle: ProjectHandle
let queries: QueryRegistry

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-settings-'))
  handle = createProject(dir, 'Settings Test')
  queries = new QueryRegistry()
  registerCoreQueries(queries)
  registerSettingsQueries(queries)
})

afterEach(() => {
  vi.restoreAllMocks()
  handle.close()
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
})

function getSettings(): Record<string, unknown> {
  const result = queries.run(
    {
      db: handle.db,
      projectId: handle.projectId,
      rootNodeId: handle.rootNodeId,
      rootCanvasId: handle.rootCanvasId,
    },
    'getSettings',
    undefined,
  )
  expect(result.ok).toBe(true)
  return (result as { ok: true; result: Record<string, unknown> }).result
}

describe('project-tier settings (§11.5, AI-IMP-074)', () => {
  it('round-trips JSON values through set and getSettings', () => {
    setProjectSetting(handle.db, handle.projectId, 'vault_mirror', true)
    setProjectSetting(handle.db, handle.projectId, 'session_snapshots', 'commit')
    const settings = getSettings()
    expect(settings['vault_mirror']).toBe(true)
    expect(settings['session_snapshots']).toBe('commit')
    // createProject seeds trash retention (§9.1); it reads back too.
    expect(settings['trash_retention']).toBe('never')
  })

  it('keeps the internal GC clock out of renderer-facing settings', () => {
    setProjectSetting(handle.db, handle.projectId, GC_ELIGIBILITY_KEY, {
      hash: { firstSeenAt: '2026-01-01T00:00:00.000Z' },
    })
    expect(getSettings()).not.toHaveProperty(GC_ELIGIBILITY_KEY)
    expect(
      getProjectSetting(handle.db, handle.projectId, GC_ELIGIBILITY_KEY, {}),
    ).toHaveProperty('hash')
  })

  it('overwrites in place: one row per key', () => {
    setProjectSetting(handle.db, handle.projectId, 'session_snapshots', 'commit')
    setProjectSetting(handle.db, handle.projectId, 'session_snapshots', 'off')
    expect(getSettings()['session_snapshots']).toBe('off')
    const rows = handle.db.all(
      "SELECT key FROM settings WHERE project_id = ? AND key = 'session_snapshots'",
      handle.projectId,
    )
    expect(rows).toHaveLength(1)
  })

  it('stays outside command history: no command_log row, no revision bump', () => {
    const before = handle.db.get<{ project_revision: number }>(
      'SELECT project_revision FROM project WHERE id = ?',
      handle.projectId,
    )!.project_revision
    setProjectSetting(handle.db, handle.projectId, 'vault_mirror', false)
    const after = handle.db.get<{ project_revision: number }>(
      'SELECT project_revision FROM project WHERE id = ?',
      handle.projectId,
    )!.project_revision
    expect(after).toBe(before)
    const logged = handle.db.get<{ n: number }>(
      'SELECT COUNT(*) AS n FROM command_log WHERE project_id = ?',
      handle.projectId,
    )!.n
    expect(logged).toBe(0)
  })

  it('rejects empty keys and undefined values', () => {
    expect(() => setProjectSetting(handle.db, handle.projectId, '', 1)).toThrow(/non-empty/)
    expect(() =>
      setProjectSetting(handle.db, handle.projectId, 'k', undefined),
    ).toThrow(/JSON-serializable/)
  })

  it('falls back visibly for malformed JSON and parseable-but-invalid values', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    handle.db.run(
      'UPDATE settings SET value = ? WHERE project_id = ? AND key = ?',
      '{',
      handle.projectId,
      TRASH_RETENTION_KEY,
    )
    expect(
      getProjectSetting(
        handle.db,
        handle.projectId,
        TRASH_RETENTION_KEY,
        'never',
        decodeTrashRetention,
      ),
    ).toBe('never')

    handle.db.run(
      'UPDATE settings SET value = ? WHERE project_id = ? AND key = ?',
      JSON.stringify('weekly'),
      handle.projectId,
      TRASH_RETENTION_KEY,
    )
    expect(
      getProjectSetting(
        handle.db,
        handle.projectId,
        TRASH_RETENTION_KEY,
        'never',
        decodeTrashRetention,
      ),
    ).toBe('never')
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('contains corruption per row in getSettings', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    setProjectSetting(handle.db, handle.projectId, 'healthy', { enabled: true })
    handle.db.run(
      'INSERT INTO settings (project_id, key, value) VALUES (?, ?, ?)',
      handle.projectId,
      'malformed_unknown',
      '{',
    )
    handle.db.run(
      'UPDATE settings SET value = ? WHERE project_id = ? AND key = ?',
      JSON.stringify('weekly'),
      handle.projectId,
      TRASH_RETENTION_KEY,
    )

    const settings = getSettings()
    expect(settings['healthy']).toEqual({ enabled: true })
    expect(settings[TRASH_RETENTION_KEY]).toBe('never')
    expect(settings).not.toHaveProperty('malformed_unknown')
    expect(warn).toHaveBeenCalledTimes(2)
  })
})

describe('project-setting storage adoption guard (AI-IMP-251)', () => {
  it('keeps settings-table SQL inside settings.ts', () => {
    for (const file of ['./project.ts', './queries-lifecycle.ts', './handlers/lifecycle.ts']) {
      const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8')
      expect(source, `${file} bypasses the project-setting codec`).not.toMatch(
        /(?:FROM|INTO|UPDATE)\s+settings\b/i,
      )
    }
  })
})
