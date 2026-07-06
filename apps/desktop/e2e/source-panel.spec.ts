import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { exec, launchApp, launchAppInDir, runQuery, seedPlacedNote } from './helpers'

/**
 * §14.4 open-as-source panels (AI-IMP-091): the project charm's menu
 * opens a second project READ-ONLY as a pinned mini-gallery panel;
 * dragging a cell onto the board runs 090's ingest-by-copy with the
 * panel header's tag-border decision, then the ordinary placement at
 * the drop point. Two-launch fixture (ingest.spec.ts pattern): the
 * source is a REAL project seeded through an ordinary session.
 *
 * The drag rides dispatchEvent-built DragEvents sharing one real
 * DataTransfer (HTML5 DnD is not synthesizable from raw mouse moves
 * under Playwright+Electron): dragstart exercises the panel's
 * ondragstart payload writer, drop exercises import-surfaces' MIME
 * branch — the full renderer path minus the OS drag loop.
 */

const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg=='

/** Seed a source project: one imported image pinned on a TAGGED node.
 * Returns the asset's content hash (resolved through the gallery
 * projection so the seed stays query-shaped, ingest.spec.ts idiom). */
async function seedSourceProject(dir: string, tagName: string): Promise<string> {
  const { app, win } = await launchAppInDir(dir)
  const imported = await win.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    return window.ew.project.importAsset({ bytes, originalFilename: 'ref.png' })
  }, PNG_1PX)
  expect(imported.ok, JSON.stringify(imported)).toBe(true)
  const assetId = (imported as { ok: true; assetId: string }).assetId
  const nodeId = crypto.randomUUID()
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  await exec(win, 'CreatePin', {
    nodeId,
    canvasId,
    placementId: crypto.randomUUID(),
    x: 10,
    y: 10,
    appearance: { kind: 'image', assetId, crop: null },
  })
  const tagId = crypto.randomUUID()
  await exec(win, 'CreateTag', { tagId, name: tagName })
  await exec(win, 'AssignTagToNode', { tagId, nodeId })
  const items = await runQuery<Array<{ contentHash: string | null }>>(win, 'getGalleryItems', {
    nodeIds: [nodeId],
  })
  const contentHash = items[0]?.contentHash
  expect(contentHash, JSON.stringify(items)).toBeTruthy()
  await app.close()
  return contentHash!
}

/** Open the source panel through its entry point: project charm →
 * menu → the open-as-source directory prompt (plain text field). */
async function openSourcePanel(win: Page, dir: string): Promise<void> {
  await win.getByTestId('charm-project').click()
  await expect(win.getByTestId('project-menu')).toBeVisible()
  await win.getByTestId('project-source-dir-input').fill(dir)
  await win.getByTestId('project-source-dir-confirm').click()
  await expect(win.getByTestId('source-panel')).toBeVisible()
}

