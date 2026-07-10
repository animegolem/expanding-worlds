import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { uuidv7 } from '@ew/domain'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DB_FILENAME } from './project'
import { openProjectService, type ProjectService } from './service'

/**
 * §11.4 involuntary checkpoint (AI-IMP-096): checkpoint() truncates
 * the WAL so the .sqlite is complete at rest — a cloud daemon must
 * never sync a live -wal. A read-only source no-ops.
 */

const WAL_SUFFIX = '-wal'

function walSize(dir: string): number {
  const wal = join(dir, DB_FILENAME + WAL_SUFFIX)
  return existsSync(wal) ? statSync(wal).size : 0
}

describe('WAL checkpoint on the primary', () => {
  let dir: string
  let service: ProjectService

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ew-checkpoint-'))
    service = openProjectService(dir, { createIfMissing: true, title: 'Checkpoint' })
  })

  afterEach(() => {
    service.close()
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  })

  it('truncates the -wal file after writes', () => {
    const { projectId, rootCanvasId: canvasId } = service.info()
    // Commit a burst of pins so committed pages accumulate in the WAL.
    for (let i = 0; i < 40; i += 1) {
      const result = service.execute({
        commandId: uuidv7(),
        projectId,
        commandType: 'CreatePin',
        commandVersion: 1,
        issuedAt: new Date().toISOString(),
        expectedRevision: service.info().revision,
        payload: {
          nodeId: uuidv7(),
          canvasId,
          placementId: uuidv7(),
          x: i,
          y: i,
          appearance: { kind: 'dot', color: '#abc' },
        },
      })
      expect(result.status).toBe('committed')
    }

    // WAL mode holds committed pages in the -wal until a checkpoint.
    const before = walSize(dir)
    expect(before).toBeGreaterThan(0)

    service.checkpoint()

    // TRUNCATE resets the -wal to zero bytes (kept, not deleted, while
    // the connection stays open) — the .sqlite is now complete at rest.
    expect(walSize(dir)).toBe(0)

    // The data survived the checkpoint: it moved into the main db file.
    expect(service.query('getCanvasScene', { canvasId }).ok).toBe(true)
  })

  it('is idempotent — a checkpoint with nothing pending stays at zero', () => {
    service.checkpoint()
    expect(walSize(dir)).toBe(0)
    service.checkpoint()
    expect(walSize(dir)).toBe(0)
  })
})

describe('WAL checkpoint on a read-only source', () => {
  it('no-ops without touching the source (no lock, no write)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ew-checkpoint-ro-'))
    const owner = openProjectService(dir, { createIfMissing: true, title: 'Source' })
    const info = owner.info()
    owner.execute({
      commandId: uuidv7(),
      projectId: info.projectId,
      commandType: 'CreatePin',
      commandVersion: 1,
      issuedAt: new Date().toISOString(),
      expectedRevision: info.revision,
      payload: {
        nodeId: uuidv7(),
        canvasId: info.rootCanvasId,
        placementId: uuidv7(),
        x: 1,
        y: 1,
        appearance: { kind: 'dot', color: '#abc' },
      },
    })
    const source = openProjectService(dir, { readOnly: true })
    try {
      // A read-only checkpoint must not throw and must not disturb the
      // owner's live WAL (it holds no lock to checkpoint under).
      const before = walSize(dir)
      expect(() => source.checkpoint()).not.toThrow()
      expect(walSize(dir)).toBe(before)
      expect(source.query('getCanvasScene', { canvasId: source.info().rootCanvasId }).ok).toBe(true)
    } finally {
      source.close()
      owner.close()
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    }
  })
})
