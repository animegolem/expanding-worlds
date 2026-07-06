import { expect, test } from '@playwright/test'
import { exec, launchApp, runQuery } from './helpers'

/**
 * AI-IMP-102 acceptance (RFC-0001 §9.7 rev 0.46): the trash browser.
 * Trashing a note, a node, and a canvas lists all three in ONE flat
 * takeover entered through the ☰ Trash… row; per-row restore returns
 * a record intact and offers a fly-to toast that flies cross-canvas;
 * Empty Trash purges every eligible record behind the §9 confirmation.
 */

interface TrashView {
  notes: unknown[]
  nodes: unknown[]
  canvases: unknown[]
}

test('trash browser: list, restore + fly-to, empty trash', async () => {
  const { app, win } = await launchApp('ew-e2e-trash-')

  try {
    const root = await win.evaluate(() => window.__ewDebug!.canvasId())

    // A child canvas B holding a placed node — restore's fly-to must
    // land here, cross-canvas from the root.
    const boardNodeB = crypto.randomUUID()
    const canvasB = crypto.randomUUID()
    await exec(win, 'CreateNode', { nodeId: boardNodeB })
    await exec(win, 'CreateCanvas', { canvasId: canvasB, nodeId: boardNodeB })

    // The node that gets trashed and restored: a note-carrying node
    // placed on canvas B (so getNodeLocations flies there).
    const nodeP = crypto.randomUUID()
    const placedNote = crypto.randomUUID()
    await exec(win, 'CreateNode', { nodeId: nodeP })
    await exec(win, 'CreateNote', { noteId: placedNote, title: 'Placed', body: 'on B' })
    await exec(win, 'AttachNoteToNode', { nodeId: nodeP, noteId: placedNote })
    await exec(win, 'CreatePlacement', {
      placementId: crypto.randomUUID(),
      canvasId: canvasB,
      nodeId: nodeP,
      x: 200,
      y: 150,
    })

    // A loose note (no node) to trash, and a canvas C to trash.
    const looseNote = crypto.randomUUID()
    await exec(win, 'CreateNote', { noteId: looseNote, title: 'Orphan', body: 'lonely' })
    const boardNodeC = crypto.randomUUID()
    const canvasC = crypto.randomUUID()
    await exec(win, 'CreateNode', { nodeId: boardNodeC })
    await exec(win, 'CreateCanvas', { canvasId: canvasC, nodeId: boardNodeC })

    // Trash one of each kind.
    await exec(win, 'TrashNote', { noteId: looseNote })
    await exec(win, 'TrashNode', { nodeId: nodeP })
    await exec(win, 'TrashCanvas', { canvasId: canvasC })

    // Open the trash takeover through the ☰ Trash… row.
    await win.getByTestId('charm-menu').click()
    await expect(win.getByTestId('rail-menu')).toBeVisible()
    await win.getByTestId('menu-trash').click()
    await expect(win.getByTestId('rail-menu')).toHaveCount(0)
    await expect(win.getByTestId('takeover-trash')).toBeVisible()

    // All three kinds list, each with an impact summary.
    await expect(win.getByTestId('trash-row')).toHaveCount(3)
    await expect(win.locator('[data-testid="trash-row"][data-kind="note"]')).toHaveCount(1)
    await expect(win.locator('[data-testid="trash-row"][data-kind="node"]')).toHaveCount(1)
    await expect(win.locator('[data-testid="trash-row"][data-kind="canvas"]')).toHaveCount(1)
    await expect(
      win.locator('[data-testid="trash-row"][data-kind="node"]').getByTestId('trash-row-impact'),
    ).toContainText('placement')

    // Restore the node: the row leaves the list and a restore toast
    // offers fly-to.
    await win
      .locator('[data-testid="trash-row"][data-kind="node"]')
      .getByTestId('trash-restore')
      .click()
    await expect(win.getByTestId('trash-row')).toHaveCount(2)
    await expect(win.getByTestId('trash-restored')).toBeVisible()

    // The node returned intact — active again with its placement on B.
    const locations = await runQuery<{ placements: unknown[] } | null>(win, 'getNodeLocations', {
      nodeId: nodeP,
    })
    expect(locations?.placements.length).toBe(1)

    // Fly to it: the takeover closes and navigation lands on canvas B.
    await win.getByTestId('trash-flyto').click()
    await expect(win.getByTestId('takeover-trash')).toHaveCount(0)
    await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(canvasB)
    expect(canvasB).not.toBe(root)

    // Reopen trash: two records remain (note + canvas). Empty Trash
    // shows the §9 impact summary, then purges on confirm.
    await win.getByTestId('charm-menu').click()
    await win.getByTestId('menu-trash').click()
    await expect(win.getByTestId('trash-row')).toHaveCount(2)

    await win.getByTestId('trash-empty-trash').click()
    await expect(win.getByTestId('trash-empty-confirm')).toBeVisible()
    await expect(win.getByTestId('trash-empty-summary')).toContainText('Permanently delete')
    await win.getByTestId('trash-empty-confirm-yes').click()

    // The list empties and the records are purged from the model.
    await expect(win.getByTestId('trash-empty')).toBeVisible()
    const after = await runQuery<TrashView>(win, 'getTrashView')
    expect(after.notes.length + after.nodes.length + after.canvases.length).toBe(0)
    // Purge is permanent: the loose note is gone entirely.
    const note = await runQuery<unknown>(win, 'getNote', { noteId: looseNote })
    expect(note).toBeNull()
  } finally {
    await app.close()
  }
})
