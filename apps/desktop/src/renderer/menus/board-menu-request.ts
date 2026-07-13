/**
 * The board menu has one renderer-owned instance and three doors.
 * Chrome cannot import the imperative canvas menu without creating an
 * ownership cycle, so the crumb asks through this tiny typed event seam.
 */
export const OPEN_BOARD_MENU_EVENT = 'ew-open-board-menu'

export interface BoardMenuRequest {
  clientX: number
  clientY: number
}

export function requestBoardMenu(at: BoardMenuRequest): void {
  window.dispatchEvent(new CustomEvent<BoardMenuRequest>(OPEN_BOARD_MENU_EVENT, { detail: at }))
}
