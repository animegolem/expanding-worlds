import { existsSync, mkdtempSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { exec, launchApp, launchAppInDir, runQuery, seedPlacedNote } from './helpers'

/**
 * §16 portable export (AI-IMP-157; container rev 0.57): the renderer →
 * main → utility wiring behind Settings › Export project. Archive
 * INTERNALS (manifest inventory, stored-vs-deflate policy, hashes) are
 * proven at unit level in @ew/persistence; this spec proves the seam
 * end to end on a live app and the rev-0.18 estimate footer.
 * AI-IMP-158 extends this file with the import half and the roundtrip
 * database diff.
 */

async function openSettings(win: Page): Promise<void> {
  await win.getByTestId('charm-menu').click()
  await win.getByTestId('menu-settings').click()
  await expect(win.getByTestId('settings-view')).toBeVisible()
}

test('export streams a .ewproj with honest counts; the estimate footer is live', async () => {
  const { app, win } = await launchApp('ew-e2e-export-')
  await seedPlacedNote(win, 'Exported Note', 'body that travels', { x: 200, y: 200 })

  // A real imported asset so the archive carries a blob.
  await win.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#2e6ac0'
    ctx.fillRect(0, 0, 64, 64)
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'))
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const imported = await window.ew.project.importAsset({
      bytes,
      originalFilename: 'travels.png',
    })
    if (!('assetId' in imported) || !imported.assetId) throw new Error('import failed')
  })

  // The Settings surface: row present, live estimate footer non-empty.
  await openSettings(win)
  await expect(win.getByTestId('settings-row-export')).toBeVisible()
  await expect
    .poll(async () => (await win.getByTestId('settings-export-note').textContent()) ?? '')
    .toContain('Estimated size:')

  // Drive the export through the real seam (the native save dialog is
  // main's; e2e supplies the destination directly).
  const dest = join(mkdtempSync(join(tmpdir(), 'ew-e2e-export-out-')), 'fixture.ewproj')
  const result = await win.evaluate((destPath) => window.ew.export.run(destPath, false), dest)
  if (!result.ok) throw new Error(`export failed: ${result.message}`)
  expect(result.notes).toBe(1)
  expect(result.assets).toBe(1)
  expect(result.entries).toBeGreaterThanOrEqual(4) // manifest + db + note + asset

  // The archive exists on disk at the size the utility reported.
  expect(statSync(dest).size).toBe(result.bytesWritten)

  // The active-only variant rides the same seam (deep semantics are
  // unit-proven in @ew/persistence; this is the wiring + the toggle).
  await win.getByTestId('settings-export-scope-active').click()
  const activeDest = join(mkdtempSync(join(tmpdir(), 'ew-e2e-export-out-')), 'active.ewproj')
  const activeResult = await win.evaluate(
    (destPath) => window.ew.export.run(destPath, true),
    activeDest,
  )
  if (!activeResult.ok) throw new Error(`active-only export failed: ${activeResult.message}`)
  expect(statSync(activeDest).size).toBeGreaterThan(0)

  await app.close()
})

test('the roundtrip: import materializes a sibling project that opens with the content', async () => {
  const { app, win } = await launchApp('ew-e2e-roundtrip-')
  await seedPlacedNote(win, 'Survivor', 'the body that must come back', { x: 220, y: 180 })

  const archive = join(mkdtempSync(join(tmpdir(), 'ew-e2e-roundtrip-out-')), 'travel.ewproj')
  const exported = await win.evaluate((destPath) => window.ew.export.run(destPath, false), archive)
  if (!exported.ok) throw new Error(`export failed: ${exported.message}`)

  // Import through the real seam: main computes a collision-safe
  // sibling directory, the utility materializes and verifies.
  const imported = await win.evaluate(
    (archivePath) => window.ew.export.import(archivePath),
    archive,
  )
  if (!imported.ok) throw new Error(`import refused: ${imported.message}`)
  expect(imported.notes).toBe(1)
  expect(existsSync(join(imported.dir, 'project.sqlite'))).toBe(true)
  expect(existsSync(`${imported.dir}.partial`)).toBe(false)
  await app.close()

  // The imported directory IS a working project: launch the app on it
  // and find the note by identity-preserving content.
  const second = await launchAppInDir(imported.dir)
  const search = await runQuery<{ notes: Array<{ title: string }> }>(
    second.win,
    'searchProject',
    { query: 'Survivor' },
  )
  expect(JSON.stringify(search)).toContain('Survivor')
  await second.app.close()
})

