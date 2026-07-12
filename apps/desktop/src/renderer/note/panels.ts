/**
 * Note panel store (RFC §8.5, AI-IMP-064). The logical "note pane"
 * realized as floating panels: ONE tethered panel (opening another
 * note replaces its content — same component, same CM6 instance) and
 * any number of PINNED panels, which accumulate and never auto-unpin.
 * The window-level open-note events land here; the docked pane is
 * gone.
 *
 * A note already showing in a pinned panel never opens twice — the
 * request focuses that panel instead (one buffer per note).
 */
import { itemWorldAABB, type ScreenInset } from '@ew/canvas-engine'
import type { CanvasHostHandle } from '../canvas/host'
import { navigateTo } from '../chrome/navigation'
import { toast } from '../chrome/status'
import { registerInputBlocker } from '../chrome/takeover'
import {
  onOpenNote,
  onOpenPhantom,
  onRenameNote,
  onRevealNote,
  type OpenNoteAnchor,
} from './open-note'
import { createNoteProjectPort } from './project-port'
import type { ProjectPort } from './note-editor'
import { runAsUndoGroup } from '../undo/undo-store'
import { attachLandmarks, clearLandmarkFact, landmarkFacts } from './paper/lifecycle'
import type { BindSide } from './paper/bound-geometry'
import { clearPhantomDrafts } from './phantom-drafts'

// §8.5 rev 0.55 (AI-IMP-134): the open book's geometry lives in a pure,
// node-testable module under paper/; the store re-exports the side
// chooser so the bound presentation's decision fn has one public home
// alongside the panel lifecycle it belongs to.
export {
  chooseBindSide,
  pageBaseSize,
  boundEdgeLength,
  ringCount,
  ringOffsets,
  WIDE_ASPECT,
  RING_RADIUS,
  DEFAULT_PAGE_EXTENT,
  type BindSide,
} from './paper/bound-geometry'

export type PanelAnchor =
  | { kind: 'placement'; canvasId: string; placementId: string; label: string }
  | { kind: 'corner' }
  /** A world point with no record yet — the pin tool's provisional
   * dot (§6.2, AI-IMP-067). */
  | { kind: 'point'; canvasId: string; x: number; y: number }
  | { kind: 'none' }

export type PanelRequest =
  | { kind: 'note'; noteId: string }
  | { kind: 'phantom'; title: string }
  /** §8.5 canvas phantom: empty editor over a note-less node; the
   * first committed edit creates + attaches (title from first line). */
  | { kind: 'canvas-phantom'; nodeId: string }
  /** §6.2 pin phantom: the pin tool clicked a spot; the first
   * committed edit is ONE CreatePin (note + dot node + placement). */
  | { kind: 'pin-phantom'; canvasId: string; x: number; y: number }

export interface PanelSize {
  width: number
  height: number
}

/** §8.5 rev 0.31 feel constant: the ONE size a tethered panel spawns
 * at — sized for a glance and a quick line, not an essay. Never a
 * remembered value; pinning is what makes a panel a proper window. */
export const DEFAULT_PANEL_SIZE: PanelSize = { width: 320, height: 300 }

/** Below this the header controls collapse; the resize grip never
 * goes there. */
export const MIN_PANEL_SIZE: PanelSize = { width: 240, height: 150 }

export function clampPanelSize(size: PanelSize): PanelSize {
  return {
    width: Math.max(MIN_PANEL_SIZE.width, Math.round(size.width)),
    height: Math.max(MIN_PANEL_SIZE.height, Math.round(size.height)),
  }
}

// ---- §8.5 rev 0.47 HOLD-AT-FLOOR (AI-IMP-200) ----
// A tethered panel scales WITH the world (rev 0.47), but rev 0.47's
// fade-at-floor made it a postage stamp at the zoom levels boards
// actually live at — "almost unperceivable as even open" (owner FAIL).
// The clamp holds the render size at a legibility floor: world-tracked
// down to the floor, then a MINI PINNED PANEL below it (position still
// world-tracked, glued to its node; size SCREEN-HELD). A deep-zoom fade
// is kept only for far-out overview, where even the held panel would
// loom over a tiny board. These are hand-tuned feel numbers (the owner
// feel-tunes), NOT model state — and NOT the shrink-ladder's rendered-px
// gates: they clamp a SCALE (a fraction of the default card), so they
// live here beside the panel lifecycle rather than in the px ladder.

