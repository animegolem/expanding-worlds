import { expect, test, type Page } from '@playwright/test'
import { exec, launchApp, launchAppInDir, runQuery } from './helpers'

interface PlacementRow {
  id: string
  caption: string | null
}

async function pngAsset(win: Page): Promise<string> {
  return win.evaluate(async () => {
    const canvas = new OffscreenCanvas(12, 8)
    const context = canvas.getContext('2d')!
    context.fillStyle = 'rgb(35, 105, 210)'
    context.fillRect(0, 0, 12, 8)
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    const result = await window.ew.project.importAsset({
      bytes: new Uint8Array(await blob.arrayBuffer()),
      originalFilename: 'caption-blue.png',
    })
    if (!result.ok) throw new Error(result.message)
    return result.assetId
  })
}

async function scenePlacements(win: Page): Promise<PlacementRow[]> {
  const scene = await runQuery<{ items: Array<Record<string, unknown>> }>(
    win,
    'getCanvasScene',
    { canvasId: await win.evaluate(() => window.__ewDebug!.canvasId()) },
  )
  return scene.items
    .filter((item) => item['itemKind'] === 'placement')
    .map((item) => ({
      id: item['id'] as string,
      caption: item['caption'] as string | null,
    }))
}

async function captionOf(win: Page, placementId: string): Promise<string | null | undefined> {
  return (await scenePlacements(win)).find((placement) => placement.id === placementId)?.caption
}

async function labels(win: Page): Promise<string[]> {
  return win.evaluate(() =>
    [...window.__ewGestureDebug!.labelTexts()]
      .map((text) => text.replace(/\s+/g, ' '))
      .sort(),
  )
}

async function openCaptionFromMenu(
  win: Page,
  at: { x: number; y: number },
  expectedLabel: 'Add caption…' | 'Edit caption…',
): Promise<void> {
  const host = (await win.getByTestId('canvas-host').boundingBox())!
  await win.mouse.click(host.x + at.x, host.y + at.y, { button: 'right' })
  const row = win.getByTestId('ctx-caption')
  await expect(row).toHaveText(expectedLabel)
  await row.click()
  await expect(win.getByTestId('caption-editor')).toBeVisible()
}

async function pinEngagement(win: Page): Promise<void> {
  await win.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('ew-test-set-engagement', { detail: { engaged: true, hold: true } }),
    )
  })
}

test('caption is placement-local, replaces its title label, persists, stays out of outline, and is one undo', async () => {
  const launched = await launchApp('ew-e2e-caption-')
  let app = launched.app
  let win = launched.win
  const { projectDir } = launched
  const firstAt = { x: 320, y: 260 }
  const secondAt = { x: 700, y: 260 }
  const nodeId = crypto.randomUUID()
  const noteId = crypto.randomUUID()
  const firstPlacementId = crypto.randomUUID()
  const secondPlacementId = crypto.randomUUID()
  const title = 'Blue reference title'
  const thought = 'I like the blue'

  try {
    const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
    const assetId = await pngAsset(win)
    await exec(win, 'CreateNode', { nodeId })
    await exec(win, 'CreateNote', { noteId, title, body: '' })
    await exec(win, 'AttachNoteToNode', { nodeId, noteId })
    await exec(win, 'SetNodeAppearance', {
      nodeId,
      appearance: { kind: 'image', assetId, crop: null },
    })
    await exec(win, 'CreatePlacement', {
      placementId: firstPlacementId,
      canvasId,
      nodeId,
      x: firstAt.x,
      y: firstAt.y,
      width: 240,
      height: 160,
    })
    await exec(win, 'CreatePlacement', {
      placementId: secondPlacementId,
      canvasId,
      nodeId,
      x: secondAt.x,
      y: secondAt.y,
      width: 240,
      height: 160,
    })
    await expect.poll(() => scenePlacements(win)).toHaveLength(2)
    await expect.poll(() => labels(win)).toEqual([title, title])

    await openCaptionFromMenu(win, firstAt, 'Add caption…')
    await win.getByTestId('caption-editor').fill(thought)
    await win.getByTestId('caption-editor').press('Enter')
    await expect.poll(() => captionOf(win, firstPlacementId)).toBe(thought)
    expect(await captionOf(win, secondPlacementId)).toBeNull()
    // The caption occupies the first placement text slot; its title is
    // not stacked. The second placement of the same node keeps its title.
    await expect.poll(() => labels(win)).toEqual([thought, title].sort())

    const outline = await runQuery<unknown>(win, 'getOutlineTree')
    expect(JSON.stringify(outline)).not.toContain(thought)

    await expect.poll(() => win.evaluate(() => window.__ewUndo !== undefined)).toBe(true)
    await win.evaluate(() => window.__ewUndo!.undo())
    await expect.poll(() => captionOf(win, firstPlacementId)).toBeNull()
    await expect.poll(() => labels(win)).toEqual([title, title])

    // Put it back through the same user-facing verb, then prove the
    // placement property survives a full app restart.
    await openCaptionFromMenu(win, firstAt, 'Add caption…')
    await win.getByTestId('caption-editor').fill(thought)
    await win.getByTestId('caption-editor').press('Enter')
    await expect.poll(() => captionOf(win, firstPlacementId)).toBe(thought)
    await app.close()

    const relaunched = await launchAppInDir(projectDir)
    app = relaunched.app
    win = relaunched.win
    await expect.poll(() => captionOf(win, firstPlacementId)).toBe(thought)
    await expect.poll(() => labels(win)).toEqual([thought, title].sort())

    // Edit pre-fills; committing empty clears. This also proves the menu
    // reflects the live Add/Edit state.
    await openCaptionFromMenu(win, firstAt, 'Edit caption…')
    await expect(win.getByTestId('caption-editor')).toHaveValue(thought)
    await win.getByTestId('caption-editor').fill('')
    await win.getByTestId('caption-editor').press('Enter')
    await expect.poll(() => captionOf(win, firstPlacementId)).toBeNull()

    // The image-only charm is the second entry surface and opens the
    // same editor instance. (The engagement clock is pinned for hidden
    // windows so the faded charm layer stays pointer-active.)
    await pinEngagement(win)
    const host = (await win.getByTestId('canvas-host').boundingBox())!
    await win.mouse.click(host.x + firstAt.x, host.y + firstAt.y)
    await expect(win.getByTestId('charm-caption')).toBeVisible()
    await win.getByTestId('charm-caption').click()
    await expect(win.getByTestId('caption-editor')).toBeVisible()
    await win.getByTestId('caption-editor').fill('Charm thought')
    await win.getByTestId('caption-editor').press('Enter')
    await expect.poll(() => captionOf(win, firstPlacementId)).toBe('Charm thought')
    expect(await captionOf(win, secondPlacementId)).toBeNull()
  } finally {
    await app.close().catch(() => undefined)
  }
})
