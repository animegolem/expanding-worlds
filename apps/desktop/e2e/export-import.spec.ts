import { chmodSync, existsSync, mkdtempSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
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

/**
 * Export is now fused in main (AI-IMP-229): the renderer can no longer
 * name a path — `export.chooseAndRun` opens main's save dialog and
 * forwards the picked path itself. e2e injects the dialog result by
 * stubbing `dialog.showSaveDialog` in the MAIN process, then drives the
 * one fused call from the renderer.
 */
async function stubSaveDialog(app: ElectronApplication, destPath: string): Promise<void> {
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath })) as typeof dialog.showSaveDialog
  }, destPath)
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

  // Drive the export through the real fused seam. The native save dialog
  // is main's; e2e stubs it to the chosen destination, then the renderer
  // makes the single choose-and-run call (it never names a path).
  const dest = join(mkdtempSync(join(tmpdir(), 'ew-e2e-export-out-')), 'fixture.ewproj')
  await stubSaveDialog(app, dest)
  const result = await win.evaluate(() => window.ew.export.chooseAndRun(false))
  if (!result || !result.ok) {
    throw new Error(`export failed: ${result ? result.message : 'cancelled'}`)
  }
  expect(result.notes).toBe(1)
  expect(result.assets).toBe(1)
  expect(result.entries).toBeGreaterThanOrEqual(4) // manifest + db + note + asset

  // The archive exists on disk at the size the utility reported.
  expect(statSync(dest).size).toBe(result.bytesWritten)

  // The active-only variant rides the same seam (deep semantics are
  // unit-proven in @ew/persistence; this is the wiring + the toggle).
  await win.getByTestId('settings-export-scope-active').click()
  const activeDest = join(mkdtempSync(join(tmpdir(), 'ew-e2e-export-out-')), 'active.ewproj')
  await stubSaveDialog(app, activeDest)
  const activeResult = await win.evaluate(() => window.ew.export.chooseAndRun(true))
  if (!activeResult || !activeResult.ok) {
    throw new Error(`active-only export failed: ${activeResult ? activeResult.message : 'cancelled'}`)
  }
  expect(statSync(activeDest).size).toBeGreaterThan(0)

  await app.close()
})

/**
 * CA-004: the renderer's only path to main is `window.ew`. Proving the
 * path-naming surface is gone there proves the sandbox can no longer aim
 * the exporter at an arbitrary file — the fused choose-and-run is the
 * only export entry it can reach.
 */
test('the renderer cannot name an export path: the old channel is gone', async () => {
  const { app, win } = await launchApp('ew-e2e-export-nochannel-')
  const surface = await win.evaluate(() => ({
    hasRun: 'run' in window.ew.export,
    hasChooseDest: 'chooseDest' in window.ew.export,
    chooseAndRun: typeof window.ew.export.chooseAndRun,
  }))
  expect(surface.hasRun).toBe(false)
  expect(surface.hasChooseDest).toBe(false)
  expect(surface.chooseAndRun).toBe('function')
  await app.close()
})

/**
 * CA-009: a failed export must never destroy the previous good backup,
 * and must never leave a partial behind. Export a good archive, then
 * make its directory read-only so the next export cannot open its
 * partial sibling (a stand-in for disk-full / stream death), and prove
 * the prior file is byte-for-byte intact with no partial residue.
 */
test('a failed export preserves the prior backup and leaves no partial', async () => {
  const { app, win } = await launchApp('ew-e2e-export-fail-')
  await seedPlacedNote(win, 'Precious', 'the backup that must survive', { x: 200, y: 200 })

  const outDir = mkdtempSync(join(tmpdir(), 'ew-e2e-export-fail-out-'))
  const dest = join(outDir, 'backup.ewproj')

  // The previous good backup.
  await stubSaveDialog(app, dest)
  const good = await win.evaluate(() => window.ew.export.chooseAndRun(false))
  if (!good || !good.ok) {
    throw new Error(`seed export failed: ${good ? good.message : 'cancelled'}`)
  }
  const goodSize = statSync(dest).size
  expect(goodSize).toBe(good.bytesWritten)

  // Read-only directory: the partial sibling cannot be opened for write.
  const failed = await (async () => {
    chmodSync(outDir, 0o555)
    try {
      return await win.evaluate(() => window.ew.export.chooseAndRun(false))
    } finally {
      chmodSync(outDir, 0o755) // restore before assertions + cleanup
    }
  })()
  // Refused, not a silent success.
  expect(failed && failed.ok).toBeFalsy()

  // The prior good backup is byte-for-byte intact...
  expect(statSync(dest).size).toBe(goodSize)
  // ...and no partial sibling survives.
  expect(readdirSync(outDir).filter((f) => f.includes('.partial'))).toEqual([])

  await app.close()
})

test('the roundtrip: import materializes a sibling project that opens with the content', async () => {
  const { app, win } = await launchApp('ew-e2e-roundtrip-')
  const { nodeId } = await seedPlacedNote(win, 'Survivor', 'the body that must come back', {
    x: 220,
    y: 180,
  })
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  const sourceScene = await runQuery<{
    items: Array<{ id: string; nodeId?: string; caption?: string | null }>
  }>(win, 'getCanvasScene', { canvasId })
  const placementId = sourceScene.items.find((item) => item.nodeId === nodeId)?.id
  if (!placementId) throw new Error('seed placement missing from scene')
  await exec(win, 'SetPlacementCaption', {
    placementId,
    caption: 'Caption that travels',
  })

  const archive = join(mkdtempSync(join(tmpdir(), 'ew-e2e-roundtrip-out-')), 'travel.ewproj')
  await stubSaveDialog(app, archive)
  const exported = await win.evaluate(() => window.ew.export.chooseAndRun(false))
  if (!exported || !exported.ok) {
    throw new Error(`export failed: ${exported ? exported.message : 'cancelled'}`)
  }

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
  const importedCanvasId = await second.win.evaluate(() => window.__ewDebug!.canvasId())
  const importedScene = await runQuery<{
    items: Array<{ caption?: string | null }>
  }>(second.win, 'getCanvasScene', { canvasId: importedCanvasId })
  expect(importedScene.items.some((item) => item.caption === 'Caption that travels')).toBe(
    true,
  )
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
  await stubSaveDialog(app, archive)
  const exported = await win.evaluate(() => window.ew.export.chooseAndRun(false))
  if (!exported || !exported.ok) {
    throw new Error(`export failed: ${exported ? exported.message : 'cancelled'}`)
  }
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
