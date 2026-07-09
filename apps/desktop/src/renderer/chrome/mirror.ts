/**
 * The inbox mirror (RFC §14.4, AI-IMP-092): a drop into a world also
 * performs a second ordinary import into the library project — bytes
 * copied, an unplaced node created, provenance recorded — strictly
 * one-way and NEVER blocking the foreground drop. This store owns the
 * whole renderer side: the once-per-project first-drop ask (a
 * two-button panel anchored to the drop; the import runs either way),
 * lazy opening of the 'library' secondary slot (separate from 091's
 * 'source' slot — the two never contend), hash recognition before
 * copy, the transient tag-offer chip, bulk collapse to one summary
 * chip, and the one-quiet-notice-per-session failure posture.
 *
 * Framework-agnostic listener store in the status.ts mold; the
 * MirrorAsk / RecognitionChip components subscribe via
 * onMirrorUiChanged. Chips obey the engagement fade (§8.2): ignoring
 * one IS the dismissal gesture — the next idle dissolves it with no
 * dismissal debt.
 */
import { nameKey, uuidv7 } from '@ew/domain'
import type { CommandResult } from '@ew/commands'
import { onEngagementChanged, wake } from './engagement'
import { onImportProgressChanged } from './import-progress'
import { MIRROR_CHIP_LIFETIME_MS } from './feel'

/** One committed foreground import, offered to the mirror. */
export interface MirrorDrop {
  assetId: string
  /** The fresh world node — the tag offer's target. */
  nodeId: string
  /** Drop anchor in client coordinates (chip/ask placement). */
  clientX: number
  clientY: number
  /** Progress-strip drops collapse to one summary chip. */
  bulk: boolean
}

export interface MirrorAskState {
  x: number
  y: number
}

export type MirrorChip =
  | {
      id: number
      kind: 'recognition'
      x: number
      y: number
      nodeId: string
      tagNames: string[]
    }
  | { id: number; kind: 'summary'; message: string }

export interface MirrorUiState {
  ask: MirrorAskState | null
  chips: readonly MirrorChip[]
}

type UiListener = (ui: MirrorUiState) => void

let ask: MirrorAskState | null = null
let chips: readonly MirrorChip[] = []
let nextChipId = 1
const listeners = new Set<UiListener>()

/** Drops parked behind the unanswered first-drop ask. */
let pendingAsk: MirrorDrop[] = []

/** Session flags: ONE quiet notice, however many drops fail. */
let noticeShown = false
/** The library slot opens lazily on the first mirror and stays open;
 * a dead-slot failure clears this so the retry rides the next drop. */
let libraryOpen = false

/** Mirrors run strictly serialized — concurrent ingests into one
 * library are a race for nothing (hash dedupe makes order moot). */
let chain: Promise<void> = Promise.resolve()
let inFlight = 0

/** Bulk accounting for the summary chip. */
let bulkMirrored = 0
let bulkRecognized = 0
let batchActive = false

let attached = false

/**
 * Per-chip presentation timers (AI-IMP-213, stuck-state family). A
 * chip's designed dismissal is the §8.2 engagement fade — but that
 * false-edge is a shared clock the chip does not control, and it never
 * arrives while a takeover pins engagement (holdEngagement) or the
 * fade is 'never'; the buttonless "Already in your library" chip then
 * has no way back and maroons mid-board. Every chip therefore also
 * owns a self-dismissal timer, armed at creation, that removes it after
 * a bounded window regardless of the engagement clock's state. Guarded
 * fire (it no-ops if the chip is already gone) + cleared on every
 * removal path is the PathBar safety-timeout idiom (AI-IMP-166).
 */
const chipTimers = new Map<number, ReturnType<typeof setTimeout>>()

function armChipTimer(id: number): void {
  chipTimers.set(
    id,
    setTimeout(() => {
      chipTimers.delete(id)
      if (!chips.some((chip) => chip.id === id)) return
      chips = chips.filter((chip) => chip.id !== id)
      emit()
    }, MIRROR_CHIP_LIFETIME_MS),
  )
}

function clearChipTimer(id: number): void {
  const timer = chipTimers.get(id)
  if (timer === undefined) return
  clearTimeout(timer)
  chipTimers.delete(id)
}

