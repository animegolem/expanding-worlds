import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import type { EwApi } from '../src/preload/index'

declare global {
  interface Window {
    ew: EwApi
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

  // Ctrl-wheel (pinch) zooms at a point; the camera must move off
  // identity (§6.9: plain wheel pans — covered by the mapping test).
  await win.mouse.move(box.x + 200, box.y + 200)
  await win.keyboard.down('Control')
  await win.mouse.wheel(0, -400)
  await win.keyboard.up('Control')
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

test('§6.9 camera input mapping: pinch zooms at pointer, scroll pans, cursors track state', async () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'ew-e2e-input-'))
  const app = await electron.launch({
    args: ['out/main/index.cjs'],
    env: { ...process.env, EW_PROJECT_DIR: projectDir },
  })
  const win = await app.firstWindow()
  await win.waitForFunction(() => window.__ewDebug !== undefined)
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  // Pinch: ctrl-flagged wheel zooms and keeps the world point under
  // the pointer invariant (synthetic event pins the exact deltas).
  const pinch = await win.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="canvas-host"] canvas')!
    const rect = canvas.getBoundingClientRect()
    // MouseEvent client coords coerce to integers; derive the local
    // point from the coerced values so the anchor math is exact.
    const clientX = Math.round(rect.left + 240)
    const clientY = Math.round(rect.top + 180)
    const at = { x: clientX - rect.left, y: clientY - rect.top }
    const before = window.__ewDebug!.camera()
    const worldBefore = {
      x: before.x + at.x / before.zoom,
      y: before.y + at.y / before.zoom,
    }
    canvas.dispatchEvent(
      new WheelEvent('wheel', {
        clientX,
        clientY,
        deltaY: -50,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    )
    const after = window.__ewDebug!.camera()
    const worldAfter = {
      x: after.x + at.x / after.zoom,
      y: after.y + at.y / after.zoom,
    }
    return { before, after, worldBefore, worldAfter }
  })
  expect(pinch.after.zoom).toBeGreaterThan(pinch.before.zoom)
  expect(pinch.worldAfter.x).toBeCloseTo(pinch.worldBefore.x, 5)
  expect(pinch.worldAfter.y).toBeCloseTo(pinch.worldBefore.y, 5)

  // Two-finger scroll: plain wheel pans; zoom is untouched.
  const beforePan = await win.evaluate(() => window.__ewDebug!.camera())
  await win.mouse.move(box.x + 200, box.y + 200)
  await win.mouse.wheel(60, 80)
  const afterPan = await win.evaluate(() => window.__ewDebug!.camera())
  expect(afterPan.zoom).toBeCloseTo(beforePan.zoom, 5)
  expect(afterPan.x).toBeCloseTo(beforePan.x + 60 / beforePan.zoom, 3)
  expect(afterPan.y).toBeCloseTo(beforePan.y + 80 / beforePan.zoom, 3)

  // Cursor feedback: grab while Space is held, grabbing during the
  // drag, default again after release.
  const cursorOf = () =>
    win.evaluate(
      () =>
        document.querySelector<HTMLCanvasElement>('[data-testid="canvas-host"] canvas')!.style
          .cursor,
    )
  await win.mouse.move(box.x + 150, box.y + 150)
  await win.keyboard.down('Space')
  expect(await cursorOf()).toBe('grab')
  await win.mouse.down()
  await win.mouse.move(box.x + 100, box.y + 120, { steps: 2 })
  expect(await cursorOf()).toBe('grabbing')
  await win.mouse.up()
  await win.keyboard.up('Space')
  await win.mouse.move(box.x + 155, box.y + 155)
  expect(await cursorOf()).toBe('default')

  // Handle hover: select a placement, hover its resize handle, and
  // the directional cursor from gestures-ui wins over the base cursor.
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
    const nodeId = crypto.randomUUID()
    await run('CreateNode', { nodeId })
    await run('CreatePlacement', {
      placementId: crypto.randomUUID(),
      canvasId: window.__ewDebug!.canvasId(),
      nodeId,
      x: 300,
      y: 300,
      width: 80,
      height: 80,
    })
  })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)
  // Camera moved during the pan assertions above — select via world
  // coords projected through the current camera.
  const target = await win.evaluate(() => {
    const cam = window.__ewDebug!.camera()
    return { x: (300 - cam.x) * cam.zoom, y: (300 - cam.y) * cam.zoom }
  })
  await win.mouse.click(box.x + target.x, box.y + target.y)
  await win.waitForFunction(() => window.__ewDebug!.selection().length === 1)
  const handle = await win.evaluate(
    () => window.__ewGestureDebug!.handles().find((h) => h.kind === 'resize' && h.dir === 'se')!,
  )
  await win.mouse.move(box.x + handle.x, box.y + handle.y)
  expect(await cursorOf()).toBe('nwse-resize')

  await app.close()
})
