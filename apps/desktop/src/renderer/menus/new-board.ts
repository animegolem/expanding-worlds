/**
 * New-board request seam (RFC §8.4, AI-IMP-239). The empty-board
 * context menu is plain DOM (ContextMenu.ts); the naming prompt is the
 * Svelte command palette (NewBoardPalette.svelte). This dependency-free
 * window event bridges the two, mirroring open-note.ts's request events:
 * the menu asks with the WORLD position the board-object should land at,
 * and CanvasHost.svelte mounts the palette in response.
 */

const NEW_BOARD_EVENT = 'ew-new-board'

/** World coordinates where the new board's placement is seeded. */
export interface NewBoardAt {
  x: number
  y: number
}

/** Menu → CanvasHost: open the New board palette, seeding at `at`. */
export function requestNewBoard(at: NewBoardAt): void {
  window.dispatchEvent(new CustomEvent<NewBoardAt>(NEW_BOARD_EVENT, { detail: at }))
}

export function onNewBoard(listener: (at: NewBoardAt) => void): () => void {
  const handler = (event: Event): void => {
    const detail = (event as CustomEvent<NewBoardAt>).detail
    if (detail && typeof detail.x === 'number' && typeof detail.y === 'number') listener(detail)
  }
  window.addEventListener(NEW_BOARD_EVENT, handler)
  return () => window.removeEventListener(NEW_BOARD_EVENT, handler)
}
