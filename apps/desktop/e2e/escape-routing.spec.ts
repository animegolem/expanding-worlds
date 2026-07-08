import { expect, test } from '@playwright/test'
import { launchApp, seedPlacedNote } from './helpers'

/**
 * AI-IMP-183 acceptance (Escape / global-key routing hygiene). The
 * systemic defect: Escape (and Mod+[/]) reaching the canvas host
 * underneath the surface that should consume them — clearing the
 * selection or moving the board. These drive the routing guarantees:
 *
 *  - Escape inside a text field never leaks to the board (M-09 root fix).
 *  - Escape closing a floating panel never clears the selection (M-24).
 *  - The big editor is a takeover-FAMILY input blocker: Mod+P quick-open
 *    cannot open behind it, and opening it retires the search panel
 *    (M-11 / M-12 / M-29).
 */

test('Escape in the note-title input discards the rename WITHOUT clearing the selection (M-09)', async () => {
  const { app, win } = await launchApp('ew-e2e-esc-title-')
  const box = (await win.getByTestId('canvas-host').boundingBox())!
  await seedPlacedNote(win, 'Alpha', 'first', { x: 300, y: 240 })
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))

  // Open the note pane (double-click selects the pin and opens it).
  await win.mouse.dblclick(box.x + 300, box.y + 240)
  const title = win.getByTestId('note-title-input')
  await expect(title).toHaveValue('Alpha')
  const selected = await win.evaluate(() => window.__ewDebug!.selection())
  expect(selected.length).toBe(1)

  // Type a would-be rename, then Escape to discard it.
  await title.fill('Zzz renamed')
  await title.press('Escape')

  // The draft reverts AND — the whole point — the canvas selection under
  // the panel is untouched (the host's Escape never fired).
  await expect(title).toHaveValue('Alpha')
  expect(await win.evaluate(() => window.__ewDebug!.selection())).toEqual(selected)

  await app.close()
})

test('Escape closing the search panel leaves the canvas selection intact (M-24)', async () => {
  const { app, win } = await launchApp('ew-e2e-esc-panel-')
  const box = (await win.getByTestId('canvas-host').boundingBox())!
  await seedPlacedNote(win, 'Alpha', 'first', { x: 300, y: 240 })
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))

  await win.mouse.click(box.x + 300, box.y + 240)
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.selection().length))
    .toBe(1)
  const selected = await win.evaluate(() => window.__ewDebug!.selection())

  const panel = win.getByTestId('search-panel')
  await win.keyboard.press('ControlOrMeta+p')
  await expect(panel).toBeVisible()

  await win.keyboard.press('Escape')
  await expect(panel).not.toBeVisible()
  // Exactly one surface peeled: the panel closed, the selection did not.
  expect(await win.evaluate(() => window.__ewDebug!.selection())).toEqual(selected)

  await app.close()
})

test('the big editor blocks Mod+P quick-open and retires the search panel (M-11/M-12/M-29)', async () => {
  const { app, win } = await launchApp('ew-e2e-esc-blocker-')
  const box = (await win.getByTestId('canvas-host').boundingBox())!
  // Place away from the top-center where the quick-open panel anchors, so
  // the note pane's expand button is never occluded by it.
  await seedPlacedNote(win, 'Alpha', 'first', { x: 460, y: 380 })
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))
  await win.mouse.dblclick(box.x + 460, box.y + 380)
  await expect(win.getByTestId('note-pane')).toBeVisible()

  const panel = win.getByTestId('search-panel')
  const editor = win.getByTestId('big-editor')

  // Open quick-open, THEN the big editor: registering the editor's input
  // blocker notifies the takeover store, retiring the panel (M-12/M-29).
  await win.keyboard.press('ControlOrMeta+p')
  await expect(panel).toBeVisible()
  await win.getByTestId('panel-expand').click()
  await expect(editor).toBeVisible()
  await expect(panel).not.toBeVisible()

  // Under the editor, Mod+P is suppressed — no panel opens behind it (M-11).
  await win.keyboard.press('ControlOrMeta+p')
  await expect(panel).not.toBeVisible()

  // Close the editor; the blocker releases and quick-open works again.
  await win.getByTestId('big-editor-done').click()
  await expect(editor).toHaveCount(0)
  await win.keyboard.press('ControlOrMeta+p')
  await expect(panel).toBeVisible()

  await app.close()
})
