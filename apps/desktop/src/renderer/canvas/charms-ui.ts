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
import type { NodeAppearance } from '@ew/commands'
import { uuidv7 } from '@ew/domain'
import type { CanvasHostHandle } from './host'
import { Z } from '../z'
import { navigateTo } from '../chrome/navigation'
import { onEngagementChanged } from '../chrome/engagement'
import { tooltip } from '../chrome/tooltip'
import { requestAttachNote, requestOpenNote } from '../note/open-note'
import { openCornerPanel } from '../note/panels'
import { appSettings, onAppSettingsChanged } from '../settings/settings'
import { openTagPanel } from '../tags/tag-panel'
import { assignTagByName, filterTagCompletions } from '../tags/tag-assign'
import { importErrorNotice } from './import-surfaces'
import { themeTokenValue } from '../theme'
import { CHARM_MIN_SCREEN_PX, HINT_CHARM_REST_OPACITY } from '../chrome/feel'
import { ICON_SVG_DATA_URLS } from './icon-atlas.generated'

export interface CharmsUiHandle {
  destroy(): void
}

/**
 * Imperative seam (AI-IMP-136): the §8.4 context menu's Appearance and
 * Tags verbs open the SAME charm popovers this module owns, rather than
 * duplicating their UI. The menu selects the placement and fires this;
 * the charm layer opens the matching popover anchored to the charm bar.
 */
export const CHARM_POPOVER_EVENT = 'ew-charm-popover'
export interface CharmPopoverRequest {
  placementId: string
  which: 'appearance' | 'tags'
}
export function requestCharmPopover(
  placementId: string,
  which: 'appearance' | 'tags',
): void {
  window.dispatchEvent(
    new CustomEvent<CharmPopoverRequest>(CHARM_POPOVER_EVENT, {
      detail: { placementId, which },
    }),
  )
}

const PAGE_GLYPH = '¶'
const FRAME_GLYPH = '⊡'

// §4.6 appearance switcher (rev 0.45, AI-IMP-109). Dot swatches source
// their colour from theme.css tokens — the raw-hex guard forbids
// literals here, so the click resolves the token to its stored hex via
// themeTokenValue (the same move the zero-node dot colour makes). There
// was no canonical multi-colour dot palette before this ticket; these
// tokens ARE it.
const DOT_SWATCH_TOKENS = [
  '--ew-node-dot-blue',
  '--ew-node-dot-teal',
  '--ew-node-dot-green',
  '--ew-node-dot-gold',
  '--ew-node-dot-orange',
  '--ew-node-dot-red',
  '--ew-node-dot-purple',
  '--ew-node-dot-pink',
] as const

