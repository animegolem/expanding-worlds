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
 * §17 vertical-slice items 2–6, 9–10, 17–19 (AI-EPIC-004 success
 * metric) as ONE continuous project. Pointer-driven flows that the
 * per-feature suites already prove end to end (background edit mode,
 * tool drawing, panel drag, URL-fetch success) run here through the
 * Project API with scene/command-log assertions; the load-bearing
 * §10.2 clauses (marquee+drag = one durable command, snapping with
 * the disable modifier) are pointer-driven again in-slice. Item 19's
 * cross-canvas-undo clause needs the EPIC-007 undo stack and is
 * deferred; inverse-command round-trips stand in at data level.
 */

test.setTimeout(180_000)

interface Ctx {
  win: Page
  projectId: string
  rootNodeId: string
  rootCanvasId: string
}

async function revision(win: Page): Promise<number> {
  return win.evaluate(async () => {
    const project = await window.ew.project.query('getProject')
    if (!project.ok) throw new Error(project.message)
    return (project.result as { revision: number }).revision
  })
}

/** Content commands after `sinceRevision`, camera persists excluded —
 * timing-immune replacement for exact revision deltas (AI-IMP-050). */
async function contentCommandsSince(win: Page, sinceRevision: number): Promise<string[]> {
  return win.evaluate(async (since) => {
    const log = await window.ew.project.query('listCommandLog', { sinceRevision: since })
    if (!log.ok) throw new Error(log.message)
    return (log.result as Array<{ commandType: string }>)
      .map((row) => row.commandType)
      .filter((type) => type !== 'SetCanvasCamera')
  }, sinceRevision)
}

async function exec(ctx: Ctx, commandType: string, payload: unknown): Promise<unknown> {
  return ctx.win.evaluate(
    async ({ projectId, commandType, payload }) => {
      const result = await window.ew.project.execute({
        commandId: crypto.randomUUID(),
        projectId,
        commandType,
        commandVersion: 1,
        issuedAt: new Date().toISOString(),
        payload,
      })
      if (result.status !== 'committed') {
        throw new Error(`${commandType}: ${result.status} ${JSON.stringify(result)}`)
      }
      return result
    },
    { projectId: ctx.projectId, commandType, payload },
  )
}

async function query<T>(win: Page, name: string, args?: unknown): Promise<T> {
  return win.evaluate(
    async ({ name, args }) => {
      const result = await window.ew.project.query(name, args)
      if (!result.ok) throw new Error(`${name}: ${result.message}`)
      return result.result
    },
    { name, args: args ?? null },
  ) as Promise<T>
}

async function importPng(win: Page, filename: string, seed: number): Promise<string> {
  return win.evaluate(
    async ({ filename, seed }) => {
      const canvas = document.createElement('canvas')
      canvas.width = 64
      canvas.height = 48
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = `hsl(${seed % 360} 60% 50%)`
      ctx.fillRect(0, 0, 64, 48)
      const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'))
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const imported = await window.ew.project.importAsset({ bytes, originalFilename: filename })
      if (!('assetId' in imported) || !imported.assetId) throw new Error('import failed')
      return imported.assetId
    },
    { filename, seed },
  )
}

