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

  expect((await decorations()).length).toBe(8)
  await app.close()
})
