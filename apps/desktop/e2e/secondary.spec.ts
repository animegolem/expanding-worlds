import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp, launchAppInDir, revision, seedPlacedNote } from './helpers'

/**
 * §11.1/§14.4 secondary project seam (AI-IMP-088): a second project
 * opens READ-ONLY beside the primary — same query vocabulary, every
 * write refused, no lock taken, primary untouched throughout.
 */

test('source slot: read-only browse of a second project beside the primary', async () => {
  // Seed the future source through an ordinary app session — the
  // fixture is a real project made of real commands.
  const sourceDir = mkdtempSync(join(tmpdir(), 'ew-e2e-source-'))
  {
    const { app, win } = await launchAppInDir(sourceDir)
    await seedPlacedNote(win, 'Harbor Ref', 'stone quay', { x: 100, y: 100 })
    await app.close()
  }

  const { app, win } = await launchApp('ew-e2e-secondary-')
  const revBefore = await revision(win)

  // Open as source and browse it with the shared gallery vocabulary.
  const opened = await win.evaluate(
    (dir) => window.ew.secondary.open('source', dir),
    sourceDir,
  )
  expect(opened.ok, JSON.stringify(opened)).toBe(true)

  const index = await win.evaluate(() =>
    window.ew.secondary.query('source', 'getGalleryIndex', { sort: 'date' }),
  )
  expect(index.ok, JSON.stringify(index)).toBe(true)
  expect((index as { ok: true; result: unknown[] }).result.length).toBeGreaterThanOrEqual(1)

  // Writes into a source refuse at the service with EW_READ_ONLY.
  const written = await win.evaluate(() =>
    window.ew.secondary.importAsset('source', {
      bytes: new Uint8Array([1, 2, 3]),
      originalFilename: 'nope.png',
    }),
  )
  expect(written.ok).toBe(false)
  expect(written.ok === false && written.code).toBe('EW_READ_ONLY')

  // The primary lived through all of it, revision untouched.
  expect(await revision(win)).toBe(revBefore)
  const own = await win.evaluate(() => window.ew.project.query('listNodeLibrary'))
  expect(own.ok).toBe(true)

  // Close releases the slot; further queries answer NO_SECONDARY.
  const closed = await win.evaluate(() => window.ew.secondary.close('source'))
  expect(closed.ok).toBe(true)
  const after = await win.evaluate(() =>
    window.ew.secondary.query('source', 'listNodeLibrary'),
  )
  expect(after.ok).toBe(false)
  expect(after.ok === false && after.code).toBe('NO_SECONDARY')

  await app.close()
})

test('library slot: writable secondary under the ordinary lock', async () => {
  const libraryDir = mkdtempSync(join(tmpdir(), 'ew-e2e-library-'))
  {
    const { app, win } = await launchAppInDir(libraryDir)
    await seedPlacedNote(win, 'Library Root Note', 'seed', { x: 50, y: 50 })
    await app.close()
  }

  const { app, win } = await launchApp('ew-e2e-libwrite-')
  const opened = await win.evaluate(
    (dir) => window.ew.secondary.open('library', dir),
    libraryDir,
  )
  expect(opened.ok, JSON.stringify(opened)).toBe(true)

  // The mirror direction: an import INTO the library lands (1x1 PNG).
  const PNG_1PX =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg=='
  const imported = await win.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    return window.ew.secondary.importAsset('library', {
      bytes,
      originalFilename: 'mirror.png',
    })
  }, PNG_1PX)
  expect(imported.ok, JSON.stringify(imported)).toBe(true)

  await win.evaluate(() => window.ew.secondary.close('library'))
  await app.close()
})