/** The panel never renders below this SCREEN scale — half its default
 * card. Below it the panel holds this size and world-tracks its node. */
export const MIN_PANEL_SCREEN_SCALE = 0.5

/** World scale at/above which the held panel is fully opaque. Below it,
 * only in deep overview, the panel fades out (it can no longer earn its
 * screen real estate over a board shrunk to a thumbnail). */
export const PANEL_OVERVIEW_FADE_SCALE = 0.1

/** Scale span of the overview fade: opacity ramps 1 → 0 across this,
 * gone by PANEL_OVERVIEW_FADE_SCALE − PANEL_OVERVIEW_FADE_SPAN. */
export const PANEL_OVERVIEW_FADE_SPAN = 0.06

/** The render scale a tethered panel draws at for a given WORLD scale:
 * world-tracked (= worldScale) until it would drop below the floor,
 * then HELD at the floor so an open note always reads as open. */
export function heldPanelScale(worldScale: number): number {
  return Math.max(worldScale, MIN_PANEL_SCREEN_SCALE)
}

/** Overview-fade opacity for a tethered panel at `worldScale`: full at
 * the board zooms notes are read at, a smooth 1 → 0 ramp only far out. */
export function tetheredPanelOverviewOpacity(worldScale: number): number {
  const gone = PANEL_OVERVIEW_FADE_SCALE - PANEL_OVERVIEW_FADE_SPAN
  if (worldScale >= PANEL_OVERVIEW_FADE_SCALE) return 1
  if (worldScale <= gone) return 0
  return (worldScale - gone) / PANEL_OVERVIEW_FADE_SPAN
}

/** A one-shot transition beat the panel component plays exactly once
 * (§8.2 world beat budget, AI-IMP-135). The seq disambiguates repeats. */
export interface PanelBeat {
  kind: 'tear' | 'untape'
  seq: number
}

export interface PanelRecord {
  key: number
  request: PanelRequest
  anchor: PanelAnchor
  pinned: boolean
  /** Screen-fixed position once pinned (or for anchorless panels). */
  screen: { x: number; y: number } | null
  /** Presentation state, panel lifetime only (§8.5 rev 0.31):
   * null = the tethered default; pinning initializes it and the
   * grip drags it. Never persisted, never in the note record. */
  size: PanelSize | null
  /** §8.5 rev 0.55 (AI-IMP-135): a STICKY — a bound page torn out of
   * its book and taped viewport-fixed. Holds the side the book bound
   * on, so the torn edge scars the right page edge. Panel-lifetime
   * presentation, exactly like `size`; null = an ordinary panel. */
  tornFrom: BindSide | null
  /** Latest transition beat to play (one-shot); null = none yet. */
  beat: PanelBeat | null
  /** Focus pulse counter: bumps when an open request lands on an
   * already-pinned note so the panel can flash itself. */
  focus: number
}

type Listener = (records: readonly PanelRecord[]) => void

let records: PanelRecord[] = []
let nextKey = 1
const listeners = new Set<Listener>()
const flushers = new Map<number, () => Promise<void>>()
const closingPanels = new Set<number>()
const renamers = new Map<number, (noteId: string, title: string) => void>()
let host: CanvasHostHandle | null = null
let storePort: ProjectPort | null = null

function notify(): void {
  const snapshot = records.slice()
  for (const listener of listeners) listener(snapshot)
}

function tethered(): PanelRecord | null {
  return records.find((record) => !record.pinned) ?? null
}

/** §8.5 tether feel constants (mirror of NotePanel.layout): a tethered
 * panel's left edge sits GAP px right of its node's right edge, and we
 * keep the same clearance from the window edge on the far side. */
const PANEL_TETHER_GAP = 24
const PANEL_EDGE_MARGIN = 24

