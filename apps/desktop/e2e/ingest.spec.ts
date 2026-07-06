import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { exec, launchApp, launchAppInDir, runQuery } from './helpers'

/**
 * §14.4 ingest-by-copy over the full seam (AI-IMP-090 + the lead's
 * main route): bytes and tags cross the border into an unplaced node;
 * the source is untouched.
 */

const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg=='

test('drag-free ingest: hash-copy with the all border lands an unplaced tagged node', async () => {
  // Seed a source project: one imported image on a tagged node.
  const sourceDir = mkdtempSync(join(tmpdir(), 'ew-e2e-ingest-src-'))
  let contentHash = ''
  {
    const { app, win } = await launchAppInDir(sourceDir)
    const imported = await win.evaluate((b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      return window.ew.project.importAsset({ bytes, originalFilename: 'ref.png' })
    }, PNG_1PX)
    expect(imported.ok, JSON.stringify(imported)).toBe(true)
    const assetId = (imported as { ok: true; assetId: string }).assetId
    const nodeId = await win.evaluate(() => window.ew.util.newId())
    const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
    await exec(win, 'CreatePin', {
      nodeId,
      canvasId,
      placementId: await win.evaluate(() => window.ew.util.newId()),
      x: 10,
      y: 10,
      appearance: { kind: 'image', assetId, crop: null },
    })
    const tagId = await win.evaluate(() => window.ew.util.newId())
    await exec(win, 'CreateTag', { tagId, name: 'Character Ref' })
    await exec(win, 'AssignTagToNode', { tagId, nodeId })
    const assets = await runQuery<Array<{ id: string; contentHash: string }>>(
      win,
      'listAssets',
      {},
    ).catch(() => null)
    // contentHash via the asset listing if available; else read from
    // the gallery item — fall back to querying the asset row shape.
    if (assets && assets.length > 0 && assets[0]!.contentHash) {
      contentHash = assets[0]!.contentHash
    }
    await app.close()
  }

  const { app, win } = await launchApp('ew-e2e-ingest-dst-')
  const opened = await win.evaluate(
    (dir) => window.ew.secondary.open('source', dir),
    sourceDir,
  )
  expect(opened.ok, JSON.stringify(opened)).toBe(true)

  if (contentHash === '') {
    // Resolve the hash through the source slot's gallery projection.
    const idx = await win.evaluate(() =>
      window.ew.secondary.query('source', 'getGalleryIndex', {}),
    )
    expect(idx.ok).toBe(true)
    const items = await win.evaluate(
      (ids) => window.ew.secondary.query('source', 'getGalleryItems', { ids }),
      (idx as { ok: true; result: Array<{ id: string }> }).result.map((e) => e.id),
    )
    expect(items.ok).toBe(true)
    const withHash = (
      items as { ok: true; result: Array<{ contentHash?: string | null }> }
    ).result.find((i) => i.contentHash)
    expect(withHash, JSON.stringify(items)).toBeTruthy()
    contentHash = withHash!.contentHash!
  }

  const ingested = await win.evaluate(
    (hash) => window.ew.secondary.ingest('source', { contentHash: hash, border: 'all' }),
    contentHash,
  )
  expect(ingested.ok, JSON.stringify(ingested)).toBe(true)

  // The destination now holds an unplaced node carrying the tag.
  const library = await runQuery<Array<{ id: string; tags: string[]; placementCount: number }>>(
    win,
    'listNodeLibrary',
    { filter: 'unplaced' },
  )
  const landed = library.find((row) => row.tags.includes('Character Ref'))
  expect(landed, JSON.stringify(library)).toBeTruthy()
  expect(landed!.placementCount).toBe(0)

  await win.evaluate(() => window.ew.secondary.close('source'))
  await app.close()
})
