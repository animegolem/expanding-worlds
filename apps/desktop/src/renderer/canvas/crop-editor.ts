/**
 * The crop editor overlay (RFC §4.6 non-destructive crop, §8.2 hand
 * rules, §8.8 overlay families; AI-IMP-159).
 *
 * Owner shape: hit Crop on the charm bar → this overlay opens showing
 * the FULL image with a crop tool → committing crops the DISPLAY (the
 * image appearance's crop rect), never the canonical asset. The board
 * then renders only that region at the placement frame; the managed
 * asset bytes stay byte-identical (§8.5 — the texture is sampled, never
 * rewritten).
 *
 * It is a takeover-family overlay: a full-window scrim above the board,
 * engagement held, board input scoped out via registerInputBlocker (so
 * every seam already guarding on takeoverActive() — host keydown,
 * gestures pointer, nav/undo keys — goes inert underneath). NO beats:
 * crop is on the §8.2 no-beat list, so the handles/guides are silent.
 *
 * Commit grammar (§8.4): Enter or Apply commits ONE SetNodeAppearance
 * through the gateway; Esc or Cancel discards. Re-entering shows the
 * whole image with the current rect ready to adjust; Reset restores the
 * full frame.
 */
import { assetUrl, type ScenePlacement } from '@ew/canvas-engine'
import type { CanvasHostHandle } from './host'
import { Z } from '../z'
import { holdEngagement } from '../chrome/engagement'
import { registerInputBlocker } from '../chrome/takeover'
// The crop commit is ONE SetNodeAppearance, but that command sits in
// the undo store's GROUP_ONLY set (frame machinery), not the standing
// CAPTURED set — a bare execute would not be undoable. Running the
// single commit inside a group window captures it as one entry through
// EXISTING machinery (the ContextMenu gather/flipAll idiom) without
// widening the capture allowlist. Flagged for the AI-IMP-154 gesture-
// capture reconciliation at merge.
import { runAsUndoGroup } from '../undo/undo-store'
import {
  CROP_EDITOR_EVENT,
  type CropEditorRequest,
} from './crop-request'
import {
  clampCrop,
  CROP_HANDLES,
  type CropHandle,
  type CropRect,
  FULL_CROP,
  moveCrop,
  normalizeCrop,
  resetCrop,
  resizeCropByHandle,
} from './crop-rect'

export interface CropEditorHandle {
  destroy(): void
}

/** Fit padding: the image never touches the window edge, leaving room
 * for the handles to reach out past the crop box. */
const FIT_PADDING = 72
const HANDLE_SIZE = 12

/** Parse the appearance crop (stored as a JSON string on the wire) into
 * a rect, defaulting to the full frame when null/absent/malformed. */
function parseStoredCrop(raw: string | null): CropRect {
  if (!raw) return { ...FULL_CROP }
  try {
    const value = JSON.parse(raw) as Partial<CropRect>
    if (
      typeof value?.x === 'number' &&
      typeof value?.y === 'number' &&
      typeof value?.width === 'number' &&
      typeof value?.height === 'number'
    ) {
      return clampCrop({ x: value.x, y: value.y, width: value.width, height: value.height })
    }
  } catch {
    /* malformed crop → treat as uncropped */
  }
  return { ...FULL_CROP }
}

