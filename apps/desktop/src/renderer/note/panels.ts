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
import type { CanvasHostHandle } from '../canvas/host'
import { toast } from '../chrome/status'
import {
  onOpenNote,
  onOpenPhantom,
  onRenameNote,
  type OpenNoteAnchor,
} from './open-note'
import { createNoteProjectPort } from './project-port'
import type { ProjectPort } from './note-editor'

export type PanelAnchor =
  | { kind: 'placement'; canvasId: string; placementId: string; label: string }
  | { kind: 'corner' }
  | { kind: 'none' }

export type PanelRequest =
  | { kind: 'note'; noteId: string }
  | { kind: 'phantom'; title: string }
  /** §8.5 canvas phantom: empty editor over a note-less node; the
   * first committed edit creates + attaches (title from first line). */
  | { kind: 'canvas-phantom'; nodeId: string }

export interface PanelRecord {
  key: number
  request: PanelRequest
  anchor: PanelAnchor
  pinned: boolean
  /** Screen-fixed position once pinned (or for anchorless panels). */
  screen: { x: number; y: number } | null
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
    current.request = request
    current.anchor = anchor
  } else {
    records = [...records, { key: nextKey++, request, anchor, pinned: false, screen: null, focus: 0 }]
  }
  notify()
}

export function openNotePanel(noteId: string, anchor?: OpenNoteAnchor): void {
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
  void resolveAnchor(noteId).then((resolved) => setTethered({ kind: 'note', noteId }, resolved))
}

export function openPhantomPanel(title: string): void {
  const current = tethered()
  // A phantom keeps the panel where the link that spawned it lives.
  setTethered({ kind: 'phantom', title }, current?.anchor ?? { kind: 'none' })
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

export function closePanel(key: number): void {
  flushers.delete(key)
  records = records.filter((record) => record.key !== key)
  notify()
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

export function attachPanels(handle: CanvasHostHandle): () => void {
  host = handle
  void createNoteProjectPort().then(({ port }) => (storePort = port))

  const disposers = [
    onOpenNote((noteId, anchor) => openNotePanel(noteId, anchor)),
    onOpenPhantom((title) => openPhantomPanel(title)),
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
  ]

  return () => {
    for (const dispose of disposers) dispose()
    records = []
    flushers.clear()
    renamers.clear()
    host = null
    notify()
  }
}
