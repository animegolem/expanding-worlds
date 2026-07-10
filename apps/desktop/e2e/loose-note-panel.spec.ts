/**
 * AI-IMP-258: the LOOSE-note panel (no placement — opened from
 * gallery/outline/search). The field-report failures, each pinned:
 * the anchorless spawn parked the close button under the charm rail
 * (whose search charm ate its clicks), and the panel was undraggable
 * — unpinned panels refuse drags and the header offered no grab area.
 * Now: the spawn clears the rail, every header control hit-tests to
 * itself, and the panel is FREE-FLOATING — the grip drags it without
 * pinning and the position sticks across camera-driven relayouts.
 */
import { test, expect } from '@playwright/test'
import { launchApp, exec, seedPlacedNote } from './helpers'

async function openLooseNote(win: import('@playwright/test').Page): Promise<string> {
  const noteId = crypto.randomUUID()
  await exec(win, 'CreateNote', { noteId, title: 'Loose one', body: 'no placement' })
  await win.evaluate((id) => {
    window.dispatchEvent(new CustomEvent('ew-open-note', { detail: { noteId: id } }))
  }, noteId)
  await expect(win.getByTestId('note-pane')).toBeVisible()
  // layout() runs on an rAF after the async note load settles.
  await win.waitForTimeout(300)
  return noteId
}

/** The element actually receiving hits at a locator's center. */
async function hitTestId(
  win: import('@playwright/test').Page,
  testid: string,
): Promise<string | null> {
  const box = (await win.getByTestId(testid).boundingBox())!
  return win.evaluate(
    ([x, y]) => {
      const el = document.elementFromPoint(x!, y!)
      return el ? ((el.closest('[data-testid]') as HTMLElement | null)?.dataset['testid'] ?? null) : null
    },
    [box.x + box.width / 2, box.y + box.height / 2],
  )
}

test('loose-note panel spawns clear of chrome: every control hit-tests to itself and close CLOSES (§8.5, AI-IMP-258)', async () => {
  const { app, win } = await launchApp('ew-e2e-loose-hit-')
  await openLooseNote(win)

  // The old -16 anchorless default put panel-close's center inside the
  // charm rail's column — elementFromPoint returned charm-search and
  // "close" opened the search takeover.
  expect(await hitTestId(win, 'panel-grip')).toBe('panel-grip')
  expect(await hitTestId(win, 'panel-pin')).toBe('panel-pin')
  expect(await hitTestId(win, 'panel-expand')).toBe('panel-expand')
  expect(await hitTestId(win, 'panel-close')).toBe('panel-close')

  await win.getByTestId('panel-close').click()
  await expect(win.getByTestId('note-pane')).toBeHidden()
  // And no takeover was collaterally opened by the click.
  await expect(win.getByTestId('search-panel')).toHaveCount(0)
  await app.close()
})

test('loose-note panel drags WITHOUT pinning and the position sticks across a camera relayout (AI-IMP-258)', async () => {
  const { app, win } = await launchApp('ew-e2e-loose-drag-')
  await openLooseNote(win)
  const panel = win.getByTestId('note-pane')

  const grip = (await win.getByTestId('panel-grip').boundingBox())!
  const before = (await panel.boundingBox())!
  const start = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }
  await win.mouse.move(start.x, start.y)
  await win.mouse.down()
  await win.mouse.move(start.x - 300, start.y + 200, { steps: 10 })
  await win.mouse.up()
  await win.waitForTimeout(200)
  const after = (await panel.boundingBox())!
  expect(Math.round(after.x - before.x)).toBe(-300)
  expect(Math.round(after.y - before.y)).toBe(200)

  // Still unpinned: dragging did not silently pin it.
  await expect(win.locator('[data-testid^="note-panel-pinned-"]')).toHaveCount(0)

  // A camera move re-runs layout(); the dragged position must hold
  // (the old fallback re-parked the panel at the corner every pass).
  const host = (await win.getByTestId('canvas-host').boundingBox())!
  await win.mouse.move(host.x + host.width / 2, host.y + host.height / 2)
  await win.mouse.wheel(0, 120)
  await win.waitForTimeout(250)
  const held = (await panel.boundingBox())!
  expect(Math.round(held.x)).toBe(Math.round(after.x))
  expect(Math.round(held.y)).toBe(Math.round(after.y))

  // Pin afterwards keeps the dragged spot (screen carries over).
  await win.getByTestId('panel-pin').click()
  const pinned = win.locator('[data-testid^="note-panel-pinned-"]')
  await expect(pinned).toBeVisible()
  const pinnedBox = (await pinned.boundingBox())!
  expect(Math.round(pinnedBox.x)).toBe(Math.round(after.x))
  await app.close()
})

test('a PLACED note keeps the tether: no grip, drag refused, layout follows the node (§8.5 unchanged)', async () => {
  const { app, win } = await launchApp('ew-e2e-loose-tether-')
  const { noteId } = await seedPlacedNote(win, 'Placed one', 'body', { x: 400, y: 300 })
  await win.evaluate((id) => {
    window.dispatchEvent(new CustomEvent('ew-open-note', { detail: { noteId: id } }))
  }, noteId)
  const panel = win.getByTestId('note-pane')
  await expect(panel).toBeVisible()
  await win.waitForTimeout(300)

  // Tethered to its placement: not free-floating, so no grip shows.
  await expect(win.getByTestId('panel-grip')).toHaveCount(0)

  // A header drag attempt must not move it (layout owns the position).
  const header = panel.locator('header')
  const hbox = (await header.boundingBox())!
  const before = (await panel.boundingBox())!
  await win.mouse.move(hbox.x + 4, hbox.y + hbox.height / 2)
  await win.mouse.down()
  await win.mouse.move(hbox.x - 150, hbox.y + 150, { steps: 8 })
  await win.mouse.up()
  await win.waitForTimeout(200)
  const after = (await panel.boundingBox())!
  expect(Math.round(after.x)).toBe(Math.round(before.x))
  expect(Math.round(after.y)).toBe(Math.round(before.y))
  await app.close()
})
