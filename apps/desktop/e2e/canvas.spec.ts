import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import type { EwApi } from '../src/preload/index'
import type { SceneDecoration } from '@ew/canvas-engine'

declare global {
  interface Window {
    ew: EwApi
    __ewDebug?: {
      sceneStats: () => { total: number; placements: number; decorations: number }
      canvasId: () => string
      camera: () => { x: number; y: number; zoom: number }
      selection: () => string[]
      interactionState: () => string
      activeTool: () => string
      decorations: () => SceneDecoration[]
      decorationEndpoints: (id: string) => { x1: number; y1: number; x2: number; y2: number } | null
      decorationVisible: (id: string) => boolean | null
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

test('controller: pan, zoom-at-cursor, marquee selection, camera persistence', async () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'ew-e2e-controller-'))
  const app = await electron.launch({
    args: ['out/main/index.cjs'],
    env: { ...process.env, EW_PROJECT_DIR: projectDir },
  })
  const win = await app.firstWindow()
  await win.waitForFunction(() => window.__ewDebug !== undefined)

  // Seed two dot placements through the Project API.
  await win.evaluate(async () => {
    const project = await window.ew.project.query('getProject')
    if (!project.ok) throw new Error(project.message)
    const { id: projectId } = project.result as { id: string }
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
    for (const [x, y] of [
      [150, 150],
      [260, 200],
    ]) {
      const nodeId = crypto.randomUUID()
      await run('CreateNode', { nodeId })
      await run('CreatePlacement', {
        placementId: crypto.randomUUID(),
        canvasId: window.__ewDebug!.canvasId(),
        nodeId,
        x,
        y,
        width: 40,
        height: 40,
      })
    }
  })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 2)

  const box = (await win.getByTestId('canvas-host').boundingBox())!

  // Marquee over both placements (camera is identity: world = screen).
  await win.mouse.move(box.x + 80, box.y + 80)
  await win.mouse.down()
  await win.mouse.move(box.x + 330, box.y + 280, { steps: 5 })
  await win.mouse.up()
  const selected = await win.evaluate(() => window.__ewDebug!.selection())
  expect(selected).toHaveLength(2)

  // Wheel-zoom at a point; the camera must move off identity.
  await win.mouse.move(box.x + 200, box.y + 200)
  await win.mouse.wheel(0, -400)
  const zoomed = await win.evaluate(() => window.__ewDebug!.camera())
  expect(zoomed.zoom).toBeGreaterThan(1)

  // Space-drag pans.
  await win.keyboard.down('Space')
  await win.mouse.move(box.x + 200, box.y + 200)
  await win.mouse.down()
  await win.mouse.move(box.x + 120, box.y + 160, { steps: 3 })
  await win.mouse.up()
  await win.keyboard.up('Space')
  const panned = await win.evaluate(() => window.__ewDebug!.camera())
  expect(panned.x).not.toBe(zoomed.x)

  // The debounced SetCanvasCamera lands; a reload restores the view.
  await expect
    .poll(
      () =>
        win.evaluate(async () => {
          const project = await window.ew.project.query('getProject')
          if (!project.ok) return 'no-project'
          const { rootNodeId } = project.result as { rootNodeId: string }
          const canvas = await window.ew.project.query('getCanvasByNode', { nodeId: rootNodeId })
          if (!canvas.ok) return 'no-canvas'
          return (canvas.result as { camera: string }).camera
        }),
      { timeout: 5_000 },
    )
    .toBe(JSON.stringify(panned))
  await win.reload()
  await win.waitForFunction(() => window.__ewDebug !== undefined)
  const restored = await win.evaluate(() => window.__ewDebug!.camera())
  expect(restored.x).toBeCloseTo(panned.x, 5)
  expect(restored.zoom).toBeCloseTo(panned.zoom, 5)

  await app.close()
})
