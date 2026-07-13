import { isFurnitureVisible, unionBounds, type SceneItem } from '@ew/canvas-engine'

/** Pure shrink-ladder predicate kept outside the imperative charm module
 * so geometry tests do not load Svelte-mounted panel components. */
export function isSelectionBelowFurnitureFloor(
  selectedItems: readonly SceneItem[],
  zoom: number,
): boolean {
  const bounds = unionBounds(selectedItems)
  if (!bounds) return false
  return !isFurnitureVisible(Math.max(bounds.width, bounds.height) * zoom)
}
