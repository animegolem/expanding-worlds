/**
 * AI-IMP-206 dev feel-dial: an in-app replacement for the console-only
 * `__ewDebug.zoomTuning` hook (AI-IMP-098). A small draggable DOM
 * overlay — NOT canvas-rendered — of sliders bound to the live zoom
 * feel tunables, so the remote tester can dial the "weight" on his own
 * Windows release build and paste the numbers back over Discord.
 *
 * It is deliberately DEV FURNITURE: hidden until a keyboard chord opens
 * it, kit-styled but marked, and PRESENT in release builds (that is the
 * entire point — alph tunes on the shipped binary). Values are
 * session-only; nothing persists (§11.5 — feel constants are not
 * settings, the dialed numbers get frozen into code from the paste).
 *
 * Talks to the host purely through the window `__ewDebug` hooks, so it
 * carries no reference to the canvas host and cannot break its build:
 *   - `zoomTuning()` reads the live values; `zoomTuning(partial)` sets.
 *   - `zoomTuningDefaults()` gives the shipped values for reset.
 *
 * Adding a slider is ONE line in the TUNABLES registry below.
 */
import { matchesCombo, type Combo } from '../keys/registry'
import { Z } from '../z'

/** A live-adjustable feel scalar. `key` matches the `zoomTuning`
 * partial/return shape; the slider ranges LOG-uniformly around the
 * shipped value (×0.25 – ×4). */
interface Tunable {
  key: 'tau' | 'wheelSpeed' | 'pinchSpeed'
  label: string
  unit?: string
  /** Decimals in the numeric readout (the raw value, not the ×factor). */
  decimals: number
}

/**
 * The registry. host.ts's audit (AI-IMP-206) found exactly three
 * module-local feel scalars, all on the zoom chase — the plain pan is a
 * deliberate 1:1 passthrough with no scalar to dial (Apple's deltas ARE
 * the tuned curve), and CameraFlight's 250 ms framing duration is a
 * separate interaction the tester did not flag. So the exposed set is
 * the zoomTuning trio; new tunables drop in as one row each.
 */
const TUNABLES: Tunable[] = [
  { key: 'tau', label: 'Zoom ease (τ)', unit: 'ms', decimals: 1 },
  { key: 'wheelSpeed', label: 'Wheel / scroll zoom', decimals: 5 },
  { key: 'pinchSpeed', label: 'Pinch zoom', decimals: 4 },
]

/** Log range around each shipped value: ×0.25 to ×4 (the ticket span). */
const RANGE_MIN_FACTOR = 0.25
const RANGE_MAX_FACTOR = 4
const LOG_LO = Math.log(RANGE_MIN_FACTOR)
const LOG_HI = Math.log(RANGE_MAX_FACTOR)
/** Slider position [0,1] → multiplicative factor on the shipped value. */
const factorFor = (t: number): number => Math.exp(LOG_LO + (LOG_HI - LOG_LO) * t)
/** Inverse: a factor back to its slider position (clamped to the track). */
const positionFor = (factor: number): number =>
  Math.min(1, Math.max(0, (Math.log(factor) - LOG_LO) / (LOG_HI - LOG_LO)))

/** Open the chord: ⌥⇧⌘F (Alt+Shift+Ctrl+F elsewhere). Matched by CODE,
 * not key — on macOS ⌥F emits a dead-key glyph ("ƒ"), so event.key
 * would miss; event.code is 'KeyF' regardless. Deliberately NOT
 * declared in keys/bindings.ts: dev furniture must stay out of the
 * Settings > Keyboard map an artist reads. */
const TOGGLE_COMBO: Combo = { mod: true, shift: true, alt: true, code: 'KeyF' }

type Tuning = { tau: number; wheelSpeed: number; pinchSpeed: number }

interface FeelDialDebug {
  open(): void
  close(): void
  toggle(): void
  isOpen(): boolean
  /** The live tuning the wheel/pinch path is using right now. */
  values(): Tuning | null
  /** The compact JSON the "copy values" button writes to the clipboard. */
  serialize(): string
}