export function attachCropEditor(host: CanvasHostHandle, element: HTMLElement): CropEditorHandle {
  const layer = document.createElement('div')
  layer.dataset['testid'] = 'crop-editor'
  // §8.2 hand rules: outside the image is out of bounds — the pointer
  // shows the refusal cursor there (the locked-item 'not-allowed'
  // idiom); the stage below restores the default hand. NO beats: crop
  // is on the §8.2 no-beat list, so refusal here is cursor-only.
  layer.style.cssText =
    `position:absolute;inset:0;z-index:${Z.popover};display:none;` +
    'align-items:center;justify-content:center;background:var(--ew-scrim);pointer-events:auto;' +
    'cursor:not-allowed;'

  // The stage holds the image at fit-zoom; the crop box, dimming panels,
  // handles, and guides are positioned in its local pixel space.
  const stage = document.createElement('div')
  stage.dataset['testid'] = 'crop-stage'
  stage.style.cssText = 'position:relative;line-height:0;cursor:default;'
  const img = document.createElement('img')
  img.dataset['testid'] = 'crop-image'
  img.draggable = false
  img.style.cssText = 'display:block;width:100%;height:100%;user-select:none;'
  stage.appendChild(img)

  // Four dimming panels around the crop box (kept out of the box so the
  // cropped region reads at full brightness).
  const dim = { top: panel(), bottom: panel(), left: panel(), right: panel() }
  stage.append(dim.top, dim.bottom, dim.left, dim.right)

  const box = document.createElement('div')
  box.dataset['testid'] = 'crop-box'
  box.style.cssText =
    'position:absolute;box-sizing:border-box;border:1px solid var(--ew-text);' +
    'box-shadow:0 0 0 1px var(--ew-scrim);cursor:move;'
  stage.appendChild(box)

  // Rule-of-thirds guides, shown only while dragging (§8.2 restraint).
  const guides = document.createElement('div')
  guides.dataset['testid'] = 'crop-guides'
  guides.style.cssText = 'position:absolute;inset:0;pointer-events:none;display:none;'
  for (const spec of ['left:33.333%', 'left:66.666%', 'top:33.333%', 'top:66.666%']) {
    const [side] = spec.split(':') as ['left' | 'top']
    const line = document.createElement('div')
    const vertical = side === 'left'
    line.style.cssText =
      `position:absolute;${spec};background:var(--ew-text);opacity:0.4;` +
      (vertical ? 'top:0;bottom:0;width:1px;' : 'left:0;right:0;height:1px;')
    guides.appendChild(line)
  }
  box.appendChild(guides)

  const handles = new Map<CropHandle, HTMLDivElement>()
  for (const h of CROP_HANDLES) {
    const handle = document.createElement('div')
    handle.dataset['testid'] = `crop-handle-${h}`
    handle.dataset['handle'] = h
    handle.style.cssText =
      `position:absolute;width:${HANDLE_SIZE}px;height:${HANDLE_SIZE}px;` +
      'box-sizing:border-box;background:var(--ew-surface-menu);border:1px solid var(--ew-text);' +
      `border-radius:2px;cursor:${handleCursor(h)};`
    handles.set(h, handle)
    box.appendChild(handle)
  }

  layer.appendChild(stage)

  // Toolbar: Reset · Cancel · Apply (§8.4 commit grammar).
  const toolbar = document.createElement('div')
  toolbar.dataset['testid'] = 'crop-toolbar'
  toolbar.style.cssText =
    'position:absolute;left:50%;bottom:24px;transform:translateX(-50%);display:flex;gap:8px;' +
    'padding:6px 8px;background:var(--ew-surface-menu);border:1px solid var(--ew-border);' +
    'border-radius:10px;box-shadow:0 8px 22px var(--ew-shadow);'
  const resetBtn = toolButton('crop-reset', 'Reset')
  const cancelBtn = toolButton('crop-cancel', 'Cancel')
  const applyBtn = toolButton('crop-apply', 'Apply', true)
  toolbar.append(resetBtn, cancelBtn, applyBtn)
  layer.appendChild(toolbar)

  element.appendChild(layer)

  // ------------------------------------------------------------- state
  let openFor: ScenePlacement | null = null
  let crop: CropRect = { ...FULL_CROP }
  /** The image's on-screen display rect within the stage, in px. */
  let display = { width: 1, height: 1 }

  function isOpen(): boolean {
    return openFor !== null
  }
  const unregisterBlocker = registerInputBlocker(isOpen)

  function placementById(id: string | undefined): ScenePlacement | null {
    const ids = id ? [id] : host.controller.selection.ids()
    const targetId = id ?? (ids.length === 1 ? ids[0] : undefined)
    if (!targetId) return null
    const item = host.controller.items().find((candidate) => candidate.id === targetId)
    return item && item.itemKind === 'placement' ? item : null
  }

  function layoutStage(): void {
    if (!openFor) return
    const naturalW = openFor.assetWidth ?? (img.naturalWidth || 1)
    const naturalH = openFor.assetHeight ?? (img.naturalHeight || 1)
    const availW = Math.max(1, element.clientWidth - FIT_PADDING * 2)
    const availH = Math.max(1, element.clientHeight - FIT_PADDING * 2 - 60)
    const scale = Math.min(availW / naturalW, availH / naturalH, 4)
    display = { width: Math.round(naturalW * scale), height: Math.round(naturalH * scale) }
    stage.style.width = `${display.width}px`
    stage.style.height = `${display.height}px`
    paint()
  }

  /** Position the crop box, dimming panels, handles, and guides from the
   * current normalized rect over the display rect. */
  function paint(): void {
    const px = {
      x: crop.x * display.width,
      y: crop.y * display.height,
      w: crop.width * display.width,
      h: crop.height * display.height,
    }
    box.style.left = `${px.x}px`
    box.style.top = `${px.y}px`
    box.style.width = `${px.w}px`
    box.style.height = `${px.h}px`
    // Dimming panels (top full width; bottom full width; left/right hug
    // the box vertically).
    dim.top.style.cssText = panelCss(0, 0, display.width, px.y)
    dim.bottom.style.cssText = panelCss(
      0,
      px.y + px.h,
      display.width,
      display.height - (px.y + px.h),
    )
    dim.left.style.cssText = panelCss(0, px.y, px.x, px.h)
    dim.right.style.cssText = panelCss(px.x + px.w, px.y, display.width - (px.x + px.w), px.h)
    for (const [h, handle] of handles) positionHandle(handle, h, px.w, px.h)
  }

  function open(request: CropEditorRequest): void {
    const placement = placementById(request.placementId)
    if (!placement) return
    // Crop is an image-appearance verb only (and the commit re-sends
    // the appearance, so the asset id must be present too).
    if (
      placement.appearanceKind !== 'image' ||
      !placement.assetContentHash ||
      !placement.appearanceAssetId
    )
      return
    openFor = placement
    crop = parseStoredCrop(placement.appearanceCrop)
    img.src = assetUrl(placement.assetContentHash)
    layer.style.display = 'flex'
    holdEngagement(true)
    layoutStage()
    // Layout again once the image reports its natural size (in case the
    // placement wire shape lacked asset dims).
    img.onload = () => layoutStage()
  }

  function close(): void {
    openFor = null
    layer.style.display = 'none'
    guides.style.display = 'none'
    holdEngagement(false)
  }

  async function commit(): Promise<void> {
    if (!openFor) return
    const placement = openFor
    const next = normalizeCrop(crop)
    close()
    // ONE command; the group window is only the capture vehicle (see
    // the import note). A full-frame rect commits crop: null, so
    // "cropped to everything" and "never cropped" are the same state.
    await runAsUndoGroup(async (groupToken) => {
      await host.gateway.execute('SetNodeAppearance', {
        nodeId: placement.nodeId,
        appearance: { kind: 'image', assetId: placement.appearanceAssetId, crop: next },
      }, { groupToken })
    })
  }

  // ---------------------------------------------------------- dragging
  type Drag =
    | { kind: 'move'; startX: number; startY: number; origin: CropRect }
    | { kind: 'handle'; handle: CropHandle; startX: number; startY: number; origin: CropRect }
  let drag: Drag | null = null

  function beginHandle(event: PointerEvent, handle: CropHandle): void {
    event.preventDefault()
    event.stopPropagation()
    drag = { kind: 'handle', handle, startX: event.clientX, startY: event.clientY, origin: crop }
    guides.style.display = 'block'
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
  }

  function beginMove(event: PointerEvent): void {
    if (event.target !== box) return // handles own their own drags
    event.preventDefault()
    drag = { kind: 'move', startX: event.clientX, startY: event.clientY, origin: crop }
    guides.style.display = 'block'
    box.setPointerCapture?.(event.pointerId)
  }

  function onMove(event: PointerEvent): void {
    if (!drag) return
    const dx = (event.clientX - drag.startX) / display.width
    const dy = (event.clientY - drag.startY) / display.height
    crop =
      drag.kind === 'move'
        ? moveCrop(drag.origin, dx, dy)
        : resizeCropByHandle(drag.origin, drag.handle, dx, dy)
    paint()
  }

  function endDrag(): void {
    if (!drag) return
    drag = null
    guides.style.display = 'none'
  }

  for (const [h, handle] of handles) {
    handle.addEventListener('pointerdown', (event) => beginHandle(event, h))
  }
  box.addEventListener('pointerdown', beginMove)
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', endDrag)

  resetBtn.addEventListener('click', () => {
    crop = resetCrop()
    paint()
  })
  cancelBtn.addEventListener('click', () => close())
  applyBtn.addEventListener('click', () => void commit())

  // Commit grammar keys: Enter applies, Esc cancels. Captured on the
  // layer so they never reach the board (which is also blocked).
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!isOpen()) return
    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      void commit()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
    }
  }
  window.addEventListener('keydown', onKeyDown, true)

  const onRequest = (event: Event): void => {
    open((event as CustomEvent<CropEditorRequest>).detail ?? {})
  }
  window.addEventListener(CROP_EDITOR_EVENT, onRequest)

  const onResize = (): void => layoutStage()
  window.addEventListener('resize', onResize)

  // e2e/debug seam (the __ewDebug / __ewUndo mold): drive the editor
  // deterministically without pixel-dragging under fit-zoom math.
  window.__ewCrop = {
    isOpen,
    current: () => (openFor ? { ...crop } : null),
    setRect: (rect: CropRect) => {
      if (!openFor) return
      crop = clampCrop(rect)
      paint()
    },
    apply: () => void commit(),
    cancel: () => close(),
  }

  return {
    destroy() {
      close()
      unregisterBlocker()
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', endDrag)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener(CROP_EDITOR_EVENT, onRequest)
      window.removeEventListener('resize', onResize)
      delete window.__ewCrop
      layer.remove()
    },
  }
}

