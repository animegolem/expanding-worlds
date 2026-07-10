import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProject, type ProjectHandle } from './project'
import { QueryRegistry, registerCoreQueries } from './queries'
import { registerSettingsQueries, setProjectSetting } from './settings'

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
})
