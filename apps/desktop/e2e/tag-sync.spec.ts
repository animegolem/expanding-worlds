import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { exec, launchAppInDir, runQuery } from './helpers'

/** RFC §4.8 rev 0.69 / AI-IMP-271: one additive tag universe across
 * live mirror edges. These fixtures use two real project directories,
 * ordinary imports/commands, one persisted app profile, and the actual
 * close ritual — never private DB access. */

const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg=='

interface SeededImage {
  nodeId: string
  placementId: string
}

interface TagRow {
  id: string
  name: string
  nodeCount: number
}

async function seedImage(win: Page, at = { x: 260, y: 220 }): Promise<SeededImage> {
  const imported = await win.evaluate((base64) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    return window.ew.project.importAsset({ bytes, originalFilename: 'shared.png' })
  }, PNG_1PX)
  expect(imported.ok, JSON.stringify(imported)).toBe(true)
  const assetId = (imported as { ok: true; assetId: string }).assetId
  const { nodeId, placementId } = await win.evaluate(() => ({
    nodeId: window.ew.util.newId(),
    placementId: window.ew.util.newId(),
  }))
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  await exec(win, 'CreatePin', {
    nodeId,
    canvasId,
    placementId,
    x: at.x,
    y: at.y,
    appearance: { kind: 'image', assetId, crop: null },
  })
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.sceneStats().placements)).toBe(1)
  return { nodeId, placementId }
}

async function createAndAssignTag(win: Page, nodeId: string, name: string): Promise<string> {
  const tagId = await win.evaluate(() => window.ew.util.newId())
  await exec(win, 'CreateTag', { tagId, name })
  await exec(win, 'AssignTagToNode', { tagId, nodeId })
  return tagId
}

async function tags(win: Page): Promise<TagRow[]> {
  return runQuery<TagRow[]>(win, 'listTags')
}

async function tagNamed(win: Page, name: string): Promise<TagRow | undefined> {
  return (await tags(win)).find((tag) => tag.name === name)
}

async function openTagPanel(
  win: Page,
  placementId: string,
  tagId: string,
  at = { x: 260, y: 220 },
): Promise<void> {
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))
  const host = (await win.getByTestId('canvas-host').boundingBox())!
  await win.mouse.click(host.x + at.x, host.y + at.y)
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.selection())).toEqual([placementId])
  await win.getByTestId('charm-tags').click()
  await win.getByTestId(`tag-chip-${tagId}`).click()
  await expect(win.getByTestId('tag-panel')).toBeVisible()
}

