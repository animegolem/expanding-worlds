/**
 * The tooltip rule (RFC §8.2): every hoverable control names itself
 * and prints its shortcut, one chip style app-wide, after a short
 * delay. Svelte action: `use:tooltip={{ name: 'Select', shortcut: 'V' }}`.
 */
import { TOOLTIP_DELAY_MS } from './feel'

export interface TooltipSpec {
  name: string
  shortcut?: string
}

let chip: HTMLDivElement | null = null

function ensureChip(): HTMLDivElement {
  if (chip) return chip
  chip = document.createElement('div')
  chip.className = 'ew-tooltip-chip'
  chip.dataset['testid'] = 'tooltip-chip'
  chip.style.cssText = [
    'position: fixed',
    'z-index: 1000',
    'display: none',
    'padding: 3px 8px',
    'background: var(--ew-tooltip-scrim)',
    'color: var(--ew-text)',
    'border: 1px solid var(--ew-border-strong)',
    'border-radius: 5px',
    'font: 11px/1.4 system-ui, sans-serif',
    'pointer-events: none',
    'white-space: nowrap',
  ].join(';')
  document.body.appendChild(chip)
  return chip
}

function show(anchor: HTMLElement, spec: TooltipSpec): void {
  const el = ensureChip()
  el.textContent = spec.name
  if (spec.shortcut) {
    const key = document.createElement('span')
    key.style.cssText = 'margin-left: 6px; opacity: 0.65; font-family: ui-monospace, monospace'
    key.textContent = spec.shortcut
    el.appendChild(key)
  }
  el.style.display = 'block'
  const rect = anchor.getBoundingClientRect()
  const chipRect = el.getBoundingClientRect()
  let x = rect.left + rect.width / 2 - chipRect.width / 2
  x = Math.max(4, Math.min(x, window.innerWidth - chipRect.width - 4))
  // Above the control by default; below when there is no headroom.
  let y = rect.top - chipRect.height - 6
  if (y < 4) y = rect.bottom + 6
  el.style.left = `${x}px`
  el.style.top = `${y}px`
}

function hide(): void {
  if (chip) chip.style.display = 'none'
}

export function tooltip(
  node: HTMLElement,
  spec: TooltipSpec,
): { update: (next: TooltipSpec) => void; destroy: () => void } {
  let current = spec
  let timer: ReturnType<typeof setTimeout> | null = null

  const onEnter = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => show(node, current), TOOLTIP_DELAY_MS)
  }
  const cancel = (): void => {
    if (timer) clearTimeout(timer)
    timer = null
    hide()
  }

  node.addEventListener('pointerenter', onEnter)
  node.addEventListener('pointerleave', cancel)
  node.addEventListener('pointerdown', cancel)
  node.setAttribute('aria-label', current.name)

  return {
    update(next: TooltipSpec) {
      current = next
      node.setAttribute('aria-label', current.name)
    },
    destroy() {
      cancel()
      node.removeEventListener('pointerenter', onEnter)
      node.removeEventListener('pointerleave', cancel)
      node.removeEventListener('pointerdown', cancel)
    },
  }
}
