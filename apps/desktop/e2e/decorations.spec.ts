import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import type { EwApi } from '../src/preload/index'
import type { SceneDecoration } from '@ew/canvas-engine'

declare global {
  interface Window {
    ew: EwApi
  }
}

/**
 * AI-IMP-021 acceptance (§17 item 18 + §6.8): draw every decoration
 * kind through the toolbar with exactly one CreateDecoration each,
 * anchor a connector to a placement and watch it follow, group two
 * shapes (member click selects the group), lock ⇒ marquee skips,
 * hide/show round-trip, and canvas text lands in canvas_text_fts.
 * The camera stays at identity throughout, so canvas-box pixels are
 * world units.
 */

test('decorations: draw, anchor, group, lock, hide, search', async () => {
  test.setTimeout(120_000)
  const projectDir = mkdtempSync(join(tmpdir(), 'ew-e2e-decorations-'))
  const app = await electron.launch({
    args: ['out/main/index.cjs'],
    env: { ...process.env, EW_PROJECT_DIR: projectDir },
  })
  const win = await app.firstWindow()
  await win.waitForFunction(() => window.__ewDebug !== undefined)

  const revision = (): Promise<number> =>
    win.evaluate(async () => {
      const project = await window.ew.project.query('getProject')
      if (!project.ok) throw new Error(project.message)
      return (project.result as { revision: number }).revision
    })

  const decorations = (): Promise<SceneDecoration[]> =>
    win.evaluate(() => window.__ewDebug!.decorations())

  // GIVEN a canvas with two image-ish placements (40x40 dots).
  const { placementB } = await win.evaluate(async () => {
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
    const ids: string[] = []
    for (const [x, y] of [
      [150, 150],
      [400, 150],
    ]) {
      const nodeId = crypto.randomUUID()
      const placementId = crypto.randomUUID()
      ids.push(placementId)
      await run('CreateNode', { nodeId })
      await run('CreatePlacement', {
        placementId,
        canvasId: window.__ewDebug!.canvasId(),
        nodeId,
        x,
        y,
        width: 40,
        height: 40,
      })
    }
    return { placementA: ids[0]!, placementB: ids[1]! }
  })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 2)

  const box = (await win.getByTestId('canvas-host').boundingBox())!
  const at = (x: number, y: number): [number, number] => [box.x + x, box.y + y]

  async function drawTool(
    tool: string,
    from: [number, number],
    to: [number, number],
    via: Array<[number, number]> = [],
  ): Promise<void> {
    await win.getByTestId(`tool-${tool}`).click()
    const before = await revision()
    const count = (await decorations()).length
    await win.mouse.move(...at(...from))
    await win.mouse.down()
    for (const [x, y] of via) await win.mouse.move(...at(x, y), { steps: 3 })
    await win.mouse.move(...at(...to), { steps: 4 })
    await win.mouse.up()
    // Exactly one command per completed tool gesture (§10.2).
    await expect.poll(() => revision()).toBe(before + 1)
    expect(await revision()).toBe(before + 1)
    await expect.poll(async () => (await decorations()).length).toBe(count + 1)
  }

  // WHEN drawing one of each kind (regions never overlap each other).
  await drawTool('rect', [500, 300], [560, 340])
  await drawTool('ellipse', [600, 300], [660, 340])
  await drawTool('triangle', [500, 400], [560, 440])
  await drawTool('path', [600, 420], [660, 450], [
    [615, 430],
    [630, 415],
    [645, 445],
  ])
  await drawTool('line', [500, 500], [560, 520])
  await drawTool('arrow', [600, 500], [660, 520])
  // Connector: drag from empty space onto placement B → end anchors.
  await drawTool('connector', [600, 150], [400, 150])

  const byKind = async (kind: string): Promise<SceneDecoration[]> =>
    (await decorations()).filter((d) => d.kind === kind)

  const shapes = await byKind('shape')
  expect(shapes.map((s) => s.data['shape']).sort()).toEqual(['ellipse', 'rect', 'triangle'])
  expect(await byKind('path')).toHaveLength(1)
  expect(await byKind('line')).toHaveLength(1)
  expect(await byKind('arrow')).toHaveLength(1)

  // THEN the connector is anchored to the placement it was dropped on.
  const connector = (await byKind('connector'))[0]!
  expect(connector.anchorStartPlacementId).toBeNull()
  expect(connector.anchorEndPlacementId).toBe(placementB)
  await expect
    .poll(() => win.evaluate((id) => window.__ewDebug!.decorationEndpoints(id), connector.id))
    .toEqual({ x1: 600, y1: 150, x2: 400, y2: 150 })

  // WHEN the anchored placement moves (durable transform)…
  await win.evaluate(
    async ({ placementId }) => {
      const project = await window.ew.project.query('getProject')
      if (!project.ok) throw new Error(project.message)
      const result = await window.ew.project.execute({
        commandId: crypto.randomUUID(),
        projectId: (project.result as { id: string }).id,
        commandType: 'TransformContent',
        commandVersion: 1,
        issuedAt: new Date().toISOString(),
        payload: {
          canvasId: window.__ewDebug!.canvasId(),
          items: [
            {
              kind: 'placement',
              placementId,
              x: 450,
              y: 250,
              width: 40,
              height: 40,
              scale: 1,
              rotation: 0,
            },
          ],
        },
      })
      if (result.status !== 'committed') throw new Error(`TransformContent: ${result.status}`)
    },
    { placementId: placementB },
  )
  // …THEN the rendered connector endpoint follows after re-render.
  await expect
    .poll(() => win.evaluate((id) => window.__ewDebug!.decorationEndpoints(id), connector.id))
    .toEqual({ x1: 600, y1: 150, x2: 450, y2: 250 })

  // WHEN two shapes are grouped: marquee both, Group.
  const rect = shapes.find((s) => s.data['shape'] === 'rect')!
  const ellipse = shapes.find((s) => s.data['shape'] === 'ellipse')!
  await win.getByTestId('tool-select').click()
  await win.mouse.move(...at(480, 280))
  await win.mouse.down()
  await win.mouse.move(...at(680, 360), { steps: 4 })
  await win.mouse.up()
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.selection().sort()))
    .toEqual([rect.id, ellipse.id].sort())
  await win.getByTestId('deco-group').click()
  await expect
    .poll(async () => {
      const ds = await decorations()
      const g1 = ds.find((d) => d.id === rect.id)?.groupId
      const g2 = ds.find((d) => d.id === ellipse.id)?.groupId
      return g1 !== null && g1 !== undefined && g1 === g2
    })
    .toBe(true)

  // THEN clicking one member selects the whole group.
  await win.mouse.click(...at(250, 600))
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.selection())).toEqual([])
  await win.mouse.click(...at(530, 320)) // rect body
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.selection().sort()))
    .toEqual([rect.id, ellipse.id].sort())

  // AND the group moves through ONE TransformContent. The 019 move
  // driver has not merged into this branch, so the durable command is
  // issued directly (the gesture pipeline is unit-tested upstream).
  const beforeGroupMove = await revision()
  await win.evaluate(
    async ({ items }) => {
      const project = await window.ew.project.query('getProject')
      if (!project.ok) throw new Error(project.message)
      const result = await window.ew.project.execute({
        commandId: crypto.randomUUID(),
        projectId: (project.result as { id: string }).id,
        commandType: 'TransformContent',
        commandVersion: 1,
        issuedAt: new Date().toISOString(),
        payload: { canvasId: window.__ewDebug!.canvasId(), items },
      })
      if (result.status !== 'committed') throw new Error(`TransformContent: ${result.status}`)
    },
    {
      items: [rect, ellipse].map((d) => ({
        kind: 'decoration',
        decorationId: d.id,
        data: { ...d.data, x: (d.data['x'] as number) + 20, y: (d.data['y'] as number) + 20 },
      })),
    },
  )
  await expect.poll(() => revision()).toBe(beforeGroupMove + 1)
  await expect
    .poll(async () => (await decorations()).find((d) => d.id === rect.id)?.data['x'])
    .toBe((rect.data['x'] as number) + 20)

  // AND ungrouping restores individual selection semantics.
  await win.getByTestId('deco-ungroup').click()
  await expect
    .poll(async () => (await decorations()).find((d) => d.id === rect.id)?.groupId ?? null)
    .toBeNull()
  await win.mouse.click(...at(250, 600))
  await win.mouse.click(...at(550, 340)) // moved rect body (+20, +20)
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.selection()))
    .toEqual([rect.id])

  // WHEN the triangle is locked, THEN a marquee over it selects nothing.
  const triangle = shapes.find((s) => s.data['shape'] === 'triangle')!
  await win.mouse.click(...at(250, 600))
  await win.mouse.click(...at(530, 420))
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.selection()))
    .toEqual([triangle.id])
  await win.getByTestId('deco-lock').click()
  await expect
    .poll(async () => (await decorations()).find((d) => d.id === triangle.id)?.locked)
    .toBe(1)
  await win.mouse.click(...at(250, 600))
  await win.mouse.move(...at(470, 380))
  await win.mouse.down()
  await win.mouse.move(...at(590, 460), { steps: 4 })
  await win.mouse.up()
  expect(await win.evaluate(() => window.__ewDebug!.selection())).toEqual([])

  // WHEN the line is hidden it stays in the scene, invisible, and the
  // hidden list restores it.
  const line = (await byKind('line'))[0]!
  await win.mouse.click(...at(530, 510))
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.selection()))
    .toEqual([line.id])
  await win.getByTestId('deco-hide').click()
  await expect
    .poll(async () => (await decorations()).find((d) => d.id === line.id)?.hidden)
    .toBe(1)
  expect(await win.evaluate((id) => window.__ewDebug!.decorationVisible(id), line.id)).toBe(false)
  expect((await decorations()).some((d) => d.id === line.id)).toBe(true)
  await win.getByTestId(`deco-show-${line.id}`).click()
  await expect
    .poll(async () => (await decorations()).find((d) => d.id === line.id)?.hidden)
    .toBe(0)
  await expect
    .poll(() => win.evaluate((id) => window.__ewDebug!.decorationVisible(id), line.id))
    .toBe(true)

  // WHEN text is entered through the DOM overlay (§12.2)…
  const overlayFocused = () =>
    expect
      .poll(() =>
        win.evaluate(
          () => (document.activeElement as HTMLElement | null)?.dataset?.['testid'] ?? null,
        ),
      )
      .toBe('text-entry')
  await win.getByTestId('tool-text').click()
  const beforeText = await revision()
  await win.mouse.click(...at(200, 300))
  await expect(win.getByTestId('text-entry')).toBeVisible()
  await overlayFocused()
  await win.keyboard.type('ancient beacon tower')
  await win.keyboard.press('Enter')
  await expect.poll(() => revision()).toBe(beforeText + 1)
  const text = (await byKind('text'))[0]!
  expect(text.data).toMatchObject({ x: 200, y: 300, text: 'ancient beacon tower', fontSize: 16 })

  // …THEN it is findable via canvas_text_fts.
  const hits = await win.evaluate(async () => {
    const result = await window.ew.project.query('searchProject', { query: 'beacon' })
    if (!result.ok) throw new Error(result.message)
    return result.result as { canvasText: Array<{ decorationId: string }> }
  })
  expect(hits.canvasText).toHaveLength(1)
  expect(hits.canvasText[0]!.decorationId).toBe(text.id)

  // Editing via double-click commits exactly one UpdateDecoration.
  await win.getByTestId('tool-select').click()
  const beforeEdit = await revision()
  await win.mouse.dblclick(...at(202, 302))
  await expect(win.getByTestId('text-entry')).toBeVisible()
  await overlayFocused()
  // The edit overlay opens with the text selected: type to replace.
  await win.keyboard.type('renamed beacon')
  await win.keyboard.press('Enter')
  await expect.poll(() => revision()).toBe(beforeEdit + 1)
  await expect
    .poll(async () => (await byKind('text'))[0]!.data['text'])
    .toBe('renamed beacon')

  // AI-IMP-030: edits store measured world extents, which make the
  // text body clickable (not just the 4-unit slop at its corner)…
  const measured = (await byKind('text'))[0]!.data as {
    measuredWidth?: number
    measuredHeight?: number
  }
  expect(measured.measuredWidth).toBeGreaterThan(20)
  expect(measured.measuredHeight).toBeGreaterThan(10)
  const center: [number, number] = [
    200 + measured.measuredWidth! / 2,
    300 + measured.measuredHeight! / 2,
  ]
  await win.mouse.click(...at(...center))
  await win.waitForFunction(() => window.__ewDebug!.selection().length === 1)

  // …and draggable: one durable TransformContent moves the body.
  const beforeMove = await revision()
  await win.mouse.move(...at(...center))
  await win.mouse.down()
  await win.mouse.move(...at(320, 380), { steps: 5 })
  await win.mouse.up()
  await expect.poll(() => revision()).toBe(beforeMove + 1)
  const moved = (await byKind('text'))[0]!.data as { x: number; y: number }
  expect(moved.x).toBeGreaterThan(200)
  expect(moved.y).toBeGreaterThan(300)

  // AI-IMP-034: whole-object type controls on a single selected text.
  await expect(win.getByTestId('text-style-controls')).toBeVisible()
  await win.getByTestId('text-size').fill('32')
  await win.getByTestId('text-size').press('Enter')
  await expect
    .poll(async () => (await byKind('text'))[0]!.data['fontSize'])
    .toBe(32)
  // The toolbar composes edits from its (120ms-refreshed) snapshot —
  // wait for it to reflect the size before layering the bold toggle.
  await expect(win.getByTestId('text-size')).toHaveValue('32')
  await win.getByTestId('text-bold').click()
  await expect.poll(async () => (await byKind('text'))[0]!.data['bold']).toBe(true)
  const sizedBounds = (await byKind('text'))[0]!.data as { measuredHeight?: number }
  expect(sizedBounds.measuredHeight).toBeGreaterThan(30)

  // AI-IMP-037: the family picker enumerates installed fonts on its
  // first user gesture and stores the choice with a stack fallback.
  await win.getByTestId('text-family').click()
  await expect
    .poll(async () => win.locator('[data-testid="text-family"] option').count(), {
      timeout: 10_000,
    })
    .toBeGreaterThan(3)
  const systemFamily = await win.evaluate(() => {
    const select = document.querySelector<HTMLSelectElement>('[data-testid="text-family"]')!
    const opt = [...select.options].find((o) => o.value.includes('",'))
    return opt?.value ?? null
  })
  expect(systemFamily).not.toBeNull()
  await win.getByTestId('text-family').selectOption(systemFamily!)
  await expect
    .poll(async () => ((await byKind('text'))[0]!.data as { fontFamily?: string }).fontFamily)
    .toBe(systemFamily)
  expect(systemFamily).toContain('sans-serif')

  // Art-text resize: dragging a corner scales fontSize uniformly.
  await win.waitForFunction(() => window.__ewDebug!.selection().length === 1)
  const seHandle = await win.evaluate(
    () => window.__ewGestureDebug!.handles().find((h) => h.kind === 'resize' && h.dir === 'se')!,
  )
  const beforeScale = await revision()
  await win.mouse.move(box.x + seHandle.x, box.y + seHandle.y)
  await win.mouse.down()
  await win.mouse.move(box.x + seHandle.x + 60, box.y + seHandle.y + 10, { steps: 5 })
  await win.mouse.up()
  await expect.poll(() => revision()).toBe(beforeScale + 1)
  const scaled = (await byKind('text'))[0]!.data as { fontSize: number }
  expect(scaled.fontSize).toBeGreaterThan(32)

  expect((await decorations()).length).toBe(8)
  await app.close()
})

