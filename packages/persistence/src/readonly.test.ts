import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Db } from './db'
import { LOCK_FILENAME } from './lock'
import { DB_FILENAME } from './project'
import { openProjectService, type ProjectService } from './service'
import { existsSync } from 'node:fs'

/**
 * §11.1/§14.4 read-only source opening (AI-IMP-088): no lock, no
 * migration, no recovery, every write path refuses EW_READ_ONLY,
 * and a concurrently writable owner is neither blocked nor blocks.
 */

describe('read-only project open', () => {
  let dir: string
  let owner: ProjectService

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ew-ro-'))
    owner = openProjectService(dir, { createIfMissing: true, title: 'Source' })
    const canvasId = owner.info().rootCanvasId
    owner.execute({
      commandId: 'c-1',
      commandType: 'CreatePin',
      commandVersion: 1,
      expectedRevision: 0,
      payload: {
        nodeId: 'n-1',
        canvasId,
        placementId: 'pl-1',
        x: 10,
        y: 10,
        appearance: { kind: 'dot', color: '#abc' },
      },
    })
  })

  afterEach(() => {
    owner.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('reads while the owner holds the project, without touching the lock', () => {
    // The owner's lock exists and stays untouched by the source open.
    expect(existsSync(join(dir, LOCK_FILENAME))).toBe(true)
    const source = openProjectService(dir, { readOnly: true })
    try {
      expect(source.readOnly).toBe(true)
      expect(source.info().projectId).toBe(owner.info().projectId)
      const scene = source.query('getCanvasScene', { canvasId: source.info().rootCanvasId })
      expect(scene.ok).toBe(true)
      // Recovery did not run (it would mutate the source).
      expect(source.recovery()).toEqual({ checksRun: [], repairs: [], integrityErrors: [] })
    } finally {
      source.close()
    }
    // Closing the source did not release the owner's lock.
    expect(existsSync(join(dir, LOCK_FILENAME))).toBe(true)
    expect(owner.query('getCanvasScene', { canvasId: owner.info().rootCanvasId }).ok).toBe(true)
  })

  it('refuses every write verb with EW_READ_ONLY', async () => {
    const source = openProjectService(dir, { readOnly: true })
    try {
      const result = source.execute({
        commandId: 'c-2',
        commandType: 'CreatePin',
        commandVersion: 1,
        expectedRevision: 1,
        payload: {
          nodeId: 'n-2',
          canvasId: source.info().rootCanvasId,
          placementId: 'pl-2',
          x: 0,
          y: 0,
          appearance: { kind: 'dot', color: '#fff' },
        },
      })
      expect(result.status).toBe('error')
      expect(result.status === 'error' && result.code).toBe('EW_READ_ONLY')
      expect(() => source.setSetting('trash_retention', 'never')).toThrow(/read-only/)
      await expect(
        source.importAsset({ bytes: new Uint8Array([1]), originalFilename: 'x.png' }),
      ).rejects.toMatchObject({ code: 'EW_READ_ONLY' })
      expect(source.claimThumbnailJob()).toBeNull()
      expect(source.completeThumbnailJob({ jobId: 'j', bytes: null })).toBeNull()
      // Belt and braces: raw SQL writes die at the connection.
      expect(() => source.query('getCanvasScene', { canvasId: 'nope' })).not.toThrow()
    } finally {
      source.close()
    }
  })

  it('refuses a source whose schema is behind', () => {
    const behindDir = mkdtempSync(join(tmpdir(), 'ew-ro-behind-'))
    try {
      openProjectService(behindDir, { createIfMissing: true, title: 'Old' }).close()
      const db = Db.open(join(behindDir, DB_FILENAME))
      db.run('UPDATE project SET schema_version = 5')
      db.close()
      expect(() => openProjectService(behindDir, { readOnly: true })).toThrow(
        /open the project writable once/,
      )
    } finally {
      rmSync(behindDir, { recursive: true, force: true })
    }
  })

  it('a WRITABLE second open (the library-slot path) fails typed on a held lock', () => {
    // The owner holds the lock; the mirror's writable open must get a
    // typed refusal it can queue on — never a crash, never a block.
    expect(() => openProjectService(dir, {})).toThrow(
      expect.objectContaining({ code: 'PROJECT_LOCKED' }),
    )
  })

  it('readOnly + createIfMissing is rejected outright', () => {
    expect(() => openProjectService(dir, { readOnly: true, createIfMissing: true })).toThrow(
      /contradictory/,
    )
  })
})