/** §6.9/§8.5 (AI-IMP-100): the screen band the tethered panel will
 * occupy after a flight, expressed as a fit inset so the flight frames
 * its target BESIDE the panel. NotePanel.layout always spawns the panel
 * to the RIGHT of its node, so the reservation lands on the right edge;
 * with no tethered panel there is nothing to reserve. Effective size is
 * the record's own size when pinned-into-a-window, else the tethered
 * default. Kept as ONE helper shared by every activation fly.
 *
 * §8.5 rev 0.47: a tethered panel now scales WITH the camera, so its
 * screen footprint after the flight is size.width × the post-flight
 * zoom. That zoom is capped at 1 (feel.PANEL_TETHER_MAX_SCALE), so the
 * unscaled size.width reserved here is the panel's MAXIMUM footprint at
 * any resulting zoom — a safe superset that never lets the panel land
 * over its node. (Below zoom 1 it over-reserves harmlessly, leaving a
 * little extra gap between the framed node and the shrunk panel.) */
function tetheredPanelInset(): ScreenInset {
  const panel = tethered()
  if (!panel) return { top: 0, right: 0, bottom: 0, left: 0 }
  const size = panel.size ?? DEFAULT_PANEL_SIZE
  return { top: 0, right: PANEL_TETHER_GAP + size.width + PANEL_EDGE_MARGIN, bottom: 0, left: 0 }
}

/** Arm the camera so the NEXT fit (the flight about to be requested)
 * reserves the tethered panel's band. One-shot: consumed by that fit,
 * inert otherwise. Every panel-opening activation path calls this
 * immediately before it triggers its flight. */
export function reserveTetheredPanelSpace(): void {
  host?.controller.camera.setNextFitInset(tetheredPanelInset())
}

function panelNoteId(record: PanelRecord): string | null {
  return record.request.kind === 'note' ? record.request.noteId : null
}

/** Resolve where a tethered panel should sit for a note opened with
 * no explicit anchor: its placement on the ACTIVE canvas when there
 * is exactly one obvious home; anchorless otherwise. */
async function resolveAnchor(noteId: string): Promise<PanelAnchor> {
  if (!host) return { kind: 'none' }
  try {
    const response = await window.ew.project.query('getNoteUses', { noteId })
    if (!response.ok) return { kind: 'none' }
    const uses = response.result as {
      canvases: Array<{
        canvasId: string
        nodes: Array<{ placements: Array<{ placementId: string }> }>
      }>
    }
    const active = uses.canvases.find((canvas) => canvas.canvasId === host!.canvasId)
    const placements = active?.nodes.flatMap((node) => node.placements) ?? []
    if (placements.length > 0) {
      return {
        kind: 'placement',
        canvasId: host.canvasId,
        placementId: placements[0]!.placementId,
        label: '',
      }
    }
  } catch {
    // Anchorless is a legal state, not an error.
  }
  return { kind: 'none' }
}

function setTethered(request: PanelRequest, anchor: PanelAnchor): number {
  const current = tethered()
  if (current) {
    // Replacing the tethered content while its buffer sits in the big
    // editor would swap the note under the overlay; close it first.
    if (bigEditorKey === current.key) closeBigEditor()
    current.request = request
    current.anchor = anchor
  } else {
    records = [
      ...records,
      {
        key: nextKey++,
        request,
        anchor,
        pinned: false,
        screen: null,
        size: null,
        tornFrom: null,
        beat: null,
        focus: 0,
      },
    ]
  }
  notify()
  return tethered()!.key
}

let nextBeatSeq = 1

/** Orders async anchor resolves: only the LATEST open request may
 * land, so a slow query for an older click can never replace the
 * note the user opened last (AI-IMP-085). */
let openGeneration = 0

export function openNotePanel(noteId: string, anchor?: OpenNoteAnchor): void {
  const generation = ++openGeneration
  // One buffer per note: an already-pinned note focuses its panel.
  const pinnedHolder = records.find((record) => record.pinned && panelNoteId(record) === noteId)
  if (pinnedHolder) {
    pinnedHolder.focus += 1
    notify()
    return
  }
  if (anchor) {
    setTethered(
      { kind: 'note', noteId },
      {
        kind: 'placement',
        canvasId: anchor.canvasId,
        placementId: anchor.placementId,
        label: anchor.label ?? '',
      },
    )
    return
  }
  void resolveAnchor(noteId).then((resolved) => {
    if (generation !== openGeneration) return // a newer open won
    setTethered({ kind: 'note', noteId }, resolved)
  })
}

