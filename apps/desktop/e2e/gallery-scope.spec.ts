import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { exec, launchApp, launchAppInDir, revision, runQuery, seedPlacedNote } from './helpers'

/**
 * §14.4 gallery scope toggle (AI-IMP-089): *this world · everything*
 * selects WHOSE gallery is shown. "Everything" IS the designated
 * library project's gallery, browsed read-only over the 088
 * secondary seam — entries and the tag vocabulary swap whole,
 * thumbnails re-root at the source store via ?scope=source, every
 * place/mutate action greys out, and the primary project is
 * untouched throughout. Two-launch fixture pattern: the library is
 * a REAL project seeded through an ordinary app session.
 */

/** Seed one tagged note and one imported image into the current
 * session's project, so both the entry swap and the cross-store
 * thumbnail path are observable. */
async function seedLibraryMaterial(win: Page, tagName: string): Promise<void> {
  const { nodeId } = await seedPlacedNote(win, 'Library Clipping', 'lore excerpt', {
    x: 80,
    y: 80,
  })
  const tagId = crypto.randomUUID()
  await exec(win, 'CreateTag', { tagId, name: tagName })
  await exec(win, 'AssignTagToNode', { tagId, nodeId })

  // A REAL imported asset: its blob exists ONLY in the library's
  // store, so a rendered pixel proves main re-rooted the request.
  const { assetId } = await win.evaluate(async () => {
    const canvas = new OffscreenCanvas(320, 240)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = 'rgb(40, 160, 90)'
    ctx.fillRect(0, 0, 320, 240)
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const result = await window.ew.project.importAsset({
      bytes,
      originalFilename: 'green.png',
    })
    if (!result.ok) throw new Error('library seed import failed')
    return { assetId: result.assetId }
  })
  const imageNode = crypto.randomUUID()
  await exec(win, 'CreateNode', { nodeId: imageNode })
  await exec(win, 'SetNodeAppearance', {
    nodeId: imageNode,
    appearance: { kind: 'image', assetId, crop: null },
  })
}

async function openGallery(win: Page): Promise<void> {
  await win.getByTestId('charm-gallery').click()
  await expect(win.getByTestId('takeover-gallery')).toBeVisible()
}

