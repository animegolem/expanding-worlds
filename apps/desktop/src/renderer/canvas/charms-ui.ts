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
import {
  adornedWorldAABB,
  itemWorldAABB,
  unionBounds,
  type SceneItem,
  type ScenePlacement,
} from '@ew/canvas-engine'
import { mount, unmount } from 'svelte'
import type { NodeAppearance } from '@ew/commands'
import { uuidv7 } from '@ew/domain'
import { FRAME_SORT_ON_DROP_PREFIX } from '@ew/protocol'
import type { BoardTooling } from './board-tooling'
import type { CanvasHostHandle } from './host'
import { Z } from '../z'
import { navigateTo } from '../chrome/navigation'
import { onEngagementChanged } from '../chrome/engagement'
import { tooltip } from '../chrome/tooltip'
import { requestAttachNote, requestOpenNote } from '../note/open-note'
import { closeNotePanel, isNoteOpen } from '../note/panels'
import { appSettings, onAppSettingsChanged } from '../settings/settings'
import { openTagPanel } from '../tags/tag-panel'
import { assignTagByName, filterTagCompletions } from '../tags/tag-assign'
import { runAsUndoGroup } from '../undo/undo-store'
import { importErrorNotice } from './import-surfaces'
import { requestCropEditor } from './crop-request'
import { requestCaptionEditor } from './caption-request'
import { requestCaptionPromotion } from './caption-promotion'
import { themeTokenValue } from '../theme'
import { CHARM_MIN_SCREEN_PX, HINT_CHARM_REST_OPACITY } from '../chrome/feel'
import { ICON_SVG_DATA_URLS } from './icon-atlas.generated'
import { placeAnchored, type PlacementRect } from '../chrome/anchored-placement'
import ArrangePopover from './ArrangePopover.svelte'
import RestylePanel from './RestylePanel.svelte'
import {
  commitRestyle,
  restyleEligibility,
  restyleValues,
} from './selection-restyle'
import {
  registerSelectionHaloProvider,
  selectionHaloRect,
} from './selection-halo'
import { isSelectionBelowFurnitureFloor } from './selection-furniture'

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
    /* A faded layer must be pointer-transparent too (AI-IMP-141): the
       bar/popovers carry inline pointer-events:auto, so an opacity-0
       bar would still swallow clicks meant for what sits under it
       (note-panel links, board objects). !important beats those
       inline values while the layer is disengaged. */
    .ew-charms.disengaged, .ew-charms.disengaged * { pointer-events: none !important; }
    .ew-charms .hint-group { opacity: ${HINT_CHARM_REST_OPACITY}; transition: opacity 120ms ease-out; }
    .ew-charms .hint-group:hover { opacity: 1; }
  `
  document.head.appendChild(style)
}

/**
 * AI-IMP-192 (§8.2 shrink ladder): true when the CURRENT SELECTION's
 * on-screen footprint — the same union bbox "zoom to selection"
 * already computes via `unionBounds` — has shrunk, at this camera
 * zoom, below the shared FURNITURE floor (the EW_FURNITURE_MIN_PX
 * family, AI-IMP-133). Below the floor there is nothing legible left
 * for the charm bar to annotate, so the caller dismisses the
 * selection outright rather than merely hiding the bar — the owner's
 * explicit "dismissal, not hiding" call (zooming back in must NOT
 * resurrect it). This is the pure LEVEL predicate; the caller's
 * layout() wraps it in an above→below CROSSING gate so a selection
 * born below the floor (search fly-to onto a tiny asset) survives.
 * Degenerates to a single placement's own AABB when
 * exactly one item is selected, so single- and multi-selection share
 * one code path. An empty selection is never "below floor" — there is
 * nothing to dismiss. Zoom-only (never camera x/y), so a pan at
 * constant zoom can never flip this.
 */
export function attachCharmsUi(
  host: CanvasHostHandle,
  element: HTMLElement,
  tooling: BoardTooling,
  onError: (message: string) => void,
): CharmsUiHandle {
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
  // §8.4 bar restyle (AI-IMP-141): the kit CharmBar surface — menu
  // ground, soft drop shadow, roomier radius; buttons below pick up
  // the kit's 26px 7px-radius transparent style. Vertical padding is
  // 2px (not the kit's 6px) so the OUTER height stays the pre-restyle
  // 32px: the charms layer floats above note panels (their z port is
  // pending), and a taller bar would cover the panel's first text
  // line — clicks into it were intercepted (see ticket).
  bar.style.cssText =
    'position:absolute;display:none;gap:4px;align-items:center;' +
    'padding:2px 8px;background:var(--ew-surface-menu);border:1px solid var(--ew-border);' +
    'border-radius:10px;box-shadow:0 8px 22px var(--ew-shadow);pointer-events:auto;font-size:13px;'
  layer.appendChild(bar)

  const arrangeHost = document.createElement('div')
  arrangeHost.style.cssText = `position:absolute;display:none;z-index:${Z.popover};pointer-events:auto;`
  layer.appendChild(arrangeHost)
  const restyleHost = document.createElement('div')
  restyleHost.style.cssText = `position:absolute;display:none;z-index:${Z.popover};pointer-events:auto;`
  layer.appendChild(restyleHost)

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
   * reselection. Wrapped in a runAsUndoGroup so the change is one Mod+Z
   * entry (AI-IMP-182 M-07): SetNodeAppearance is GROUP_ONLY, so a bare
   * execute here was silently uncaptured — this matches the sibling
   * sites (host.ts, crop-editor.ts). The handler's inverse restores the
   * prior appearance. */
  function commitAppearance(next: NodeAppearance): void {
    const placement = selectedPlacement()
    if (!placement) return
    void runAsUndoGroup(async (groupToken) => {
      await host.gateway.execute('SetNodeAppearance', { nodeId: placement.nodeId, appearance: next }, { groupToken })
    })
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
    // AI-IMP-182 M-07: SetNodeAppearance is GROUP_ONLY — wrap so the
    // image apply is one Mod+Z entry, matching commitAppearance and the
    // sibling sites. The bound nodeId (not live selection) stays the
    // target through the group.
    await runAsUndoGroup(async (groupToken) => {
      await host.gateway.execute('SetNodeAppearance', {
        nodeId,
        appearance: { kind: 'image', assetId: imported.assetId, crop: null },
      }, { groupToken })
    })
    // AI-IMP-184 (M-19): fold ONLY the popover this import opened. A slow
    // import can resolve after the user opened a DIFFERENT node's
    // appearance popover — an unconditional close would force that one
    // shut. The commit above still targets the bound nodeId.
    if (appearanceFor === placement.id) closeAppearance()
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
    // AI-IMP-182: one add-tag gesture = one Mod+Z. The group folds the
    // create-and-assign pair (CreateTag + AssignTagToNode) into a single
    // entry (both are GROUP_ONLY); an existing-tag assign is a group of one.
    const outcome = await runAsUndoGroup((groupToken) =>
      assignTagByName(
        (commandType, payload) => host.gateway.execute(commandType, payload, { groupToken }),
        placement.nodeId,
        name,
        tagVocab,
      ),
    )
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

  // Tooltip handles per bar button, for the buttons whose tip text
  // follows live state (crop's enabled/disabled reason, AI-IMP-159).
  // One tooltip per node — a second attachment would race the shared
  // chip — so state changes go through update(), never re-attachment.
  const barTips = new WeakMap<
    HTMLButtonElement,
    { update: (next: { name: string; shortcut?: string }) => void }
  >()

  function barButton(
    testId: string,
    glyph: string,
    spec: { name: string; shortcut?: string },
    onClick: () => void,
  ): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset['testid'] = testId
    button.dataset['placementOnly'] = 'true'
    button.textContent = glyph
    button.style.cssText =
      'width:26px;height:26px;padding:0;display:flex;align-items:center;justify-content:center;' +
      'background:transparent;color:var(--ew-text);border:none;border-radius:7px;cursor:pointer;font-size:13px;'
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      onClick()
    })
    const tip = tooltip(button, spec)
    disposers.push(tip.destroy)
    barTips.set(button, tip)
    bar.appendChild(button)
    return button
  }

  function divider(): void {
    const line = document.createElement('span')
    line.dataset['placementOnly'] = 'true'
    line.style.cssText = 'width:1px;height:16px;background:var(--ew-border);margin:0 3px;'
    bar.appendChild(line)
  }

  function selectedPlacement(): ScenePlacement | null {
    const ids = host.controller.selection.ids()
    if (ids.length !== 1) return null
    const item = host.controller.items().find((candidate) => candidate.id === ids[0])
    return item && item.itemKind === 'placement' ? item : null
  }

  function selectedItems(): SceneItem[] {
    return host.controller.selectedItems()
  }

  function selectedDecorations(): import('@ew/canvas-engine').SceneDecoration[] {
    return selectedItems().filter(
      (item): item is import('@ew/canvas-engine').SceneDecoration => item.itemKind === 'decoration',
    )
  }

  let selectionHalo: PlacementRect | null = null
  function selectedScreenRect(): PlacementRect | null {
    const items = selectedItems()
    const selected = items.length === 1 && items[0]?.itemKind === 'placement' ? items[0] : null
    const bounds = selected
      ? adornedWorldAABB(selected, host.controller.camera.zoom)
      : unionBounds(items)
    if (!bounds) return null
    const topLeft = host.controller.camera.worldToScreen({ x: bounds.x, y: bounds.y })
    const bottomRight = host.controller.camera.worldToScreen({
      x: bounds.x + bounds.width,
      y: bounds.y + bounds.height,
    })
    return {
      x: Math.min(topLeft.x, bottomRight.x),
      y: Math.min(topLeft.y, bottomRight.y),
      width: Math.abs(bottomRight.x - topLeft.x),
      height: Math.abs(bottomRight.y - topLeft.y),
    }
  }
  function updateSelectionHalo(): void {
    const card = selectedScreenRect()
    selectionHalo = card ? selectionHaloRect(card, bar.offsetHeight || 32) : null
  }
  disposers.push(registerSelectionHaloProvider(() => selectionHalo))

  async function execute(commandType: string, payload: unknown): Promise<void> {
    await host.gateway.execute(commandType, payload)
  }

  // §8.4 bar: crop · flip H · flip V · | · appearance · make-canvas ·
  // note · # · lock.
  // Crop (AI-IMP-159): opens the crop-editor overlay for an image item —
  // a §4.6 non-destructive DISPLAY crop on the appearance, never the
  // asset. Non-image items keep the button visible but inert with a
  // "why" tooltip (the card-button idiom: not native `disabled`, which
  // would swallow the hover that explains itself).
  const cropTipSpec = { name: 'Crop — trim what this image shows' }
  const cropDisabledTipSpec = { name: 'Crop needs an image item' }
  const cropButton = barButton('charm-crop', '⬚', cropTipSpec, () => {
    const placement = selectedPlacement()
    if (!placement || cropButton.dataset['disabled'] === 'true') return
    requestCropEditor(placement.id)
  })
  function setCropEnabled(isImage: boolean): void {
    cropButton.dataset['disabled'] = isImage ? 'false' : 'true'
    cropButton.style.opacity = isImage ? '1' : '0.4'
    cropButton.style.cursor = isImage ? 'pointer' : 'default'
    barTips.get(cropButton)?.update(isImage ? cropTipSpec : cropDisabledTipSpec)
  }
  const captionButton = barButton('charm-caption', '✎', { name: 'Add caption' }, () => {
    const placement = selectedPlacement()
    if (placement?.appearanceKind === 'image') requestCaptionEditor(placement.id)
  })
  const promoteCaptionButton = barButton(
    'charm-promote-caption',
    '↗',
    { name: 'Promote caption to note' },
    () => {
      const placement = selectedPlacement()
      if (
        placement?.appearanceKind === 'image' &&
        placement.caption !== null &&
        placement.noteId === null
      ) {
        requestCaptionPromotion(placement.id)
      }
    },
  )
  function syncCaptionButton(placement: ScenePlacement): void {
    const isImage = placement.appearanceKind === 'image'
    captionButton.style.display = isImage ? 'flex' : 'none'
    const name = placement.caption === null ? 'Add caption' : 'Edit caption'
    captionButton.setAttribute('aria-label', name)
    barTips.get(captionButton)?.update({ name })

    const hasCaption = placement.caption !== null
    const promotionDisabled = placement.noteId !== null
    promoteCaptionButton.style.display = isImage && hasCaption ? 'flex' : 'none'
    promoteCaptionButton.dataset['disabled'] = promotionDisabled ? 'true' : 'false'
    promoteCaptionButton.style.opacity = promotionDisabled ? '0.4' : '1'
    promoteCaptionButton.style.cursor = promotionDisabled ? 'default' : 'pointer'
    const promoteName = promotionDisabled
      ? 'Promote caption — this item already has a note'
      : 'Promote caption to note'
    promoteCaptionButton.setAttribute('aria-label', promoteName)
    promoteCaptionButton.setAttribute('aria-disabled', String(promotionDisabled))
    barTips.get(promoteCaptionButton)?.update({ name: promoteName })
  }
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
  const makeCanvasTip = { name: 'Make canvas' }
  const alreadyCanvasTip = { name: 'already a board — dive with its frame charm' }
  const makeCanvasButton = barButton('charm-make-canvas', FRAME_GLYPH, makeCanvasTip, () => {
    const placement = selectedPlacement()
    if (!placement || placement.childCanvasId || makeCanvasButton.dataset['disabled'] === 'true') return
    const canvasId = uuidv7()
    void host.gateway.execute('CreateCanvas', { canvasId, nodeId: placement.nodeId }).then((result) => {
      if (result.status === 'committed')
        void navigateTo(canvasId, placement.noteTitle ?? 'Board')
    })
  })
  barButton('charm-note', PAGE_GLYPH, { name: 'Note — open or close, or attach one' }, () => {
    const placement = selectedPlacement()
    if (!placement) return
    if (placement.noteId) {
      // AI-IMP-210: one gesture, one meaning — the same click closes an
      // open note through the panel's own close path, and opens it when
      // shut. Attach when the placement carries no note yet.
      if (isNoteOpen(placement.noteId)) closeNotePanel(placement.noteId)
      else requestOpenNote(placement.noteId)
    } else requestAttachNote(placement.nodeId)
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
      // AI-IMP-184 (M-18): re-check AFTER rebuildChips too — closing or
      // switching the popover DURING the rebuild must not resurrect the
      // closed popover (or clobber the new one's DOM and steal focus).
      if (chipsFor !== placement.id) return
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

  let arrangeMount: ReturnType<typeof mount> | null = null
  let restyleMount: ReturnType<typeof mount> | null = null
  let arrangeOpen = false
  let restyleOpen = false
  let restyleSelectionKey = ''

  function closeArrange(): void {
    arrangeOpen = false
    arrangeHost.style.display = 'none'
    if (arrangeMount) void unmount(arrangeMount)
    arrangeMount = null
  }

  function closeRestyle(): void {
    restyleOpen = false
    restyleSelectionKey = ''
    restyleHost.style.display = 'none'
    if (restyleMount) void unmount(restyleMount)
    restyleMount = null
  }

  const restyleButton = barButton('charm-restyle', '◧', { name: 'Restyle selection' }, () => {
    if (restyleButton.dataset['disabled'] === 'true') return
    if (restyleOpen) {
      closeRestyle()
      return
    }
    closeArrange()
    const decorations = selectedDecorations()
    const eligible = restyleEligibility(decorations)
    if (!eligible.family || decorations.length !== selectedItems().length) return
    const lead = decorations[0]
    if (!lead) return
    const palette = [
      '--ew-node-dot-blue',
      '--ew-node-dot-teal',
      '--ew-node-dot-gold',
      '--ew-node-dot-red',
    ].map(themeTokenValue)
    restyleHost.style.display = 'block'
    restyleSelectionKey = decorations.map((item) => item.id).sort().join('|')
    restyleMount = mount(RestylePanel, {
      target: restyleHost,
      props: {
        family: eligible.family,
        values: restyleValues(lead),
        palette,
        onpatch: (patch: Record<string, unknown>) => {
          void commitRestyle(host, decorations, eligible.family!, patch).catch((error: unknown) =>
            onError(error instanceof Error ? error.message : String(error)),
          )
        },
      },
    })
    restyleOpen = true
    schedule()
  })
  restyleButton.dataset['placementOnly'] = 'false'

  const arrangeButton = barButton(
    'charm-arrange',
    '⌗',
    { name: 'Arrange — align, spread, pack, equalize' },
    () => {
      if (arrangeOpen) {
        closeArrange()
        return
      }
      closeRestyle()
      arrangeHost.style.display = 'block'
      arrangeMount = mount(ArrangePopover, {
        target: arrangeHost,
        props: {
          onalign: (op: import('@ew/canvas-engine').AlignOp) => void tooling.align(op),
          ondistribute: (axis: import('@ew/canvas-engine').DistributeAxis) => void tooling.distribute(axis),
          onarrange: (key: import('@ew/canvas-engine').ArrangeSortKey) => void tooling.arrange(key),
          onnormalize: (mode: import('@ew/canvas-engine').NormalizeMode) => void tooling.normalize(mode),
        },
      })
      arrangeOpen = true
      schedule()
    },
  )
  arrangeButton.dataset['placementOnly'] = 'false'

  function syncSelectionButtons(items: readonly SceneItem[]): void {
    const placement = items.length === 1 && items[0]?.itemKind === 'placement'
    for (const element of bar.querySelectorAll<HTMLElement>('[data-placement-only="true"]'))
      element.style.display = placement ? '' : 'none'
    arrangeButton.style.display = items.length >= 2 ? 'flex' : 'none'
    const decorations = items.filter(
      (item): item is import('@ew/canvas-engine').SceneDecoration => item.itemKind === 'decoration',
    )
    const selectionKey = decorations.map((item) => item.id).sort().join('|')
    if (restyleOpen && selectionKey !== restyleSelectionKey) closeRestyle()
    const eligible = restyleEligibility(decorations)
    const allDecorations = decorations.length === items.length
    const showRestyle = decorations.length > 0
    const enabled = showRestyle && allDecorations && eligible.family !== null
    restyleButton.style.display = showRestyle ? 'flex' : 'none'
    restyleButton.dataset['disabled'] = enabled ? 'false' : 'true'
    restyleButton.setAttribute('aria-disabled', String(!enabled))
    restyleButton.style.opacity = enabled ? '1' : '0.4'
    restyleButton.style.cursor = enabled ? 'pointer' : 'default'
    barTips.get(restyleButton)?.update({
      name: enabled
        ? 'Restyle selection'
        : allDecorations
          ? (eligible.reason ?? 'Restyle needs one shared style family')
          : 'Restyle does not apply to placed items',
    })
    if (!enabled && restyleOpen) closeRestyle()
    if (items.length < 2 && arrangeOpen) closeArrange()
  }

  function positionSelectionPanel(surface: HTMLElement, opener: HTMLElement): void {
    const hostBounds = element.getBoundingClientRect()
    const openerBounds = opener.getBoundingClientRect()
    const anchor = {
      x: openerBounds.left - hostBounds.left,
      y: openerBounds.top - hostBounds.top,
      width: openerBounds.width,
      height: openerBounds.height,
    }
    const bounds = surface.getBoundingClientRect()
    const placed = placeAnchored({
      anchor,
      surface: { width: bounds.width, height: bounds.height },
      host: { x: 0, y: 0, width: hostBounds.width, height: hostBounds.height },
      x: { preferred: 'center' },
      y: { preferred: 'after', fallback: 'before' },
      gap: 8,
      avoid: selectionHalo ?? undefined,
    })
    surface.style.left = `${placed.x}px`
    surface.style.top = `${placed.y}px`
  }

  const onSelectionPanelPointer = (event: PointerEvent): void => {
    const target = event.target as Node
    if (bar.contains(target) || arrangeHost.contains(target) || restyleHost.contains(target)) return
    closeArrange()
    closeRestyle()
  }
  const onSelectionPanelKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || (!arrangeOpen && !restyleOpen)) return
    event.preventDefault()
    closeArrange()
    closeRestyle()
  }
  document.addEventListener('pointerdown', onSelectionPanelPointer, true)
  window.addEventListener('keydown', onSelectionPanelKey, true)
  disposers.push(() => document.removeEventListener('pointerdown', onSelectionPanelPointer, true))
  disposers.push(() => window.removeEventListener('keydown', onSelectionPanelKey, true))

  // ---------------------------------------- frame sort chip (§4.9)
  // AI-IMP-138 (owner ruling 2026-07-07: "it has to be in the charm
  // bar"). Shown ONLY when the single selection is a frame. The chip
  // reflects and toggles AI-IMP-129's per-frame `frame_sort_on_drop`
  // flag, and a sibling button packs the frame on demand — both through
  // the SAME board-tooling path the Dock and context menu use, so there
  // is one action path and no new command. AI-IMP-129 stores only the
  // boolean (no sort-MODE fact), so the chip is the on/float toggle the
  // brief's fallback specifies: "grid" = sort-on-drop ON, "float" = the
  // visible off-state.
  const frameDivider = document.createElement('span')
  frameDivider.style.cssText = 'width:1px;height:16px;background:var(--ew-border);margin:0 3px;'
  bar.appendChild(frameDivider)

  /** A text-bearing bar chip (the icon buttons are square/glyph-only). */
  function chipButton(
    testId: string,
    spec: { name: string },
    onClick: () => void,
  ): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset['testid'] = testId
    button.style.cssText =
      'height:26px;padding:0 9px;display:flex;align-items:center;gap:4px;' +
      'background:transparent;color:var(--ew-text);border:none;border-radius:7px;cursor:pointer;font:inherit;font-size:12px;'
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      onClick()
    })
    const tip = tooltip(button, spec)
    disposers.push(tip.destroy)
    bar.appendChild(button)
    return button
  }

  // Which frame the chip currently reflects, and the flag it read.
  let sortChipFrameId: string | null = null
  let sortOnDropState = true
  function setSortChipState(on: boolean): void {
    sortOnDropState = on
    sortToggle.textContent = on ? '▦ grid' : '◇ float'
    sortToggle.setAttribute('aria-pressed', String(on))
  }
  const sortToggle = chipButton(
    'charm-frame-sort-on-drop',
    { name: 'Sort on drop — arrange items dropped into this frame' },
    () => {
      const placement = selectedPlacement()
      if (!placement || placement.appearanceKind !== 'frame') return
      const next = !sortOnDropState
      setSortChipState(next)
      void tooling.setFrameSortOnDrop(placement.id, next)
    },
  )
  const sortNowButton = chipButton(
    'charm-frame-sort-now',
    { name: 'Sort in frame — compact-pack this frame’s contents now' },
    () => {
      const placement = selectedPlacement()
      if (placement && placement.appearanceKind === 'frame') void tooling.sortFrame(placement.id)
    },
  )
  sortNowButton.textContent = '⊞'
  const frameAddButton = chipButton(
    'charm-frame-add-library',
    { name: 'Add from library' },
    () => {
      const placement = selectedPlacement()
      if (placement?.appearanceKind === 'frame') tooling.loadIntoFrame(placement.id)
    },
  )
  frameAddButton.textContent = '＋'
  setSortChipState(true)

  /** Show/refresh the frame chip for the selection (or hide it). Reads
   * the flag once per newly-selected frame; the layout pass calls this
   * before it measures the bar so centering accounts for the chip. */
  function syncFrameChip(selected: ScenePlacement | null): void {
    const isFrame = selected !== null && selected.appearanceKind === 'frame'
    frameDivider.style.display = isFrame ? '' : 'none'
    sortToggle.style.display = isFrame ? '' : 'none'
    sortNowButton.style.display = isFrame ? '' : 'none'
    frameAddButton.style.display = isFrame ? '' : 'none'
    if (!isFrame || !selected) {
      sortChipFrameId = null
      return
    }
    if (sortChipFrameId === selected.id) return
    sortChipFrameId = selected.id
    const frameId = selected.id
    void tooling.frameSortOnDrop(frameId).then((on) => {
      if (sortChipFrameId === frameId) setSortChipState(on)
    })
  }

  // AI-IMP-177: the chip reads its flag only when the selected frame ID
  // changes, so a Dock/context-menu toggle while the same frame stays
  // selected left the chip stale. Re-read on the settings broadcast (the
  // house pattern is BookmarkMenu.svelte's project.onChanged refresh);
  // absent/anything-but-false means sort-on-drop is ON (§4.9).
  disposers.push(
    window.ew.settings.onProjectChanged(({ key, value }) => {
      if (sortChipFrameId === null) return
      if (key !== `${FRAME_SORT_ON_DROP_PREFIX}${sortChipFrameId}`) return
      setSortChipState(value !== false)
    }),
  )

  // ---------------------------------------------------- hint charms
  // §8.4 hint glyphs, drawn (AI-IMP-141): the kit HintCharm bordered-div
  // shapes replace the unicode ¶/⊡ — page = a small document with two
  // rule lines; frame = a framed box with a dot and a triangle. The ink
  // stays `--ew-text` (parity with the glyphs these replace) and the
  // body is transparent so the button's own scrim chip shows through.
  function hintShape(kind: 'page' | 'frame'): HTMLDivElement {
    const shape = document.createElement('div')
    if (kind === 'frame') {
      shape.style.cssText =
        'position:relative;box-sizing:border-box;width:14px;height:14px;overflow:hidden;' +
        'border:1.5px solid var(--ew-text);border-radius:2.5px;'
      const dot = document.createElement('div')
      dot.style.cssText =
        'position:absolute;left:2px;top:2px;width:3.5px;height:3.5px;box-sizing:border-box;' +
        'border:1px solid var(--ew-text);border-radius:50%;'
      const triangle = document.createElement('div')
      triangle.style.cssText =
        'position:absolute;left:3px;bottom:-1px;width:0;height:0;' +
        'border-left:4px solid transparent;border-right:4px solid transparent;' +
        'border-bottom:7px solid var(--ew-text);'
      shape.append(dot, triangle)
      return shape
    }
    shape.style.cssText =
      'position:relative;box-sizing:border-box;width:12px;height:15px;' +
      'border:1.5px solid var(--ew-text);border-radius:2.5px;'
    const line1 = document.createElement('div')
    line1.style.cssText =
      'position:absolute;left:2.5px;right:2.5px;top:4px;border-top:1.5px solid var(--ew-text);'
    const line2 = document.createElement('div')
    line2.style.cssText =
      'position:absolute;left:2.5px;right:3.5px;top:7.5px;border-top:1.5px solid var(--ew-text);'
    shape.append(line1, line2)
    return shape
  }

  function hintButton(testId: string, kind: 'page' | 'frame', name: string): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset['testid'] = testId
    button.style.cssText =
      'width:18px;height:18px;display:grid;place-items:center;padding:0;' +
      'background:var(--ew-art-chip-scrim);color:var(--ew-text);border:none;border-radius:4px;' +
      'cursor:pointer;font-size:11px;pointer-events:auto;'
    button.appendChild(hintShape(kind))
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
      const page = hintButton(`hint-page-${item.id}`, 'page', 'Open or close note')
      page.addEventListener('click', (event) => {
        event.stopPropagation()
        const current = host.controller
          .items()
          .find((candidate) => candidate.id === item.id)
        const placement =
          current && current.itemKind === 'placement' ? current : item
        if (!placement.noteId) return
        // AI-IMP-210: the hint chip toggles too — close through the
        // panel's own path if that note is open, otherwise open tethered.
        if (isNoteOpen(placement.noteId)) closeNotePanel(placement.noteId)
        else
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
      const frame = hintButton(`hint-frame-${item.id}`, 'frame', 'Dive into canvas')
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
  // AI-IMP-192 re-entry guard: clear() already no-ops once the
  // selection is empty (Selection#clear checks size first), so this
  // is a belt-and-suspenders assertion against layout() ever calling
  // clear() from inside its own dismiss branch (e.g. a future refactor
  // that reacted to selection.onChanged synchronously).
  let dismissingSelection = false
  // AI-IMP-192 crossing state: the dismissal is EDGE-triggered — it
  // fires only when a selection OBSERVED above the furniture floor
  // SHRINKS below it (the ticket's "during zoom-out"), never on a
  // selection born below the floor. A level-triggered check here broke
  // the §8.3 search fly-to: activating a tiny asset's location selects
  // a placement that renders ~1px at rest zoom, and the instant clear
  // ate the selection the flight had just made. Deliberate selection
  // of a speck (fly-to, precision click) survives; zooming a legible
  // selection down past the floor still dismisses it for good.
  let floorSelectionKey = ''
  let selectionSeenAboveFloor = false

  /** AI-IMP-192: dismiss (never just hide) a selection whose on-screen
   * footprint has zoomed below the shared furniture floor.
   * Edge-triggered on the above→below crossing (see the state decl):
   * a NEW selection resets the crossing state; only one observed above
   * the floor arms the dismissal. Zoom-only (pan at constant zoom never
   * changes the footprint), and clearing is permanent — zooming back in
   * does not resurrect.
   * AI-IMP-209 (CI catch): runs SYNCHRONOUSLY from the camera and
   * selection onChanged listeners, not only from the rAF layout() — the
   * Linux runner's slow software frames proved arming must never depend
   * on a render tick having landed between "selected above the floor"
   * and "zoomed below it" (back-to-back camera writes outran the frame
   * and the crossing was missed forever). layout() still calls it as a
   * belt for anything that moves the camera without firing the hooks. */
  function checkFurnitureFloor(): void {
    if (dismissingSelection) return
    const floorSelection = host.controller.selectedItems()
    const selectionKey = floorSelection
      .map((item) => item.id)
      .sort()
      .join('\n')
    if (selectionKey !== floorSelectionKey) {
      floorSelectionKey = selectionKey
      selectionSeenAboveFloor = false
    }
    if (selectionKey === '') return
    if (!isSelectionBelowFurnitureFloor(floorSelection, host.controller.camera.zoom)) {
      selectionSeenAboveFloor = true
    } else if (selectionSeenAboveFloor) {
      dismissingSelection = true
      host.controller.selection.clear()
      dismissingSelection = false
      floorSelectionKey = ''
      selectionSeenAboveFloor = false
    }
  }

  function schedule(): void {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      layout()
    })
  }

  function layout(): void {
    const camera = host.controller.camera

    // AI-IMP-192: floor check first, so a same-frame dismiss falls
    // straight through to the unselected branches below (bar hidden,
    // no bar-beneath-a-speck).
    checkFurnitureFloor()

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

    // Charm bar beneath the single selected placement. Anchors to the
    // ADORNED bounds (body + the §4.5 label when one shows) so the bar
    // clears the title instead of covering it; identical to the raw
    // body AABB when no label shows (AI-IMP-161).
    const selectionItems = selectedItems()
    const selected = selectedPlacement()
    const screenRect = selectedScreenRect()
    if (selectionItems.length > 0 && screenRect) {
      const bottomCenter = {
        x: screenRect.x + screenRect.width / 2,
        y: screenRect.y + screenRect.height,
      }
      bar.style.display = 'flex'
      syncSelectionButtons(selectionItems)
      // Toggle the §4.9 frame chip BEFORE measuring, so the bar width
      // (and thus its centering) accounts for it.
      syncFrameChip(selected)
      if (selected) syncCaptionButton(selected)
      const barWidth = bar.offsetWidth || 200
      bar.style.left = `${bottomCenter.x - barWidth / 2}px`
      bar.style.top = `${bottomCenter.y + 10}px`
      updateSelectionHalo()
      // Popovers hang below the bar with a 2px gap, derived from the
      // LIVE bar height (AI-IMP-141) — the old fixed +44 encoded the
      // pre-restyle 32px bar and would sit under the taller kit bar.
      const popoverTop = bottomCenter.y + 10 + (bar.offsetHeight || 40) + 2
      if (selected) {
        lockButton.textContent = selected.locked === 1 ? '🔓' : '🔒'
        const tipSpec = selected.locked === 1 ? 'Unlock' : 'Lock'
        lockButton.setAttribute('aria-label', tipSpec)
        const canMakeCanvas = selected.childCanvasId === null
        makeCanvasButton.dataset['disabled'] = canMakeCanvas ? 'false' : 'true'
        makeCanvasButton.style.opacity = canMakeCanvas ? '1' : '0.4'
        makeCanvasButton.style.cursor = canMakeCanvas ? 'pointer' : 'default'
        barTips.get(makeCanvasButton)?.update(canMakeCanvas ? makeCanvasTip : alreadyCanvasTip)
        setCropEnabled(selected.appearanceKind === 'image' && selected.assetContentHash !== null)
      }
      if (selected && chipsFor === selected.id) {
        const card = selectedScreenRect()
        const bounds = element.getBoundingClientRect()
        const surface = chips.getBoundingClientRect()
        const placed = card
          ? placeAnchored({
              anchor: card,
              surface,
              host: { x: 0, y: 0, width: bounds.width, height: bounds.height },
              x: { preferred: 'center' },
              y: { preferred: 'after', fallback: 'before' },
              gap: 2,
              avoid: selectionHalo ?? undefined,
            })
          : { x: bottomCenter.x - barWidth / 2, y: popoverTop }
        chips.style.left = `${placed.x}px`
        chips.style.top = `${placed.y}px`
      } else {
        chipsFor = null
        chips.style.display = 'none'
      }
      if (selected && appearanceFor === selected.id) {
        const card = selectedScreenRect()
        const bounds = element.getBoundingClientRect()
        const surface = appearance.getBoundingClientRect()
        const placed = card
          ? placeAnchored({
              anchor: card,
              surface,
              host: { x: 0, y: 0, width: bounds.width, height: bounds.height },
              x: { preferred: 'center' },
              y: { preferred: 'after', fallback: 'before' },
              gap: 2,
              avoid: selectionHalo ?? undefined,
            })
          : { x: bottomCenter.x - barWidth / 2, y: popoverTop }
        appearance.style.left = `${placed.x}px`
        appearance.style.top = `${placed.y}px`
        // Keep card's enabled state fresh if a note is attached/detached
        // while the popover is open.
        setCardEnabled(selected.noteId !== null)
      } else {
        closeAppearance()
      }
      if (arrangeOpen) positionSelectionPanel(arrangeHost, arrangeButton)
      if (restyleOpen) positionSelectionPanel(restyleHost, restyleButton)
    } else {
      selectionHalo = null
      bar.style.display = 'none'
      syncFrameChip(null)
      chipsFor = null
      chips.style.display = 'none'
      closeAppearance()
      closeArrange()
      closeRestyle()
    }
  }

  // AI-IMP-192/209: the floor check rides the SAME hooks synchronously
  // (before the scheduled frame) so the crossing can never be outrun by
  // back-to-back camera writes — see checkFurnitureFloor.
  disposers.push(
    host.controller.camera.onChanged(() => {
      checkFurnitureFloor()
      updateSelectionHalo()
      schedule()
    }),
  )
  disposers.push(
    host.onSceneApplied(() => {
      updateSelectionHalo()
      schedule()
    }),
  )
  disposers.push(
    host.controller.selection.onChanged(() => {
      checkFurnitureFloor()
      updateSelectionHalo()
      schedule()
    }),
  )
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
      closeArrange()
      closeRestyle()
      for (const id of [...entries.keys()]) removeEntry(id)
      layer.remove()
    },
  }
}