export function openPhantomPanel(title: string): void {
  const current = tethered()
  // A phantom keeps the panel where the link that spawned it lives.
  setTethered({ kind: 'phantom', title }, current?.anchor ?? { kind: 'none' })
}

/** The §6.2 pin tool: a focused phantom panel at the clicked spot;
 * nothing persists until the first committed edit. */
export function openPinPhantom(canvasId: string, x: number, y: number): number {
  return setTethered({ kind: 'pin-phantom', canvasId, x, y }, { kind: 'point', canvasId, x, y })
}

/** Pin-tool leave/re-arm owns provisional cleanup, including a phantom
 * that was pinned away from the single tethered slot. */
export function discardPinPhantoms(): void {
  for (const record of [...records]) {
    // Provisional drafts deliberately bypass the persisted-note flush
    // boundary: leaving the tool means discard, synchronously.
    if (record.request.kind === 'pin-phantom') finishClosePanel(record.key)
  }
}

/** The canvas corner charm (§8.5): the active canvas's own note. */
export function openCornerPanel(nodeId: string, noteId: string | null): void {
  setTethered(
    noteId ? { kind: 'note', noteId } : { kind: 'canvas-phantom', nodeId },
    { kind: 'corner' },
  )
}

/** ⇱: tethered → screen-fixed; pinned panels accumulate and nothing
 * ever auto-unpins them (§8.5). Tearing a BOUND page passes `tornFrom`
 * (rev 0.55): the sticky wears tape + a torn edge on that side and
 * plays the one-shot tear beat. */
export function pinPanel(
  key: number,
  screen: { x: number; y: number },
  opts?: { tornFrom?: BindSide },
): void {
  const record = records.find((candidate) => candidate.key === key)
  if (!record || record.pinned) return
  record.pinned = true
  record.screen = screen
  // Pinning makes it a proper window: the size starts at the tethered
  // default and belongs to this panel for its lifetime (§8.5).
  record.size = { ...DEFAULT_PANEL_SIZE }
  if (opts?.tornFrom) {
    record.tornFrom = opts.tornFrom
    record.beat = { kind: 'tear', seq: nextBeatSeq++ }
  }
  notify()
}

/** Un-tape (§8.5 rev 0.55): the STICKY returns to its book — the one
 * deliberate un-pin in the app (pinned panels otherwise never unpin).
 * The record re-tethers: layout finds its image anchor again and the
 * page re-binds, playing the reversed tear. */
export function unpinPanel(key: number): void {
  const record = records.find((candidate) => candidate.key === key)
  if (!record || !record.pinned) return
  record.pinned = false
  record.screen = null
  record.size = null // tethered panels render at THE default
  record.tornFrom = null
  record.beat = { kind: 'untape', seq: nextBeatSeq++ }
  notify()
}

/** Pull-pin restore (§8.5 rev 0.55): the landmark's page comes off the
 * board and reappears as its STICKY — pinned, taped, torn — tethered to
 * the book it originally tore from so un-tape can walk it all the way
 * home. Runs through the ordinary tethered slot (one buffer per note). */
export function restoreSticky(
  noteId: string,
  anchor: { canvasId: string; placementId: string; label: string },
  screen: { x: number; y: number },
  tornFrom: BindSide,
): void {
  // One buffer per note: if a pinned panel already holds it (the user
  // reopened it between place and pull-pin), focus that instead of
  // spawning a second editor against the same note.
  const holder = records.find((record) => record.pinned && panelNoteId(record) === noteId)
  if (holder) {
    holder.focus += 1
    notify()
    return
  }
  setTethered(
    { kind: 'note', noteId },
    {
      kind: 'placement',
      canvasId: anchor.canvasId,
      placementId: anchor.placementId,
      label: anchor.label,
    },
  )
  const record = tethered()
  if (record) pinPanel(record.key, screen, { tornFrom })
}

/** Pull the pin (§8.5 rev 0.55): the landmark comes off the board —
 * ONE undoable DeleteContent (captured by the undo store like any
 * board delete) plus the presentation flip back to the STICKY. §9
 * impact applies unchanged: deleting the node's LAST placement trashes
 * the node, so we surface the standard notice and skip restoring a
 * sticky for a note that just left with it. The cleared landmark fact
 * is presentation state — an undo that resurrects the placement brings
 * the content back without the pin (the hardware asks to be re-placed). */