test('this world · everything: entries and tag vocabulary swap; actions grey; primary untouched', async () => {
  // Library fixture through an ordinary session (secondary.spec.ts
  // pattern), then the world under test with its own material.
  const libraryDir = mkdtempSync(join(tmpdir(), 'ew-e2e-scope-lib-'))
  {
    const { app, win } = await launchAppInDir(libraryDir)
    await seedLibraryMaterial(win, 'archive')
    await app.close()
  }

  const { app, win } = await launchApp('ew-e2e-scope-')
  const { nodeId: worldNode } = await seedPlacedNote(win, 'World Note', 'local lore', {
    x: 120,
    y: 120,
  })
  const worldTagId = crypto.randomUUID()
  await exec(win, 'CreateTag', { tagId: worldTagId, name: 'worldtag' })
  await exec(win, 'AssignTagToNode', { tagId: worldTagId, nodeId: worldNode })
  await win.evaluate(
    (dir) => window.ew.settings.setApp('libraryProjectDir', dir),
    libraryDir,
  )
  const revBefore = await revision(win)

  await openGallery(win)
  const cells = win.locator('[data-testid="gallery-cell"]')

  // Default scope is this-world: the world's single entry, the
  // world's vocabulary.
  await expect(win.getByTestId('gallery-scope-this-world')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(cells).toHaveCount(1)
  await expect(cells.first()).toContainText('World Note')
  await win.getByTestId('gallery-tag-input').click()
  await expect(win.locator('[data-testid="gallery-tag-option"]')).toContainText(['worldtag'])
  await win.getByTestId('gallery-tag-input').blur()

  // Flip to everything: the library's two entries, the library's
  // vocabulary, and the honesty line (this world does not mirror).
  await win.getByTestId('gallery-scope-everything').click()
  await expect(cells).toHaveCount(2)
  await expect(
    win.locator('[data-testid="gallery-cell"][data-kind="note"]'),
  ).toContainText('Library Clipping')
  await expect(win.getByTestId('gallery-mirror-notice')).toBeVisible()
  await win.getByTestId('gallery-tag-input').click()
  const options = win.locator('[data-testid="gallery-tag-option"]')
  await expect(options).toContainText(['archive'])
  expect(await options.allTextContents()).not.toContain('worldtag')
  await win.getByTestId('gallery-tag-input').blur()

  // The image cell rides ?scope=source and the pixels arrive: that
  // blob exists ONLY in the library's store, so a decoded width
  // proves the ew-asset re-root end to end (thumb or its fallback).
  const imageCell = win.locator('[data-testid="gallery-cell"][data-kind="image"]')
  await expect(imageCell).toHaveCount(1)
  await expect
    .poll(async () => (await imageCell.locator('img').getAttribute('src')) ?? '')
    .toContain('scope=source')
  await expect
    .poll(() =>
      imageCell.locator('img').evaluate((el) => (el as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0)

  // Selection stays scope-agnostic; the mutating actions do not.
  await imageCell.click()
  await expect(win.getByTestId('gallery-action-bar')).toBeVisible()
  await expect(win.getByTestId('gallery-action-place')).toBeDisabled()
  await expect(win.getByTestId('gallery-action-trash')).toBeDisabled()
  await expect(win.getByTestId('gallery-action-tag')).toBeDisabled()
  // Enter's primary action is also fenced: the takeover stays put.
  await win.keyboard.press('Enter')
  await expect(win.getByTestId('takeover-gallery')).toBeVisible()

  // Back to this-world: the world's entry returns, actions revive.
  await win.getByTestId('gallery-scope-this-world').click()
  await expect(cells).toHaveCount(1)
  await expect(cells.first()).toContainText('World Note')
  await cells.first().click()
  await expect(win.getByTestId('gallery-action-place')).toBeEnabled()

  // Browsing wrote NOTHING into the primary project.
  expect(await revision(win)).toBe(revBefore)

  // With the world's mirror ON, the honesty line stands down.
  await win.evaluate(() => window.ew.settings.setProject('mirror_drops', true))
  await win.getByTestId('gallery-scope-everything').click()
  await expect(cells).toHaveCount(2)
  await expect(win.getByTestId('gallery-mirror-notice')).not.toBeVisible()

  await app.close()
})

test('CA-014: a quick everything → this-world flip during the open leaves the scope state honest', async () => {
  // Library fixture through an ordinary session, then the world under
  // test with its own single entry.
  const libraryDir = mkdtempSync(join(tmpdir(), 'ew-e2e-scope-flip-lib-'))
  {
    const { app, win } = await launchAppInDir(libraryDir)
    await seedPlacedNote(win, 'Library Seed', 'lore', { x: 60, y: 60 })
    await app.close()
  }

  const { app, win } = await launchApp('ew-e2e-scope-flip-')
  await seedPlacedNote(win, 'World Note', 'local lore', { x: 120, y: 120 })
  await openGallery(win)

  const everything = win.getByTestId('gallery-scope-everything')
  const thisWorld = win.getByTestId('gallery-scope-this-world')
  const cells = win.locator('[data-testid="gallery-cell"]')

  // Designate through the UI so the store=true open path (the CA-014
  // `await settings.setApp` mid-open) runs, then IMMEDIATELY flip back
  // to this-world while that write is in flight: the stale continuation
  // must not re-mark the now-closed source open.
  await everything.click()
  await expect(win.getByTestId('gallery-designate')).toBeVisible()
  await win.getByTestId('gallery-designate-input').fill(libraryDir)
  await win.getByTestId('gallery-designate-confirm').click()
  await thisWorld.click() // race the flip against the open handshake

  // This-world is honest: its single entry, no stranded "Opening…" line.
  await expect(thisWorld).toHaveAttribute('aria-pressed', 'true')
  await expect(win.getByTestId('gallery-scope-waiting')).toHaveCount(0)
  await expect(cells).toHaveCount(1)
  await expect(cells.first()).toContainText('World Note')

  // Flip to everything again: the source must GENUINELY open. A falsely
  // 'open' flag left by the stale continuation would leave the grid
  // querying a closed source and stranded empty; instead it resolves to
  // the library's one entry.
  await everything.click()
  await expect(cells).toHaveCount(1)
  await expect(cells.first()).toContainText('Library Seed')
  await expect(win.getByTestId('gallery-scope-waiting')).toHaveCount(0)

  await app.close()
})

test('no library designated: the everything side prompts; the open validates before storing', async () => {
  const libraryDir = mkdtempSync(join(tmpdir(), 'ew-e2e-scope-designate-lib-'))
  {
    const { app, win } = await launchAppInDir(libraryDir)
    await seedPlacedNote(win, 'Seed Entry', 'seed', { x: 60, y: 60 })
    await app.close()
  }

  const { app, win } = await launchApp('ew-e2e-scope-designate-')
  await openGallery(win)
  await win.getByTestId('gallery-scope-everything').click()
  await expect(win.getByTestId('gallery-designate')).toBeVisible()

  // A directory that is not a project refuses — and stores nothing.
  await win
    .getByTestId('gallery-designate-input')
    .fill(join(tmpdir(), `ew-not-a-project-${Date.now()}`))
  await win.getByTestId('gallery-designate-confirm').click()
  await expect(win.getByTestId('gallery-designate-error')).toBeVisible()
  const stored = await win.evaluate(() => window.ew.settings.appAll())
  expect(stored['libraryProjectDir']).toBeUndefined()

  // The real project designates: setting stored, grid browses it.
  await win.getByTestId('gallery-designate-input').fill(libraryDir)
  await win.getByTestId('gallery-designate-confirm').click()
  const cells = win.locator('[data-testid="gallery-cell"]')
  await expect(cells).toHaveCount(1)
  await expect(cells.first()).toContainText('Seed Entry')
  const after = await win.evaluate(() => window.ew.settings.appAll())
  expect(after['libraryProjectDir']).toBe(libraryDir)

  await app.close()
})

/**
 * §14.4 the everything-scope pull (AI-IMP-115): the one live
 * everything-scope action. Pull ingests the item by the ordinary copy
 * semantics (or recognizes an existing node), closes the takeover, and
 * hands the board a place cursor — click places, Escape stores unplaced
 * with a toast. Covered end to end in one fixture: enablement (single
 * asset-kind only), the Escape-stores-unplaced exit, the click-places
 * exit landing at the click point, and hash recognition making no
 * duplicate node on a second pull of the same item.
 */
async function imageNodeCount(win: Page): Promise<number> {
  const index = await runQuery<Array<{ nodeId: string }>>(win, 'getGalleryIndex', {
    kinds: ['image'],
  })
  return index.length
}

async function flipToEverything(win: Page): Promise<void> {
  await win.getByTestId('charm-gallery').click()
  await expect(win.getByTestId('takeover-gallery')).toBeVisible()
  await win.getByTestId('gallery-scope-everything').click()
}

test('everything-scope pull: enablement, Escape stores unplaced, click places, hash recognition dedupes', async () => {
  // Library fixture: one note + one real imported image (the image's
  // blob lives ONLY in the library store until a pull copies it).
  const libraryDir = mkdtempSync(join(tmpdir(), 'ew-e2e-pull-lib-'))
  {
    const { app, win } = await launchAppInDir(libraryDir)
    await seedLibraryMaterial(win, 'archive')
    await app.close()
  }

  const { app, win } = await launchApp('ew-e2e-pull-')
  await win.evaluate((dir) => window.ew.settings.setApp('libraryProjectDir', dir), libraryDir)

  // This world starts with no image nodes at all.
  expect(await imageNodeCount(win)).toBe(0)

  await flipToEverything(win)
  const imageCell = win.locator('[data-testid="gallery-cell"][data-kind="image"]')
  const noteCell = win.locator('[data-testid="gallery-cell"][data-kind="note"]')
  await expect(imageCell).toHaveCount(1)

  // Enablement: pull is live for a single asset-kind item; the other
  // actions stay browse-only, and note-kind / multi-select do not pull.
  await noteCell.first().click()
  const pull = win.getByTestId('gallery-action-pull')
  await expect(pull).toBeDisabled()
  await expect(win.getByTestId('gallery-action-place')).toBeDisabled()
  await expect(win.getByTestId('gallery-action-tag')).toBeDisabled()
  await expect(win.getByTestId('gallery-action-trash')).toBeDisabled()
  await imageCell.click()
  await expect(pull).toBeEnabled()
  await noteCell.first().click({ modifiers: ['Meta'] }) // extend to two
  await expect(win.getByTestId('gallery-action-count')).toHaveText('2')
  await expect(pull).toBeDisabled()

  // --- Escape exit: pull ingests (bytes copied) then Escape stores the
  // node UNPLACED with the toast; no placement is created. ---
  await imageCell.click() // back to the single image
  await expect(pull).toBeEnabled()
  await pull.click()
  await expect(win.getByTestId('takeover-gallery')).toHaveCount(0)
  await expect(win.getByTestId('place-mode-ghost')).toBeVisible()
  await win.keyboard.press('Escape')
  await expect(win.getByTestId('place-mode-ghost')).toHaveCount(0)
  await expect(win.getByTestId('gallery-actions')).toContainText('unplaced')

  // The node exists in this world (bytes copied), but unplaced.
  await expect.poll(() => imageNodeCount(win)).toBe(1)
  const pulledNode = (
    await runQuery<Array<{ nodeId: string }>>(win, 'getGalleryIndex', { kinds: ['image'] })
  )[0]!.nodeId
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  const placementsFor = async (): Promise<Array<{ nodeId: string; x: number; y: number }>> => {
    const scene = await runQuery<{
      items: Array<{ itemKind: string; nodeId: string; x: number; y: number }>
    }>(win, 'getCanvasScene', { canvasId })
    return scene.items.filter((it) => it.itemKind === 'placement' && it.nodeId === pulledNode)
  }
  expect(await placementsFor()).toHaveLength(0)

  // --- Click exit + recognition: a SECOND pull of the same item finds
  // the node already in this world (dedupe), enters place mode with it,
  // and a click places it at the cursor — no duplicate node is made. ---
  await flipToEverything(win)
  await imageCell.click()
  await expect(pull).toBeEnabled()
  await pull.click()
  await expect(win.getByTestId('place-mode-ghost')).toBeVisible()

  const host = (await win.getByTestId('canvas-host').boundingBox())!
  const clickX = host.x + host.width * 0.6
  const clickY = host.y + host.height * 0.45
  await win.mouse.move(clickX, clickY)
  const expected = await win.evaluate(
    ({ cx, cy }) => {
      const rect = document.querySelector('[data-testid="canvas-host"]')!.getBoundingClientRect()
      const cam = window.__ewDebug!.camera()
      return { x: (cx - rect.left) / cam.zoom + cam.x, y: (cy - rect.top) / cam.zoom + cam.y }
    },
    { cx: clickX, cy: clickY },
  )
  await win.mouse.down()
  await win.mouse.up()
  await expect(win.getByTestId('place-mode-ghost')).toHaveCount(0)

  // The placement commits asynchronously behind the ghost's removal —
  // poll until it lands on the active canvas for the recognized node.
  await expect.poll(async () => (await placementsFor()).length).toBe(1)

  // No duplicate: still exactly one image node, and it is the SAME node
  // the first pull ingested — recognition reused it, and the placement
  // landed at the click point.
  expect(await imageNodeCount(win)).toBe(1)
  const placed = await placementsFor()
  expect(placed[0]!.x).toBeCloseTo(expected.x, 0)
  expect(placed[0]!.y).toBeCloseTo(expected.y, 0)

  await app.close()
})
