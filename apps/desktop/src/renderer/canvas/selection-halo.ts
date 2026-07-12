import type { PlacementRect } from '../chrome/anchored-placement'

const HALO_PAD = 12
const FALLBACK_CHARM_HEIGHT = 32
let provider: (() => PlacementRect | null) | null = null

/** RFC §8.8.4: selection furniture expands only the card's bottom edge. */
export function selectionHaloRect(
  card: PlacementRect,
  measuredCharmHeight = FALLBACK_CHARM_HEIGHT,
): PlacementRect {
  const charmHeight = Number.isFinite(measuredCharmHeight)
    ? Math.max(0, measuredCharmHeight)
    : FALLBACK_CHARM_HEIGHT
  return {
    x: card.x - HALO_PAD,
    y: card.y - HALO_PAD,
    width: Math.max(0, card.width) + HALO_PAD * 2,
    height: Math.max(0, card.height) + HALO_PAD * 2 + charmHeight,
  }
}

export function registerSelectionHaloProvider(next: () => PlacementRect | null): () => void {
  provider = next
  return () => {
    if (provider === next) provider = null
  }
}

export function currentSelectionHalo(): PlacementRect | null {
  return provider?.() ?? null
}
