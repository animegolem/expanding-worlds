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
 * AI-IMP-019/062 acceptance: one durable command per completed
 * gesture (§10.2) driven through CURSOR ZONES (§6.9 rev 0.17) — no
 * drawn handles. Pointer positions are computed from the selection's
 * known world geometry (camera is identity unless a test moves it):
 * inside = move, edge band = directional resize, the band outside a
 * corner = rotate. Also: ⌥-duplicate (§6.5), placement lock refusal,
 * reorder, flip, and labels that follow renames (§4.5; the toggle
 * affordance moved to the AI-IMP-063 charm bar, so visibility is
 * exercised via its command here).
 */

interface ScenePlacementLite {
  id: string
  nodeId: string
  x: number
  y: number
  width: number | null
  height: number | null
  rotation: number
  flipX: number
  labelVisible: number
  locked: number
}

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

async function revision(win: Page): Promise<number> {
  return win.evaluate(async () => {
    const project = await window.ew.project.query('getProject')
    if (!project.ok) throw new Error(project.message)
    return (project.result as { revision: number }).revision
  })
}

async function scenePlacements(win: Page): Promise<ScenePlacementLite[]> {
  return win.evaluate(async () => {
    const scene = await window.ew.project.query('getCanvasScene', {
      canvasId: window.__ewDebug!.canvasId(),
    })
    if (!scene.ok) throw new Error(scene.message)
    const { items } = scene.result as {
      items: Array<Record<string, unknown> & { itemKind: string }>
    }
    return items
      .filter((item) => item.itemKind === 'placement')
      .map((item) => ({
        id: item['id'] as string,
        nodeId: item['nodeId'] as string,
        x: item['x'] as number,
        y: item['y'] as number,
        width: item['width'] as number | null,
        height: item['height'] as number | null,
        rotation: item['rotation'] as number,
        flipX: item['flipX'] as number,
        labelVisible: item['labelVisible'] as number,
        locked: item['locked'] as number,
      }))
  })
}

async function cursorOf(win: Page): Promise<string> {
  return win.evaluate(
    () =>
      document.querySelector<HTMLCanvasElement>('[data-testid="canvas-host"] canvas')!.style
        .cursor,
  )
}

/** Wait until the zone classifier sees `zone` at a canvas-local point
 * — the deterministic replacement for polling drawn handle positions
 * (selection and scene sync land asynchronously after commits). */
async function expectZone(win: Page, x: number, y: number, zone: string): Promise<void> {
  await expect
    .poll(() => win.evaluate(({ x, y }) => window.__ewGestureDebug!.zoneAt(x, y), { x, y }))
    .toBe(zone)
}

async function seedPlacement(
  win: Page,
  at: { x: number; y: number },
  size = 40,
): Promise<{ nodeId: string; placementId: string }> {
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
  return { nodeId, placementId }
}

