/**
 * The crop-editor open seam (§8.4, AI-IMP-159). A tiny, dependency-free
 * request channel so BOTH entry points — the charm-bar Crop button
 * (canvas/charms-ui.ts) and the §8.4 context-menu Crop row
 * (menus/inventory.ts, which stays a pure host/DOM-free builder) — can
 * ask the single crop-editor overlay to open, without either importing
 * the overlay's Pixi/DOM surface. The overlay (canvas/crop-editor.ts)
 * listens for this event and resolves the target from the request or,
 * when omitted, the live single selection.
 *
 * This mirrors charms-ui's requestCharmPopover, but lives in its own
 * module so the context-menu inventory can import it without pulling the
 * canvas engine into that unit-tested grammar module.
 */

export const CROP_EDITOR_EVENT = 'ew-open-crop-editor'

export interface CropEditorRequest {
  /** Placement to crop; omit to let the overlay use the single
   * selection (the context menu selects the hit item before it opens). */
  placementId?: string
}

export function requestCropEditor(placementId?: string): void {
  const detail: CropEditorRequest = placementId === undefined ? {} : { placementId }
  window.dispatchEvent(new CustomEvent<CropEditorRequest>(CROP_EDITOR_EVENT, { detail }))
}
