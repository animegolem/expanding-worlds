import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type Page } from '@playwright/test'
import type { EwApi } from '../src/preload/index'

declare global {
  interface Window {
    ew: EwApi
    __ewGestureDebug?: {
      handles: () => Array<{ kind: string; dir: string | null; x: number; y: number }>
      labelTexts: () => string[]
    }
  }
}

/**
 * AI-IMP-019 acceptance: one durable command per completed gesture
 * (§10.2), handle-based resize/rotate, reorder over the shared plane,
 * flip persistence, and labels that follow renames and toggle from
 * the selection controls (§4.5).
 */

interface ScenePlacementLite {
  id: string
  x: number
  y: number
  width: number | null
  height: number | null
  rotation: number
  flipX: number
  labelVisible: number
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
        commandId: crypto.randomUUID(),
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
        x: item['x'] as number,
        y: item['y'] as number,
        width: item['width'] as number | null,
        height: item['height'] as number | null,
        rotation: item['rotation'] as number,
        flipX: item['flipX'] as number,
        labelVisible: item['labelVisible'] as number,
      }))
  })
}

async function handleAt(
  win: Page,
  kind: string,
  dir: string | null = null,
): Promise<{ x: number; y: number }> {
  const box = (await win.getByTestId('canvas-host').boundingBox())!
  await expect
    .poll(() =>
      win.evaluate(
        ({ kind, dir }) =>
          window
            .__ewGestureDebug!.handles()
            .some((h) => h.kind === kind && (dir === null || h.dir === dir)),
        { kind, dir },
      ),
    )
    .toBe(true)
  const handle = await win.evaluate(
    ({ kind, dir }) =>
      window
        .__ewGestureDebug!.handles()
        .find((h) => h.kind === kind && (dir === null || h.dir === dir))!,
    { kind, dir },
  )
  return { x: box.x + handle.x, y: box.y + handle.y }
}

test('move, resize, rotate, reorder, and flip: one durable command per gesture', async () => {
  const { app, win } = await launch('ew-e2e-gestures-')

  // Seed two 40×40 dot placements.
  const nodeA = await win.evaluate(() => crypto.randomUUID())
  const nodeB = await win.evaluate(() => crypto.randomUUID())
  for (const [nodeId, x, y] of [
    [nodeA, 150, 150],
    [nodeB, 260, 200],
  ] as const) {
    await runCommand(win, 'CreateNode', { nodeId })
    await runCommand(win, 'CreatePlacement', {
      placementId: crypto.randomUUID(),
      canvasId: await win.evaluate(() => window.__ewDebug!.canvasId()),
      nodeId,
      x,
      y,
      width: 40,
      height: 40,
    })
  }
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 2)
  const [first, second] = await scenePlacements(win)
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  // Marquee-select both (camera is identity: world = screen).
  await win.mouse.move(box.x + 100, box.y + 100)
  await win.mouse.down()
  await win.mouse.move(box.x + 320, box.y + 260, { steps: 4 })
  await win.mouse.up()
  await win.waitForFunction(() => window.__ewDebug!.selection().length === 2)

  // Drag both by (100, 40): exactly ONE TransformContent → revision +1.
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

  // Select the first placement alone and resize by the se handle:
  // bounds 230..270 × 170..210, anchor nw → drag +40/+20 doubles x,
  // stretches y ×1.5 (free aspect for a non-image appearance).
  await win.mouse.click(box.x + 500, box.y + 350) // clear
  await win.mouse.click(box.x + 250, box.y + 190)
  await win.waitForFunction(() => window.__ewDebug!.selection().length === 1)
  const beforeResize = await revision(win)
  const se = await handleAt(win, 'resize', 'se')
  await win.mouse.move(se.x, se.y)
  await win.mouse.down()
  await win.mouse.move(se.x + 40, se.y + 20, { steps: 5 })
  await win.mouse.up()
  await expect
    .poll(async () => {
      const placements = await scenePlacements(win)
      const p = placements.find((item) => item.id === first!.id)!
      return { w: Math.round(p.width ?? 0), h: Math.round(p.height ?? 0) }
    })
    .toEqual({ w: 80, h: 60 })
  expect(await revision(win)).toBe(beforeResize + 1)

  // Rotate by the handle: sweep from above the bounds (−90°) to the
  // right of the center (0°) → +90° in one command. Wait for the
  // overlay to re-render at the post-resize bounds (center x = 270)
  // so we don't grab a stale handle position.
  await expect
    .poll(() =>
      win.evaluate(() => window.__ewGestureDebug!.handles().find((h) => h.kind === 'rotate')?.x),
    )
    .toBe(270)
  const rotate = await handleAt(win, 'rotate')
  const center = { x: box.x + 270, y: box.y + 200 } // post-resize body center
  await win.mouse.move(rotate.x, rotate.y)
  await win.mouse.down()
  const radius = center.y - rotate.y
  await win.mouse.move(center.x + radius, center.y, { steps: 6 })
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

test('labels: follow the note title, resize with the placement, toggle from selection controls', async () => {
  const { app, win } = await launch('ew-e2e-labels-')

  const nodeId = await win.evaluate(() => crypto.randomUUID())
  const noteId = await win.evaluate(() => crypto.randomUUID())
  await runCommand(win, 'CreateNode', { nodeId })
  await runCommand(win, 'CreatePlacement', {
    placementId: crypto.randomUUID(),
    canvasId: await win.evaluate(() => window.__ewDebug!.canvasId()),
    nodeId,
    x: 200,
    y: 200,
    width: 40,
    height: 40,
  })
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

  // Toggle from the selection controls; the state persists in the scene.
  const box = (await win.getByTestId('canvas-host').boundingBox())!
  await win.mouse.click(box.x + 200, box.y + 200)
  await win.waitForFunction(() => window.__ewDebug!.selection().length === 1)
  const toggleOff = await handleAt(win, 'label')
  await win.mouse.click(toggleOff.x, toggleOff.y)
  await expect
    .poll(async () => (await scenePlacements(win))[0]!.labelVisible)
    .toBe(0)
  await win.waitForFunction(() => window.__ewGestureDebug!.labelTexts().length === 0)

  // Re-toggling restores it.
  const toggleOn = await handleAt(win, 'label')
  await win.mouse.click(toggleOn.x, toggleOn.y)
  await expect
    .poll(async () => (await scenePlacements(win))[0]!.labelVisible)
    .toBe(1)
  await win.waitForFunction(() => window.__ewGestureDebug!.labelTexts().includes('Haven'))

  await app.close()
})
