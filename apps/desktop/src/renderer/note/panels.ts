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
import { itemWorldAABB } from '@ew/canvas-engine'
import type { CanvasHostHandle } from '../canvas/host'
import { navigateTo } from '../chrome/navigation'
import { toast } from '../chrome/status'
import {
  onOpenNote,
  onOpenPhantom,
  onRenameNote,
  onRevealNote,
  type OpenNoteAnchor,
} from './open-note'
import { createNoteProjectPort } from './project-port'
import type { ProjectPort } from './note-editor'

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
  /** Focus pulse counter: bumps when an open request lands on an
   * already-pinned note so the panel can flash itself. */
  focus: number
}

type Listener = (records: readonly PanelRecord[]) => void

let records: PanelRecord[] = []
let nextKey = 1
const listeners = new Set<Listener>()
const flushers = new Map<number, () => Promise<void>>()
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

function setTethered(request: PanelRequest, anchor: PanelAnchor): void {
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
      { key: nextKey++, request, anchor, pinned: false, screen: null, size: null, focus: 0 },
    ]
  }
  notify()
}

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
export function openPinPhantom(canvasId: string, x: number, y: number): void {
  setTethered({ kind: 'pin-phantom', canvasId, x, y }, { kind: 'point', canvasId, x, y })
}

/** The canvas corner charm (§8.5): the active canvas's own note. */
export function openCornerPanel(nodeId: string, noteId: string | null): void {
  setTethered(
    noteId ? { kind: 'note', noteId } : { kind: 'canvas-phantom', nodeId },
    { kind: 'corner' },
  )
}

/** ⇱: tethered → screen-fixed; pinned panels accumulate and nothing
 * ever auto-unpins them (§8.5). */
export function pinPanel(key: number, screen: { x: number; y: number }): void {
  const record = records.find((candidate) => candidate.key === key)
  if (!record || record.pinned) return
  record.pinned = true
  record.screen = screen
  // Pinning makes it a proper window: the size starts at the tethered
  // default and belongs to this panel for its lifetime (§8.5).
  record.size = { ...DEFAULT_PANEL_SIZE }
  notify()
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

export function closePanel(key: number): void {
  if (bigEditorKey === key) closeBigEditor()
  // §7.1: close is a guaranteed save point — a burst still inside
  // the debounce window commits before the panel goes (AI-IMP-085;
  // the command lands async, the panel need not wait for it).
  const flush = flushers.get(key)
  if (flush) void flush().catch(() => undefined)
  flushers.delete(key)
  records = records.filter((record) => record.key !== key)
  notify()
}

// ---- §8.5 big editor (rev 0.31): ONE centered overlay editor over a
// dimmed board. The panel's CodeMirror buffer MOVES there and back
// (one buffer per note); commit semantics are untouched (§7.1).

let bigEditorKey: number | null = null
const bigEditorListeners = new Set<(key: number | null) => void>()

function notifyBigEditor(): void {
  for (const listener of bigEditorListeners) listener(bigEditorKey)
}

export function openBigEditor(key: number): void {
  if (bigEditorKey === key) return
  if (!records.some((record) => record.key === key)) return
  bigEditorKey = key
  notifyBigEditor()
}

export function closeBigEditor(): void {
  if (bigEditorKey === null) return
  bigEditorKey = null
  notifyBigEditor()
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
  await Promise.all([...flushers.values()].map((flush) => flush().catch(() => undefined)))
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
  // wait for the placement to exist before selecting it.
  const item = await waitForItem(placementId)
  if (item) {
    host.controller.selection.click(placementId)
    const aabb = itemWorldAABB(item)
    if (aabb) host.flyTo(aabb)
  }
  // Anchor handoff: the panel rode the clicked link until now; the
  // flight has a destination, so the note re-tethers to it.
  openNotePanel(noteId, { canvasId, placementId, label: title })
}

function waitForItem(
  placementId: string,
  timeoutMs = 2000,
): Promise<ReturnType<CanvasHostHandle['controller']['items']>[number] | null> {
  return new Promise((resolve) => {
    const find = (): ReturnType<CanvasHostHandle['controller']['items']>[number] | undefined =>
      host?.controller.items().find((candidate) => candidate.id === placementId)
    const immediate = find()
    if (immediate || !host) {
      resolve(immediate ?? null)
      return
    }
    const off = host.onSceneApplied(() => {
      const found = find()
      if (found) {
        off()
        clearTimeout(timer)
        resolve(found)
      }
    })
    const timer = setTimeout(() => {
      off()
      resolve(find() ?? null)
    }, timeoutMs)
  })
}

async function revealNote(detail: {
  noteId: string
  title: string
  anchor?: { x: number; y: number }
}): Promise<void> {
  if (!host) return
  const response = await window.ew.project.query('getNoteUses', { noteId: detail.noteId })
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
  void createNoteProjectPort().then(({ port }) => (storePort = port))

  const disposers = [
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
        if (!storePort) return
        // checkRevision off: the flush above just committed through
        // OTHER gateways, and this port only learns their revisions
        // via the async project-changed push — an optimistic check
        // here would race itself into a silent conflict. RenameNote
        // targets a stable id; unconditional apply is the intent.
        const result = await storePort.execute(
          'RenameNote',
          { noteId: detail.noteId, title: detail.title },
          { checkRevision: false },
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
    flushers.clear()
    renamers.clear()
    chooser = null
    notifyChooser()
    bigEditorKey = null
    notifyBigEditor()
    host = null
    notify()
  }
}
