import { EW_FURNITURE_MIN_PX, type SceneItem, type ScenePlacement } from '@ew/canvas-engine'
import { describe, expect, it } from 'vitest'
import { isSelectionBelowFurnitureFloor } from './charms-ui'

/**
 * AI-IMP-192 (§8.2 shrink ladder): unit coverage for the pure
 * threshold function the charm-bar zoom-clamp uses. `charms-ui.ts`'s
 * `layout()` calls this every camera-change frame with
 * `host.controller.selectedItems()` and the live zoom; here it's
 * exercised directly against fixture placements so the floor boundary
 * itself is proven without spinning up the DOM/host machinery.
 */

let nextId = 0

/** A minimal-but-valid ScenePlacement fixture — only the fields
 * itemWorldAABB/unionBounds read matter; the rest are inert filler. */
function placement(box: { x: number; y: number; width: number; height: number }): ScenePlacement {
  nextId += 1
  return {
    itemKind: 'placement',
    id: `p${nextId}`,
    nodeId: `n${nextId}`,
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
    width: box.width,
    height: box.height,
    scale: 1,
    rotation: 0,
    flipX: 0,
    flipY: 0,
    renderOrder: 0,
    labelVisible: 0,
    locked: 0,
    appearanceKind: 'dot',
    appearanceColor: null,
    appearanceIcon: null,
    appearanceAssetId: null,
    appearanceCrop: null,
    noteTitle: null,
    noteId: null,
    childCanvasId: null,
    assetContentHash: null,
    assetMimeType: null,
    assetWidth: null,
    assetHeight: null,
  }
}

describe('isSelectionBelowFurnitureFloor (AI-IMP-192, §8.2)', () => {
  it('is false for an empty selection — there is nothing to dismiss', () => {
    expect(isSelectionBelowFurnitureFloor([], 1)).toBe(false)
    expect(isSelectionBelowFurnitureFloor([], 0.01)).toBe(false)
  })

  it('single placement: false at/above the furniture floor, true strictly below it', () => {
    const item = placement({ x: 0, y: 0, width: 100, height: 100 })
    // Rendered edge = 100 * zoom. Solve zoom so the edge lands exactly
    // on, just above, and just below EW_FURNITURE_MIN_PX.
    const atFloorZoom = EW_FURNITURE_MIN_PX / 100
    expect(isSelectionBelowFurnitureFloor([item], atFloorZoom)).toBe(false) // inclusive floor
    expect(isSelectionBelowFurnitureFloor([item], atFloorZoom * 1.5)).toBe(false) // above
    expect(isSelectionBelowFurnitureFloor([item], atFloorZoom * 0.5)).toBe(true) // below
  })

  it('uses the LONGEST edge of a non-square placement', () => {
    // 200 wide × 10 tall: at zoom where height*zoom is tiny but
    // width*zoom still clears the floor, the selection stays legible.
    const bar = placement({ x: 0, y: 0, width: 200, height: 10 })
    const zoom = (EW_FURNITURE_MIN_PX / 10) * 2 // height*zoom = 2x floor, width*zoom = 40x floor
    expect(isSelectionBelowFurnitureFloor([bar], zoom)).toBe(false)
  })

  it('multi-selection: false while the LARGEST member (its union bbox) still clears the floor', () => {
    const small = placement({ x: 0, y: 0, width: 20, height: 20 })
    const big = placement({ x: 500, y: 500, width: 400, height: 400 })
    // At this zoom the union bbox spans well past the floor even
    // though `small` alone would already be sub-floor.
    const zoom = 1
    expect(isSelectionBelowFurnitureFloor([small, big], zoom)).toBe(false)
  })

  it('multi-selection: true once the whole cluster (union bbox) is sub-floor', () => {
    const a = placement({ x: 0, y: 0, width: 20, height: 20 })
    const b = placement({ x: 30, y: 0, width: 20, height: 20 })
    // Union bbox is 50×20 world units; zoom it down past the floor.
    const zoom = (EW_FURNITURE_MIN_PX / 50) * 0.5
    expect(isSelectionBelowFurnitureFloor([a, b], zoom)).toBe(true)
  })

  it('decorations count too (unionBounds is itemKind-agnostic)', () => {
    const decoration: SceneItem = {
      itemKind: 'decoration',
      id: 'd1',
      kind: 'shape',
      data: { x: 0, y: 0, width: 6, height: 6 },
      renderOrder: 0,
      locked: 0,
      hidden: 0,
      groupId: null,
      anchorStartPlacementId: null,
      anchorEndPlacementId: null,
    }
    expect(isSelectionBelowFurnitureFloor([decoration], 1)).toBe(true) // 6px < 8px floor
    expect(isSelectionBelowFurnitureFloor([decoration], 2)).toBe(false) // 12px >= 8px floor
  })
})
