/**
 * First-run walkthrough state + lifecycle (AI-IMP-145).
 *
 * The guide is a takeover-family overlay shown EXACTLY ONCE on the
 * true first open. "Seen" and the optional workflow pick ride app-tier
 * settings (they follow the application, not any project — §11.5), so
 * a fresh profile shows the guide and every later launch never does.
 * Both skipping and finishing mark it seen; the Settings "replay"
 * action re-opens it on demand without clearing the seen flag.
 *
 * Finishing with `start ›` lands the user INSIDE the seeded example:
 * the guide ensures the example library exists (the same create seam
 * the gallery's create-new path uses) and opens the gallery straight
 * into the everything scope where that library lives (screen 20 —
 * "the library opens pre-arranged").
 */
import { openTakeover, registerInputBlocker } from './takeover'

/** App-tier setting keys (flat app-settings.json, no migration). */
export const FIRST_RUN_SEEN_KEY = 'firstRunSeen'
export const FIRST_RUN_PICK_KEY = 'firstRunPick'

type Listener = (visible: boolean) => void

let visible = false
const listeners = new Set<Listener>()

// PR #14 review (P2): the guide is takeover-FAMILY — board input
// (delete, undo, quick-open, tool keys) must not act underneath it.
// Registering its visibility folds it into takeoverActive(), the one
// predicate every board seam already guards on.
registerInputBlocker(() => visible)

function notify(): void {
  for (const listener of listeners) listener(visible)
}

/** Subscribe to guide visibility; fires immediately with the current
 * state and returns an unsubscribe. */
export function onFirstRunChanged(listener: Listener): () => void {
  listeners.add(listener)
  listener(visible)
  return () => listeners.delete(listener)
}

export function isFirstRunVisible(): boolean {
  return visible
}

/** Show the guide (boot detection and the Settings replay action). */
export function showFirstRun(): void {
  if (visible) return
  visible = true
  notify()
}

function hideFirstRun(): void {
  if (!visible) return
  visible = false
  notify()
}

/** True on a genuine first open: the app-tier seen flag is unset.
 * Defensive under vitest/jsdom where the bridge may be absent. */
export async function shouldShowFirstRun(): Promise<boolean> {
  try {
    const settings = await window.ew.settings.appAll()
    return settings[FIRST_RUN_SEEN_KEY] !== true
  } catch {
    return false
  }
}

async function markSeen(pick: string | null): Promise<void> {
  try {
    await window.ew.settings.setApp(FIRST_RUN_SEEN_KEY, true)
    if (pick !== null) await window.ew.settings.setApp(FIRST_RUN_PICK_KEY, pick)
  } catch {
    // A failed write leaves the guide able to reappear next launch —
    // preferable to a hard failure that eats the user's dismissal.
  }
}

// ---- gallery entry one-shot ------------------------------------------
// `start ›` wants the gallery to open at the EVERYTHING scope (where
// the seeded library lives) rather than its default this-world. A
// module one-shot carries that request to GalleryView, which consumes
// it once on mount. Deliberately narrow: the guide is its only writer.
let pendingGalleryEverything = false

/** GalleryView reads this once on mount; returns and clears the flag. */
export function consumeGalleryEverythingRequest(): boolean {
  const pending = pendingGalleryEverything
  pendingGalleryEverything = false
  return pending
}

/** Ensure the seeded example library exists, mirroring the gallery's
 * create-new path (GalleryView.createLibrary): create + seed into the
 * writable library slot, release it, then designate. Idempotent — a
 * library already designated is left untouched. Best-effort: a failed
 * seed still ends the guide; the gallery falls back to its ordinary
 * create/designate prompt. */
async function ensureExampleLibrary(): Promise<void> {
  try {
    const settings = await window.ew.settings.appAll()
    const existing = settings['libraryProjectDir']
    if (typeof existing === 'string' && existing.length > 0) return
    const dir = await window.ew.secondary.defaultLibraryDir()
    const created = await window.ew.secondary.open('library', dir, {
      createIfMissing: true,
      title: 'Library',
    })
    if (!created.ok) return
    await window.ew.secondary.close('library')
    await window.ew.settings.setApp('libraryProjectDir', dir)
  } catch {
    // Best-effort — see the doc comment above.
  }
}

/** `skip`: mark seen and dismiss, leaving the user on their board. */
export async function skipFirstRun(): Promise<void> {
  await markSeen(null)
  hideFirstRun()
}

/** `start ›`: mark seen (storing the optional pick), dismiss, and land
 * inside the seeded example — the gallery, opened at everything scope
 * on the freshly-seeded library. */
export async function startFirstRun(pick: string | null): Promise<void> {
  await markSeen(pick)
  hideFirstRun()
  await ensureExampleLibrary()
  pendingGalleryEverything = true
  openTakeover('gallery')
}