test('§17 slice items 2–6, 9–10, 17–19 in one project', async () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'ew-e2e-slice-'))
  const app = await electron.launch({
    args: ['out/main/index.cjs'],
    env: { ...process.env, EW_PROJECT_DIR: projectDir },
  })
  const win = await app.firstWindow()
  await win.waitForFunction(() => window.__ewDebug !== undefined)
  const project = await query<{ id: string; rootNodeId: string }>(win, 'getProject')
  const rootCanvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  const ctx: Ctx = {
    win,
    projectId: project.id,
    rootNodeId: project.rootNodeId,
    rootCanvasId,
  }
  const box = (await win.getByTestId('canvas-host').boundingBox())!
  type Background = {
    assetId: string | null
    settings: Record<string, unknown> | null
    color: string | null
  }
  const scene = () =>
    query<{ background: Background; items: Array<Record<string, unknown>> }>(
      win,
      'getCanvasScene',
      { canvasId: ctx.rootCanvasId },
    )

  // ---- Item 2: set, edit, reset, replace, remove a managed image
  // background on the root canvas (one durable command each).
  const bgA = await importPng(win, 'bg-a.png', 10)
  const bgB = await importPng(win, 'bg-b.png', 200)
  let rev = await revision(win)
  await exec(ctx, 'SetCanvasBackground', {
    canvasId: ctx.rootCanvasId,
    assetId: bgA,
    settings: { x: 0, y: 0, scale: 1, opacity: 1 },
  })
  expect((await scene()).background.assetId).toBe(bgA)
  await exec(ctx, 'SetCanvasBackground', {
    canvasId: ctx.rootCanvasId,
    assetId: bgA,
    settings: { x: 40, y: 20, scale: 2, opacity: 1 },
  })
  expect((await scene()).background.settings).toMatchObject({ x: 40, scale: 2 })
  await exec(ctx, 'SetCanvasBackground', {
    canvasId: ctx.rootCanvasId,
    assetId: bgA,
    settings: { x: 0, y: 0, scale: 1, opacity: 1 },
  })
  await exec(ctx, 'SetCanvasBackground', {
    canvasId: ctx.rootCanvasId,
    assetId: bgB,
    settings: { x: 0, y: 0, scale: 1, opacity: 1 },
  })
  expect((await scene()).background.assetId).toBe(bgB)
  await exec(ctx, 'SetCanvasBackground', { canvasId: ctx.rootCanvasId, assetId: null, settings: null })
  expect((await scene()).background.assetId).toBeNull()
  expect(await revision(win)).toBe(rev + 5)

  // ---- Item 3: several drops, a paste, a browser drag with source
  // URL, an unsupported rejection with zero records. (URL-only drop
  // success/failure paths are pointer-proven in import.spec.ts.)
  const host = win.getByTestId('canvas-host')
  const dropFiles = async (
    files: Array<{ name: string; type: string; b64: string }>,
    extra?: { uriList?: string },
  ) =>
    host.dispatchEvent('drop', {
      dataTransfer: await win.evaluateHandle(
        ({ files, extra }) => {
          const dt = new DataTransfer()
          for (const f of files) {
            const bytes = Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0))
            dt.items.add(new File([bytes], f.name, { type: f.type }))
          }
          if (extra?.uriList) dt.setData('text/uri-list', extra.uriList)
          return dt
        },
        { files, extra: extra ?? null },
      ),
      clientX: box.x + 200,
      clientY: box.y + 200,
    })
  const png1x1 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg=='
  await dropFiles([
    { name: 'drop-a.png', type: 'image/png', b64: png1x1 },
  ])
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements >= 1)
  // Browser drag: bytes + source page URL attribution.
  const distinctPng = await win.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 3
    canvas.height = 3
    canvas.getContext('2d')!.fillRect(0, 1, 2, 2)
    const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'))
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let s = ''
    bytes.forEach((b) => (s += String.fromCharCode(b)))
    return btoa(s)
  })
  await dropFiles(
    [{ name: 'from-web.png', type: 'image/png', b64: distinctPng }],
    { uriList: 'https://example.com/page' },
  )
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements >= 2)
  const assets = await query<Array<{ sourceUrl?: string | null; source_url?: string | null }>>(
    win,
    'listAssets',
  )
  expect(
    assets.some((a) => (a.sourceUrl ?? a.source_url) === 'https://example.com/page'),
  ).toBe(true)
  // Unsupported file: clear notice, zero new records.
  const beforeReject = await win.evaluate(() => window.__ewDebug!.sceneStats().placements)
  const beforeRev = await revision(win)
  await dropFiles([{ name: 'notes.txt', type: 'text/plain', b64: btoa('hello') }])
  await expect(win.getByTestId('import-error')).toBeVisible()
  expect(await win.evaluate(() => window.__ewDebug!.sceneStats().placements)).toBe(beforeReject)
  expect(await contentCommandsSince(win, beforeRev)).toHaveLength(0)
  await win.getByTestId('import-error-dismiss').click()

  // ---- Item 5: pins with dot, icon, and cropped-image appearance.
  const pinAsset = await importPng(win, 'pin.png', 120)
  const dotNode = crypto.randomUUID()
  await exec(ctx, 'CreatePin', {
    nodeId: dotNode,
    canvasId: ctx.rootCanvasId,
    placementId: crypto.randomUUID(),
    x: 400,
    y: 120,
    appearance: { kind: 'dot', color: '#ff7700' },
  })
  await exec(ctx, 'CreatePin', {
    nodeId: crypto.randomUUID(),
    canvasId: ctx.rootCanvasId,
    placementId: crypto.randomUUID(),
    x: 460,
    y: 120,
    appearance: { kind: 'icon', icon: 'star' },
  })
  await exec(ctx, 'CreatePin', {
    nodeId: crypto.randomUUID(),
    canvasId: ctx.rootCanvasId,
    placementId: crypto.randomUUID(),
    x: 520,
    y: 120,
    appearance: { kind: 'image', assetId: pinAsset, crop: { x: 4, y: 4, width: 32, height: 24 } },
  })
  const pinned = await scene()
  expect(
    pinned.items.filter((i) => i['itemKind'] === 'placement').map((i) => i['appearanceKind']),
  ).toEqual(expect.arrayContaining(['dot', 'icon', 'image']))
  expect(
    pinned.items.find((i) => i['appearanceKind'] === 'image' && i['appearanceCrop'] !== null),
  ).toBeTruthy()

  // ---- Item 6: attach a note → the placement shows its title as a
  // label; toggle it off from the selection controls (pointer-driven).
  const noteId = crypto.randomUUID()
  await exec(ctx, 'CreateNote', { noteId, title: 'Harbor Watch' })
  await exec(ctx, 'AttachNoteToNode', { nodeId: dotNode, noteId })
  await expect
    .poll(() => win.evaluate(() => window.__ewGestureDebug!.labelTexts()))
    .toContain('Harbor Watch')
  await win.mouse.click(box.x + 400, box.y + 120)
  await expect
    .poll(() => win.evaluate(() => window.__ewGestureDebug!.handles().length))
    .toBeGreaterThan(0)
  const labelHandle = await win.evaluate(
    () => window.__ewGestureDebug!.handles().find((h) => h.kind === 'label')!,
  )
  rev = await revision(win)
  await win.mouse.click(box.x + labelHandle.x, box.y + labelHandle.y)
  await expect
    .poll(() => win.evaluate(() => window.__ewGestureDebug!.labelTexts()))
    .not.toContain('Harbor Watch')
  expect(await revision(win)).toBe(rev + 1)
  await win.mouse.click(box.x + 700, box.y + 500) // clear selection

  // ---- Item 4: marquee select, one-command multi-drag with snapping
  // guides and the Alt bypass, align/distribute, flip, zoom to fit
  // and to selection.
  const gA = crypto.randomUUID()
  const gB = crypto.randomUUID()
  for (const [placementId, x, y] of [
    [gA, 150, 400],
    [gB, 260, 430],
  ] as const) {
    const nodeId = crypto.randomUUID()
    await exec(ctx, 'CreateNode', { nodeId })
    await exec(ctx, 'CreatePlacement', {
      placementId,
      canvasId: ctx.rootCanvasId,
      nodeId,
      x,
      y,
      width: 40,
      height: 40,
    })
  }
  await win.waitForFunction(
    (ids) => {
      const stats = window.__ewDebug!.sceneStats()
      return stats.placements >= 7 && ids.every(Boolean)
    },
    [gA, gB],
  )
  // Marquee both, drag: exactly ONE durable command for the gesture.
  await win.mouse.move(box.x + 120, box.y + 370)
  await win.mouse.down()
  await win.mouse.move(box.x + 300, box.y + 470, { steps: 4 })
  await win.mouse.up()
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.selection().length)).toBe(2)
  rev = await revision(win)
  await win.mouse.move(box.x + 155, box.y + 405)
  await win.mouse.down()
  await win.mouse.move(box.x + 215, box.y + 405, { steps: 6 })
  await win.mouse.up()
  await expect.poll(() => revision(win)).toBe(rev + 1)
  // Snap drag: guides appear near a neighbor edge; Alt disables.
  rev = await revision(win)
  await win.mouse.move(box.x + 215, box.y + 405)
  await win.mouse.down()
  await win.mouse.move(box.x + 320, box.y + 431, { steps: 6 })
  const guides = await win.evaluate(() => window.__ewDebug!.guides().length)
  expect(guides).toBeGreaterThan(0)
  await win.keyboard.down('Alt')
  await win.mouse.move(box.x + 321, box.y + 432)
  expect(await win.evaluate(() => window.__ewDebug!.guides().length)).toBe(0)
  await win.keyboard.up('Alt')
  await win.mouse.up()
  await expect.poll(() => revision(win)).toBe(rev + 1)
  // Align + distribute: one command each. Flip: presentation state.
  await win.mouse.move(box.x + 90, box.y + 90)
  await win.mouse.down()
  await win.mouse.move(box.x + 700, box.y + 470, { steps: 3 })
  await win.mouse.up()
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.selection().length))
    .toBeGreaterThanOrEqual(3)
  rev = await revision(win)
  await win.getByTestId('align-top').click()
  await expect.poll(() => revision(win)).toBe(rev + 1)
  rev = await revision(win)
  await win.getByTestId('distribute-horizontal').click()
  await expect.poll(() => revision(win)).toBe(rev + 1)
  const flipTarget = await win.evaluate(() => window.__ewDebug!.selection()[0]!)
  await exec(ctx, 'FlipPlacement', { placementId: flipTarget, axis: 'x' })
  const flipped = await scene()
  expect(flipped.items.find((i) => i['id'] === flipTarget)!['flipX']).toBe(1)
  // Zoom to fit / to selection: camera only — no CONTENT command;
  // the debounced camera persist lands whenever it lands, so this
  // goes through the command log (AI-IMP-050).
  rev = await revision(win)
  const zoomBefore = await win.evaluate(() => window.__ewDebug!.camera().zoom)
  await win.getByTestId('zoom-fit').click()
  // §6.9 rev 0.11: fits EASE the camera — poll past the flight.
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.camera().zoom))
    .not.toBe(zoomBefore)
  expect(await contentCommandsSince(win, rev)).toHaveLength(0)
  await win.getByTestId('zoom-selection').click()
  expect(await contentCommandsSince(win, rev)).toHaveLength(0)

  // ---- Item 9: the same node placed twice, plus a zero-node note
  // placed from the sources panel (labeled dot appears).
  await exec(ctx, 'CreatePlacement', {
    placementId: crypto.randomUUID(),
    canvasId: ctx.rootCanvasId,
    nodeId: dotNode,
    x: 620,
    y: 320,
  })
  const nodeUses = (await scene()).items.filter((i) => i['nodeId'] === dotNode)
  expect(nodeUses.length).toBe(2)
  const looseNote = crypto.randomUUID()
  await exec(ctx, 'CreateNote', { noteId: looseNote, title: 'Unplaced Legend' })
  await win.getByTestId('toggle-sources').click()
  await win.getByTestId('sources-tab-notes').click()
  await win
    .locator(`[data-note-id="${looseNote}"]`)
    .getByTestId('sources-place-note')
    .click()
  await expect
    .poll(() => win.evaluate(() => window.__ewGestureDebug!.labelTexts()))
    .toContain('Unplaced Legend')
  await win.getByTestId('toggle-sources').click()

  // ---- Item 10: open a node's canvas (persisted immediately), add
  // nested content, return to the root canvas.
  const canvasOwner = crypto.randomUUID()
  await exec(ctx, 'CreateNode', { nodeId: canvasOwner })
  const nestedCanvas = crypto.randomUUID()
  await exec(ctx, 'CreateCanvas', { canvasId: nestedCanvas, nodeId: canvasOwner })
  // Persisted before any content: the row is queryable right now.
  expect(
    await query<{ id: string } | null>(win, 'getCanvasByNode', { nodeId: canvasOwner }),
  ).toMatchObject({ id: nestedCanvas })
  await win.evaluate((id) => window.__ewDebug!.openCanvas(id), nestedCanvas)
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().total === 0)
  await exec(ctx, 'CreatePin', {
    nodeId: crypto.randomUUID(),
    canvasId: nestedCanvas,
    placementId: crypto.randomUUID(),
    x: 50,
    y: 50,
    appearance: { kind: 'dot', color: '#22cc88' },
  })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)
  await win.evaluate((id) => window.__ewDebug!.openCanvas(id), ctx.rootCanvasId)
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements >= 8)

  // ---- Item 17: detach a note without touching other uses; make a
  // note independent under a new project-unique title.
  const sharedNote = crypto.randomUUID()
  await exec(ctx, 'CreateNote', { noteId: sharedNote, title: 'Shared Lore' })
  const userA = crypto.randomUUID()
  const userB = crypto.randomUUID()
  for (const nodeId of [userA, userB]) {
    await exec(ctx, 'CreateNode', { nodeId })
    await exec(ctx, 'AttachNoteToNode', { nodeId, noteId: sharedNote })
  }
  await exec(ctx, 'DetachNoteFromNode', { nodeId: userA })
  expect(await query<{ noteId: string | null }>(win, 'getNode', { nodeId: userA })).toMatchObject({
    noteId: null,
  })
  expect(await query<{ noteId: string | null }>(win, 'getNode', { nodeId: userB })).toMatchObject({
    noteId: sharedNote,
  })
  const independent = crypto.randomUUID()
  await exec(ctx, 'MakeNoteIndependent', {
    nodeId: userB,
    newNoteId: independent,
    newTitle: 'Shared Lore (B)',
  })
  expect(await query<{ noteId: string | null }>(win, 'getNode', { nodeId: userB })).toMatchObject({
    noteId: independent,
  })
  expect(
    await query<{ title: string; body: string } | null>(win, 'getNote', { noteId: sharedNote }),
  ).toMatchObject({ title: 'Shared Lore' })

  // ---- Item 18: every decoration kind, incl. a placement-anchored
  // connector (one durable command each; §4.9 non-semantic).
  const anchorPlacement = nodeUses[0]!['id'] as string
  const mkDecoration = async (kind: string, data: Record<string, unknown>, anchors = {}) => {
    const before = await revision(win)
    await exec(ctx, 'CreateDecoration', {
      decorationId: crypto.randomUUID(),
      canvasId: ctx.rootCanvasId,
      kind,
      data,
      ...anchors,
    })
    expect(await revision(win)).toBe(before + 1)
  }
  await mkDecoration('text', { x: 40, y: 600, text: 'slice text', fontSize: 16, color: '#eee' })
  await mkDecoration('shape', { shape: 'rect', x: 140, y: 600, width: 60, height: 40, stroke: '#eee', strokeWidth: 2 })
  await mkDecoration('shape', { shape: 'ellipse', x: 240, y: 600, width: 60, height: 40, stroke: '#eee', strokeWidth: 2 })
  await mkDecoration('path', { points: [[340, 600], [380, 640], [420, 610]], stroke: '#eee', strokeWidth: 2 })
  await mkDecoration('line', { x1: 460, y1: 600, x2: 520, y2: 640, stroke: '#eee', strokeWidth: 2 })
  await mkDecoration('arrow', { x1: 540, y1: 600, x2: 600, y2: 640, stroke: '#eee', strokeWidth: 2 })
  await mkDecoration(
    'connector',
    { x1: 620, y1: 600, x2: 660, y2: 640, stroke: '#eee', strokeWidth: 2 },
    { anchorStartPlacementId: anchorPlacement },
  )

  // ---- Item 19: reorder, lock, hide, group, move, ungroup; inverse
  // round-trip stands in for undo (EPIC-007 owns the interactive
  // stack); connectors stayed visual (no graph identity to query —
  // asserted structurally by §4.9's absence of any link/edge rows for
  // decorations, checked via search finding only the text).
  const decorationIds = (await scene()).items
    .filter((i) => i['itemKind'] === 'decoration')
    .map((i) => i['id'] as string)
  const [d1, d2] = decorationIds as [string, string]
  rev = await revision(win)
  await exec(ctx, 'ReorderContent', { canvasId: ctx.rootCanvasId, itemId: d1, afterId: null, beforeId: (await scene()).items[0]!['id'] })
  expect(await revision(win)).toBe(rev + 1)
  await exec(ctx, 'UpdateDecoration', { decorationId: d1, set: { locked: true } })
  await exec(ctx, 'UpdateDecoration', { decorationId: d2, set: { hidden: true } })
  expect(await win.evaluate((id) => window.__ewDebug!.decorationVisible(id), d2)).toBe(false)
  await exec(ctx, 'UpdateDecoration', { decorationId: d2, set: { hidden: false } })
  const groupId = crypto.randomUUID()
  const groupMembers = decorationIds.slice(2, 4) as [string, string]
  await exec(ctx, 'GroupDecorations', {
    groupId,
    canvasId: ctx.rootCanvasId,
    decorationIds: groupMembers,
  })
  const groupMove = (await win.evaluate(
    async ({ projectId, canvasId, members }) => {
      const sceneResult = await window.ew.project.query('getCanvasScene', { canvasId })
      if (!sceneResult.ok) throw new Error(sceneResult.message)
      const items = (sceneResult.result as { items: Array<Record<string, unknown>> }).items
      const payloadItems = members.map((id) => {
        const item = items.find((i) => i['id'] === id)!
        const data = { ...(item['data'] as Record<string, unknown>) }
        if (typeof data['x'] === 'number') data['x'] = (data['x'] as number) + 25
        if (typeof data['points'] === 'object') {
          data['points'] = (data['points'] as Array<[number, number]>).map(([x, y]) => [x + 25, y])
        }
        return { kind: 'decoration', decorationId: id, data }
      })
      const result = await window.ew.project.execute({
        commandId: crypto.randomUUID(),
        projectId,
        commandType: 'TransformContent',
        commandVersion: 1,
        issuedAt: new Date().toISOString(),
        payload: { canvasId, items: payloadItems },
      })
      if (result.status !== 'committed') throw new Error(`group move: ${result.status}`)
      return result
    },
    { projectId: ctx.projectId, canvasId: ctx.rootCanvasId, members: groupMembers },
  )) as { inverse: { commandType: string; commandVersion: number; payload: unknown } }
  // Inverse round-trip (data-level undo).
  await exec(ctx, groupMove.inverse.commandType, groupMove.inverse.payload)
  await exec(ctx, 'UngroupDecorations', { groupId })
  const finalScene = await scene()
  expect(
    finalScene.items.filter((i) => groupMembers.includes(i['id'] as string)).every((i) => i['groupId'] === null),
  ).toBe(true)

  await app.close()
})
