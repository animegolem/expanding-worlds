import { EW_MENU_CASCADE_MS, EW_MENU_STAGGER_CAP, EW_MENU_STAGGER_MS } from './beats'

/**
 * The universal menu CASCADE applicator (RFC-0001 §8.2 rev 0.64,
 * decision 06, AI-IMP-167). Stamps a freshly-opened menu surface so its
 * rows fade in staggered top to bottom — the ONE grammar shared by both
 * families (chrome/MenuPopover.svelte via `use:applyMenuCascade`, and
 * the imperative menus/ContextMenu.ts builder plus its flyouts).
 *
 * Each direct child row gets a running `--row-index` (per the ticket)
 * and the shared `ew-menu-cascade-row` class; the stagger delay and the
 * per-row fade come straight from the chrome/beats.ts constants so the
 * numbers live in one place. The keyframe (opacity ramp) is in
 * chrome/menu-cascade.css. One-shot on open — call once per fresh mount;
 * close needs nothing (no exit animation). Opacity only, so rows stay
 * interactive through the fade.
 */

/** The per-row fade. The last STAGGERED row starts at cap*stagger and
 * finishes at exactly the cascade budget: cap*stagger + rowFade ==
 * cascade (4*30 + 70 == 190). A longer menu caps at the same delay, so
 * it still lands in budget. */
const EW_MENU_ROW_FADE_MS = EW_MENU_CASCADE_MS - EW_MENU_STAGGER_CAP * EW_MENU_STAGGER_MS

export function applyMenuCascade(container: HTMLElement): void {
  const rows = container.children
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as HTMLElement
    // Cap the effective stagger so a long menu still finishes in budget.
    const delay = Math.min(i, EW_MENU_STAGGER_CAP) * EW_MENU_STAGGER_MS
    row.style.setProperty('--row-index', String(i))
    row.style.animationDelay = `${delay}ms`
    row.style.animationDuration = `${EW_MENU_ROW_FADE_MS}ms`
    row.classList.add('ew-menu-cascade-row')
  }
}
