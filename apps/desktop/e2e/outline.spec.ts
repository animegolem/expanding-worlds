import { expect, test } from '@playwright/test'
import type { EwApi } from '../src/preload/index'
import { exec, launchApp } from './helpers'
import type { Page } from '@playwright/test'

declare global {
  interface Window {
    ew: EwApi
  }
}

/**
 * AI-IMP-069 acceptance: the ▤ outline (RFC §14.1) — canvas ▸
 * children with page/frame glyphs, alias rows where containment
 * cycles back onto the expansion path, the root-level loose bin,
 * and the three filter chips.
 */

async function seedWorld(win: Page): Promise<{
  boardACanvasId: string
  rootCanvasId: string
}> {
  const rootCanvasId = await win.evaluate(() => window.__ewDebug!.canvasId())

  // A bare tagged image-less node placed on the root board.
  const bare = crypto.randomUUID()
  await exec(win, 'CreateNode', { nodeId: bare })
  await exec(win, 'CreatePlacement', {
    placementId: crypto.randomUUID(),
    canvasId: rootCanvasId,
    nodeId: bare,
  })
  const tagId = crypto.randomUUID()
  await exec(win, 'CreateTag', { tagId, name: 'ruins' })
  await exec(win, 'AssignTagToNode', { tagId, nodeId: bare })

  // Board A (titled) on the root; board B on A; A placed back on B —
  // a legal containment cycle (§4.4) the outline must alias.
  const nodeA = crypto.randomUUID()
  const noteA = crypto.randomUUID()
  const boardACanvasId = crypto.randomUUID()
  await exec(win, 'CreateNote', { noteId: noteA, title: 'Ruins Board', body: '' })
  await exec(win, 'CreateNode', { nodeId: nodeA })
  await exec(win, 'AttachNoteToNode', { nodeId: nodeA, noteId: noteA })
  await exec(win, 'CreateCanvas', { canvasId: boardACanvasId, nodeId: nodeA })
  await exec(win, 'CreatePlacement', {
    placementId: crypto.randomUUID(),
    canvasId: rootCanvasId,
    nodeId: nodeA,
  })
  const nodeB = crypto.randomUUID()
  const boardBCanvasId = crypto.randomUUID()
  await exec(win, 'CreateNode', { nodeId: nodeB })
  await exec(win, 'CreateCanvas', { canvasId: boardBCanvasId, nodeId: nodeB })
  await exec(win, 'CreatePlacement', {
    placementId: crypto.randomUUID(),
    canvasId: boardACanvasId,
    nodeId: nodeB,
  })
  await exec(win, 'CreatePlacement', {
    placementId: crypto.randomUUID(),
    canvasId: boardBCanvasId,
    nodeId: nodeA,
  })

  // Unplaced material: a stashed node and an unattached note.
  await exec(win, 'CreateNode', { nodeId: crypto.randomUUID() })
  await exec(win, 'CreateNote', {
    noteId: crypto.randomUUID(),
    title: 'Adrift Thought',
    body: '',
  })

  return { boardACanvasId, rootCanvasId }
}

test('outline: tree with alias rows, loose bin, and filter chips (§14.1)', async () => {
  const { app, win } = await launchApp('ew-e2e-outline-')
  const { rootCanvasId } = await seedWorld(win)

  await win.getByTestId('charm-outline').click()
  const outline = win.getByTestId('outline-view')
  await expect(outline).toBeVisible()

  // Root section renders expanded with both children: the bare node
  // (short-code title, no glyphs) and Ruins Board (¶ + ⊡).
  const rootSection = win.getByTestId(`outline-canvas-${rootCanvasId}`)
  await expect(rootSection).toBeVisible()
  await expect(rootSection.getByTestId('outline-child-row')).toHaveCount(2)
  const boardRow = rootSection
    .getByTestId('outline-child-row')
    .filter({ hasText: 'Ruins Board' })
  await expect(boardRow).toHaveCount(1)

  // Unfold A, then B: B's child A is already on the expansion path
  // and renders as an alias row, not another unfold.
  await boardRow.getByTestId('outline-expand').click()
  const bRow = rootSection.getByTestId('outline-child-row').nth(2)
  await bRow.getByTestId('outline-expand').click()
  const alias = win.getByTestId('outline-alias-row')
  await expect(alias).toHaveCount(1)
  await expect(alias).toContainText('Ruins Board')
  await alias.click() // flies to the real entry, never unfolds

  // The loose bin holds the stashed node (loose + orphan) and the
  // unattached note (loose).
  const bin = win.getByTestId('outline-loose-bin')
  await expect(bin.getByTestId('loose-node-row')).toHaveCount(1)
  await expect(bin.getByTestId('loose-node-row').getByTestId('badge-orphan')).toBeVisible()
  await expect(bin.getByTestId('loose-note-row')).toHaveCount(1)
  await expect(bin.getByTestId('loose-note-row')).toContainText('Adrift Thought')

  // hide content-less drops the bare image row, keeps Ruins Board.
  await win.getByTestId('outline-filter-contentless').click()
  await expect(rootSection.getByTestId('outline-child-row').first()).toContainText('Ruins Board')
  await win.getByTestId('outline-filter-contentless').click()

  // disconnected: in the tree only orphans remain (loose lives in
  // the bin, which stays).
  await win.getByTestId('outline-filter-disconnected').click()
  for (const row of await rootSection.getByTestId('outline-child-row').all()) {
    await expect(row).not.toContainText('Ruins Board')
  }
  await expect(bin.getByTestId('loose-node-row')).toHaveCount(1)
  await win.getByTestId('outline-filter-disconnected').click()

  // one tag: type into the filter (completion offers the tag), pick
  // it — only the tagged bare node survives, in tree and bin.
  await win.getByTestId('outline-filter-tag').click()
  await win.keyboard.type('ru')
  await expect(win.getByTestId('outline-tag-option')).toHaveText('ruins')
  await win.getByTestId('outline-tag-option').click()
  await expect(win.getByTestId('outline-filter-tag')).toHaveValue('ruins')
  await expect(rootSection.getByTestId('outline-child-row')).toHaveCount(1)
  await expect(rootSection.getByTestId('outline-child-row')).not.toContainText('Ruins Board')
  await expect(bin.getByTestId('loose-node-row')).toHaveCount(0)

  await app.close()
})
