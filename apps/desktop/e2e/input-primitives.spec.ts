import { expect, test, type Page } from '@playwright/test'
import { launchApp } from './helpers'

/**
 * AI-IMP-142 equivalence spot check: the migrated surfaces now render
 * their text fields through ui/TextInput.svelte. This asserts the
 * COMPUTED style of two migrated fields — one of each variant — matches
 * the shared skin: the input-surface fill, the strong border, and the
 * variant's radius (999px pill / 5px standard). The fill/border are
 * compared against a probe element painted with the same var(), so the
 * proof holds without hardcoding a theme's hex. The surfaces' own specs
 * (search, settings, tags, restore) ride unchanged as the behavioural
 * half of the equivalence proof.
 */

interface FieldStyle {
  borderRadius: string
  background: string
  borderColor: string
  tokenBackground: string
  tokenBorder: string
}

async function fieldStyle(win: Page, testid: string): Promise<FieldStyle> {
  return win.evaluate((id): FieldStyle => {
    const el = document.querySelector(`[data-testid="${id}"]`)
    if (!el) throw new Error(`no element for testid ${id}`)
    const cs = getComputedStyle(el)
    // Probe resolves the tokens in the same document/theme.
    const probe = document.createElement('div')
    probe.style.background = 'var(--ew-surface-input)'
    probe.style.borderTop = '1px solid var(--ew-border-strong)'
    document.body.appendChild(probe)
    const ps = getComputedStyle(probe)
    const out: FieldStyle = {
      borderRadius: cs.borderTopLeftRadius,
      background: cs.backgroundColor,
      borderColor: cs.borderTopColor,
      tokenBackground: ps.backgroundColor,
      tokenBorder: ps.borderTopColor,
    }
    probe.remove()
    return out
  }, testid)
}

test('pill field (search) renders the shared skin at 999px', async () => {
  const { app, win } = await launchApp('ew-e2e-input-pill-')
  try {
    await win.getByTestId('charm-search').click()
    await expect(win.getByTestId('search-input')).toBeVisible()

    const style = await fieldStyle(win, 'search-input')
    expect(style.borderRadius).toBe('999px')
    expect(style.background).toBe(style.tokenBackground)
    expect(style.borderColor).toBe(style.tokenBorder)
  } finally {
    await app.close()
  }
})

test('standard field (settings remote) renders the shared skin at 5px', async () => {
  const { app, win } = await launchApp('ew-e2e-input-standard-')
  try {
    await win.getByTestId('charm-menu').click()
    await win.getByTestId('menu-settings').click()
    await expect(win.getByTestId('settings-view')).toBeVisible()
    await win.getByTestId('settings-snapshots-commit-push').click()
    await expect(win.getByTestId('settings-snapshot-remote-url')).toBeVisible()

    const style = await fieldStyle(win, 'settings-snapshot-remote-url')
    expect(style.borderRadius).toBe('5px')
    expect(style.background).toBe(style.tokenBackground)
    expect(style.borderColor).toBe(style.tokenBorder)
  } finally {
    await app.close()
  }
})
