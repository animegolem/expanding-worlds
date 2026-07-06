import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { launchApp, launchAppInDir, seedPlacedNote } from './helpers'

/**
 * §14.4 first-open seed (AI-IMP-094): creating a NEW library through
 * the gallery's designation prompt seeds the example world — a root
 * board of artists diving into per-artist boards of placed works,
 * everything tagged, plus the pinned explainer note — all ordinary
 * records made by ordinary commands. "Clear the example set" trashes
 * every example-tagged node (explainer included) through ordinary
 * TrashNode commands. Designating an EXISTING project seeds nothing.
 */

// The generated placeholder set: 3 artist boards + 9 works + the
// explainer note (see apps/desktop/resources/seed/).
const SEED_ENTRY_COUNT = 13

async function openEverything(win: Page): Promise<void> {
  await win.getByTestId('charm-gallery').click()
  await expect(win.getByTestId('takeover-gallery')).toBeVisible()
  await win.getByTestId('gallery-scope-everything').click()
}

test('create-new library seeds the example; clear trashes it all through ordinary commands', async () => {
  // EW_LIBRARY_DIR overrides main's default create location so the
  // test never writes into the real userData (projectDir's pattern).
  const libraryDir = mkdtempSync(join(tmpdir(), 'ew-e2e-seed-lib-'))
  const { app, win } = await launchApp('ew-e2e-seed-', { EW_LIBRARY_DIR: libraryDir })

  await openEverything(win)
  await expect(win.getByTestId('gallery-designate')).toBeVisible()

  // Create-new: fresh project at the default location, seeded.
  await win.getByTestId('gallery-create-library').click()
  const cells = win.locator('[data-testid="gallery-cell"]')
  await expect(cells).toHaveCount(SEED_ENTRY_COUNT)
  await expect(win.locator('[data-testid="gallery-cell"][data-kind="board"]')).toHaveCount(3)
  await expect(win.locator('[data-testid="gallery-cell"][data-kind="image"]')).toHaveCount(9)
  // The explainer is an ordinary note entry, reading as a text post.
  const explainer = win.locator('[data-testid="gallery-cell"][data-kind="note"]')
  await expect(explainer).toHaveCount(1)
  await expect(explainer).toContainText('Start here')

  // The designation stored: create-new IS designation.
  const settings = await win.evaluate(() => window.ew.settings.appAll())
  expect(settings['libraryProjectDir']).toBe(libraryDir)

  // Everything is tag-reachable: the shared 'example' tag counts all.
  const counts = await win.evaluate(() =>
    window.ew.secondary.query('source', 'galleryTagCounts', {}),
  )
  expect(counts.ok, JSON.stringify(counts)).toBe(true)
  const example = (
    (counts as { ok: true; result: Array<{ name: string; count: number }> }).result
  ).find((tag) => tag.name === 'example')
  expect(example?.count).toBe(SEED_ENTRY_COUNT)

  // Clear the example: the affordance is present, one press empties.
  await expect(win.getByTestId('gallery-clear-example')).toBeVisible()
  await win.getByTestId('gallery-clear-example').click()
  await expect(cells).toHaveCount(0)
  await expect(win.getByTestId('gallery-empty')).toBeVisible()
  await expect(win.getByTestId('gallery-clear-example')).not.toBeVisible()

  // Ordinary trash, not deletion: every seed node is recoverable in
  // the library's Trash (the source slot reads committed state live).
  const trash = await win.evaluate(() =>
    window.ew.secondary.query('source', 'getTrashView'),
  )
  expect(trash.ok, JSON.stringify(trash)).toBe(true)
  expect(
    (trash as { ok: true; result: { nodes: unknown[] } }).result.nodes.length,
  ).toBe(SEED_ENTRY_COUNT)

  await app.close()
})

test('designating an EXISTING project as library seeds nothing', async () => {
  const libraryDir = mkdtempSync(join(tmpdir(), 'ew-e2e-noseed-lib-'))
  {
    const { app, win } = await launchAppInDir(libraryDir)
    await seedPlacedNote(win, 'My Own Note', 'user material', { x: 60, y: 60 })
    await app.close()
  }

  const { app, win } = await launchApp('ew-e2e-noseed-')
  await openEverything(win)
  await win.getByTestId('gallery-designate-input').fill(libraryDir)
  await win.getByTestId('gallery-designate-confirm').click()

  // Only the user's material — no example, no clear affordance.
  const cells = win.locator('[data-testid="gallery-cell"]')
  await expect(cells).toHaveCount(1)
  await expect(cells.first()).toContainText('My Own Note')
  await expect(win.getByTestId('gallery-clear-example')).not.toBeVisible()

  // The protocol guard: createIfMissing is a library-slot verb only.
  const refused = await win.evaluate(
    (dir) => window.ew.secondary.open('source', dir, { createIfMissing: true }),
    mkdtempSync(join(tmpdir(), 'ew-e2e-refuse-')),
  )
  expect(refused.ok).toBe(false)
  expect(refused.ok === false && refused.code).toBe('INVALID_TARGET')

  await app.close()
})
