/**
 * Shared "assign a tag at the moment of arranging" logic (RFC §4.8
 * rev 0.45, AI-IMP-108). The find-or-create + assign gesture and the
 * completion filter live here ONCE so the two surfaces that carry the
 * add-field — the `#` charm popover (§8.4) and the note panel's chip
 * row (§8.5) — behave identically.
 *
 * Merge is by name_key (§4.8): an existing name resolves to its tag id
 * and only a genuinely new name creates. A TAG_NAME_CONFLICT race (a
 * concurrent create, or a draft/assignment-less tag absent from the
 * caller's vocabulary) recovers the real id from `details.existingTagId`,
 * and AssignTagToNode's TAG_ALREADY_ASSIGNED is a benign no-op. The
 * gallery action bar (§14.4) keeps its own copy this ticket: its
 * bulk-over-many-nodes accounting and toast wording differ enough that
 * folding it in would not be mechanical.
 *
 * Completion is the TagPanel idiom: a custom prefix-filtered list,
 * NEVER a <datalist> — the native popup segfaults Electron's hidden
 * e2e windows (AI-IMP-069).
 */
import { nameKey, uuidv7 } from '@ew/domain'
import type { CommandResult } from '@ew/commands'
import type { CommandExecutionOptions } from '@ew/canvas-engine'

export interface TagOption {
  id: string
  name: string
}

/** The single command door each surface already owns (charm gateway /
 * note project port), narrowed to what this module issues. */
export type ExecuteCommand = (
  commandType: string,
  payload: unknown,
  options?: CommandExecutionOptions,
) => Promise<CommandResult>

export type AssignOutcome =
  | { status: 'assigned'; tagId: string; label: string }
  | { status: 'already'; tagId: string; label: string }
  | { status: 'error'; message: string }

/**
 * Prefix-filter the vocabulary for the completion list. Case-insensitive
 * startsWith, the exact current text dropped (nothing completes to
 * itself), capped so the popover stays small.
 */
export function filterTagCompletions<T extends TagOption>(
  allTags: readonly T[],
  needle: string,
  limit = 8,
): T[] {
  const lower = needle.trim().toLowerCase()
  return allTags
    .filter((tag) => tag.name.toLowerCase().startsWith(lower) && tag.name !== needle)
    .slice(0, limit)
}

/** Resolve the typed name to a tag id, merging by name_key (§4.8). */
async function resolveTagId(
  execute: ExecuteCommand,
  name: string,
  allTags: readonly TagOption[],
): Promise<{ id: string; label: string } | null> {
  const key = nameKey(name)
  const existing = allTags.find((tag) => nameKey(tag.name) === key)
  if (existing) return { id: existing.id, label: existing.name }
  const tagId = uuidv7()
  const created = await execute('CreateTag', { tagId, name })
  if (created.status === 'committed') return { id: tagId, label: name }
  // Race, or a draft (assignment-less) tag absent from the caller's
  // vocabulary: the conflict names the existing id (§4.8).
  if (created.status === 'error' && created.code === 'TAG_NAME_CONFLICT') {
    const existingTagId = created.details?.['existingTagId']
    if (typeof existingTagId === 'string') return { id: existingTagId, label: name }
  }
  return null
}

/**
 * Find-or-create the named tag and assign it to the node in one
 * gesture (CreateTag then AssignTagToNode). TAG_ALREADY_ASSIGNED is a
 * benign no-op reported as 'already'; every other non-committed result
 * is an 'error' the surface can surface however it likes.
 */
export async function assignTagByName(
  execute: ExecuteCommand,
  nodeId: string,
  name: string,
  allTags: readonly TagOption[],
): Promise<AssignOutcome> {
  const trimmed = name.trim()
  if (trimmed.length === 0) return { status: 'error', message: 'a tag needs a name' }
  const tag = await resolveTagId(execute, trimmed, allTags)
  if (!tag) return { status: 'error', message: `Tag "${trimmed}" could not be created` }
  const result = await execute('AssignTagToNode', { tagId: tag.id, nodeId })
  if (result.status === 'committed') return { status: 'assigned', tagId: tag.id, label: tag.label }
  if (result.status === 'error' && result.code === 'TAG_ALREADY_ASSIGNED')
    return { status: 'already', tagId: tag.id, label: tag.label }
  const message =
    result.status === 'error' ? result.message : 'the project changed underneath (retry)'
  return { status: 'error', message }
}