test('move, resize, rotate, reorder, and flip: one durable command per zone gesture', async () => {
  const { app, win } = await launch('ew-e2e-gestures-')

  // Seed two 40×40 dot placements.
  await seedPlacement(win, { x: 150, y: 150 })
  await seedPlacement(win, { x: 260, y: 200 })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 2)
  const [first, second] = await scenePlacements(win)
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  // Marquee-select both (camera is identity: world = screen).
  await win.mouse.move(box.x + 100, box.y + 100)
  await win.mouse.down()
  await win.mouse.move(box.x + 320, box.y + 260, { steps: 4 })
  await win.mouse.up()
  await win.waitForFunction(() => window.__ewDebug!.selection().length === 2)

  // Drag from INSIDE (the move zone) by (100, 40): exactly ONE
  // TransformContent → revision +1.
  await expectZone(win, 150, 150, 'move')
  const beforeMove = await revision(win)
  await win.mouse.move(box.x + 150, box.y + 150)
  await win.mouse.down()
  await win.mouse.move(box.x + 250, box.y + 190, { steps: 6 })
  await win.mouse.up()
  await expect
    .poll(async () => {
      const placements = await scenePlacements(win)
      return placements.map((p) => [Math.round(p.x), Math.round(p.y)])
    })
    .toEqual([
      [250, 190],
      [360, 240],
    ])
  expect(await revision(win)).toBe(beforeMove + 1)

  // Select the first placement alone and resize from the SE corner
  // zone: bounds 230..270 × 170..210, anchor nw → drag +40/+20
  // doubles x, stretches y ×1.5 (free aspect for a non-image).
  await win.mouse.click(box.x + 500, box.y + 350) // clear
  await win.mouse.click(box.x + 250, box.y + 190)
  await win.waitForFunction(() => window.__ewDebug!.selection().length === 1)
  await expectZone(win, 270, 210, 'resize-se')
  await win.mouse.move(box.x + 270, box.y + 210)
  expect(await cursorOf(win)).toBe('nwse-resize')
  const beforeResize = await revision(win)
  await win.mouse.down()
  await win.mouse.move(box.x + 310, box.y + 230, { steps: 5 })
  await win.mouse.up()
  await expect
    .poll(async () => {
      const placements = await scenePlacements(win)
      const p = placements.find((item) => item.id === first!.id)!
      return { w: Math.round(p.width ?? 0), h: Math.round(p.height ?? 0) }
    })
    .toEqual({ w: 80, h: 60 })
  expect(await revision(win)).toBe(beforeResize + 1)

  // Rotate from the band 10 px outside the NE corner: post-resize
  // bounds are 230..310 × 170..230 (center 270,200). Sweeping the
  // pointer a quarter turn about the center lands on +90° via the
  // cardinal orientation magnet (§6.9 rev 0.12) — no handles drawn.
  await expectZone(win, 317, 163, 'rotate-ne')
  await win.mouse.move(box.x + 317, box.y + 163)
  // Custom SVG rotate glyph with crosshair fallback (AI-IMP-031).
  expect(await cursorOf(win)).toMatch(/^url\(.*svg.*\).*crosshair$/)
  await win.mouse.down()
  // (317,163) − center = (47,−37); rotated +90° → (37,47) → (307,247).
  await win.mouse.move(box.x + 307, box.y + 247, { steps: 6 })
  await win.mouse.up()
  await expect
    .poll(async () => {
      const placements = await scenePlacements(win)
      return placements.find((item) => item.id === first!.id)!.rotation
    })
    .toBeCloseTo(Math.PI / 2, 1)

  // Bring-to-front reorders the shared plane: first item becomes last.
  await win.keyboard.press('ControlOrMeta+Shift+BracketRight')
  await expect
    .poll(async () => (await scenePlacements(win)).map((p) => p.id))
    .toEqual([second!.id, first!.id])

  // Flip persists as placement presentation state (§6.9).
  await win.keyboard.press('Shift+H')
  await expect
    .poll(async () => {
      const placements = await scenePlacements(win)
      return placements.find((item) => item.id === first!.id)!.flipX
    })
    .toBe(1)

  await app.close()
})

test('labels: follow the note title, visibility persists via SetPlacementLabelVisibility', async () => {
  const { app, win } = await launch('ew-e2e-labels-')

  const { nodeId, placementId } = await seedPlacement(win, { x: 200, y: 200 })
  const noteId = crypto.randomUUID()
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)

  // No note → no label (§4.5).
  expect(await win.evaluate(() => window.__ewGestureDebug!.labelTexts())).toEqual([])

  await runCommand(win, 'CreateNote', { noteId, title: 'Harbor' })
  await runCommand(win, 'AttachNoteToNode', { nodeId, noteId })
  await win.waitForFunction(() =>
    window.__ewGestureDebug!.labelTexts().includes('Harbor'),
  )

  // Renaming the note renames the label (§4.5: labels follow renames).
  await runCommand(win, 'RenameNote', { noteId, title: 'Haven' })
  await win.waitForFunction(
    () =>
      window.__ewGestureDebug!.labelTexts().includes('Haven') &&
      !window.__ewGestureDebug!.labelTexts().includes('Harbor'),
  )

  // Visibility persists in the scene. (The pointer affordance is the
  // §8.4 charm bar, AI-IMP-063 — selection draws no controls now.)
  await runCommand(win, 'SetPlacementLabelVisibility', { placementId, visible: false })
  await expect
    .poll(async () => (await scenePlacements(win))[0]!.labelVisible)
    .toBe(0)
  await win.waitForFunction(() => window.__ewGestureDebug!.labelTexts().length === 0)

  await runCommand(win, 'SetPlacementLabelVisibility', { placementId, visible: true })
  await expect
    .poll(async () => (await scenePlacements(win))[0]!.labelVisible)
    .toBe(1)
  await win.waitForFunction(() => window.__ewGestureDebug!.labelTexts().includes('Haven'))

  await app.close()
})

