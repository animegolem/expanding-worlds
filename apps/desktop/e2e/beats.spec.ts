import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type Page } from '@playwright/test'
import type { EwApi } from '../src/preload/index'

declare global {
  interface Window {
    ew: EwApi
    __ewGestureDebug?: {
      zoneAt: (x: number, y: number) => string
      labelTexts: () => string[]
    }
  }
}

/**
 * AI-IMP-151 acceptance: the §8.2 interaction-physics beats decorate the
 * DISPLAY layer only. Driven through real pointer gestures and read via
 * the sleep-free `__ewDebug.beat` seams (composited scale over the model
 * transform, live beat flags) — never pixel diffing, never a bare sleep.
 * The no-beat gestures (resize) are proven beat-free the same way.
 */

async function launch(prefix: string) {
  const projectDir = mkdtempSync(join(tmpdir(), prefix))
  const app = await electron.launch({
    args: ['out/main/index.cjs'],
    env: { ...process.env, EW_PROJECT_DIR: projectDir },
  })
  const win = await app.firstWindow()
  await win.waitForFunction(
    () => window.__ewDebug !== undefined && window.__ewGestureDebug !== undefined,
  )
  return { app, win }
}

async function runCommand(win: Page, commandType: string, payload: unknown): Promise<void> {
  await win.evaluate(
    async ({ commandType, payload }) => {
      const project = await window.ew.project.query('getProject')
      if (!project.ok) throw new Error(project.message)
      const { id: projectId } = project.result as { id: string }
      const result = await window.ew.project.execute({
        commandId: window.ew.util.newId(),
        projectId,
        commandType,
        commandVersion: 1,
        issuedAt: new Date().toISOString(),
        payload,
      })
      if (result.status !== 'committed') throw new Error(`${commandType}: ${result.status}`)
    },
    { commandType, payload },
  )
}

async function seedPlacement(
  win: Page,
  at: { x: number; y: number },
  size = 40,
): Promise<string> {
  const nodeId = crypto.randomUUID()
  const placementId = crypto.randomUUID()
  await runCommand(win, 'CreateNode', { nodeId })
  await runCommand(win, 'CreatePlacement', {
    placementId,
    canvasId: await win.evaluate(() => window.__ewDebug!.canvasId()),
    nodeId,
    x: at.x,
    y: at.y,
    width: size,
    height: size,
  })
  return placementId
}

const beatScale = (win: Page, id: string) =>
  win.evaluate((id) => window.__ewDebug!.beat.scale(id), id)

test('grab lifts (+~1%, shadow) and release settles back — one beat, ±1% cap', async () => {
  const { app, win } = await launch('ew-e2e-beats-lift-')
  const id = await seedPlacement(win, { x: 150, y: 150 })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  await win.mouse.click(box.x + 150, box.y + 150)
  await win.waitForFunction(() => window.__ewDebug!.selection().length === 1)

  // Grab and drag — hold the pointer down while we observe the lift.
  await win.mouse.move(box.x + 150, box.y + 150)
  await win.mouse.down()
  await win.mouse.move(box.x + 210, box.y + 190, { steps: 6 })

  await expect.poll(() => win.evaluate((id) => window.__ewDebug!.beat.dragging(id), id)).toBe(true)
  // Lifts above rest, and NEVER past the +1% cap (§8.2: scale rides ±1%).
  await expect.poll(() => beatScale(win, id)).toBeGreaterThan(1.0001)
  const lifted = (await beatScale(win, id))!
  expect(lifted).toBeLessThanOrEqual(1.01 + 1e-6)
  // The drag shadow is up while lifted.
  expect(await win.evaluate((id) => window.__ewDebug!.beat.shadow(id), id)).toBeGreaterThan(0)

  // Release → SETTLE back to exactly rest (no bounce: never dips below 1).
  await win.mouse.up()
  await expect.poll(() => win.evaluate((id) => window.__ewDebug!.beat.dragging(id), id)).toBe(false)
  await expect.poll(() => beatScale(win, id)).toBeCloseTo(1, 3)
  await app.close()
})