export async function pullLandmarkPin(placementId: string): Promise<void> {
  if (!host || !storePort) return
  const fact = landmarkFacts().get(placementId)
  if (!fact) return
  const item = host.controller
    .items()
    .find((candidate) => candidate.itemKind === 'placement' && candidate.id === placementId)
  if (!item || item.itemKind !== 'placement') return
  const aabb = itemWorldAABB(item)
  const screenAt = aabb
    ? host.controller.camera.worldToScreen({ x: aabb.x, y: aabb.y })
    : { x: 80, y: 80 }
  const isLast =
    host.controller
      .items()
      .filter(
        (candidate) => candidate.itemKind === 'placement' && candidate.nodeId === item.nodeId,
      ).length <= 1
  const result = await storePort.execute('DeleteContent', {
    canvasId: host.canvasId,
    placementIds: [placementId],
    decorationIds: [],
  })
  if (result.status !== 'committed') {
    if (result.status === 'error') toast(result.message, { kind: 'error' })
    else toast('the project changed underneath (retry)', { kind: 'error' })
    return
  }
  // §8.2 LIFT AWAY on the departing body, same as any delete.
  host.beats.away([placementId])
  clearLandmarkFact(placementId)
  if (isLast) {
    window.dispatchEvent(
      new CustomEvent('ew-board-notice', {
        detail: { message: 'that was its last pin — the sticky moved to trash.' },
      }),
    )
    return
  }
  restoreSticky(
    fact.noteId,
    { canvasId: fact.canvasId, placementId: fact.sourcePlacementId, label: fact.label },
    { x: Math.max(8, screenAt.x), y: Math.max(8, screenAt.y) },
    fact.tornFrom,
  )
}

/** Grip drag on a pinned panel; tethered panels keep THE default. */
export function resizePanel(key: number, size: PanelSize): void {
  const record = records.find((candidate) => candidate.key === key)
  if (!record || !record.pinned) return
  record.size = clampPanelSize(size)
  notify()
}

export function movePanel(key: number, screen: { x: number; y: number }): void {
  const record = records.find((candidate) => candidate.key === key)
  if (!record) return
  record.screen = screen
  notify()
}

/** A panel resolves its own content in place (canvas-phantom →
 * created note) without re-anchoring. */
export function setPanelRequest(key: number, request: PanelRequest): void {
  const record = records.find((candidate) => candidate.key === key)
  if (!record) return
  record.request = request
  notify()
}

/** A pin phantom materialized: the panel re-tethers from its
 * provisional point to the real placement. */
export function setPanelAnchor(key: number, anchor: PanelAnchor): void {
  const record = records.find((candidate) => candidate.key === key)
  if (!record) return
  record.anchor = anchor
  notify()
}

/** §8.5 (AI-IMP-210): is `noteId` currently showing in ANY panel
 * (tethered or pinned)? One buffer per note, so at most one holds it —
 * the gesture-symmetry query behind the note charm / hint chip toggle. */
export function isNoteOpen(noteId: string): boolean {
  return records.some((record) => panelNoteId(record) === noteId)
}

/** Toggle-close for the note charm / hint chip (AI-IMP-210): close the
 * panel showing `noteId` through the ordinary close path, so the close
 * side-effects stay honest (§7.1 flush-on-close). No-op when the note is
 * not open — the caller opens it in that branch. */
export function closeNotePanel(noteId: string): void {
  const record = records.find((candidate) => panelNoteId(candidate) === noteId)
  if (record) closePanel(record.key)
}

export function closePanel(key: number): void {
  if (closingPanels.has(key)) return
  const flush = flushers.get(key)
  if (!flush) {
    finishClosePanel(key)
    return
  }
  // §7.1: close is a guaranteed save point. The panel and its live
  // editor are the only copy of a rejected draft, so they stay mounted
  // until the commit succeeds. NoteEditorController reports failures;
  // leaving the panel open gives the user a retry path.
  closingPanels.add(key)
  void flush()
    .then(() => finishClosePanel(key))
    .catch(() => undefined)
    .finally(() => closingPanels.delete(key))
}

