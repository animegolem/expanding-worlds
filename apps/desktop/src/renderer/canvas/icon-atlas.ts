/**
 * §8.2 node object-icon atlas loader (AI-IMP-132). Turns the baked
 * atlas (scripts/bake-icon-atlas.mjs → icon-atlas.generated.ts) into
 * the IconAtlasResource the canvas engine consumes. This is the host
 * side of the seam: canvas-engine never decodes assets or reads CSS,
 * so texture decoding AND the sub-threshold dot-colour token
 * resolution both live here.
 *
 * Every icon frame is a view onto ONE shared texture source, so the
 * thousands of icon sprites the §12.1 perf suite seeds all draw in a
 * single batch. The atlas is loaded OUTSIDE the §12.2 texture budget
 * (it is chrome-scale UI art, not a managed board asset), so it never
 * appears in textureStats() — the perf suite's residency assertions
 * stay exact.
 */
import { Rectangle, Texture } from 'pixi.js'
import type { IconAtlasResource } from '@ew/canvas-engine'
import { cssColorToNumber } from '@ew/canvas-engine'
import { themeTokenValue } from '../theme'
import {
  ICON_ATLAS_FRAMES,
  ICON_ATLAS_PNG_DATA_URL,
  ICON_ATLAS_TIERS,
  ICON_DOT_TOKENS,
  ICON_IDS,
} from './icon-atlas.generated'

export async function loadIconAtlas(): Promise<IconAtlasResource> {
  const response = await fetch(ICON_ATLAS_PNG_DATA_URL)
  const bitmap = await createImageBitmap(await response.blob())
  const base = Texture.from(bitmap)

  // One frame texture per icon per tier, index-aligned with the tiers
  // array; all share base.source so tier swaps never break batching.
  const framesByIcon = new Map<string, Texture[]>()
  for (const id of ICON_IDS) {
    framesByIcon.set(
      id,
      ICON_ATLAS_TIERS.map((tier) => {
        const f = ICON_ATLAS_FRAMES[id]![String(tier)]!
        return new Texture({ source: base.source, frame: new Rectangle(f.x, f.y, f.w, f.h) })
      }),
    )
  }

  // Sub-threshold dot colour, resolved from each icon's fixed token
  // (node-dot tokens are theme-independent, so resolving once is safe).
  const dotColors = new Map<string, number>()
  for (const id of ICON_IDS) {
    dotColors.set(id, cssColorToNumber(themeTokenValue(ICON_DOT_TOKENS[id]!)))
  }

  return {
    tiers: ICON_ATLAS_TIERS,
    frames: (iconId: string) => framesByIcon.get(iconId) ?? null,
    dotColor: (iconId: string) => dotColors.get(iconId) ?? cssColorToNumber(null),
  }
}
