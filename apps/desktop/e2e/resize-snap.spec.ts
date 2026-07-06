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
 * AI-IMP-082 acceptance: resize consults the snap seam (§6.9). A
 * dragged edge within the engage threshold of a neighbor's edge lands
 * EXACTLY on it, and Alt pressed mid-drag bypasses the snap so the
 * edge follows the pointer to the world unit. Camera stays identity,
 * so world = screen throughout.
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

interface PlacementGeom {
  id: string
  x: number
  y: number
  width: number | null
  height: number | null
}

async function scenePlacements(win: Page): Promise<PlacementGeom[]> {
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
      }))
  })
}

/** Deterministic wait for zone classification (selection sync is async). */
async function expectZone(win: Page, x: number, y: number, zone: string): Promise<void> {
  await expect
    .poll(() => win.evaluate(({ x, y }) => window.__ewGestureDebug!.zoneAt(x, y), { x, y }))
    .toBe(zone)
}

async function seedPlacement(win: Page, at: { x: number; y: number }, size = 40): Promise<void> {
  const nodeId = crypto.randomUUID()
  await runCommand(win, 'CreateNode', { nodeId })
  await runCommand(win, 'CreatePlacement', {
    placementId: crypto.randomUUID(),
    canvasId: await win.evaluate(() => window.__ewDebug!.canvasId()),
    nodeId,
    x: at.x,
    y: at.y,
    width: size,
    height: size,
  })
}

test('resize snapping: alt bypasses mid-drag; the dragged edge lands exactly on the neighbor edge', async () => {
  const { app, win } = await launch('ew-e2e-resize-snap-')
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  // Mover at center (200, 200) — e edge at x = 220 — and a static
  // neighbor at (400, 200) whose west edge sits at x = 380.
  await seedPlacement(win, { x: 200, y: 200 })
  await seedPlacement(win, { x: 400, y: 200 })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 2)
  const [mover, neighbor] = await scenePlacements(win)

  await win.mouse.click(box.x + 200, box.y + 200)
  await win.waitForFunction(() => window.__ewDebug!.selection().length === 1)

  // Phase 1 — Alt mid-drag is the §6.9 snap bypass: park the pointer
  // at 377, three world px inside the engage radius of the neighbor
  // edge at 380. With Alt held the edge follows the pointer exactly
  // (width 197), proving the snap that phase 2 exercises was refused.
  await expectZone(win, 220, 200, 'resize-e')
  await win.mouse.move(box.x + 220, box.y + 200)
  await win.mouse.down()
  await win.mouse.move(box.x + 370, box.y + 200, { steps: 5 })
  await win.keyboard.down('Alt')
  await win.mouse.move(box.x + 377, box.y + 200)
  await win.mouse.up()
  await win.keyboard.up('Alt')
  await expect
    .poll(async () => (await scenePlacements(win)).find((p) => p.id === mover!.id)!.width)
    .toBeCloseTo(197, 5)

  // Phase 2 — the same approach without Alt snaps: the e edge starts
  // at 377 now; wander out to 365 and come back to 378 (2 px from the
  // stop). The committed edge must land EXACTLY on 380.
  await expectZone(win, 377, 200, 'resize-e')
  await win.mouse.move(box.x + 377, box.y + 200)
  await win.mouse.down()
  await win.mouse.move(box.x + 365, box.y + 200, { steps: 3 })
  await win.mouse.move(box.x + 378, box.y + 200, { steps: 3 })
  await win.mouse.up()
  await expect
    .poll(async () => {
      const p = (await scenePlacements(win)).find((item) => item.id === mover!.id)!
      return p.x + (p.width ?? 0) / 2 // world x of the east edge
    })
    .toBeCloseTo(380, 5)
  const done = await scenePlacements(win)
  const snapped = done.find((p) => p.id === mover!.id)!
  expect(snapped.width!).toBeCloseTo(200, 5)
  expect(snapped.height!).toBeCloseTo(40, 5) // e handle: one axis only
  // The neighbor never moved.
  expect(done.find((p) => p.id === neighbor!.id)).toMatchObject({ x: 400, y: 200 })

  await app.close()
})