function finishClosePanel(key: number): void {
  if (bigEditorKey === key) closeBigEditor()
  flushers.delete(key)
  records = records.filter((record) => record.key !== key)
  notify()
}

// ---- §8.5 big editor (rev 0.31): ONE centered overlay editor over a
// dimmed board. The panel's CodeMirror buffer MOVES there and back
// (one buffer per note); commit semantics are untouched (§7.1).

let bigEditorKey: number | null = null
/** §8.5 rev 0.55 (AI-IMP-135): the CENTERED TEAR — a big editor opened
 * by tearing a bound page to center wears the torn-page chrome and the
 * tear/tuck beats; an ordinary expand does not. */
let bigEditorTorn = false
/** §8.5 modal (AI-IMP-183 M-11): while the big editor is open it is a
 * takeover-FAMILY input blocker — held here so open/close register and
 * release it. */
let bigEditorBlocker: (() => void) | null = null
const bigEditorListeners = new Set<(key: number | null) => void>()

function notifyBigEditor(): void {
  for (const listener of bigEditorListeners) listener(bigEditorKey)
}

export function openBigEditor(key: number, opts?: { torn?: boolean }): void {
  if (bigEditorKey === key) return
  if (!records.some((record) => record.key === key)) return
  bigEditorKey = key
  bigEditorTorn = opts?.torn === true
  // §8.5 modal (AI-IMP-183 M-11/M-29): register the editor as an input
  // blocker so Mod+P quick-open and Mod+[/] Back/Forward are suppressed
  // under it (they guard on takeoverActive()); registering also notifies
  // the takeover store, retiring the tag/search panels — which removes
  // the M-12 capture-steal by construction (the panels are gone before
  // the editor's Escape matters). bigEditorKey is set above, so the
  // predicate reads true when registerInputBlocker broadcasts.
  if (!bigEditorBlocker) bigEditorBlocker = registerInputBlocker(() => bigEditorKey !== null)
  notifyBigEditor()
}

export function closeBigEditor(): void {
  if (bigEditorKey === null) return
  bigEditorKey = null
  bigEditorTorn = false
  bigEditorBlocker?.()
  bigEditorBlocker = null
  notifyBigEditor()
}

export function bigEditorIsTorn(): boolean {
  return bigEditorTorn
}

export function bigEditorPanel(): number | null {
  return bigEditorKey
}

export function onBigEditorChanged(listener: (key: number | null) => void): () => void {
  bigEditorListeners.add(listener)
  listener(bigEditorKey)
  return () => bigEditorListeners.delete(listener)
}

// §8.8 law 2 (rev 0.41): modals escape their parents. The app shell
// registers ONE root overlay host; surfaces with a backdrop portal
// into it so they mount above every local stacking context. The full
// named z-ladder is EPIC-016; this registry frees the two live
// prisoners (the big editor and the title-conflict dialog).
let overlayHost: HTMLElement | null = null

export function setOverlayHost(host: HTMLElement | null): void {
  overlayHost = host
}

/**
 * Svelte action: relocate `node` into the root overlay host. Only the
 * element's DOM position moves — its Svelte bindings, event handlers,
 * reactive updates, and scoped styles ride along untouched (the same
 * property note-editor's `reparent` relies on for the CM buffer). If
 * no host is registered yet the element stays put, still rendered.
 */
export function overlayPortal(node: HTMLElement): { destroy: () => void } {
  if (overlayHost) overlayHost.appendChild(node)
  return {
    destroy() {
      node.remove()
    },
  }
}

export function panelRecords(): readonly PanelRecord[] {
  return records
}

export function onPanelsChanged(listener: Listener): () => void {
  listeners.add(listener)
  listener(records.slice())
  return () => listeners.delete(listener)
}

/** Panels register their editor flush; quit flush and every
 * body-reading command path awaits ALL open buffers (§10.2). */
export function registerPanelFlush(key: number, flush: () => Promise<void>): () => void {
  flushers.set(key, flush)
  return () => flushers.delete(key)
}

/** Rename routing: the store owns the ONE onRenameNote subscription
 * (per-panel subscriptions would double-execute) and hands the event
 * to the panel holding that note, which owns the conflict dialog. */
export function registerPanelRename(
  key: number,
  rename: (noteId: string, title: string) => void,
): () => void {
  renamers.set(key, rename)
  return () => renamers.delete(key)
}

