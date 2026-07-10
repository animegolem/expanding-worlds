/**
 * The tooltip rule (RFC §8.2): every hoverable control names itself
 * and prints its shortcut, one chip style app-wide, after a short
 * delay. Svelte action: `use:tooltip={{ name: 'Select', shortcut: 'V' }}`.
 */
import { TOOLTIP_DELAY_MS } from './feel'
import { Z } from '../z'
import { placeAnchored } from './anchored-placement'

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
    `z-index: ${Z.tooltip}`,
    'display: none',
    'padding: 3px 8px',
    'background: var(--ew-tooltip-scrim)',
    'color: var(--ew-chip-text)',
    'border: 1px solid var(--ew-chip-border)',
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
  const placed = placeAnchored({
    anchor: rect,
    surface: chipRect,
    host: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight },
    x: { preferred: 'center' },
    y: { preferred: 'before', fallback: 'after' },
    gap: { y: 6 },
    margin: 4,
  })
  el.style.left = `${placed.x}px`
  el.style.top = `${placed.y}px`
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