test('shift-constrained drawing (AI-IMP-035)', async () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'ew-e2e-shift-draw-'))
  const app = await electron.launch({
    args: ['out/main/index.cjs'],
    env: { ...process.env, EW_PROJECT_DIR: projectDir },
  })
  const win = await app.firstWindow()
  await win.waitForFunction(() => window.__ewDebug !== undefined)
  const box = (await win.getByTestId('canvas-host').boundingBox())!
  const decorations = (): Promise<Array<{ kind: string; data: Record<string, number | string> }>> =>
    win.evaluate(() => window.__ewDebug!.decorations() as never)

  // Shift-rect commits a square from the dominant drag extent.
  await win.getByTestId('tool-rect').click()
  await win.keyboard.down('Shift')
  await win.mouse.move(box.x + 200, box.y + 200)
  await win.mouse.down()
  await win.mouse.move(box.x + 280, box.y + 230, { steps: 4 })
  await win.mouse.up()
  await win.keyboard.up('Shift')
  await expect.poll(async () => (await decorations()).length).toBe(1)
  const square = (await decorations())[0]!.data
  expect(square['width']).toBe(80)
  expect(square['height']).toBe(80)

  // Shift-arrow at ~50° commits at exactly 45°, length preserved.
  await win.getByTestId('tool-arrow').click()
  await win.keyboard.down('Shift')
  await win.mouse.move(box.x + 400, box.y + 200)
  await win.mouse.down()
  await win.mouse.move(box.x + 400 + 64, box.y + 200 + 77, { steps: 4 })
  await win.mouse.up()
  await win.keyboard.up('Shift')
  await expect.poll(async () => (await decorations()).length).toBe(2)
  const arrow = (await decorations()).find((d) => d.kind === 'arrow')!.data
  const dx = (arrow['x2'] as number) - (arrow['x1'] as number)
  const dy = (arrow['y2'] as number) - (arrow['y1'] as number)
  expect(Math.atan2(dy, dx)).toBeCloseTo(Math.PI / 4, 5)

  // AI-IMP-038: the arrow SHAPE scales with its box like any shape.
  await win.getByTestId('tool-shape-arrow').click()
  await win.mouse.move(box.x + 600, box.y + 200)
  await win.mouse.down()
  await win.mouse.move(box.x + 700, box.y + 250, { steps: 4 })
  await win.mouse.up()
  await expect.poll(async () => (await decorations()).length).toBe(3)
  const arrowShape = (await decorations()).find((d) => d.data['shape'] === 'arrow')!
  expect(arrowShape.data['width']).toBe(100)
  await win.getByTestId('tool-select').click()
  await win.mouse.click(box.x + 650, box.y + 225)
  await win.waitForFunction(() => window.__ewDebug!.selection().length === 1)
  const se = await win.evaluate(
    () => window.__ewGestureDebug!.handles().find((h) => h.kind === 'resize' && h.dir === 'se')!,
  )
  await win.mouse.move(box.x + se.x, box.y + se.y)
  await win.mouse.down()
  await win.mouse.move(box.x + se.x + 100, box.y + se.y + 50, { steps: 5 })
  await win.mouse.up()
  await expect
    .poll(async () => {
      const d = (await decorations()).find((dd) => dd.data['shape'] === 'arrow')!.data
      return d['width']
    })
    .toBeGreaterThan(150)
  const scaledArrowShape = (await decorations()).find((d) => d.data['shape'] === 'arrow')!.data
  expect(scaledArrowShape['height']).toBeGreaterThan(75)

  await app.close()
})