test('resize is BEAT-FREE — an item gesture that never lifts (no-beat list)', async () => {
  const { app, win } = await launch('ew-e2e-beats-nobeat-')
  const id = await seedPlacement(win, { x: 200, y: 200 })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  await win.mouse.click(box.x + 200, box.y + 200)
  await win.waitForFunction(() => window.__ewDebug!.selection().length === 1)
  // SE corner of the 180..220 bounds is the resize zone.
  await expect
    .poll(() => win.evaluate(() => window.__ewGestureDebug!.zoneAt(220, 220)))
    .toBe('resize-se')

  await win.mouse.move(box.x + 220, box.y + 220)
  await win.mouse.down()
  await win.mouse.move(box.x + 260, box.y + 250, { steps: 6 })
  // Give the ticker several frames; a resize must register NO lift.
  await expect
    .poll(() => win.evaluate((id) => window.__ewDebug!.beat.dragging(id), id))
    .toBe(false)
  expect(await beatScale(win, id)).toBeCloseTo(1, 6)
  await win.mouse.up()
  await app.close()
})

test('lock presses −~1% into the desk; a grab on it strains, never lifts', async () => {
  const { app, win } = await launch('ew-e2e-beats-lock-')
  const id = await seedPlacement(win, { x: 150, y: 150 })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  // PRESS: lock commits → the body settles to a steady −1%.
  await runCommand(win, 'SetPlacementLock', { placementId: id, locked: true })
  await expect.poll(() => beatScale(win, id)).toBeCloseTo(0.99, 3)

  // STRAIN, not lift: a grab on the locked body plays the sideways
  // refusal and NEVER starts a drag / lifts (scale stays ≤ rest).
  await win.mouse.move(box.x + 150, box.y + 150)
  await win.mouse.down()
  await expect.poll(() => win.evaluate((id) => window.__ewDebug!.beat.strain(id), id)).toBe(true)
  expect(await win.evaluate((id) => window.__ewDebug!.beat.dragging(id), id)).toBe(false)
  expect(await beatScale(win, id)).toBeLessThanOrEqual(1 + 1e-6)
  await win.mouse.up()
  await app.close()
})

async function screenOf(win: Page, wx: number, wy: number): Promise<{ x: number; y: number }> {
  return win.evaluate(
    ({ x, y }) => {
      const s = window.__ewDebug!.worldToScreen(x, y)
      const rect = document
        .querySelector('[data-testid="canvas-host"] canvas')!
        .getBoundingClientRect()
      return { x: rect.left + s.x, y: rect.top + s.y }
    },
    { x: wx, y: wy },
  )
}

async function dragWorld(
  win: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  const p = await screenOf(win, from.x, from.y)
  const q = await screenOf(win, to.x, to.y)
  await win.mouse.move(p.x, p.y)
  await win.mouse.down()
  await win.mouse.move(q.x, q.y, { steps: 8 })
  await win.mouse.up()
}