test('proper-close push, announced open pull, tombstone, and cross-project undo boundary', async () => {
  const libraryDir = mkdtempSync(join(tmpdir(), 'ew-e2e-tag-sync-library-'))
  const worldDir = mkdtempSync(join(tmpdir(), 'ew-e2e-tag-sync-world-'))
  const configDir = mkdtempSync(join(tmpdir(), 'ew-e2e-tag-sync-config-'))
  const env = { EW_APP_CONFIG_DIR: configDir }

  let libraryNodeId: string
  {
    const { app, win } = await launchAppInDir(libraryDir, env)
    libraryNodeId = (await seedImage(win)).nodeId
    await app.close()
  }

  let worldImage: SeededImage
  {
    const { app, win } = await launchAppInDir(worldDir, env)
    worldImage = await seedImage(win)
    await createAndAssignTag(win, worldImage.nodeId, 'world settle')
    const designated = await win.evaluate(
      (dir) => window.ew.settings.setApp('libraryProjectDir', dir),
      libraryDir,
    )
    expect(designated.ok, JSON.stringify(designated)).toBe(true)
    // app.close() is the real proper-close PUSH seam.
    await app.close()
  }

  {
    const { app, win } = await launchAppInDir(libraryDir, env)
    await expect.poll(async () => (await tagNamed(win, 'world settle'))?.nodeCount ?? 0).toBe(1)
    await createAndAssignTag(win, libraryNodeId, 'library settle')
    await app.close()
  }

  // OPEN pulls the library union into the world and announces one
  // aggregate delta. Direct utility envelopes never enter Mod+Z.
  {
    const { app, win } = await launchAppInDir(worldDir, env)
    await expect.poll(async () => (await tagNamed(win, 'library settle'))?.nodeCount ?? 0).toBe(1)
    await expect(win.getByTestId('board-notice')).toContainText('1 tag arrived from the library')
    await expect.poll(() => win.evaluate(() => window.__ewUndo !== undefined)).toBe(true)
    expect(await win.evaluate(() => window.__ewUndo!.undoDepth())).toBe(0)

    // Project-scope delete is one local undo group. Undo restores both
    // the tag and suppression state; redo recreates the tombstone.
    const pulled = (await tagNamed(win, 'library settle'))!
    await openTagPanel(win, worldImage.placementId, pulled.id)
    await win.getByTestId('tag-delete-open').click()
    await expect(win.getByTestId('tag-delete-dialog')).toBeVisible()
    await win.getByTestId('tag-delete-project').click()
    await expect(win.getByTestId('tag-panel')).toHaveCount(0)
    await expect.poll(() => tagNamed(win, 'library settle')).toBeUndefined()
    expect(await win.evaluate(() => window.__ewUndo!.undoDepth())).toBe(1)

    await win.evaluate(() => window.__ewUndo!.undo())
    await expect.poll(async () => (await tagNamed(win, 'library settle'))?.nodeCount ?? 0).toBe(1)
    await win.evaluate(() => window.__ewUndo!.redo())
    await expect.poll(() => tagNamed(win, 'library settle')).toBeUndefined()
    await app.close()
  }

  // The library still owns the tag, but the world's persisted tombstone
  // makes the next automatic pull a clean no-op.
  {
    const { app, win } = await launchAppInDir(worldDir, env)
    const settled = await win.evaluate(() => window.ew.tagSync.pull())
    expect(settled.ok, JSON.stringify(settled)).toBe(true)
    await expect.poll(() => tagNamed(win, 'library settle')).toBeUndefined()

    // Library-scope delete removes both copies. Local undo deliberately
    // cannot reach across DBs; the later proper-close settle re-unions.
    const outward = (await tagNamed(win, 'world settle'))!
    await openTagPanel(win, worldImage.placementId, outward.id)
    await win.getByTestId('tag-delete-open').click()
    await expect(win.getByTestId('tag-delete-library')).toBeEnabled()
    await win.getByTestId('tag-delete-library').click()
    await expect.poll(() => tagNamed(win, 'world settle')).toBeUndefined()
    await expect
      .poll(async () => {
        const response = await win.evaluate(() => window.ew.secondary.query('library', 'listTags'))
        return response.ok
          ? (response.result as TagRow[]).some((tag) => tag.name === 'world settle')
          : true
      })
      .toBe(false)

    await win.evaluate(() => window.__ewUndo!.undo())
    await expect.poll(async () => (await tagNamed(win, 'world settle'))?.nodeCount ?? 0).toBe(1)
    const libraryStillDeleted = await win.evaluate(async () => {
      const response = await window.ew.secondary.query('library', 'listTags')
      return response.ok
        ? !(response.result as TagRow[]).some((tag) => tag.name === 'world settle')
        : false
    })
    expect(libraryStillDeleted).toBe(true)
    await app.close()
  }

  // The local undo becomes outward truth only at the next settle.
  {
    const { app, win } = await launchAppInDir(libraryDir, env)
    await expect.poll(async () => (await tagNamed(win, 'world settle'))?.nodeCount ?? 0).toBe(1)
    await app.close()
  }
})

test('delete scope prints a visible disabled reason when no library is designated', async () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'ew-e2e-tag-delete-local-'))
  const { app, win } = await launchAppInDir(projectDir)
  const image = await seedImage(win)
  const tagId = await createAndAssignTag(win, image.nodeId, 'local only')

  await openTagPanel(win, image.placementId, tagId)
  await win.getByTestId('tag-delete-open').click()
  await expect(win.getByTestId('tag-delete-dialog')).toBeVisible()
  await expect(win.getByTestId('tag-delete-library')).toBeDisabled()
  await expect(win.getByTestId('tag-delete-library-reason')).toBeVisible()
  await expect(win.getByTestId('tag-delete-library-reason')).toContainText(
    'No library is designated',
  )

  await win.getByTestId('tag-delete-project').click()
  await expect.poll(() => tagNamed(win, 'local only')).toBeUndefined()
  await win.evaluate(() => window.__ewUndo!.undo())
  await expect.poll(async () => (await tagNamed(win, 'local only'))?.nodeCount ?? 0).toBe(1)
  await app.close()
})