test('rotation fidelity: shapes spin in place, zones follow the angle (AI-IMP-031/062)', async () => {
  const { app, win } = await launch('ew-e2e-rotation-')
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  // A rect shape: center (360, 230); stroke 2 → visual half 61×31.
  await runCommand(win, 'CreateDecoration', {
    decorationId: crypto.randomUUID(),
    canvasId: await win.evaluate(() => window.__ewDebug!.canvasId()),
    kind: 'shape',
    data: { shape: 'rect', x: 300, y: 200, width: 120, height: 60, stroke: '#dde3ea', strokeWidth: 2 },
  })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().decorations === 1)
  await win.mouse.click(box.x + 360, box.y + 230)
  await win.waitForFunction(() => window.__ewDebug!.selection().length === 1)

  // Rotate a quarter turn from the band outside the NE corner
  // (421,199): 10 px out along the diagonal → (428,192).
  await expectZone(win, 428, 192, 'rotate-ne')
  const beforeRotate = await revision(win)
  await win.mouse.move(box.x + 428, box.y + 192)
  await win.mouse.down()
  // (428,192) − center = (68,−38); rotated +90° → (38,68) → (398,298).
  await win.mouse.move(box.x + 398, box.y + 298, { steps: 8 })
  await win.mouse.up()
  await expect.poll(() => revision(win)).toBe(beforeRotate + 1)

  const dataOf = async (): Promise<Record<string, number>> =>
    win.evaluate(async () => {
      const scene = await window.ew.project.query('getCanvasScene', {
        canvasId: window.__ewDebug!.canvasId(),
      })
      if (!scene.ok) throw new Error(scene.message)
      const { items } = scene.result as {
        items: Array<{ itemKind: string; data?: Record<string, number> }>
      }
      return items.find((item) => item.itemKind === 'decoration')!.data!
    })
  // Spin in place: rotation ≈ π/2, top-left untouched (no orbit).
  const shapeData = await dataOf()
  expect(shapeData['rotation']).toBeCloseTo(Math.PI / 2, 1)
  expect(shapeData['x']).toBeCloseTo(300, 0)
  expect(shapeData['y']).toBeCloseTo(200, 0)

  // Zones follow the angle: the local E edge now sits BELOW the
  // center (local +x rotated 90° → world +y), at center + (0, 61).
  await win.mouse.click(box.x + 360, box.y + 230)
  await win.waitForFunction(() => window.__ewDebug!.selection().length === 1)
  await expectZone(win, 360, 291, 'resize-e')
  await win.mouse.move(box.x + 360, box.y + 291)
  // Local e rotated 90° quantizes onto the vertical screen axis.
  expect(await cursorOf(win)).toBe('ns-resize')

  // Resize in the local frame: dragging that zone further down
  // widens the shape along its own axis; rotation is untouched.
  const beforeResize = await revision(win)
  await win.mouse.down()
  await win.mouse.move(box.x + 360, box.y + 321, { steps: 5 })
  await win.mouse.up()
  await expect.poll(() => revision(win)).toBe(beforeResize + 1)
  const resized = await dataOf()
  expect(resized['width']).toBeGreaterThan(140)
  expect(resized['height']).toBeCloseTo(60, 0)
  expect(resized['rotation']).toBeCloseTo(Math.PI / 2, 1)

  // Corner-hover rotate affordance on the RESIZED, rotated shape:
  // compute the rotated NE corner from live data and step 10 px out
  // along its diagonal; the rotate cursor shows without any chrome.
  await win.mouse.click(box.x + 360, box.y + 230)
  await win.waitForFunction(() => window.__ewDebug!.selection().length === 1)
  const zonePoint = await win.evaluate(async () => {
    const scene = await window.ew.project.query('getCanvasScene', {
      canvasId: window.__ewDebug!.canvasId(),
    })
    if (!scene.ok) throw new Error(scene.message)
    const { items } = scene.result as {
      items: Array<{ itemKind: string; data?: Record<string, number> }>
    }
    const d = items.find((item) => item.itemKind === 'decoration')!.data!
    const pad = (d['strokeWidth'] ?? 0) / 2
    const cx = d['x']! + d['width']! / 2
    const cy = d['y']! + d['height']! / 2
    const halfW = d['width']! / 2 + pad
    const halfH = d['height']! / 2 + pad
    const rot = d['rotation'] ?? 0
    const cos = Math.cos(rot)
    const sin = Math.sin(rot)
    const out = 10 / Math.SQRT2
    const lx = halfW + out
    const ly = -halfH - out
    return { x: cx + lx * cos - ly * sin, y: cy + lx * sin + ly * cos }
  })
  await expectZone(win, zonePoint.x, zonePoint.y, 'rotate-ne')
  await win.mouse.move(box.x + zonePoint.x, box.y + zonePoint.y)
  // Custom SVG rotate glyph with crosshair fallback (AI-IMP-031).
  expect(await cursorOf(win)).toMatch(/^url\(.*svg.*\).*crosshair$/)

  await app.close()
})

