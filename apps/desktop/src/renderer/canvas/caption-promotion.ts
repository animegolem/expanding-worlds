import type { CommandResult } from '@ew/commands'
import { runAsUndoGroup } from '../undo/undo-store'

const PROMOTE_CAPTION_EVENT = 'ew-promote-caption'

export interface PromoteCaptionRequest {
  placementId: string
}

export function requestCaptionPromotion(placementId: string): void {
  window.dispatchEvent(
    new CustomEvent<PromoteCaptionRequest>(PROMOTE_CAPTION_EVENT, {
      detail: { placementId },
    }),
  )
}

export function onCaptionPromotion(listener: (request: PromoteCaptionRequest) => void): () => void {
  const handler = (event: Event): void => {
    const detail = (event as CustomEvent<PromoteCaptionRequest>).detail
    if (detail?.placementId) listener(detail)
  }
  window.addEventListener(PROMOTE_CAPTION_EVENT, handler)
  return () => window.removeEventListener(PROMOTE_CAPTION_EVENT, handler)
}

export type PromotionRoute = 'title' | 'body'

export interface PromotionInput {
  placementId: string
  nodeId: string
  noteId: string
  caption: string
  route: PromotionRoute
  bodyTitle?: string
}

export type PromotionOutcome =
  | { status: 'committed' }
  | { status: 'create-refused'; result: CommandResult }
  | { status: 'clear-refused'; result: CommandResult }

type Execute = (commandType: string, payload: unknown) => Promise<CommandResult>
type Group = <T>(run: () => Promise<T>) => Promise<T>

/** Run the two fail-stop commands inside one capture window. */
export async function commitCaptionPromotion(
  execute: Execute,
  input: PromotionInput,
  group: Group = runAsUndoGroup,
): Promise<PromotionOutcome> {
  let outcome: PromotionOutcome | null = null
  await group(async () => {
    const title = input.route === 'title' ? input.caption : (input.bodyTitle ?? '').trim()
    const created = await execute('CreateNoteAndAttach', {
      nodeId: input.nodeId,
      noteId: input.noteId,
      title,
      ...(input.route === 'body' ? { body: input.caption } : {}),
    })
    if (created.status !== 'committed') {
      outcome = { status: 'create-refused', result: created }
      return
    }

    const cleared = await execute('SetPlacementCaption', {
      placementId: input.placementId,
      caption: null,
    })
    outcome =
      cleared.status === 'committed'
        ? { status: 'committed' }
        : { status: 'clear-refused', result: cleared }
  })
  if (outcome === null) throw new Error('caption promotion group completed without an outcome')
  return outcome
}