// The built-in icon set (§4.6 / §8.2). This list defines the
// vocabulary of icon ids the switcher can commit; the row previews the
// REAL baked objects (ICON_SVG_DATA_URLS, AI-IMP-132) at chrome size,
// with the unicode glyph kept only as a fallback if a preview is
// missing. 'star'/'pin' match the values already used in seeds/tests.
const BUILTIN_ICONS: ReadonlyArray<{ id: string; glyph: string }> = [
  { id: 'star', glyph: '★' },
  { id: 'pin', glyph: '◉' },
  { id: 'flag', glyph: '⚑' },
  { id: 'heart', glyph: '♥' },
  { id: 'bolt', glyph: '⚡' },
  { id: 'leaf', glyph: '☘' },
]

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
  layer.style.cssText = `position:absolute;inset:0;z-index:${Z.affordance};pointer-events:none;overflow:hidden;`
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
    'position:absolute;top:calc(100% + 3px);left:0;z-index:1;' + // rung: popover — local stacking context WITHIN the tag popover, not the global ladder
    'display:none;flex-direction:column;' +
    'min-width:8rem;background:var(--ew-surface-menu);border:1px solid var(--ew-border);' +
    'border-radius:6px;overflow:hidden;'
  addRow.appendChild(addCompletions)
  chips.appendChild(addRow)

  const chipRow = document.createElement('div')
  chipRow.dataset['testid'] = 'charm-tag-chip-row'
  chipRow.style.cssText = 'display:flex;gap:4px;align-items:center;flex-wrap:wrap;'
  chips.appendChild(chipRow)

  // ------------------------------------------- appearance popover
  // §4.6 rev 0.45: the appearance charm opens this popover — dot
  // swatches · icon set · image… · card. One charm popover at a time
  // (opening appearance folds the tag chips and vice versa). Built
  // once; every pick acts on the CURRENT single selection and folds.
  const appearance = document.createElement('div')
  appearance.dataset['testid'] = 'charm-appearance-popover'
  appearance.style.cssText =
    'position:absolute;display:none;flex-direction:column;gap:6px;' +
    'max-width:210px;padding:6px 7px;background:var(--ew-surface-menu);' +
    'border:1px solid var(--ew-border);border-radius:7px;pointer-events:auto;' +
    'font-size:11px;color:var(--ew-text);'
  layer.appendChild(appearance)
  let appearanceFor: string | null = null

  function closeAppearance(): void {
    appearanceFor = null
    appearance.style.display = 'none'
  }
  function closeChips(): void {
    chipsFor = null
    chips.style.display = 'none'
  }

  /** Commit one appearance to the selected node and fold the popover.
   * The scene re-renders through the ordinary onSceneApplied path — no
   * reselection. The handler's inverse restores the prior appearance
   * (one undo). */
  function commitAppearance(next: NodeAppearance): void {
    const placement = selectedPlacement()
    if (!placement) return
    void execute('SetNodeAppearance', { nodeId: placement.nodeId, appearance: next })
    closeAppearance()
  }

  // Dot swatch row.
  const dotRow = document.createElement('div')
  dotRow.style.cssText = 'display:flex;gap:5px;align-items:center;flex-wrap:wrap;'
  for (const token of DOT_SWATCH_TOKENS) {
    const name = token.replace('--ew-node-dot-', '')
    const swatch = document.createElement('button')
    swatch.type = 'button'
    swatch.dataset['testid'] = `appearance-dot-${name}`
    swatch.style.cssText =
      'width:18px;height:18px;padding:0;border-radius:50%;cursor:pointer;' +
      `border:1px solid var(--ew-border-strong);background:var(${token});`
    const tip = tooltip(swatch, { name: `Dot — ${name}` })
    disposers.push(tip.destroy)
    swatch.addEventListener('click', (event) => {
      event.stopPropagation()
      // Resolve the token to its stored hex at click time (guard-safe).
      commitAppearance({ kind: 'dot', color: themeTokenValue(token) })
    })
    dotRow.appendChild(swatch)
  }
  appearance.appendChild(dotRow)

  // Built-in icon row.
  const iconRow = document.createElement('div')
  iconRow.style.cssText = 'display:flex;gap:4px;align-items:center;flex-wrap:wrap;'
  for (const icon of BUILTIN_ICONS) {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset['testid'] = `appearance-icon-${icon.id}`
    button.style.cssText =
      'width:22px;height:22px;padding:0;display:grid;place-items:center;cursor:pointer;' +
      'border:1px solid var(--ew-border-strong);border-radius:5px;' +
      'background:var(--ew-surface-raised);color:var(--ew-text);font-size:13px;'
    // §8.2 preview: the real baked object at chrome size (SVG stays
    // crisp), the picker's own affordance for the on-board icon.
    const preview = ICON_SVG_DATA_URLS[icon.id]
    if (preview) {
      button.style.backgroundImage = `url("${preview}")`
      button.style.backgroundRepeat = 'no-repeat'
      button.style.backgroundPosition = 'center'
      button.style.backgroundSize = '16px 16px'
    } else {
      button.textContent = icon.glyph
    }
    const tip = tooltip(button, { name: `Icon — ${icon.id}` })
    disposers.push(tip.destroy)
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      commitAppearance({ kind: 'icon', icon: icon.id })
    })
    iconRow.appendChild(button)
  }
  appearance.appendChild(iconRow)

  // image… + card row.
  const actionRow = document.createElement('div')
  actionRow.style.cssText = 'display:flex;gap:5px;align-items:center;'

  // image… routes through the ordinary §6.1 import pipeline (picker →
  // importAsset → SetNodeAppearance image). A hidden file input kept in
  // the DOM (opacity 0) so e2e setInputFiles can reach it, mirroring the
  // background file input.
  const imageInput = document.createElement('input')
  imageInput.type = 'file'
  imageInput.accept = 'image/*'
  imageInput.dataset['testid'] = 'appearance-image-input'
  imageInput.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;'
  async function onImagePicked(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return // cancel imports nothing
    const placement = selectedPlacement()
    if (!placement) return
    const nodeId = placement.nodeId // bind before the await (selection may move)
    const bytes = new Uint8Array(await file.arrayBuffer())
    const imported = await window.ew.project.importAsset({
      bytes,
      originalFilename: file.name.length > 0 ? file.name : 'image',
    })
    if (!imported.ok) {
      importErrorNotice(imported.message)
      return
    }
    void execute('SetNodeAppearance', {
      nodeId,
      appearance: { kind: 'image', assetId: imported.assetId, crop: null },
    })
    closeAppearance()
  }
  imageInput.addEventListener('change', (event) => void onImagePicked(event))
  appearance.appendChild(imageInput)

  const imageButton = document.createElement('button')
  imageButton.type = 'button'
  imageButton.dataset['testid'] = 'appearance-image'
  imageButton.textContent = 'image…'
  imageButton.style.cssText =
    'flex:1;height:22px;padding:0 8px;cursor:pointer;border:1px solid var(--ew-border-strong);' +
    'border-radius:5px;background:var(--ew-surface-raised);color:var(--ew-text);font:inherit;font-size:11px;'
  const imageTip = tooltip(imageButton, { name: 'Image — pick a file to import' })
  disposers.push(imageTip.destroy)
  imageButton.addEventListener('click', (event) => {
    event.stopPropagation()
    imageInput.click()
  })
  actionRow.appendChild(imageButton)

  // card: enabled only while a note is attached (§4.6). NOT a native
  // `disabled` — disabled controls swallow pointer events, so the
  // "why" tooltip would never fire; aria-disabled + a no-op click keep
  // it hoverable.
  const cardButton = document.createElement('button')
  cardButton.type = 'button'
  cardButton.dataset['testid'] = 'appearance-card'
  cardButton.textContent = 'card'
  cardButton.style.cssText =
    'flex:1;height:22px;padding:0 8px;cursor:pointer;border:1px solid var(--ew-border-strong);' +
    'border-radius:5px;background:var(--ew-surface-raised);color:var(--ew-text);font:inherit;font-size:11px;'
  const cardTip = tooltip(cardButton, { name: 'Card — display the attached note' })
  disposers.push(cardTip.destroy)
  function setCardEnabled(hasNote: boolean): void {
    cardButton.dataset['disabled'] = hasNote ? 'false' : 'true'
    cardButton.style.opacity = hasNote ? '1' : '0.4'
    cardButton.style.cursor = hasNote ? 'pointer' : 'default'
    cardTip.update(
      hasNote
        ? { name: 'Card — display the attached note' }
        : { name: 'Card needs a note — attach one first' },
    )
  }
  cardButton.addEventListener('click', (event) => {
    event.stopPropagation()
    if (cardButton.dataset['disabled'] === 'true') return
    commitAppearance({ kind: 'card' })
  })
  actionRow.appendChild(cardButton)
  appearance.appendChild(actionRow)

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

  // §8.4 bar: crop · flip H · flip V · | · appearance · make-canvas ·
  // note · # · lock.
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
  /** Open the appearance popover for a placement (shared by the charm
   * button and the §8.4 context-menu seam). */
  function openAppearanceFor(placement: ScenePlacement): void {
    appearanceFor = placement.id
    closeChips() // one charm popover at a time (§4.8 idiom)
    setCardEnabled(placement.noteId !== null)
    appearance.style.display = 'flex'
    schedule()
  }
  barButton(
    'charm-appearance',
    '◑',
    { name: 'Appearance — dot, icon, image, or card' },
    () => {
      const placement = selectedPlacement()
      if (!placement) return
      if (appearanceFor === placement.id) {
        closeAppearance()
        return
      }
      openAppearanceFor(placement)
    },
  )
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
  /** Open the tag-chips popover for a placement (shared by the charm
   * button and the §8.4 context-menu seam). */
  function openTagsFor(placement: ScenePlacement): void {
    chipsFor = placement.id
    closeAppearance() // one charm popover at a time
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
  }
  barButton('charm-tags', '#', { name: 'Tags — add or open this node’s tags' }, () => {
    const placement = selectedPlacement()
    if (!placement) return
    if (chipsFor === placement.id) {
      chipsFor = null
      chips.style.display = 'none'
      return
    }
    openTagsFor(placement)
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
      if (appearanceFor === selected.id) {
        appearance.style.left = `${bottomCenter.x - barWidth / 2}px`
        appearance.style.top = `${bottomCenter.y + 44}px`
        // Keep card's enabled state fresh if a note is attached/detached
        // while the popover is open.
        setCardEnabled(selected.noteId !== null)
      } else {
        closeAppearance()
      }
    } else {
      bar.style.display = 'none'
      chipsFor = null
      chips.style.display = 'none'
      closeAppearance()
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
  // §8.4 context-menu seam: open the appearance/tags popover for the
  // requested placement, selecting it first so the bar (and thus the
  // popover anchor) lays out beneath it.
  const onCharmPopover = (event: Event): void => {
    const detail = (event as CustomEvent<CharmPopoverRequest>).detail
    const item = host.controller.items().find((candidate) => candidate.id === detail.placementId)
    if (!item || item.itemKind !== 'placement') return
    host.controller.selection.set([detail.placementId])
    if (detail.which === 'appearance') openAppearanceFor(item)
    else openTagsFor(item)
  }
  window.addEventListener(CHARM_POPOVER_EVENT, onCharmPopover)
  disposers.push(() => window.removeEventListener(CHARM_POPOVER_EVENT, onCharmPopover))
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
