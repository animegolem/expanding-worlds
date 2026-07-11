/** Shared imperative seam for the placement-menu and image-charm caption verb. */
export const CAPTION_EDITOR_EVENT = 'ew-caption-editor'

export interface CaptionEditorRequest {
  placementId: string
}

export function requestCaptionEditor(placementId: string): void {
  window.dispatchEvent(
    new CustomEvent<CaptionEditorRequest>(CAPTION_EDITOR_EVENT, {
      detail: { placementId },
    }),
  )
}
