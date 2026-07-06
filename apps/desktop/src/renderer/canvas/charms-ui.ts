/**
 * Node charms and the selection charm bar (RFC §8.4, AI-IMP-063).
 *
 * A DOM adornment layer over the canvas — charms are UI, not pixels,
 * so living outside the scene texture makes the crop/flip/export
 * exclusion structural rather than filtered. Two hint glyphs per
 * node at most (page = has a note · frame = has a nested canvas),
 * side-by-side inside the lower-right corner on a scrim chip; the
 * charm bar floats beneath a single selected placement. Everything
 * repositions from the camera each animation frame the scene is
 * dirty, follows the shared engagement clock at rest opacity, and
 * hides when the node's RENDERED screen size drops below the
 * threshold — never zoom percentage.
 */
import { itemWorldAABB, type ScenePlacement } from '@ew/canvas-engine'
import { uuidv7 } from '@ew/domain'
import type { CanvasHostHandle } from './host'
import { navigateTo } from '../chrome/navigation'
import { onEngagementChanged } from '../chrome/engagement'
import { tooltip } from '../chrome/tooltip'
import { requestAttachNote, requestOpenNote } from '../note/open-note'
import { openCornerPanel } from '../note/panels'
import { appSettings, onAppSettingsChanged } from '../settings/settings'
import { openTagPanel } from '../tags/tag-panel'
import { assignTagByName, filterTagCompletions } from '../tags/tag-assign'
import { CHARM_MIN_SCREEN_PX, HINT_CHARM_REST_OPACITY } from '../chrome/feel'

export interface CharmsUiHandle {
  destroy(): void
}

const PAGE_GLYPH = '¶'
const FRAME_GLYPH = '⊡'

interface CharmEntry {
  group: HTMLDivElement
  page: HTMLButtonElement | null
  frame: HTMLButtonElement | null
  disposers: Array<() => void>
}

let styleInjected = false
function injectStyles(): void {
  if (styleInjected) return
  styleInjected = true
  const style = document.createElement('style')
  // Rest opacity per charm group so :hover can light ONE charm to
  // full; disengagement fades the whole layer on the shared clock.
  style.textContent = `
    .ew-charms { transition: opacity 240ms ease-out; opacity: 1; }
    .ew-charms.disengaged { opacity: 0; }
    .ew-charms .hint-group { opacity: ${HINT_CHARM_REST_OPACITY}; transition: opacity 120ms ease-out; }
    .ew-charms .hint-group:hover { opacity: 1; }
  `
  document.head.appendChild(style)
}

