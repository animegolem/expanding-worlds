import { expect, test } from '@playwright/test'
import { launchApp } from './helpers'

/**
 * AI-IMP-206 dev feel-dial: the console-only `zoomTuning` hook, now an
 * in-app draggable overlay so the remote tester dials zoom feel on his
 * own release build. The chord opens it; a slider live-applies to the
 * host tunable; "copy values" yields parseable JSON; reset restores the
 * shipped defaults. Session-only, present in release builds.
 */

test('the feel-dial chord opens the overlay; a slider live-applies, copy serializes, reset restores', async () => {
  const { app, win } = await launchApp('ew-e2e-feel-dial-')

  // Hidden until summoned — no panel in the DOM at rest.
  await expect(win.getByTestId('feel-dial')).toHaveCount(0)

  // ⌥⇧⌘F / Ctrl+Shift+Alt+F — Ctrl satisfies Mod on every platform,
  // and the binding matches by code (KeyF) so Alt's dead-key glyph on
  // macOS can't miss.
  await win.keyboard.press('Control+Shift+Alt+F')
  await expect(win.getByTestId('feel-dial')).toBeVisible()

  const shippedTau = await win.evaluate(() => window.__ewDebug!.zoomTuningDefaults().tau)

  // Drag the τ slider to the top of its range (×4) and confirm the
  // very host tunable the wheel path reads has changed live.
  await win.evaluate(() => {
    const slider = document.querySelector<HTMLInputElement>('[data-testid="feel-dial-slider-tau"]')!
    slider.value = '1'
    slider.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const dialedTau = await win.evaluate(() => window.__ewDebug!.zoomTuning().tau)
  expect(dialedTau).toBeCloseTo(shippedTau * 4, 2)

  // Copy values writes the full current set as parseable compact JSON.
  const serialized = await win.evaluate(() => window.__ewFeelDial!.serialize())
  const parsed = JSON.parse(serialized) as { tau: number; wheelSpeed: number; pinchSpeed: number }
  expect(parsed.tau).toBeCloseTo(dialedTau, 6)
  expect(typeof parsed.wheelSpeed).toBe('number')
  expect(typeof parsed.pinchSpeed).toBe('number')

  // Reset returns the tunables to the SHIPPED code defaults.
  await win.getByTestId('feel-dial-reset').click()
  const resetTau = await win.evaluate(() => window.__ewDebug!.zoomTuning().tau)
  expect(resetTau).toBeCloseTo(shippedTau, 6)

  // The chord toggles it back closed.
  await win.keyboard.press('Control+Shift+Alt+F')
  await expect(win.getByTestId('feel-dial')).toBeHidden()

  await app.close()
})