test('⌥-drag inside duplicates: one CreatePlacement, single undo removes it, Esc cancels', async () => {
  const { app, win } = await launch('ew-e2e-duplicate-')
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  const { nodeId } = await seedPlacement(win, { x: 200, y: 200 })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)
  const [source] = await scenePlacements(win)

  await win.mouse.click(box.x + 200, box.y + 200)
  await win.waitForFunction(() => window.__ewDebug!.selection().length === 1)

  // ⌥-drag from the move zone to (320, 260). Playwright's click
  // `modifiers` never reach synthesized pointer events in Electron —
  // hold the key around the drag instead (decorations.spec precedent).
  const beforeDup = await revision(win)
  await win.keyboard.down('Alt')
  await win.mouse.move(box.x + 200, box.y + 200)
  await win.mouse.down()
  await win.mouse.move(box.x + 320, box.y + 260, { steps: 5 })
  await win.mouse.up()
  await win.keyboard.up('Alt')

  // One CreatePlacement of the SAME node at the release point (§6.5);
  // the source never moved.
  await expect.poll(async () => (await scenePlacements(win)).length).toBe(2)
  expect(await revision(win)).toBe(beforeDup + 1)
  const placements = await scenePlacements(win)
  const copy = placements.find((p) => p.id !== source!.id)!
  expect(copy.nodeId).toBe(nodeId)
  expect(Math.round(copy.x)).toBe(320)
  expect(Math.round(copy.y)).toBe(260)
  expect(placements.find((p) => p.id === source!.id)).toMatchObject({ x: 200, y: 200 })

  // Single undo: CreatePlacement's inverse is one DeleteDraftPlacement
  // (the interactive stack is EPIC-007's; data-level undo per slice
  // precedent).
  await runCommand(win, 'DeleteDraftPlacement', { placementId: copy.id })
  await expect.poll(async () => (await scenePlacements(win)).length).toBe(1)

  // Esc mid-drag cancels with nothing committed.
  const beforeEsc = await revision(win)
  await win.keyboard.down('Alt')
  await win.mouse.move(box.x + 200, box.y + 200)
  await win.mouse.down()
  await win.mouse.move(box.x + 280, box.y + 240, { steps: 4 })
  await win.keyboard.press('Escape')
  await win.mouse.up()
  await win.keyboard.up('Alt')
  await expect.poll(async () => (await scenePlacements(win)).length).toBe(1)
  expect(await revision(win)).toBe(beforeEsc)

  await app.close()
})

test('locked placements refuse move and resize with the not-allowed cursor', async () => {
  const { app, win } = await launch('ew-e2e-lock-')
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  const { placementId } = await seedPlacement(win, { x: 200, y: 200 })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)
  await runCommand(win, 'SetPlacementLock', { placementId, locked: true })
  await expect.poll(async () => (await scenePlacements(win))[0]!.locked).toBe(1)

  // A locked placement stays selectable (it must be unlockable), but
  // shows the refusal cursor and never starts a drag.
  await win.mouse.click(box.x + 200, box.y + 200)
  await win.waitForFunction(() => window.__ewDebug!.selection().length === 1)
  await win.mouse.move(box.x + 200, box.y + 200)
  expect(await cursorOf(win)).toBe('not-allowed')

  // Move attempt: no drag, no command.
  const beforeMove = await revision(win)
  await win.mouse.down()
  await win.mouse.move(box.x + 300, box.y + 260, { steps: 5 })
  await win.mouse.up()
  expect(await revision(win)).toBe(beforeMove)
  expect((await scenePlacements(win))[0]).toMatchObject({ x: 200, y: 200 })

  // Resize attempt from the SE corner zone: refused the same way.
  await expectZone(win, 220, 220, 'resize-se')
  await win.mouse.move(box.x + 220, box.y + 220)
  expect(await cursorOf(win)).toBe('not-allowed')
  await win.mouse.down()
  await win.mouse.move(box.x + 260, box.y + 260, { steps: 5 })
  await win.mouse.up()
  expect(await revision(win)).toBe(beforeMove)
  expect((await scenePlacements(win))[0]!.width).toBe(40)

  // Unlocking restores the move: proof the refusal was the lock.
  await runCommand(win, 'SetPlacementLock', { placementId, locked: false })
  await expect.poll(async () => (await scenePlacements(win))[0]!.locked).toBe(0)
  const beforeFree = await revision(win)
  await win.mouse.move(box.x + 200, box.y + 200)
  await win.mouse.down()
  await win.mouse.move(box.x + 300, box.y + 260, { steps: 5 })
  await win.mouse.up()
  await expect
    .poll(async () => {
      const p = (await scenePlacements(win))[0]!
      return [Math.round(p.x), Math.round(p.y)]
    })
    .toEqual([300, 260])
  expect(await revision(win)).toBe(beforeFree + 1)

  await app.close()
})