function clearAllChipTimers(): void {
  for (const timer of chipTimers.values()) clearTimeout(timer)
  chipTimers.clear()
}

function emit(): void {
  for (const listener of listeners) listener({ ask, chips })
}

function attach(): void {
  if (attached || typeof window === 'undefined') return
  attached = true
  // §8.2 engagement fade: the next idle dissolves chips AND an
  // unanswered ask (the setting stays unset, so the ask simply rides
  // the next drop — no dismissal debt either way).
  onEngagementChanged((engaged) => {
    if (engaged) return
    if (ask === null && chips.length === 0) return
    ask = null
    pendingAsk = []
    chips = []
    clearAllChipTimers()
    emit()
  })
  // Bulk collapse: the summary chip waits for BOTH the strip and the
  // trailing mirror queue — mirrors lag the batch by construction.
  onImportProgressChanged((state) => {
    batchActive = state !== null
    if (!batchActive) maybeEmitSummary()
  })
}

function quietNotice(message: string): void {
  if (noticeShown) return
  noticeShown = true
  // §9.2 board-notice idiom: one transient line, replace-keyed.
  window.dispatchEvent(new CustomEvent('ew-board-notice', { detail: { message } }))
}

function maybeEmitSummary(): void {
  if (batchActive || inFlight > 0) return
  if (bulkMirrored === 0 && bulkRecognized === 0) return
  const parts: string[] = []
  if (bulkMirrored > 0) {
    parts.push(`${bulkMirrored} drop${bulkMirrored === 1 ? '' : 's'} mirrored to your library`)
  }
  if (bulkRecognized > 0) parts.push(`${bulkRecognized} recognized`)
  bulkMirrored = 0
  bulkRecognized = 0
  const id = nextChipId++
  chips = [...chips, { id, kind: 'summary', message: parts.join(' · ') }]
  armChipTimer(id)
  emit()
  wake()
}

async function ensureLibraryOpen(): Promise<boolean> {
  if (libraryOpen) return true
  const appSettings = await window.ew.settings.appAll()
  const dir = appSettings['libraryProjectDir']
  if (typeof dir !== 'string' || dir.length === 0) {
    quietNotice('Drops are not mirrored — no library project is designated')
    return false
  }
  const opened = await window.ew.secondary.open('library', dir)
  if (!opened.ok) {
    quietNotice(`Library unavailable — drops are not mirrored (${opened.message})`)
    return false
  }
  libraryOpen = true
  return true
}

/** One drop through recognition-then-mirror. Runs on the serialized
 * chain, well behind the foreground drop; every failure is swallowed
 * into (at most) the session's one quiet notice. */
async function mirrorOne(drop: MirrorDrop): Promise<void> {
  const asset = await window.ew.project.query('getAsset', { assetId: drop.assetId })
  if (!asset.ok || asset.result === null) return
  const contentHash = (asset.result as { contentHash?: string }).contentHash
  if (typeof contentHash !== 'string' || contentHash.length === 0) return
  if (!(await ensureLibraryOpen())) return

  // Recognition BEFORE copy (§14.4): the library already holding the
  // bytes skips the mirror and MAY offer the library's tags. A failed
  // probe falls through to the mirror, whose own failure notices.
  const probe = await window.ew.secondary.query('library', 'hasContentHash', { contentHash })
  if (probe.ok) {
    const { present, tagNames } = probe.result as { present: boolean; tagNames: string[] }
    if (present) {
      if (drop.bulk) {
        bulkRecognized += 1
      } else {
        const id = nextChipId++
        chips = [
          ...chips,
          {
            id,
            kind: 'recognition',
            x: drop.clientX,
            y: drop.clientY,
            nodeId: drop.nodeId,
            tagNames,
          },
        ]
        armChipTimer(id)
        emit()
        wake()
      }
      return
    }
  }

  const mirrored = await window.ew.secondary.mirrorToLibrary({ contentHash })
  if (!mirrored.ok) {
    // A dead slot reopens on the next drop; §14.4 allows "queue or
    // notice" and notice is the honest v1 (ticket Design/Approach).
    if (mirrored.code === 'NO_SECONDARY' || mirrored.code === 'NO_PROJECT') libraryOpen = false
    quietNotice(`Library mirror failed — drops are not mirrored (${mirrored.message})`)
    return
  }
  if (drop.bulk) bulkMirrored += 1
}

