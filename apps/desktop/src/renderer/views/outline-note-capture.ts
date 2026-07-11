import type { CommandResult } from '@ew/commands'

export interface OutlineTitleConflict {
  flow: 'promotion'
  requestedTitle: string
  existingNoteId: string
  conflictingLifecycle: 'active' | 'trashed'
}

export interface OutlineNoteCaptureInput {
  nodeId: string
  noteId: string
  title: string
}

export type OutlineNoteCaptureOutcome =
  | { status: 'committed'; noteId: string }
  | { status: 'conflict'; conflict: OutlineTitleConflict }
  | { status: 'refused'; result: CommandResult }

type Execute = (commandType: string, payload: unknown) => Promise<CommandResult>

/**
 * Commit the preview's editable-empty register. The gesture is exactly one
 * shipped CreateNoteAndAttach command; conflict recovery stays outside this
 * helper so the component can keep its draft mounted while the user decides.
 */
export async function captureOutlineNote(
  execute: Execute,
  input: OutlineNoteCaptureInput,
): Promise<OutlineNoteCaptureOutcome> {
  const title = input.title.trim()
  const result = await execute('CreateNoteAndAttach', {
    nodeId: input.nodeId,
    noteId: input.noteId,
    title,
  })
  if (result.status === 'committed') return { status: 'committed', noteId: input.noteId }
  if (result.status !== 'error' || result.code !== 'NOTE_TITLE_CONFLICT') {
    return { status: 'refused', result }
  }
  const details = result.details ?? {}
  return {
    status: 'conflict',
    conflict: {
      // Capture follows the promotion-shaped conflict grammar: opening or
      // restoring the collision can never silently replace the typed draft.
      flow: 'promotion',
      requestedTitle: title,
      existingNoteId: String(details['existingNoteId'] ?? ''),
      conflictingLifecycle: details['conflictingLifecycle'] === 'trashed' ? 'trashed' : 'active',
    },
  }
}
