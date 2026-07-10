import type { SceneDecoration, SceneItem, ScenePlacement } from '@ew/canvas-engine'
import { assetSizeFor } from './textures'
import { mulberry32 } from './prng'

/**
 * Synthetic board (§ AI-IMP-217): N image placements on a jittered grid
 * plus a scatter of decorations (shapes, lines, text) and per-image
 * labels — the same item families the real projection feeds SceneSync,
 * so every built-in renderer's create/update path runs. No gateway, no
 * persistence: this is the ENGINE path only.
 */

export interface BuiltScene {
  items: SceneItem[]
  /** World-space bounds of all content — the sweep pans/zooms across it. */
  bounds: { x: number; y: number; width: number; height: number }
}

const CELL = 520 // world units between grid cells
const IMG_DISPLAY = 320 // nominal display width in world units

function placement(
  index: number,
  x: number,
  y: number,
  rnd: () => number,
): ScenePlacement {
  const hash = `hash-${index}`
  const native = assetSizeFor(hash)
  const aspect = native.height / native.width
  const width = IMG_DISPLAY * (0.7 + rnd() * 0.6)
  const height = width * aspect
  return {
    itemKind: 'placement',
    id: `p-${index}`,
    nodeId: `n-${index}`,
    x,
    y,
    width,
    height,
    scale: 1,
    rotation: (rnd() - 0.5) * 0.08, // slight tilt exercises oriented AABBs
    flipX: 0,
    flipY: 0,
    renderOrder: index,
    labelVisible: 1,
    locked: 0,
    appearanceKind: 'image',
    appearanceColor: null,
    appearanceIcon: null,
    appearanceAssetId: `a-${index}`,
    appearanceCrop: null,
    noteTitle: `Reference ${index + 1}`,
    noteId: `note-${index}`,
    childCanvasId: null,
    assetContentHash: hash,
    assetMimeType: 'image/png',
    assetWidth: native.width,
    assetHeight: native.height,
  }
}

function shapeDecoration(id: number, x: number, y: number, rnd: () => number): SceneDecoration {
  const kinds = ['rect', 'ellipse', 'triangle'] as const
  return {
    itemKind: 'decoration',
    id: `d-shape-${id}`,
    kind: 'shape',
    data: {
      shape: kinds[Math.floor(rnd() * kinds.length)]!,
      x,
      y,
      width: 180 + rnd() * 220,
      height: 140 + rnd() * 200,
      stroke: `hsl(${Math.floor(rnd() * 360)} 70% 60%)`,
      strokeWidth: 3,
      fill: rnd() > 0.5 ? `hsla(${Math.floor(rnd() * 360)} 60% 50% / 0.18)` : undefined,
      cornerRadius: rnd() > 0.5 ? 0.3 : 0,
    },
    renderOrder: 100000 + id,
    locked: 0,
    hidden: 0,
    groupId: null,
    anchorStartPlacementId: null,
    anchorEndPlacementId: null,
  }
}

function lineDecoration(id: number, x: number, y: number, rnd: () => number): SceneDecoration {
  return {
    itemKind: 'decoration',
    id: `d-line-${id}`,
    kind: rnd() > 0.5 ? 'arrow' : 'line',
    data: {
      x1: x,
      y1: y,
      x2: x + (rnd() - 0.5) * 700,
      y2: y + (rnd() - 0.5) * 700,
      stroke: `hsl(${Math.floor(rnd() * 360)} 65% 62%)`,
      strokeWidth: 4,
    },
    renderOrder: 200000 + id,
    locked: 0,
    hidden: 0,
    groupId: null,
    anchorStartPlacementId: null,
    anchorEndPlacementId: null,
  }
}

function textDecoration(id: number, x: number, y: number, rnd: () => number): SceneDecoration {
  return {
    itemKind: 'decoration',
    id: `d-text-${id}`,
    kind: 'text',
    data: {
      x,
      y,
      text: ['MOODBOARD', 'act ii', 'colour keys', 'silhouettes', 'ref only'][id % 5]!,
      fontSize: 48 + rnd() * 40,
      color: '#e6e8ea',
      bold: rnd() > 0.5,
    },
    renderOrder: 300000 + id,
    locked: 0,
    hidden: 0,
    groupId: null,
    anchorStartPlacementId: null,
    anchorEndPlacementId: null,
  }
}

export function buildScene(count: number): BuiltScene {
  const rnd = mulberry32(0x5eed)
  const cols = Math.ceil(Math.sqrt(count))
  const items: SceneItem[] = []
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (let i = 0; i < count; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = col * CELL + (rnd() - 0.5) * 160
    const y = row * CELL + (rnd() - 0.5) * 160
    const p = placement(i, x, y, rnd)
    items.push(p)
    minX = Math.min(minX, x - p.width! / 2)
    minY = Math.min(minY, y - p.height! / 2)
    maxX = Math.max(maxX, x + p.width! / 2)
    maxY = Math.max(maxY, y + p.height! / 2)
  }

  // Scatter decorations across the same field — ~15% shapes, plus a
  // handful of lines and text labels, so all decoration renderers run.
  const decoCount = Math.max(6, Math.round(count * 0.15))
  for (let i = 0; i < decoCount; i++) {
    const x = minX + rnd() * (maxX - minX)
    const y = minY + rnd() * (maxY - minY)
    const roll = rnd()
    if (roll < 0.5) items.push(shapeDecoration(i, x, y, rnd))
    else if (roll < 0.8) items.push(lineDecoration(i, x, y, rnd))
    else items.push(textDecoration(i, x, y, rnd))
  }

  return {
    items,
    bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
  }
}