/**
 * AI-IMP-169 (§17 item 11): a legal containment cycle (§4.4 — Board A
 * on the root, B on A, A placed back on B) must not hang navigation,
 * the outline projection, or the §16 export/import walkers. The
 * outline's alias-row semantics live in outline.spec; THIS test walks
 * the loop as a user would and roundtrips the archive.
 */
test('a containment cycle survives navigation, graph queries, and the roundtrip (§17 item 11)', async () => {
  const { app, win } = await launchApp('ew-e2e-cycle-')
  const rootCanvasId = await win.evaluate(() => window.__ewDebug!.canvasId())

  const nodeA = crypto.randomUUID()
  const noteA = crypto.randomUUID()
  const canvasA = crypto.randomUUID()
  await exec(win, 'CreateNote', { noteId: noteA, title: 'Loop Board', body: '' })
  await exec(win, 'CreateNode', { nodeId: nodeA })
  await exec(win, 'AttachNoteToNode', { nodeId: nodeA, noteId: noteA })
  await exec(win, 'CreateCanvas', { canvasId: canvasA, nodeId: nodeA })
  await exec(win, 'CreatePlacement', {
    placementId: crypto.randomUUID(),
    canvasId: rootCanvasId,
    nodeId: nodeA,
  })
  const nodeB = crypto.randomUUID()
  const canvasB = crypto.randomUUID()
  await exec(win, 'CreateNode', { nodeId: nodeB })
  await exec(win, 'CreateCanvas', { canvasId: canvasB, nodeId: nodeB })
  await exec(win, 'CreatePlacement', {
    placementId: crypto.randomUUID(),
    canvasId: canvasA,
    nodeId: nodeB,
  })
  // The cycle: A placed back on B.
  await exec(win, 'CreatePlacement', {
    placementId: crypto.randomUUID(),
    canvasId: canvasB,
    nodeId: nodeA,
  })

  // Walk the loop twice — entry-route history, so entries grow
  // linearly and every hop lands (no collapse, no hang).
  for (const [id, label] of [
    [canvasA, 'Loop Board'],
    [canvasB, 'Inner'],
    [canvasA, 'Loop Board'],
    [canvasB, 'Inner'],
  ] as const) {
    await win.evaluate(
      ({ id, label }) => window.__ewNav!.navigateTo(id, label),
      { id, label },
    )
    await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(id)
  }
  const nav = await win.evaluate(() => ({
    entries: window.__ewNav!.entries().length,
    cursor: window.__ewNav!.cursor(),
  }))
  expect(nav).toEqual({ entries: 5, cursor: 4 })

  // Graph projection terminates: three canvases, flat.
  const outline = await runQuery<unknown[]>(win, 'getOutlineTree')
  expect(outline).toHaveLength(3)

  // The §16 walkers: export the cycle, import it back, and the copy
  // opens with the loop intact and its projection still terminating.
  const archive = join(mkdtempSync(join(tmpdir(), 'ew-e2e-cycle-out-')), 'loop.ewproj')
  const exported = await win.evaluate((destPath) => window.ew.export.run(destPath, false), archive)
  if (!exported.ok) throw new Error(`export failed: ${exported.message}`)
  const imported = await win.evaluate(
    (archivePath) => window.ew.export.import(archivePath),
    archive,
  )
  if (!imported.ok) throw new Error(`import refused: ${imported.message}`)
  await app.close()

  const second = await launchAppInDir(imported.dir)
  const importedOutline = await runQuery<unknown[]>(second.win, 'getOutlineTree')
  expect(importedOutline).toHaveLength(3)
  await second.win.evaluate(
    ({ id, label }) => window.__ewNav!.navigateTo(id, label),
    { id: canvasA, label: 'Loop Board' },
  )
  await expect
    .poll(() => second.win.evaluate(() => window.__ewDebug!.canvasId()))
    .toBe(canvasA)
  await second.app.close()
})
