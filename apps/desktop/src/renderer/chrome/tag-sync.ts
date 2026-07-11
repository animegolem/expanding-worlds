import { toast } from './status'

export interface TagSyncPullDeps {
  pull: () => Promise<
    | { ok: true; added: number; skipped?: string }
    | { ok: false; code: string; message: string }
  >
  notice: (message: string) => void
}

const defaultDeps: TagSyncPullDeps = {
  pull: () => window.ew.tagSync.pull(),
  notice: (message) => void toast(message, { surface: 'board-notice' }),
}

/** Project-open settle. Every skip/failure stays silent; only a successful
 * inbound delta gets one aggregate notice. */
export async function pullTagsFromLibrary(deps: TagSyncPullDeps = defaultDeps): Promise<void> {
  try {
    const result = await deps.pull()
    if (!result.ok || result.added === 0) return
    deps.notice(`${result.added} tag${result.added === 1 ? '' : 's'} arrived from the library`)
  } catch {
    // Additive convergence retries at the next settle; open remains calm.
  }
}

/** Compatibility name used by the focused seam tests. */
export const pullLibraryTags = pullTagsFromLibrary