function panel(): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText = panelCss(0, 0, 0, 0)
  return el
}

function panelCss(x: number, y: number, w: number, h: number): string {
  return (
    `position:absolute;left:${x}px;top:${y}px;width:${Math.max(0, w)}px;` +
    `height:${Math.max(0, h)}px;background:var(--ew-scrim);pointer-events:none;`
  )
}

function positionHandle(handle: HTMLDivElement, h: CropHandle, boxW: number, boxH: number): void {
  const half = HANDLE_SIZE / 2
  const xs: Record<string, number> = { w: -half, e: boxW - half, x: boxW / 2 - half }
  const ys: Record<string, number> = { n: -half, s: boxH - half, y: boxH / 2 - half }
  const left = h.includes('w') ? xs['w']! : h.includes('e') ? xs['e']! : xs['x']!
  const top = h.includes('n') ? ys['n']! : h.includes('s') ? ys['s']! : ys['y']!
  handle.style.left = `${left}px`
  handle.style.top = `${top}px`
}

function handleCursor(h: CropHandle): string {
  const map: Record<CropHandle, string> = {
    nw: 'nwse-resize',
    se: 'nwse-resize',
    ne: 'nesw-resize',
    sw: 'nesw-resize',
    n: 'ns-resize',
    s: 'ns-resize',
    e: 'ew-resize',
    w: 'ew-resize',
  }
  return map[h]
}

function toolButton(testid: string, label: string, primary = false): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.dataset['testid'] = testid
  button.textContent = label
  button.style.cssText =
    'padding:4px 12px;border-radius:6px;cursor:pointer;font:inherit;font-size:12px;' +
    (primary
      ? 'background:var(--ew-accent);color:var(--ew-chip-text);border:1px solid var(--ew-border-strong);'
      : 'background:var(--ew-surface-raised);color:var(--ew-text);border:1px solid var(--ew-border-strong);')
  return button
}

declare global {
  interface Window {
    __ewCrop?: {
      isOpen: () => boolean
      current: () => CropRect | null
      setRect: (rect: CropRect) => void
      apply: () => void
      cancel: () => void
    }
  }
}