test('selection restyle: stroke, fill, width, rounding after placement (AI-IMP-055)', async () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'ew-e2e-restyle-'))
  const app = await electron.launch({
    args: ['out/main/index.cjs'],
    env: { ...process.env, EW_PROJECT_DIR: projectDir },
  })
  const win = await app.firstWindow()
  await win.waitForFunction(() => window.__ewDebug !== undefined)

  const { rectId, lineId } = await win.evaluate(async () => {
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
    const rectId = crypto.randomUUID()
    const lineId = crypto.randomUUID()
    const canvasId = window.__ewDebug!.canvasId()
    await run('CreateDecoration', {
      decorationId: rectId,
      canvasId,
      kind: 'shape',
      data: { shape: 'rect', x: 200, y: 420, width: 100, height: 60, stroke: '#dde3ea', strokeWidth: 2 },
    })
    await run('CreateDecoration', {
      decorationId: lineId,
      canvasId,
      kind: 'line',
      data: { x1: 400, y1: 420, x2: 500, y2: 480, stroke: '#dde3ea', strokeWidth: 4 },
    })
    return { rectId, lineId }
  })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().decorations === 2)

  const dataOf = async (id: string): Promise<Record<string, unknown>> =>
    win.evaluate(async (targetId) => {
      const response = await window.ew.project.query('getCanvasContents', {
        canvasId: window.__ewDebug!.canvasId(),
      })
      if (!response.ok) throw new Error(response.message)
      const item = (response.result as Array<{ id: string; data?: Record<string, unknown> }>).find(
        (candidate) => candidate.id === targetId,
      )
      return item!.data!
    }, id)

  // Select the rect; the selection-style row appears.
  const box = (await win.getByTestId('canvas-host').boundingBox())!
  await win.mouse.click(box.x + 250, box.y + 450)
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.selection()))
    .toEqual([rectId])
  await expect(win.getByTestId('selection-style-controls')).toBeVisible()

  // One UpdateDecoration per edit: stroke, fill, none, rounding.
  await win.getByTestId('sel-stroke').fill('#ff0000')
  await expect.poll(async () => (await dataOf(rectId))['stroke']).toBe('#ff0000')
  await win.getByTestId('sel-fill').fill('#00ff00')
  await expect.poll(async () => (await dataOf(rectId))['fill']).toBe('#00ff00')
  await win.getByTestId('sel-rounding').fill('50')
  await win.getByTestId('sel-rounding').blur()
  await expect.poll(async () => (await dataOf(rectId))['cornerRadius']).toBe(0.5)
  await win.getByTestId('sel-fill-none').click()
  await expect.poll(async () => (await dataOf(rectId))['fill']).toBeUndefined()

  // Multi-select rect + line: stroke applies to both.
  // keyboard.down: the click `modifiers` option doesn't reach
  // synthesized POINTER events in Electron (only DOM mouse events).
  await win.keyboard.down('Shift')
  await win.mouse.click(box.x + 450, box.y + 450)
  await win.keyboard.up('Shift')
  await expect
    .poll(async () => (await win.evaluate(() => window.__ewDebug!.selection())).length)
    .toBe(2)
  await win.getByTestId('sel-stroke').fill('#0000ff')
  await expect.poll(async () => (await dataOf(rectId))['stroke']).toBe('#0000ff')
  await expect.poll(async () => (await dataOf(lineId))['stroke']).toBe('#0000ff')

  await app.close()
})