declare global {
  interface Window {
    /** AI-IMP-206 dev feel-dial control surface (also the e2e seam). */
    __ewFeelDial?: FeelDialDebug
  }
}

/**
 * Mount the feel-dial: install the toggle chord and the debug seam,
 * building the panel lazily on first open. Returns a disposer that
 * removes the listener, the DOM, and the seam.
 */
export function mountFeelDial(): () => void {
  const debug = (): Window['__ewDebug'] => window.__ewDebug
  let panel: HTMLDivElement | null = null
  const sliders = new Map<Tunable['key'], HTMLInputElement>()
  const readouts = new Map<Tunable['key'], HTMLSpanElement>()

  const shipped = (): Tuning =>
    debug()?.zoomTuningDefaults() ?? { tau: 1, wheelSpeed: 1, pinchSpeed: 1 }
  const live = (): Tuning | null => debug()?.zoomTuning() ?? null

  const formatReadout = (t: Tunable, value: number, factor: number): string => {
    const shown = value.toFixed(t.decimals) + (t.unit ? ` ${t.unit}` : '')
    return `${shown} · ×${factor.toFixed(2)}`
  }

  /** Push a tunable's current live value into its slider + readout. */
  function syncRow(t: Tunable): void {
    const values = live()
    if (!values) return
    const value = values[t.key]
    const base = shipped()[t.key] || 1
    const factor = value / base
    const slider = sliders.get(t.key)
    const readout = readouts.get(t.key)
    if (slider) slider.value = String(positionFor(factor))
    if (readout) readout.textContent = formatReadout(t, value, factor)
  }

  function syncAll(): void {
    for (const t of TUNABLES) syncRow(t)
  }

  function applyFromSlider(t: Tunable, position: number): void {
    const base = shipped()[t.key] || 1
    const factor = factorFor(position)
    const value = base * factor
    debug()?.zoomTuning({ [t.key]: value })
    const readout = readouts.get(t.key)
    if (readout) readout.textContent = formatReadout(t, value, factor)
  }

  function build(): HTMLDivElement {
    const root = document.createElement('div')
    root.dataset['testid'] = 'feel-dial'
    // Above every rung (tooltip is the ladder top): dev furniture floats
    // over the whole app so it is always reachable while tuning.
    root.style.cssText = [
      'position:fixed',
      'top:64px',
      'left:24px',
      'width:280px',
      `z-index:${Z.tooltip}`,
      'background:var(--ew-surface-raised)',
      'border:1px solid var(--ew-border-strong)',
      'border-radius:8px',
      'box-shadow:0 8px 30px var(--ew-shadow)',
      'color:var(--ew-text)',
      'font:12px/1.4 system-ui, sans-serif',
      'user-select:none',
      'padding:0 0 10px',
    ].join(';')

    // --- header (drag handle) ---
    const header = document.createElement('div')
    header.dataset['testid'] = 'feel-dial-header'
    header.style.cssText = [
      'display:flex',
      'align-items:center',
      'gap:8px',
      'padding:8px 10px',
      'cursor:move',
      'border-bottom:1px solid var(--ew-border)',
    ].join(';')
    const title = document.createElement('span')
    title.textContent = 'Feel dial'
    title.style.cssText = 'font-weight:600;flex:1'
    const pill = document.createElement('span')
    pill.textContent = 'DEV'
    pill.style.cssText = [
      'font-size:9px',
      'font-weight:700',
      'letter-spacing:0.08em',
      'padding:1px 5px',
      'border-radius:4px',
      'background:var(--ew-accent)',
      'color:var(--ew-on-accent)',
    ].join(';')
    const close = document.createElement('button')
    close.type = 'button'
    close.dataset['testid'] = 'feel-dial-close'
    close.textContent = '×'
    close.setAttribute('aria-label', 'Close feel dial')
    close.style.cssText = [
      'border:none',
      'background:transparent',
      'color:var(--ew-text-muted)',
      'font-size:16px',
      'line-height:1',
      'cursor:pointer',
      'padding:0 2px',
    ].join(';')
    close.addEventListener('click', hide)
    header.append(title, pill, close)
    root.appendChild(header)
    installDrag(root, header)

    // --- slider rows ---
    for (const t of TUNABLES) {
      const row = document.createElement('div')
      row.dataset['testid'] = `feel-dial-row-${t.key}`
      row.style.cssText = 'padding:8px 10px 4px'
      const top = document.createElement('div')
      top.style.cssText = 'display:flex;justify-content:space-between;gap:8px;margin-bottom:4px'
      const label = document.createElement('span')
      label.textContent = t.label
      const readout = document.createElement('span')
      readout.dataset['testid'] = `feel-dial-readout-${t.key}`
      readout.style.cssText = 'color:var(--ew-text-muted);font-variant-numeric:tabular-nums'
      top.append(label, readout)
      const slider = document.createElement('input')
      slider.type = 'range'
      slider.min = '0'
      slider.max = '1'
      slider.step = '0.001'
      slider.dataset['testid'] = `feel-dial-slider-${t.key}`
      slider.style.cssText = 'width:100%;accent-color:var(--ew-accent)'
      slider.addEventListener('input', () => applyFromSlider(t, Number(slider.value)))
      sliders.set(t.key, slider)
      readouts.set(t.key, readout)
      row.append(top, slider)
      root.appendChild(row)
    }

    // --- footer actions ---
    const footer = document.createElement('div')
    footer.style.cssText = 'display:flex;gap:8px;padding:8px 10px 0'
    const copy = button('Copy values', 'feel-dial-copy', () => {
      const text = serialize()
      void navigator.clipboard?.writeText(text)
      copy.textContent = 'Copied ✓'
      setTimeout(() => (copy.textContent = 'Copy values'), 1200)
    })
    const reset = button('Reset', 'feel-dial-reset', () => {
      debug()?.zoomTuning(shipped())
      syncAll()
    })
    footer.append(copy, reset)
    root.appendChild(footer)

    return root
  }

  function button(text: string, testid: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = text
    b.dataset['testid'] = testid
    b.style.cssText = [
      'flex:1',
      'padding:5px 8px',
      'border:1px solid var(--ew-border-strong)',
      'border-radius:5px',
      'background:var(--ew-surface-solid)',
      'color:var(--ew-text)',
      'font:inherit',
      'cursor:pointer',
    ].join(';')
    b.addEventListener('click', onClick)
    return b
  }

  /** Drag the panel by its header (pointer-captured so it can't drop). */
  function installDrag(root: HTMLDivElement, handle: HTMLElement): void {
    let start: { px: number; py: number; left: number; top: number } | null = null
    handle.addEventListener('pointerdown', (event) => {
      if ((event.target as HTMLElement).dataset['testid'] === 'feel-dial-close') return
      const rect = root.getBoundingClientRect()
      start = { px: event.clientX, py: event.clientY, left: rect.left, top: rect.top }
      handle.setPointerCapture(event.pointerId)
    })
    handle.addEventListener('pointermove', (event) => {
      if (!start) return
      root.style.left = `${start.left + (event.clientX - start.px)}px`
      root.style.top = `${start.top + (event.clientY - start.py)}px`
    })
    const end = (): void => {
      start = null
    }
    handle.addEventListener('pointerup', end)
    handle.addEventListener('pointercancel', end)
  }

  function serialize(): string {
    return JSON.stringify(live() ?? {})
  }

  function show(): void {
    if (!panel) panel = build()
    if (!panel.isConnected) document.body.appendChild(panel)
    panel.style.display = 'block'
    syncAll()
  }
  function hide(): void {
    if (panel) panel.style.display = 'none'
  }
  function isOpen(): boolean {
    return panel !== null && panel.isConnected && panel.style.display !== 'none'
  }
  function toggle(): void {
    if (isOpen()) hide()
    else show()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!matchesCombo(event, TOGGLE_COMBO)) return
    event.preventDefault()
    toggle()
  }
  window.addEventListener('keydown', onKeyDown)

  window.__ewFeelDial = {
    open: show,
    close: hide,
    toggle,
    isOpen,
    values: live,
    serialize,
  }

  return () => {
    window.removeEventListener('keydown', onKeyDown)
    panel?.remove()
    panel = null
    delete window.__ewFeelDial
  }
}
