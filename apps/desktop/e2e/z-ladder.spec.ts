import { expect, test } from '@playwright/test'
import { launchApp, seedPlacedNote } from './helpers'

/**
 * AI-IMP-143 acceptance (RFC §8.8): the renderer's stacking derives
 * from the named z-ladder (z.ts). Two judgment calls in that refactor
 * change a raw number, so they get a VISUAL overlap check here:
 *
 *  - the tooltip drops 1000 → Z.tooltip (800): it must still top the
 *    big-editor modal / its scrim.
 *  - the place-mode ghost drops 480 → Z.popover (500): it must still
 *    ride ABOVE chrome (below modals — a band it never shares with an
 *    open modal in practice).
 *
 * Both surfaces are pointer-events:none, so elementFromPoint would skip
 * them; each test flips the surface to `auto` as a measurement probe
 * (sample the topmost element at the point, then restore) — a real
 * paint-order check, not a computed-style guess.
 */

test('the tooltip tops the big-editor modal (§8.8, AI-IMP-143)', async () => {
  const { app, win } = await launchApp('ew-e2e-z-tooltip-')
  await seedPlacedNote(win, 'Harbor', 'stone quay', { x: 400, y: 300 })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  // Open the note, then the big editor modal (backdrop covers chrome).
  await win.mouse.dblclick(box.x + 400, box.y + 300)
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Harbor/)
  await win.getByTestId('panel-expand').click()
  await expect(win.getByTestId('big-editor')).toBeVisible()

  // Force a tooltip over the modal: a real pointerenter on a dock tool
  // (still in the DOM beneath the backdrop) drives the tooltip action.
  await win.getByTestId('tool-select').dispatchEvent('pointerenter')
  await expect(win.getByTestId('tooltip-chip')).toBeVisible()

  // The chip must be the topmost element at its own centre — proving
  // the tooltip rung (800) still paints over the modal.
  const top = await win.evaluate(() => {
    const chip = document.querySelector('[data-testid="tooltip-chip"]') as HTMLElement
    const r = chip.getBoundingClientRect()
    const prev = chip.style.pointerEvents
    chip.style.pointerEvents = 'auto'
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    chip.style.pointerEvents = prev
    return el?.closest('[data-testid]')?.getAttribute('data-testid') ?? null
  })
  expect(top).toBe('tooltip-chip')

  await app.close()
})

test('the place-mode ghost rides above chrome (§8.8, AI-IMP-143)', async () => {
  const { app, win } = await launchApp('ew-e2e-z-ghost-')
  await win.waitForFunction(() => !!window.__ewDebug)

  // Seat the ghost dead-centre over the dock (chrome). The request
  // mounts the ghost synchronously; contentHash need not resolve — the
  // <img> element (and its z-index) exists regardless of the bytes.
  const dock = (await win.getByTestId('dock').boundingBox())!
  const cx = dock.x + dock.width / 2
  const cy = dock.y + dock.height / 2
  await win.evaluate(
    ({ x, y }) => {
      window.dispatchEvent(
        new CustomEvent('ew-place-mode', {
          detail: { nodeId: crypto.randomUUID(), contentHash: 'deadbeef', clientX: x, clientY: y },
        }),
      )
    },
    { x: cx, y: cy },
  )
  await expect(win.getByTestId('place-mode-ghost')).toBeVisible()

  const result = await win.evaluate(
    ({ x, y }) => {
      const ghost = document.querySelector('[data-testid="place-mode-ghost"]') as HTMLElement
      // Ghost is pointer-transparent: the dock owns hits here (overlap).
      const underInDock = !!document.elementFromPoint(x, y)?.closest('[data-testid="dock"]')
      const prev = ghost.style.pointerEvents
      ghost.style.pointerEvents = 'auto'
      const overIsGhost =
        document.elementFromPoint(x, y)?.getAttribute('data-testid') === 'place-mode-ghost'
      ghost.style.pointerEvents = prev
      return { underInDock, overIsGhost }
    },
    { x: cx, y: cy },
  )
  // Overlaps the dock, and paints above it (popover 500 > chrome band).
  expect(result.underInDock).toBe(true)
  expect(result.overIsGhost).toBe(true)

  await win.keyboard.press('Escape')
  await app.close()
})
