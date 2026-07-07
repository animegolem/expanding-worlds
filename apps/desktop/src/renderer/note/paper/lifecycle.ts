/**
 * Note-lifecycle presentation facts (RFC §8.5 rev 0.55, AI-IMP-135).
 *
 * The freely-reversible page lifecycle — book —tear→ sticky —place→
 * landmark —pull pin→ sticky —untape→ book — needs exactly ONE
 * persisted fact: which placements are LANDMARKS (a torn page placed on
 * the board, keeping its torn edge and wearing the push pin). That fact
 * rides the settings table (§11.5 project tier — presentation state,
 * NO migration), keyed by placement id, so it survives reload and
 * vanishes harmlessly when its placement goes (a stale key decorates
 * nothing).
 *
 * The sticky's own hardware (tape + torn edge + shadow) is panel-
 * lifetime presentation on the PanelRecord, exactly as pinned state is
 * today (the ticket's out-of-scope line) — it is deliberately NOT here.
 *
 * Pure helpers live at the top (node-tested); the small store below
 * mirrors the settings into a renderer map for the landmark overlay.
 */
import type { BindSide } from './bound-geometry'

/** Namespaced settings key per landmark placement. */
export const LANDMARK_KEY_PREFIX = 'note_torn_landmark:'

export function landmarkSettingKey(placementId: string): string {
  return `${LANDMARK_KEY_PREFIX}${placementId}`
}

/** What the landmark remembers: whose page it is, and which book
 * (image placement) it tore from — the pull-pin restores the sticky
 * tethered to that book so a later untape can return the page home. */
export interface LandmarkFact {
  noteId: string
  canvasId: string
  sourcePlacementId: string
  label: string
  /** Which side the page's book bound on when it tore — the scar (and
   * a pulled-pin sticky) keeps the same edge through the round trip. */
  tornFrom: BindSide
}

const BIND_SIDES: readonly BindSide[] = ['left', 'right', 'below']

/** Persisted values are user files — trust nothing (settings.ts rule). */
export function parseLandmarkFact(value: unknown): LandmarkFact | null {
  if (typeof value !== 'object' || value === null) return null
  const fact = value as Record<string, unknown>
  if (typeof fact['noteId'] !== 'string' || fact['noteId'].length === 0) return null
  if (typeof fact['canvasId'] !== 'string' || fact['canvasId'].length === 0) return null
  if (typeof fact['sourcePlacementId'] !== 'string' || fact['sourcePlacementId'].length === 0)
    return null
  return {
    noteId: fact['noteId'],
    canvasId: fact['canvasId'],
    sourcePlacementId: fact['sourcePlacementId'],
    label: typeof fact['label'] === 'string' ? fact['label'] : '',
    tornFrom: BIND_SIDES.includes(fact['tornFrom'] as BindSide)
      ? (fact['tornFrom'] as BindSide)
      : 'right',
  }
}

/** Which of the page's edges is the SCAR: the edge that faced the
 * binding when the page was bound (right-bound book → the page's left
 * edge tore; below-bound calendar → its top edge). */
export function tornEdgeSide(bindSide: BindSide): 'left' | 'right' | 'top' {
  if (bindSide === 'left') return 'right'
  if (bindSide === 'below') return 'top'
  return 'left'
}

// ---- landmark store: settings mirrored for the overlay ----

type Listener = (facts: ReadonlyMap<string, LandmarkFact>) => void

let facts = new Map<string, LandmarkFact>()
const listeners = new Set<Listener>()

function notify(): void {
  const snapshot = new Map(facts)
  for (const listener of listeners) listener(snapshot)
}

export function landmarkFacts(): ReadonlyMap<string, LandmarkFact> {
  return facts
}

export function onLandmarksChanged(listener: Listener): () => void {
  listeners.add(listener)
  listener(new Map(facts))
  return () => listeners.delete(listener)
}

function ingest(key: string, value: unknown): boolean {
  if (!key.startsWith(LANDMARK_KEY_PREFIX)) return false
  const placementId = key.slice(LANDMARK_KEY_PREFIX.length)
  const fact = parseLandmarkFact(value)
  if (fact) facts.set(placementId, fact)
  else facts.delete(placementId)
  return true
}

/** Record a landmark (write-through: settings + local mirror — the
 * overlay must not wait for the IPC echo). */
export function setLandmarkFact(placementId: string, fact: LandmarkFact): void {
  ingest(landmarkSettingKey(placementId), fact)
  notify()
  void window.ew.settings.setProject(landmarkSettingKey(placementId), fact)
}

/** Pull the pin / dismiss: the placement stops being a landmark. */
export function clearLandmarkFact(placementId: string): void {
  ingest(landmarkSettingKey(placementId), null)
  notify()
  void window.ew.settings.setProject(landmarkSettingKey(placementId), null)
}

/** Load persisted facts and follow live settings writes. One per app,
 * attached alongside the panel store. Defensive against a partial
 * bridge (unit tests stub `window.ew` piecemeal). */
export function attachLandmarks(): () => void {
  let disposed = false
  void (async () => {
    try {
      const response = await window.ew.project.query('getSettings')
      if (disposed || !response.ok) return
      const all = response.result as Record<string, unknown>
      for (const [key, value] of Object.entries(all)) ingest(key, value)
      notify()
    } catch {
      // No settings yet — an empty project is a legal state.
    }
  })()
  const offChanged =
    window.ew?.settings?.onProjectChanged((change) => {
      if (ingest(change.key, change.value)) notify()
    }) ?? null
  return () => {
    disposed = true
    offChanged?.()
    facts = new Map()
    notify()
  }
}