export async function flushAllPanels(): Promise<void> {
  await Promise.all([...flushers.values()].map((flush) => flush()))
}

// ---- §7.3 activation pipeline (AI-IMP-065): text resolved first
// (the panel already loaded the note); space resolves by location
// count — zero: a notice, canvas untouched; one: fly there (cross-
// canvas as a history event) and RE-TETHER the note at the
// destination; many: the link-anchored chooser.

export interface UsesView {
  totalPlacements: number
  canvases: Array<{
    canvasId: string
    canvasTitle: string | null
    isRoot: boolean
    nodes: Array<{ nodeId: string; placements: Array<{ placementId: string }> }>
  }>
}

export interface ChooserState {
  noteId: string
  title: string
  uses: UsesView
  /** Client coords of the activated link; null centers the chooser. */
  anchor: { x: number; y: number } | null
}

let chooser: ChooserState | null = null
const chooserListeners = new Set<(state: ChooserState | null) => void>()

function notifyChooser(): void {
  for (const listener of chooserListeners) listener(chooser)
}

export function onChooserChanged(listener: (state: ChooserState | null) => void): () => void {
  chooserListeners.add(listener)
  listener(chooser)
  return () => chooserListeners.delete(listener)
}

export function dismissChooser(): void {
  chooser = null
  notifyChooser()
}

/** The one-placement behavior, also the chooser's row action: fly
 * (navigating first when the placement lives elsewhere — a §8.1
 * history event), select, and re-tether the note there. */
export async function jumpToPlacement(
  noteId: string,
  title: string,
  canvasId: string,
  placementId: string,
): Promise<void> {
  if (!host) return
  chooser = null
  notifyChooser()
  if (canvasId !== host.canvasId) await navigateTo(canvasId, title)
  // The destination scene applies asynchronously after openCanvas;
  // wait (bounded) for the placement to exist before selecting it
  // (AI-IMP-113 scene-ready primitive). On timeout we still re-query
  // and fly if it materialized.
  await host.waitForItems([placementId])
  const item = host?.controller.items().find((candidate) => candidate.id === placementId)
  if (item) {
    host.controller.selection.click(placementId)
    const aabb = itemWorldAABB(item)
    if (aabb) {
      // The note re-tethers to this placement below, so its panel will
      // spawn beside the flown-to node — reserve that band before the
      // fit (AI-IMP-100) so the target lands next to it, not under it.
      reserveTetheredPanelSpace()
      host.flyTo(aabb)
    }
  }
  // Anchor handoff: the panel rode the clicked link until now; the
  // flight has a destination, so the note re-tethers to it.
  openNotePanel(noteId, { canvasId, placementId, label: title })
}

/** Orders async reveal resolves: only the LATEST "Fly here" request may
 * land the chooser, so a slow getNoteUses for an older activation can
 * never hijack the chooser the user is interacting with now (AI-IMP-184
 * M-20, mirroring openNotePanel / AI-IMP-085). */
let revealGeneration = 0

async function revealNote(detail: {
  noteId: string
  title: string
  anchor?: { x: number; y: number }
}): Promise<void> {
  if (!host) return
  const generation = ++revealGeneration
  const response = await window.ew.project.query('getNoteUses', { noteId: detail.noteId })
  if (generation !== revealGeneration) return // a newer reveal won
  if (!response.ok) return
  const uses = response.result as UsesView
  if (uses.totalPlacements === 0) {
    // Text-first already opened the note; the canvas stays put.
    window.dispatchEvent(
      new CustomEvent('ew-board-notice', {
        detail: { message: `“${detail.title}” has no placed locations` },
      }),
    )
    return
  }
  const all = uses.canvases.flatMap((canvas) =>
    canvas.nodes.flatMap((node) =>
      node.placements.map((placement) => ({
        canvasId: canvas.canvasId,
        placementId: placement.placementId,
      })),
    ),
  )
  if (all.length === 1) {
    await jumpToPlacement(detail.noteId, detail.title, all[0]!.canvasId, all[0]!.placementId)
    return
  }
  chooser = { noteId: detail.noteId, title: detail.title, uses, anchor: detail.anchor ?? null }
  notifyChooser()
}