test('drag over a frame → members MAKE ROOM (the one anticipatory motion)', async () => {
  const { app, win } = await launch('ew-e2e-beats-room-')
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))

  // Draw a frame spanning world 100..400, then a member captured inside.
  await win.getByTestId('tool-frame').click()
  await dragWorld(win, { x: 100, y: 100 }, { x: 400, y: 400 })
  await win.getByTestId('tool-select').click()
  const frameId = await win.evaluate(async () => {
    const scene = await window.ew.project.query('getCanvasScene', {
      canvasId: window.__ewDebug!.canvasId(),
    })
    if (!scene.ok) throw new Error(scene.message)
    const items = (scene.result as { items: Array<Record<string, unknown>> }).items
    return items.find((i) => i['appearanceKind'] === 'frame')!['id'] as string
  })
  const member = await seedPlacement(win, { x: 600, y: 150 })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 2)
  await dragWorld(win, { x: 600, y: 150 }, { x: 200, y: 200 }) // capture into frame
  await expect
    .poll(() => win.evaluate((id) => window.__ewDebug!.frameMembers(id), frameId))
    .toEqual([member])

  // Seed a SECOND item and drag it OVER the frame — hold the pointer down.
  const incoming = await seedPlacement(win, { x: 600, y: 320 })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 3)
  const start = await screenOf(win, 600, 320)
  const overFrame = await screenOf(win, 300, 300)
  await win.mouse.move(start.x, start.y)
  await win.mouse.down()
  await win.mouse.move(overFrame.x, overFrame.y, { steps: 8 })

  // The existing member eases a clearance outward (non-zero cur toward a
  // non-zero target) while the incoming item hovers the frame.
  await expect
    .poll(() => win.evaluate((id) => window.__ewDebug!.beat.makeRoom(id), member))
    .not.toBeNull()
  await expect
    .poll(async () => {
      const r = await win.evaluate((id) => window.__ewDebug!.beat.makeRoom(id), member)
      return r ? Math.hypot(r.x, r.y) : 0
    })
    .toBeGreaterThan(0.1)

  // Release → the clearance eases back and clears.
  await win.mouse.up()
  await expect
    .poll(async () => {
      const r = await win.evaluate((id) => window.__ewDebug!.beat.makeRoom(id), member)
      return r ? Math.hypot(r.x, r.y) : 0
    })
    .toBe(0)
  void incoming
  await app.close()
})

test('delete lifts the body AWAY (up + fade) before the scene removes it', async () => {
  const { app, win } = await launch('ew-e2e-beats-away-')
  const id = await seedPlacement(win, { x: 150, y: 150 })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  await win.mouse.click(box.x + 150, box.y + 150)
  await win.waitForFunction(() => window.__ewDebug!.selection().length === 1)
  await win.keyboard.press('Delete')

  // A lift-away ghost is animating (never a crumple — it just rises+fades).
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.beat.awayGhosts())).toBeGreaterThan(0)
  // The model item is gone, and the ghost cleans itself up.
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 0)
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.beat.awayGhosts())).toBe(0)
  void id
  await app.close()
})

test('lift-away releases the deleted image texture (no resident leak)', async () => {
  // Codex finding, verified: detach() removes the entry before the
  // culler's onLeaveResidency can find it (sync.get is undefined), so
  // the ghost must release the budget ref itself at destroy time —
  // otherwise every deleted image stays resident until a canvas swap.
  const { app, win } = await launch('ew-e2e-beats-leak-')
  await win.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 96
    canvas.height = 96
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#2e6ac0'
    ctx.fillRect(0, 0, 96, 96)
    const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'))
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const imported = await window.ew.project.importAsset({ bytes, originalFilename: 'leak.png' })
    if (!('assetId' in imported) || !imported.assetId) throw new Error('import failed')
    const project = await window.ew.project.query('getProject')
    if (!project.ok) throw new Error(project.message)
    const { id: projectId } = project.result as { id: string }
    const result = await window.ew.project.execute({
      commandId: window.ew.util.newId(),
      projectId,
      commandType: 'CreatePin',
      commandVersion: 1,
      issuedAt: new Date().toISOString(),
      payload: {
        nodeId: window.ew.util.newId(),
        canvasId: window.__ewDebug!.canvasId(),
        placementId: window.ew.util.newId(),
        x: 200,
        y: 200,
        appearance: { kind: 'image', assetId: imported.assetId, crop: null },
      },
    })
    if (result.status !== 'committed') throw new Error('pin failed')
  })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)
  // Texture becomes resident (bytes counted against live refs).
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.textureStats().residentBytes))
    .toBeGreaterThan(0)

  const box = (await win.getByTestId('canvas-host').boundingBox())!
  await win.mouse.click(box.x + 200, box.y + 200)
  await win.waitForFunction(() => window.__ewDebug!.selection().length === 1)
  await win.keyboard.press('Delete')
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 0)
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.beat.awayGhosts())).toBe(0)
  // The ref dropped with the ghost: nothing resident, bytes idle-pooled.
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.textureStats().residentBytes))
    .toBe(0)
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.textureStats().idleBytes))
    .toBeGreaterThan(0)
  await app.close()
})