test('rev 0.21 Option split: Alt MID-move bypasses snapping and never duplicates; plain move snaps', async () => {
  // §6.9 rev 0.21: Option's two meanings read at different moments and
  // so never collide — held at drag START it duplicates (pinned by the
  // ⌥-drag test above), pressed MID-drag it is the snap bypass. This
  // pins the non-collision at the gesture-UI seam AND the first e2e of
  // MOVE snapping: a plain move whose edge nears a neighbor lands
  // EXACTLY on it, and the same approach with Alt held mid-drag follows
  // the pointer instead — committing one moved placement, never a copy.
  const { app, win } = await launch('ew-e2e-option-split-')
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  // Mover center (200, 200) — right edge 220 — and a static neighbor at
  // (400, 200) whose west edge sits at x = 380. Camera is identity, so
  // world = screen throughout. SNAP_ENGAGE_PX = 6, RELEASE = 9.
  await seedPlacement(win, { x: 200, y: 200 })
  await seedPlacement(win, { x: 400, y: 200 })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 2)
  const before = await scenePlacements(win)
  const mover = before.find((p) => Math.round(p.x) === 200)!
  const neighbor = before.find((p) => Math.round(p.x) === 400)!

  await win.mouse.click(box.x + 200, box.y + 200)
  await win.waitForFunction(() => window.__ewDebug!.selection().length === 1)

  // Phase 1 — a PLAIN move (no Alt at pointerdown, so no duplicate arms)
  // whose right edge approaches the neighbor's west edge at 380; Alt
  // pressed MID-drag is the snap bypass, so the center follows the
  // pointer to 358 (right edge 378, two px inside the engage radius the
  // plain phase will snap on). Exactly one moved placement — no copy.
  await expectZone(win, 200, 200, 'move')
  const beforeP1 = await revision(win)
  await win.mouse.move(box.x + 200, box.y + 200)
  await win.mouse.down()
  await win.mouse.move(box.x + 340, box.y + 200, { steps: 5 })
  await win.keyboard.down('Alt')
  await win.mouse.move(box.x + 358, box.y + 200)
  await win.mouse.up()
  await win.keyboard.up('Alt')
  await expect.poll(() => revision(win)).toBe(beforeP1 + 1)
  const afterP1 = await scenePlacements(win)
  expect(afterP1.length).toBe(2) // the non-collision: Alt mid-drag never copies
  const movedP1 = afterP1.find((p) => p.id === mover.id)!
  expect(movedP1.x).toBeCloseTo(358, 3) // bypassed: pointer wins over the stop
  expect(afterP1.find((p) => p.id === neighbor.id)).toMatchObject({ x: 400, y: 200 })

  // Phase 2 — the same approach WITHOUT Alt snaps: from the relocated
  // move zone at 358, wander out past the release radius (center 345,
  // right edge 365) and come back to one px from the stop; the
  // committed right edge must land EXACTLY on 380 (center 360).
  await expectZone(win, 358, 200, 'move')
  const beforeP2 = await revision(win)
  await win.mouse.move(box.x + 358, box.y + 200)
  await win.mouse.down()
  await win.mouse.move(box.x + 345, box.y + 200, { steps: 3 })
  await win.mouse.move(box.x + 359, box.y + 200, { steps: 3 })
  await win.mouse.up()
  await expect.poll(() => revision(win)).toBe(beforeP2 + 1)
  const afterP2 = await scenePlacements(win)
  expect(afterP2.length).toBe(2)
  const snapped = afterP2.find((p) => p.id === mover.id)!
  expect(snapped.x + (snapped.width ?? 0) / 2).toBeCloseTo(380, 3) // right edge on the stop
  expect(snapped.x).toBeCloseTo(360, 3)
  expect(snapped.width).toBeCloseTo(40, 3) // move never resizes
  expect(afterP2.find((p) => p.id === neighbor.id)).toMatchObject({ x: 400, y: 200 })

  await app.close()
})