export function attachPanels(handle: CanvasHostHandle): () => void {
  host = handle
  // The port is created async; capture its dispose so teardown
  // unsubscribes the project-changed listener even if attachPanels
  // detaches before/after the promise settles (AI-IMP-123). A
  // detach that lands first flags disposal so the late port is torn
  // down on arrival rather than leaking past the panel system.
  let portDispose: (() => void) | null = null
  let detached = false
  void createNoteProjectPort().then(({ port, dispose }) => {
    if (detached) {
      dispose()
      return
    }
    storePort = port
    portDispose = dispose
  })

  const disposers = [
    () => {
      detached = true
      portDispose?.()
      portDispose = null
    },
    // §8.5 rev 0.55 (AI-IMP-135): the landmark-facts mirror rides the
    // panel store's lifetime — the landmark overlay layer reads it.
    attachLandmarks(),
    onOpenNote((noteId, anchor) => openNotePanel(noteId, anchor)),
    onOpenPhantom((title) => openPhantomPanel(title)),
    onRevealNote((detail) => void revealNote(detail)),
    // Rename from a surface with no open panel for that note: flush
    // everything, then execute directly. A §7.7 conflict on this rare
    // path degrades to a toast (the dialog needs an owning panel).
    onRenameNote((detail) => {
      const holder = records.find((record) => panelNoteId(record) === detail.noteId)
      if (holder) {
        renamers.get(holder.key)?.(detail.noteId, detail.title)
        return
      }
      void (async () => {
        await flushAllPanels()
        const port = storePort
        if (!port) return
        // checkRevision off: the flush above just committed through
        // OTHER gateways, and this port only learns their revisions
        // via the async project-changed push — an optimistic check
        // here would race itself into a silent conflict. RenameNote
        // targets a stable id; unconditional apply is the intent.
        // AI-IMP-182: one Mod+Z per rename gesture (RenameNote is
        // GROUP_ONLY, captured at this deliberate no-open-panel path too).
        const result = await runAsUndoGroup((groupToken) =>
          port.execute(
            'RenameNote',
            { noteId: detail.noteId, title: detail.title },
            { checkRevision: false, groupToken },
          ),
        )
        if (result.status === 'error') toast(result.message, { kind: 'error' })
        else if (result.status === 'conflict') toast('rename conflicted — retry', { kind: 'error' })
      })()
    }),
    // §10.2 quit flush now covers every open buffer.
    window.ew.app.onFlushRequest(() => flushAllPanels()),
    // §4.6/§8.5 mutual highlight (AI-IMP-084): selecting a card
    // placement whose note is open in a panel flashes that panel —
    // the counterpart of the pinned panel's source-node halo. When
    // neither side is active nothing highlights (owner decision
    // 2026-07-06): this fires on selection changes only.
    handle.controller.selection.onChanged((ids) => {
      if (ids.length === 0) return
      const selected = new Set(ids)
      const cardNotes = new Set<string>()
      for (const item of handle.controller.items()) {
        if (
          item.itemKind === 'placement' &&
          selected.has(item.id) &&
          item.appearanceKind === 'card' &&
          item.noteId !== null
        ) {
          cardNotes.add(item.noteId)
        }
      }
      if (cardNotes.size === 0) return
      let flashed = false
      for (const record of records) {
        const noteId = panelNoteId(record)
        if (noteId !== null && cardNotes.has(noteId)) {
          record.focus += 1
          flashed = true
        }
      }
      if (flashed) notify()
    }),
  ]

  return () => {
    for (const dispose of disposers) dispose()
    records = []
    clearPhantomDrafts()
    flushers.clear()
    closingPanels.clear()
    renamers.clear()
    chooser = null
    notifyChooser()
    // AI-IMP-199: the big editor's takeover-family input blocker was the
    // one terminal state with no reset path — detach nulled bigEditorKey
    // but never RELEASED bigEditorBlocker, so its predicate closure stayed
    // registered and takeoverActive() could read stale across a canvas
    // swap. Release it here so teardown fully unwinds the modal (mirrors
    // closeBigEditor's own release).
    bigEditorKey = null
    bigEditorTorn = false
    bigEditorBlocker?.()
    bigEditorBlocker = null
    notifyBigEditor()
    host = null
    notify()
  }
}