test('open as source: mini grid browses, border=all drag-out ingests and places at the drop point', async () => {
  const sourceDir = mkdtempSync(join(tmpdir(), 'ew-e2e-srcpanel-src-'))
  const sourceHash = await seedSourceProject(sourceDir, 'Character Ref')

  const { app, win } = await launchApp('ew-e2e-srcpanel-dst-')
  await openSourcePanel(win, sourceDir)

  // The mini grid renders the tagged image with real pixels over the
  // cross-store URL (?scope=source; thumb 404s fall back to the
  // original bytes — either way a decoded width proves the re-root).
  const cell = win.locator('[data-testid="source-cell"]')
  await expect(cell).toHaveCount(1)
  await expect(cell).toHaveAttribute('data-kind', 'image')
  await expect
    .poll(async () => (await cell.locator('img').getAttribute('src')) ?? '')
    .toContain('scope=source')
  await expect
    .poll(() => cell.locator('img').evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0)
  // Hydrated image cells are drag sources.
  await expect(cell).toHaveAttribute('draggable', 'true')

  // The header border control: this source is NOT the designated
  // library, so the default is none — flip the session to all.
  await expect(win.getByTestId('source-border-none')).toHaveAttribute('aria-pressed', 'true')
  await win.getByTestId('source-border-all').click()
  await expect(win.getByTestId('source-border-all')).toHaveAttribute('aria-pressed', 'true')

  const sourceRevBefore = await win.evaluate(async () => {
    const response = await window.ew.secondary.query('source', 'getProject')
    if (!response.ok) throw new Error(response.message)
    return (response.result as { revision: number }).revision
  })

  // Drag the cell onto the board: one DataTransfer through both ends.
  await win.evaluate(() => {
    const source = document.querySelector('[data-testid="source-cell"]')!
    const board = document.querySelector('[data-testid="canvas-host"]')!
    const dataTransfer = new DataTransfer()
    source.dispatchEvent(
      new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }),
    )
    const rect = board.getBoundingClientRect()
    board.dispatchEvent(
      new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
        clientX: rect.left + rect.width * 0.7,
        clientY: rect.top + rect.height * 0.6,
      }),
    )
  })

  // The destination gains ONE node carrying the tag, placed once.
  await expect
    .poll(async () => {
      const library = await runQuery<
        Array<{ id: string; tags: string[]; placementCount: number }>
      >(win, 'listNodeLibrary', {})
      const landed = library.find((row) => row.tags.includes('Character Ref'))
      return landed ? landed.placementCount : -1
    })
    .toBe(1)

  // Copied bytes, not a reference: the destination's own gallery item
  // resolves the SAME content hash from its own store.
  const library = await runQuery<Array<{ id: string; tags: string[] }>>(win, 'listNodeLibrary', {})
  const landedId = library.find((row) => row.tags.includes('Character Ref'))!.id
  const landedItems = await runQuery<Array<{ contentHash: string | null }>>(
    win,
    'getGalleryItems',
    { nodeIds: [landedId] },
  )
  expect(landedItems[0]?.contentHash).toBe(sourceHash)

  // Projects source, never reference: the source project is untouched.
  const sourceRevAfter = await win.evaluate(async () => {
    const response = await window.ew.secondary.query('source', 'getProject')
    if (!response.ok) throw new Error(response.message)
    return (response.result as { revision: number }).revision
  })
  expect(sourceRevAfter).toBe(sourceRevBefore)

  // Close releases the slot cleanly: the transport refuses afterward.
  await win.getByTestId('source-panel-close').click()
  await expect(win.getByTestId('source-panel')).not.toBeVisible()
  await expect
    .poll(async () =>
      win.evaluate(async () => {
        const response = await window.ew.secondary.query('source', 'getProject')
        return response.ok
      }),
    )
    .toBe(false)

  await app.close()
})

test('opening the panel while the gallery holds the source slot evicts gracefully', async () => {
  const libraryDir = mkdtempSync(join(tmpdir(), 'ew-e2e-srcpanel-lib-'))
  {
    const { app, win } = await launchAppInDir(libraryDir)
    await seedPlacedNote(win, 'Library Entry', 'lore', { x: 60, y: 60 })
    await app.close()
  }

  const { app, win } = await launchApp('ew-e2e-srcpanel-evict-')
  await seedPlacedNote(win, 'World Note', 'local', { x: 100, y: 100 })
  await win.evaluate((dir) => window.ew.settings.setApp('libraryProjectDir', dir), libraryDir)

  // Gallery takes the slot: everything scope over the library.
  await win.getByTestId('charm-gallery').click()
  await expect(win.getByTestId('takeover-gallery')).toBeVisible()
  await win.getByTestId('gallery-scope-everything').click()
  const cells = win.locator('[data-testid="gallery-cell"]')
  await expect(cells).toHaveCount(1)
  await expect(cells.first()).toContainText('Library Entry')

  // The panel replaces the gallery's hold: the gallery degrades to
  // this-world with its notice line; the panel browses; no crash.
  await openSourcePanel(win, libraryDir)
  await expect(win.getByTestId('gallery-evicted-notice')).toBeVisible()
  await expect(win.getByTestId('gallery-scope-this-world')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(cells).toHaveCount(1)
  await expect(cells.first()).toContainText('World Note')
  await expect(win.locator('[data-testid="source-cell"]')).toHaveCount(1)

  await app.close()
})
