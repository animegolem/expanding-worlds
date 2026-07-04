import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import type { EwApi } from '../src/preload/index'

declare global {
  interface Window {
    ew: EwApi
    __ewDebug?: {
      sceneStats: () => { total: number; placements: number; decorations: number }
      canvasId: () => string
    }
  }
}

/**
 * AI-IMP-017 acceptance: the root canvas mounts on open, placements
 * created through the Project API appear via project-changed re-query
 * without reload, and trashing the node removes them.
 */

test('canvas host projects the root canvas and stays in sync', async () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'ew-e2e-canvas-'))
  const app = await electron.launch({
    args: ['out/main/index.cjs'],
    env: { ...process.env, EW_PROJECT_DIR: projectDir },
  })
  const win = await app.firstWindow()
  await expect(win.getByTestId('canvas-host')).toBeVisible()

  // The host mounts asynchronously after the project opens.
  await win.waitForFunction(() => window.__ewDebug !== undefined)
  const initial = await win.evaluate(() => window.__ewDebug!.sceneStats())
  expect(initial).toEqual({ total: 0, placements: 0, decorations: 0 })

  const { nodeId } = await win.evaluate(async () => {
    const project = await window.ew.project.query('getProject')
    if (!project.ok) throw new Error(project.message)
    const { id: projectId } = project.result as { id: string }
    const nodeId = crypto.randomUUID()
    const run = async (commandType: string, payload: unknown) => {
      const result = await window.ew.project.execute({
        commandId: crypto.randomUUID(),
        projectId,
        commandType,
        commandVersion: 1,
        issuedAt: new Date().toISOString(),
        payload,
      })
      if (result.status !== 'committed') throw new Error(`${commandType}: ${result.status}`)
    }
    await run('CreateNode', { nodeId })
    await run('SetNodeAppearance', {
      nodeId,
      appearance: { kind: 'dot', color: '#ff7700' },
    })
    await run('CreatePlacement', {
      placementId: crypto.randomUUID(),
      canvasId: window.__ewDebug!.canvasId(),
      nodeId,
      x: 120,
      y: 80,
    })
    return { nodeId }
  })

  // No reload: the pushed project-changed events drive the re-query.
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)

  await win.evaluate(async (trashNodeId) => {
    const project = await window.ew.project.query('getProject')
    if (!project.ok) throw new Error(project.message)
    const { id: projectId } = project.result as { id: string }
    const result = await window.ew.project.execute({
      commandId: crypto.randomUUID(),
      projectId,
      commandType: 'TrashNode',
      commandVersion: 1,
      issuedAt: new Date().toISOString(),
      payload: { nodeId: trashNodeId },
    })
    if (result.status !== 'committed') throw new Error(`TrashNode: ${result.status}`)
  }, nodeId)

  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 0)

  // ew-asset:// serves managed blobs to the sandboxed page by content
  // hash — and nothing else.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQAB' +
      'h6FO1AAAAABJRU5ErkJggg==',
    'base64',
  )
  const hash = createHash('sha256').update(png).digest('hex')
  mkdirSync(join(projectDir, 'assets', hash.slice(0, 2)), { recursive: true })
  writeFileSync(join(projectDir, 'assets', hash.slice(0, 2), hash), png)

  const served = await win.evaluate(async (blobHash) => {
    const good = await fetch(`ew-asset://${blobHash}`)
    const bytes = good.ok ? (await good.arrayBuffer()).byteLength : -1
    const missing = await fetch(`ew-asset://${'0'.repeat(64)}`)
    const malformed = await fetch('ew-asset://../../etc/passwd').catch(() => null)
    return {
      goodStatus: good.status,
      bytes,
      cache: good.headers.get('cache-control'),
      missingStatus: missing.status,
      malformedStatus: malformed?.status ?? 'rejected',
    }
  }, hash)
  expect(served.goodStatus).toBe(200)
  expect(served.bytes).toBe(png.byteLength)
  expect(served.cache).toContain('immutable')
  expect(served.missingStatus).toBe(404)
  expect([400, 404, 'rejected']).toContain(served.malformedStatus)

  await app.close()
})