/** Put one unit of mirror work on the serialized chain. inFlight is
 * counted from HERE — synchronously at enqueue — so a finishing
 * batch can never observe a lull between a drop's commit and its
 * mirror starting and emit a premature (or split) summary chip. */
function schedule(work: () => Promise<void>): void {
  inFlight += 1
  chain = chain
    .then(work)
    .catch(() => undefined) // never rejects, never surfaces
    .then(() => {
      inFlight -= 1
      maybeEmitSummary()
    })
}

async function route(drop: MirrorDrop): Promise<void> {
  const settings = await window.ew.project.query('getSettings')
  const mode = settings.ok
    ? (settings.result as Record<string, unknown>)['mirror_drops']
    : undefined
  if (mode === true) {
    await mirrorOne(drop)
    return
  }
  if (mode === false || !settings.ok) return
  // Unset → the once-per-project ask, anchored to this drop. The
  // import has already happened; only the MIRROR waits on the answer.
  pendingAsk.push(drop)
  if (ask === null) {
    ask = { x: drop.clientX, y: drop.clientY }
    emit()
    wake()
  }
}

/**
 * Entry point for import-surfaces: fire-and-forget, called AFTER the
 * foreground import committed its pin. Nothing here is ever awaited
 * by the drop path and nothing here ever throws out.
 */
export function queueMirrorForDrop(drop: MirrorDrop): void {
  attach()
  schedule(() => route(drop))
}

/** The two buttons. Yes mirrors the drops that triggered the ask —
 * "Also add drops to your library?" includes the drop being asked
 * about; no leaves them world-only. Either answer persists to the
 * §11.5 'mirror_drops' project setting, so the ask is once per
 * project by construction. */
export function answerMirrorAsk(yes: boolean): void {
  if (ask === null) return
  ask = null
  const parked = pendingAsk
  pendingAsk = []
  emit()
  void window.ew.settings.setProject('mirror_drops', yes)
  if (yes) for (const drop of parked) schedule(() => mirrorOne(drop))
}

/** Explicit ignore — same outcome as the engagement fade. */
export function dismissMirrorChip(id: number): void {
  if (!chips.some((chip) => chip.id === id)) return
  clearChipTimer(id)
  chips = chips.filter((chip) => chip.id !== id)
  emit()
}

/**
 * Apply the library's tags to the fresh world node: find-or-create
 * by name_key (§4.8 normalization is shared code), then ordinary
 * AssignTagToNode — plain commands through the caller's gateway, so
 * each lands in history like any user tagging act.
 */
export async function applyMirrorChipTags(
  id: number,
  execute: (commandType: string, payload: unknown) => Promise<CommandResult>,
): Promise<void> {
  const chip = chips.find((c) => c.id === id)
  if (!chip || chip.kind !== 'recognition') return
  dismissMirrorChip(id)
  const listed = await window.ew.project.query('listTags')
  const existing = listed.ok ? (listed.result as Array<{ id: string; name: string }>) : []
  for (const name of chip.tagNames) {
    const key = nameKey(name)
    let tagId = existing.find((tag) => nameKey(tag.name) === key)?.id
    if (tagId === undefined) {
      tagId = uuidv7()
      const created = await execute('CreateTag', { tagId, name })
      if (created.status !== 'committed') continue
      existing.push({ id: tagId, name })
    }
    await execute('AssignTagToNode', { tagId, nodeId: chip.nodeId })
  }
}

/** Subscribe to ask/chip state; fires immediately, returns unsub. */
export function onMirrorUiChanged(listener: UiListener): () => void {
  attach()
  listeners.add(listener)
  listener({ ask, chips })
  return () => listeners.delete(listener)
}

/** Test-only: wipe module state so unit tests stay independent. */
export function __resetMirrorForTests(): void {
  ask = null
  chips = []
  clearAllChipTimers()
  pendingAsk = []
  noticeShown = false
  libraryOpen = false
  chain = Promise.resolve()
  inFlight = 0
  bulkMirrored = 0
  bulkRecognized = 0
  batchActive = false
  listeners.clear()
}
