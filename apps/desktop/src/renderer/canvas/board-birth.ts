import type { CommandResult } from '@ew/commands'
import { titleKey } from '@ew/domain'

export interface TrashedBoardOwner {
  nodeId: string
  canvasId: string
}

/** Preserve the handler's narrow AI-IMP-309 classification as typed UI data. */
export function trashedBoardOwner(result: CommandResult): TrashedBoardOwner | null {
  if (result.status !== 'error' || result.code !== 'NOTE_TITLE_CONFLICT') return null
  const candidate = result.details?.['trashedBoardOwner']
  if (typeof candidate !== 'object' || candidate === null) return null
  const row = candidate as Record<string, unknown>
  return typeof row['nodeId'] === 'string' && typeof row['canvasId'] === 'string'
    ? { nodeId: row['nodeId'], canvasId: row['canvasId'] }
    : null
}

/** First free, space-separated collision suffix: X 2, X 3, … */
export function nextBoardTitleVariant(
  requestedTitle: string,
  occupiedTitleKeys: Iterable<string>,
): string {
  const occupied = new Set([...occupiedTitleKeys].map((key) => titleKey(key)))
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${requestedTitle} ${suffix}`
    if (!occupied.has(titleKey(candidate))) return candidate
  }
}