export function attachCharmsUi(host: CanvasHostHandle, element: HTMLElement): CharmsUiHandle {
  injectStyles()
  const layer = document.createElement('div')
  layer.dataset['testid'] = 'charms-layer'
  layer.className = 'ew-charms'
  layer.style.cssText = 'position:absolute;inset:0;z-index:6;pointer-events:none;overflow:hidden;'
  element.appendChild(layer)

  const entries = new Map<string, CharmEntry>()
  const disposers: Array<() => void> = []

  // ------------------------------------------------------- charm bar
  const bar = document.createElement('div')
  bar.dataset['testid'] = 'charm-bar'
  bar.style.cssText =
    'position:absolute;display:none;gap:2px;align-items:center;' +
    'padding:3px 5px;background:var(--ew-surface);border:1px solid var(--ew-border);' +
    'border-radius:7px;pointer-events:auto;font-size:13px;'
  layer.appendChild(bar)

  // §4.8 rev 0.45: the `#` popover is a completing add-field ABOVE the
  // node's chips — one shared component with the note-panel chip row.
  // The container is the anchored popover; the add-field row and the
  // chip row live inside it, the chip row rebuilt on each refresh.
  const chips = document.createElement('div')
  chips.dataset['testid'] = 'charm-tag-chips'
  chips.style.cssText =
    'position:absolute;display:none;flex-direction:column;gap:5px;' +
    'max-width:280px;padding:5px 6px;background:var(--ew-surface-menu);' +
    'border:1px solid var(--ew-border);border-radius:7px;pointer-events:auto;font-size:11px;' +
    'color:var(--ew-text);'
  layer.appendChild(chips)
  let chipsFor: string | null = null
  // Project-wide tag vocabulary for completion; loaded when the
  // popover opens and refreshed after an assign so a newly created tag
  // completes on the next keystroke.
  let tagVocab: Array<{ id: string; name: string }> = []

  const gatewayExecute = (commandType: string, payload: unknown) =>
    host.gateway.execute(commandType, payload)

  // Add-field row: a completing input (custom list, NEVER <datalist> —
  // the native popup segfaults hidden Electron windows, AI-IMP-069).
  const addRow = document.createElement('div')
  addRow.style.cssText = 'position:relative;display:flex;'
  const addInput = document.createElement('input')
  addInput.type = 'text'
  addInput.dataset['testid'] = 'charm-tag-add-input'
  addInput.placeholder = 'add tag…'
  addInput.style.cssText =
    'width:100%;box-sizing:border-box;padding:2px 8px;background:var(--ew-surface-input);' +
    'color:var(--ew-text);border:1px solid var(--ew-border-strong);border-radius:999px;' +
    'font:inherit;font-size:11px;'
  addRow.appendChild(addInput)
  const addCompletions = document.createElement('div')
  addCompletions.dataset['testid'] = 'charm-tag-add-completions'
  addCompletions.style.cssText =
    'position:absolute;top:calc(100% + 3px);left:0;z-index:1;display:none;flex-direction:column;' +
    'min-width:8rem;background:var(--ew-surface-menu);border:1px solid var(--ew-border);' +
    'border-radius:6px;overflow:hidden;'
  addRow.appendChild(addCompletions)
  chips.appendChild(addRow)

  const chipRow = document.createElement('div')
  chipRow.dataset['testid'] = 'charm-tag-chip-row'
  chipRow.style.cssText = 'display:flex;gap:4px;align-items:center;flex-wrap:wrap;'
  chips.appendChild(chipRow)

  function renderCompletions(): void {
    const matches =
      addInput.value.trim().length === 0 ? [] : filterTagCompletions(tagVocab, addInput.value)
    addCompletions.replaceChildren()
    if (matches.length === 0) {
      addCompletions.style.display = 'none'
      return
    }
    for (const tag of matches) {
      const option = document.createElement('button')
      option.type = 'button'
      option.dataset['testid'] = 'charm-tag-add-option'
      option.textContent = tag.name
      option.style.cssText =
        'padding:3px 8px;background:transparent;border:none;color:var(--ew-text);' +
        'font:inherit;font-size:11px;text-align:left;cursor:pointer;'
      // pointerdown (not click) so the choice lands before the input's
      // blur hides the list; preventDefault keeps focus in the field.
      option.addEventListener('pointerdown', (event) => {
        event.preventDefault()
        event.stopPropagation()
        void assignFromField(tag.name)
      })
      addCompletions.appendChild(option)
    }
    addCompletions.style.display = 'flex'
  }

  async function refreshVocab(): Promise<void> {
    const response = await window.ew.project.query('listTags')
    tagVocab = response.ok ? (response.result as Array<{ id: string; name: string }>) : []
  }

  /** Assign (or create-and-assign) the typed name to the selected
   * node, then refresh the chips in place — the node stays selected. */
  async function assignFromField(name: string): Promise<void> {
    const placement = selectedPlacement()
    if (!placement) return
    const outcome = await assignTagByName(gatewayExecute, placement.nodeId, name, tagVocab)
    if (outcome.status === 'error') return
    addInput.value = ''
    addCompletions.style.display = 'none'
    await refreshVocab()
    if (chipsFor === placement.id) await rebuildChips(placement.nodeId)
    schedule()
  }

  addInput.addEventListener('input', renderCompletions)
  addInput.addEventListener('keydown', (event) => {
    // Keep board shortcuts (space-pan, delete) out of the field.
    event.stopPropagation()
    if (event.key === 'Enter') {
      event.preventDefault()
      void assignFromField(addInput.value)
    } else if (event.key === 'Escape') {
      if (addCompletions.style.display !== 'none') addCompletions.style.display = 'none'
      else {
        addInput.value = ''
        renderCompletions()
      }
    }
  })
  addInput.addEventListener('blur', () => {
    // Let a completion's pointerdown fire first (it preventDefaults).
    setTimeout(() => (addCompletions.style.display = 'none'), 120)
  })

  /** Rebuild the node's tag chips into the chip row (§4.8 door 1). */
  async function rebuildChips(nodeId: string): Promise<void> {
    const response = await window.ew.project.query('listNodeTags', { nodeId })
    const tags = response.ok
      ? (response.result as Array<{ id: string; name: string; color: string | null }>)
      : []
    chipRow.replaceChildren()
    if (tags.length === 0) {
      const empty = document.createElement('span')
      empty.textContent = 'no tags'
      empty.style.opacity = '0.6'
      chipRow.appendChild(empty)
    }
    for (const tag of tags) {
      const chip = document.createElement('button')
      chip.type = 'button'
      chip.dataset['testid'] = `tag-chip-${tag.id}`
      chip.textContent = `#${tag.name}`
      chip.style.cssText =
        'padding:1px 7px;border-radius:9px;border:1px solid var(--ew-border-strong);cursor:pointer;' +
        `background:var(--ew-surface-raised);color:${tag.color ?? 'var(--ew-tag-default)'};font-size:11px;`
      const tip = tooltip(chip, { name: 'Open the tag panel' })
      disposers.push(tip.destroy)
      // §4.8 door 1: the chip opens THE tag panel anchored to itself;
      // the chip popover has served its purpose and folds.
      chip.addEventListener('click', (event) => {
        event.stopPropagation()
        const rect = chip.getBoundingClientRect()
        openTagPanel(tag.id, { x: rect.left, y: rect.bottom })
        chipsFor = null
        chips.style.display = 'none'
      })
      chipRow.appendChild(chip)
    }
  }

  function barButton(
    testId: string,
    glyph: string,
    spec: { name: string; shortcut?: string },
    onClick: () => void,
  ): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset['testid'] = testId
    button.textContent = glyph
    button.style.cssText =
      'min-width:24px;height:24px;padding:0 5px;background:var(--ew-surface-raised);color:var(--ew-text);' +
      'border:1px solid var(--ew-border-strong);border-radius:5px;cursor:pointer;font-size:12px;'
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      onClick()
    })
    const tip = tooltip(button, spec)
    disposers.push(tip.destroy)
    bar.appendChild(button)
    return button
  }

  function divider(): void {
    const line = document.createElement('span')
    line.style.cssText = 'width:1px;height:16px;background:var(--ew-border-strong);margin:0 3px;'
    bar.appendChild(line)
  }

  function selectedPlacement(): ScenePlacement | null {
    const ids = host.controller.selection.ids()
    if (ids.length !== 1) return null
    const item = host.controller.items().find((candidate) => candidate.id === ids[0])
    return item && item.itemKind === 'placement' ? item : null
  }

  async function execute(commandType: string, payload: unknown): Promise<void> {
    await host.gateway.execute(commandType, payload)
  }

  // §8.4 bar: crop · flip H · flip V · | · make-canvas · note · # · lock.
  const cropButton = barButton(
    'charm-crop',
    '⬚',
    { name: 'Crop — the crop editor arrives in a later ticket' },
    () => {},
  )
  cropButton.disabled = true
  cropButton.style.opacity = '0.4'
  cropButton.style.cursor = 'default'
  barButton('charm-flip-h', '⇋', { name: 'Flip horizontal' }, () => {
    const placement = selectedPlacement()
    if (placement) void execute('FlipPlacement', { placementId: placement.id, axis: 'x' })
  })
  barButton('charm-flip-v', '⇵', { name: 'Flip vertical' }, () => {
    const placement = selectedPlacement()
    if (placement) void execute('FlipPlacement', { placementId: placement.id, axis: 'y' })
  })
  divider()
  const makeCanvasButton = barButton('charm-make-canvas', FRAME_GLYPH, { name: 'Make canvas' }, () => {
    const placement = selectedPlacement()
    if (!placement || placement.childCanvasId) return
    void execute('CreateCanvas', { canvasId: uuidv7(), nodeId: placement.nodeId })
  })
  barButton('charm-note', PAGE_GLYPH, { name: 'Note — open, or attach one' }, () => {
    const placement = selectedPlacement()
    if (!placement) return
    if (placement.noteId) requestOpenNote(placement.noteId)
    else requestAttachNote(placement.nodeId)
  })
  barButton('charm-tags', '#', { name: 'Tags — add or open this node’s tags' }, () => {
    const placement = selectedPlacement()
    if (!placement) return
    if (chipsFor === placement.id) {
      chipsFor = null
      chips.style.display = 'none'
      return
    }
    chipsFor = placement.id
    addInput.value = ''
    addCompletions.style.display = 'none'
    void (async () => {
      await refreshVocab()
      if (chipsFor !== placement.id) return // toggled shut under us
      await rebuildChips(placement.nodeId)
      chips.style.display = 'flex'
      schedule()
      addInput.focus()
    })()
  })
  const lockButton = barButton('charm-lock', '🔒', { name: 'Lock' }, () => {
    const placement = selectedPlacement()
    if (placement)
      void execute('SetPlacementLock', {
        placementId: placement.id,
        locked: placement.locked !== 1,
      })
  })

  // ------------------------------------------------- corner charm
  // §8.5: the canvas is a node, and the active canvas's own note is
  // "the node you are standing inside" — a screen-fixed lower-left
  // page charm, ghost while no note exists, solid when one does.
  let cornerNodeId: string | null = null
  let cornerNoteId: string | null = null
  let cornerCanvas: string | null = null
  const corner = document.createElement('button')
  corner.type = 'button'
  corner.dataset['testid'] = 'corner-charm'
  corner.textContent = PAGE_GLYPH
  corner.style.cssText =
    'position:absolute;left:12px;bottom:12px;width:26px;height:26px;display:grid;' +
    'place-items:center;padding:0;background:var(--ew-art-chip-scrim);color:var(--ew-text);' +
    'border:1px solid var(--ew-border);border-radius:6px;cursor:pointer;font-size:13px;' +
    'pointer-events:auto;transition:opacity 120ms ease-out;'
  const cornerTip = tooltip(corner, { name: 'This board’s note' })
  disposers.push(cornerTip.destroy)
  corner.addEventListener('click', (event) => {
    event.stopPropagation()
    if (cornerNodeId) openCornerPanel(cornerNodeId, cornerNoteId)
  })
  corner.addEventListener('pointerenter', () => (corner.style.opacity = '1'))
  corner.addEventListener('pointerleave', () => applyCornerState())
  layer.appendChild(corner)

  function applyCornerState(): void {
    // Ghost when empty (§8.5: appears on approach; hover solidifies),
    // solid the moment the note exists.
    corner.style.opacity = cornerNoteId ? '1' : '0.3'
    corner.dataset['state'] = cornerNoteId ? 'solid' : 'ghost'
  }

  async function refreshCorner(): Promise<void> {
    const canvasId = host.canvasId
    const sceneResponse = await window.ew.project.query('getCanvasScene', { canvasId })
    if (!sceneResponse.ok || sceneResponse.result === null) return
    const scene = sceneResponse.result as { nodeId: string }
    const nodeResponse = await window.ew.project.query('getNode', { nodeId: scene.nodeId })
    if (host.canvasId !== canvasId) return // canvas changed under us
    cornerCanvas = canvasId
    cornerNodeId = scene.nodeId
    cornerNoteId = nodeResponse.ok
      ? ((nodeResponse.result as { noteId: string | null } | null)?.noteId ?? null)
      : null
    applyCornerState()
  }
  void refreshCorner()

  // ---------------------------------------------------- hint charms
  function hintButton(testId: string, glyph: string, name: string): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset['testid'] = testId
    button.textContent = glyph
    button.style.cssText =
      'width:18px;height:18px;display:grid;place-items:center;padding:0;' +
      'background:var(--ew-art-chip-scrim);color:var(--ew-text);border:none;border-radius:4px;' +
      'cursor:pointer;font-size:11px;pointer-events:auto;'
    const tip = tooltip(button, { name })
    disposers.push(tip.destroy)
    return button
  }

  function entryFor(item: ScenePlacement): CharmEntry {
    const entry = entries.get(item.id)
    const wantsPage = item.noteId !== null
    const wantsFrame = item.childCanvasId !== null
    if (
      entry &&
      (entry.page !== null) === wantsPage &&
      (entry.frame !== null) === wantsFrame
    )
      return entry
    if (entry) removeEntry(item.id)
    // Scrim chip grouping the at-most-two glyphs, side-by-side.
    const group = document.createElement('div')
    group.dataset['testid'] = `hint-charms-${item.id}`
    group.className = 'hint-group'
    group.style.cssText =
      'position:absolute;display:flex;gap:2px;padding:1px;border-radius:5px;' +
      'background:var(--ew-art-chip-scrim-soft);pointer-events:none;'
    const created: CharmEntry = { group, page: null, frame: null, disposers: [] }
    if (wantsPage) {
      const page = hintButton(`hint-page-${item.id}`, PAGE_GLYPH, 'Open note')
      page.addEventListener('click', (event) => {
        event.stopPropagation()
        const current = host.controller
          .items()
          .find((candidate) => candidate.id === item.id)
        const placement =
          current && current.itemKind === 'placement' ? current : item
        if (placement.noteId)
          requestOpenNote(placement.noteId, {
            canvasId: host.canvasId,
            placementId: placement.id,
            label: placement.noteTitle ?? '',
          })
      })
      group.appendChild(page)
      created.page = page
    }
    if (wantsFrame) {
      const frame = hintButton(`hint-frame-${item.id}`, FRAME_GLYPH, 'Dive into canvas')
      frame.addEventListener('click', (event) => {
        event.stopPropagation()
        const current = host.controller
          .items()
          .find((candidate) => candidate.id === item.id)
        const placement =
          current && current.itemKind === 'placement' ? current : item
        if (placement.childCanvasId)
          void navigateTo(placement.childCanvasId, placement.noteTitle ?? 'Board')
      })
      group.appendChild(frame)
      created.frame = frame
    }
    layer.appendChild(group)
    entries.set(item.id, created)
    return created
  }

  function removeEntry(id: string): void {
    const entry = entries.get(id)
    if (!entry) return
    for (const dispose of entry.disposers) dispose()
    entry.group.remove()
    entries.delete(id)
  }

  // ------------------------------------------------- layout per frame
  let frame = 0
  function schedule(): void {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      layout()
    })
  }

  function layout(): void {
    const camera = host.controller.camera
    const items = host.controller.items()
    const seen = new Set<string>()
    for (const item of items) {
      if (item.itemKind !== 'placement') continue
      if (item.noteId === null && item.childCanvasId === null) continue
      const aabb = itemWorldAABB(item)
      if (!aabb) continue
      const screenW = aabb.width * camera.zoom
      const screenH = aabb.height * camera.zoom
      // Visibility keys on rendered screen size, never zoom (§8.4).
      if (Math.min(screenW, screenH) < CHARM_MIN_SCREEN_PX) continue
      seen.add(item.id)
      const entry = entryFor(item)
      // Inset inside the chosen right corner: lower-right by default,
      // upper-right via the §11.5 charm-corner setting (AI-IMP-074).
      const upper = appSettings().charmCorner === 'upper-right'
      const corner = camera.worldToScreen({
        x: aabb.x + aabb.width,
        y: upper ? aabb.y : aabb.y + aabb.height,
      })
      const width = entry.group.offsetWidth || 20
      const height = entry.group.offsetHeight || 20
      entry.group.style.left = `${corner.x - width - 4}px`
      entry.group.style.top = upper ? `${corner.y + 4}px` : `${corner.y - height - 4}px`
    }
    for (const id of [...entries.keys()]) {
      if (!seen.has(id)) removeEntry(id)
    }

    // Charm bar beneath the single selected placement.
    const selected = selectedPlacement()
    const aabb = selected ? itemWorldAABB(selected) : null
    if (selected && aabb) {
      const bottomCenter = camera.worldToScreen({
        x: aabb.x + aabb.width / 2,
        y: aabb.y + aabb.height,
      })
      bar.style.display = 'flex'
      const barWidth = bar.offsetWidth || 200
      bar.style.left = `${bottomCenter.x - barWidth / 2}px`
      bar.style.top = `${bottomCenter.y + 10}px`
      lockButton.textContent = selected.locked === 1 ? '🔓' : '🔒'
      const tipSpec = selected.locked === 1 ? 'Unlock' : 'Lock'
      lockButton.setAttribute('aria-label', tipSpec)
      makeCanvasButton.disabled = selected.childCanvasId !== null
      makeCanvasButton.style.opacity = selected.childCanvasId !== null ? '0.4' : '1'
      if (chipsFor === selected.id) {
        chips.style.left = `${bottomCenter.x - barWidth / 2}px`
        chips.style.top = `${bottomCenter.y + 44}px`
      } else {
        chipsFor = null
        chips.style.display = 'none'
      }
    } else {
      bar.style.display = 'none'
      chipsFor = null
      chips.style.display = 'none'
    }
  }

  disposers.push(host.controller.camera.onChanged(() => schedule()))
  disposers.push(
    host.onSceneApplied(() => {
      schedule()
      // The corner charm's ghost/solid state follows the ACTIVE
      // canvas's note; scene applied covers both edits and dives.
      if (host.canvasId !== cornerCanvas) applyCornerState()
      void refreshCorner()
    }),
  )
  disposers.push(host.controller.selection.onChanged(() => schedule()))
  // §11.5 charm corner applies to charms already on screen (074).
  disposers.push(onAppSettingsChanged(() => schedule()))
  // One shared fade clock: the layer fades with the chrome; per-group
  // rest opacity + hover live in the injected stylesheet.
  disposers.push(
    onEngagementChanged((engaged) => {
      layer.classList.toggle('disengaged', !engaged)
    }),
  )
  schedule()

  return {
    destroy() {
      if (frame) cancelAnimationFrame(frame)
      for (const dispose of disposers) dispose()
      for (const id of [...entries.keys()]) removeEntry(id)
      layer.remove()
    },
  }
}
