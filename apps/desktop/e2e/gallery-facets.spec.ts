import { expect, test, type Page } from '@playwright/test'
import { exec, launchApp } from './helpers'

/**
 * §14.4 gallery facets (AI-IMP-078): the retrieval half. A facet
 * strip above the grid — sort segmented control, kind chips, a tag
 * completion field with count-ordered suggestions (custom list,
 * never <datalist>), removable active-tag chips, and the two
 * cleanup toggles (untagged · unplaced). Every control commits on
 * click and the grid re-queries live; buckets are DATE sort's
 * presentation and the flat grid belongs to name/size. Note-kind
 * cells render as text posts (FR-8): title + clamped excerpt, tags
 * on hover via the title attribute.
 */

interface FacetWorld {
  imageNode: string
  clipNode: string
  bareNode: string
  boardNode: string
  ruinsTagId: string
  inkTagId: string
}

async function seedFacetWorld(win: Page): Promise<FacetWorld> {
  // One image with a REAL imported asset (the kind chip must find a
  // genuine image-kind entry), PLACED on the root board.
  const { assetId } = await win.evaluate(async () => {
    const canvas = new OffscreenCanvas(320, 240)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = 'rgb(40, 90, 200)'
    ctx.fillRect(0, 0, 320, 240)
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const result = await window.ew.project.importAsset({ bytes, originalFilename: 'blue.png' })
    if (!result.ok) throw new Error('seed import failed')
    return { assetId: result.assetId }
  })
  const imageNode = crypto.randomUUID()
  await exec(win, 'CreateNode', { nodeId: imageNode })
  await exec(win, 'SetNodeAppearance', {
    nodeId: imageNode,
    appearance: { kind: 'image', assetId, crop: null },
  })
  const rootCanvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  await exec(win, 'CreatePlacement', {
    placementId: crypto.randomUUID(),
    canvasId: rootCanvasId,
    nodeId: imageNode,
  })

  // A text clipping: title + body long enough to clamp.
  const clipNode = crypto.randomUUID()
  const clipNote = crypto.randomUUID()
  await exec(win, 'CreateNode', { nodeId: clipNode })
  await exec(win, 'CreateNote', {
    noteId: clipNote,
    title: 'Zeppelin Clipping',
    body: 'The airship drifted over the ruined harbor at dawn. '.repeat(6),
  })
  await exec(win, 'AttachNoteToNode', { nodeId: clipNode, noteId: clipNote })

  // A bare node (untagged AND unplaced) and a board.
  const bareNode = crypto.randomUUID()
  await exec(win, 'CreateNode', { nodeId: bareNode })
  const boardNode = crypto.randomUUID()
  const boardNote = crypto.randomUUID()
  await exec(win, 'CreateNode', { nodeId: boardNode })
  await exec(win, 'CreateNote', { noteId: boardNote, title: 'Ruins Board', body: '' })
  await exec(win, 'AttachNoteToNode', { nodeId: boardNode, noteId: boardNote })
  await exec(win, 'CreateCanvas', { canvasId: crypto.randomUUID(), nodeId: boardNode })

  // Tags: ruins carries 2 (image + clipping), ink carries 1.
  const ruinsTagId = crypto.randomUUID()
  const inkTagId = crypto.randomUUID()
  await exec(win, 'CreateTag', { tagId: ruinsTagId, name: 'ruins' })
  await exec(win, 'CreateTag', { tagId: inkTagId, name: 'ink' })
  await exec(win, 'AssignTagToNode', { tagId: ruinsTagId, nodeId: imageNode })
  await exec(win, 'AssignTagToNode', { tagId: ruinsTagId, nodeId: clipNode })
  await exec(win, 'AssignTagToNode', { tagId: inkTagId, nodeId: clipNode })

  return { imageNode, clipNode, bareNode, boardNode, ruinsTagId, inkTagId }
}

