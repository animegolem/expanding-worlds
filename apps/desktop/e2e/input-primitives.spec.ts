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

interface FocusRing {
  width: string
  style: string
  color: string
  offset: string
  tokenColor: string
}

// The uniform focus ring (kit 1.2 "One voice"): 2px solid
// --ew-focus-ring outline at offset 1px on every field. Fields ring on
// plain :focus, so a programmatic focus() is enough to paint it.
async function focusRing(win: Page, testid: string): Promise<FocusRing> {
  return win.evaluate((id): FocusRing => {
    const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`)
    if (!el) throw new Error(`no element for testid ${id}`)
    el.focus()
    const cs = getComputedStyle(el)
    const probe = document.createElement('div')
    probe.style.outline = '2px solid var(--ew-focus-ring)'
    document.body.appendChild(probe)
    const tokenColor = getComputedStyle(probe).outlineColor
    probe.remove()
    return {
      width: cs.outlineWidth,
      style: cs.outlineStyle,
      color: cs.outlineColor,
      offset: cs.outlineOffset,
      tokenColor,
    }
  }, testid)
}

test('compound search field keeps a bare shared input inside palette-owned furniture', async () => {
  const { app, win } = await launchApp('ew-e2e-input-pill-')
  try {
    await win.getByTestId('charm-search').click()
    await expect(win.getByTestId('search-input')).toBeVisible()

    const input = await win.getByTestId('search-input').evaluate((el) => {
      const style = getComputedStyle(el)
      return { borderRadius: style.borderRadius, borderWidth: style.borderWidth }
    })
    expect(input.borderRadius).toBe('0px')
    expect(input.borderWidth).toBe('0px')
    const field = await fieldStyle(win, 'search-query-field')
    expect(field.borderRadius).toBe('7px')
    expect(field.borderColor).toBe(field.tokenBorder)
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

    // AI-IMP-153: the standard field carries the uniform focus ring.
    const ring = await focusRing(win, 'settings-snapshot-remote-url')
    expect(ring.width).toBe('2px')
    expect(ring.style).toBe('solid')
    expect(ring.offset).toBe('1px')
    expect(ring.color).toBe(ring.tokenColor)

    // AI-IMP-153: buttons collapse to the one 5px geometry.
    const buttonRadius = await win.evaluate(() => {
      const el = document.querySelector<HTMLElement>(
        '[data-testid="settings-snapshot-remote-test"]',
      )
      if (!el) throw new Error('no settings-snapshot-remote-test button')
      return getComputedStyle(el).borderTopLeftRadius
    })
    expect(buttonRadius).toBe('5px')
  } finally {
    await app.close()
  }
})

test('compound search field carries the uniform focus ring on its outer boundary', async () => {
  const { app, win } = await launchApp('ew-e2e-input-pill-focus-')
  try {
    await win.getByTestId('charm-search').click()
    await expect(win.getByTestId('search-input')).toBeVisible()

    // AI-IMP-153: the ruling puts the SAME ring on the pill variant that
    // the standard variant carries — never the browser default.
    await win.getByTestId('search-input').focus()
    const ring = await win.getByTestId('search-query-field').evaluate((el) => {
      const style = getComputedStyle(el)
      const probe = document.createElement('div')
      probe.style.outline = '2px solid var(--ew-focus-ring)'
      document.body.appendChild(probe)
      const tokenColor = getComputedStyle(probe).outlineColor
      probe.remove()
      return {
        width: style.outlineWidth,
        style: style.outlineStyle,
        offset: style.outlineOffset,
        color: style.outlineColor,
        tokenColor,
      }
    })
    expect(ring.width).toBe('2px')
    expect(ring.style).toBe('solid')
    expect(ring.offset).toBe('1px')
    expect(ring.color).toBe(ring.tokenColor)
  } finally {
    await app.close()
  }
})