test('facets filter live: tag with counts, kinds, cleanup toggles, sort presentation (§14.4)', async () => {
  const { app, win } = await launchApp('ew-e2e-gallery-facets-')
  const world = await seedFacetWorld(win)

  await win.getByTestId('charm-gallery').click()
  await expect(win.getByTestId('takeover-gallery')).toBeVisible()
  const cells = win.locator('[data-testid="gallery-cell"]')
  await expect(cells).toHaveCount(4)

  // FR-8 text post: the clipping reads in place — title, clamped
  // excerpt, tags on hover (title attribute).
  const clipCell = win.locator(`[data-testid="gallery-cell"][data-node-id="${world.clipNode}"]`)
  await expect(clipCell.locator('.post-title')).toHaveText('Zeppelin Clipping')
  await expect(clipCell.locator('.post-excerpt')).toContainText('airship drifted')
  await expect(clipCell.locator('.text-post')).toHaveAttribute('title', '#ink  #ruins')

  // Tag completion: focus offers the count-ordered vocabulary —
  // ruins (2) before ink (1) — and picking the top commits a chip.
  await win.getByTestId('gallery-tag-input').click()
  const options = win.locator('[data-testid="gallery-tag-option"]')
  await expect(options).toHaveCount(2)
  await expect(options.nth(0)).toContainText('ruins')
  await expect(options.nth(0)).toContainText('2')
  await win.getByTestId('gallery-tag-input').fill('ru')
  await expect(options).toHaveCount(1)
  await options.first().click()
  await expect(win.getByTestId(`gallery-tag-chip-${world.ruinsTagId}`)).toBeVisible()
  // The grid shows exactly the tag's carriers — the suggested count.
  await expect(cells).toHaveCount(2)

  // Kind facet stacks onto the tag filter; the suggestion counts
  // rescope with the mask (clipping is ruins' only note carrier).
  await win.getByTestId('gallery-kind-note').click()
  await expect(win.getByTestId('gallery-kind-note')).toHaveAttribute('aria-pressed', 'true')
  await expect(cells).toHaveCount(1)
  await expect(cells.first()).toHaveAttribute('data-kind', 'note')
  await win.getByTestId('gallery-tag-input').click()
  await expect(options.first()).toContainText('1')
  await win.getByTestId('gallery-tag-input').blur()

  // Peel the filters: remove the chip, clear the kind mask.
  await win.getByTestId(`gallery-tag-chip-${world.ruinsTagId}`).locator('button').click()
  await expect(win.getByTestId(`gallery-tag-chip-${world.ruinsTagId}`)).toHaveCount(0)
  await win.getByTestId('gallery-kind-note').click()
  await expect(cells).toHaveCount(4)

  // Cleanup filters own the §14.1 vocabulary: untagged finds the
  // bare node and the board; unplaced drops only the placed image.
  await win.getByTestId('gallery-filter-untagged').click()
  await expect(cells).toHaveCount(2)
  await win.getByTestId('gallery-filter-unplaced').click()
  await expect(cells).toHaveCount(2)
  await win.getByTestId('gallery-filter-untagged').click()
  await expect(cells).toHaveCount(3)
  const unplacedIds = await cells.evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-node-id')),
  )
  expect(unplacedIds).not.toContain(world.imageNode)
  await win.getByTestId('gallery-filter-unplaced').click()

  // A contradiction empties the grid honestly, not into a dead end.
  await win.getByTestId('gallery-kind-image').click()
  await win.getByTestId('gallery-filter-untagged').click()
  await expect(win.getByTestId('gallery-empty')).toContainText('Nothing matches')
  await win.getByTestId('gallery-filter-untagged').click()
  await win.getByTestId('gallery-kind-image').click()

  // Buckets are date sort's presentation: name sort renders the
  // FLAT grid (no headers, no period control) and collates by
  // label; returning to date restores the buckets.
  await expect(win.getByTestId('gallery-period')).toBeVisible()
  await win.getByTestId('gallery-sort-name').click()
  await expect(win.getByTestId('gallery-sort-name')).toHaveAttribute('aria-pressed', 'true')
  await expect(win.locator('[data-testid="gallery-bucket"]')).toHaveCount(0)
  await expect(win.getByTestId('gallery-period')).toHaveCount(0)
  await expect(cells).toHaveCount(4)
  // Titled entries collate: the untitled image (id-key fallback)
  // leads, then Ruins Board < Zeppelin Clipping.
  const namedOrder = await cells.evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-node-id')),
  )
  expect(namedOrder.indexOf(world.boardNode)).toBeLessThan(namedOrder.indexOf(world.clipNode))
  await win.getByTestId('gallery-sort-date').click()
  await expect(win.locator('[data-testid="gallery-bucket"]').first()).toContainText('Today')
  await expect(win.getByTestId('gallery-period')).toBeVisible()

  await app.close()
})
