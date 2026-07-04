import type { Scene, SceneDecoration, SceneImage, ScenePin, TileSpec } from './adapter'
import { hashString, mulberry32, float, int, pick, type Rng } from './prng'

/**
 * Seeded scene fixtures per RFC-0001 §12.3. Same seed → identical
 * scenes; checksum() proves it in the smoke test.
 */

export const WORLD = { w: 20000, h: 12000 } as const
export const VIEW = { w: 1280, h: 800 } as const

const COLORS = ['#e63946', '#f1a208', '#2a9d8f', '#457b9d', '#8338ec', '#ff006e'] as const

function makeImages(rng: Rng, count: number, prefix: string): SceneImage[] {
  const out: SceneImage[] = []
  for (let i = 0; i < count; i++) {
    const w = int(rng, 120, 480)
    out.push({
      id: `${prefix}-img-${i}`,
      x: float(rng, 0, WORLD.w),
      y: float(rng, 0, WORLD.h),
      w,
      h: Math.round(w * float(rng, 0.6, 1.4)),
      rotation: float(rng, -0.4, 0.4),
      textureId: `${prefix}-tex-${i % 60}`,
      label: i % 3 === 0 ? `Image ${i}` : undefined,
    })
  }
  return out
}

function makePins(rng: Rng, count: number, prefix: string): ScenePin[] {
  const out: ScenePin[] = []
  for (let i = 0; i < count; i++) {
    out.push({
      id: `${prefix}-pin-${i}`,
      x: float(rng, 0, WORLD.w),
      y: float(rng, 0, WORLD.h),
      r: int(rng, 6, 14),
      color: pick(rng, COLORS),
      label: `Pin ${i}`,
    })
  }
  return out
}

function makeDecorations(rng: Rng, count: number, prefix: string, anchorIds: string[]): SceneDecoration[] {
  const out: SceneDecoration[] = []
  for (let i = 0; i < count; i++) {
    const id = `${prefix}-dec-${i}`
    const x = float(rng, 0, WORLD.w)
    const y = float(rng, 0, WORLD.h)
    const kind = i % 7
    if (kind === 0) out.push({ id, kind: 'text', x, y, text: `note ${i}`, size: int(rng, 14, 32) })
    else if (kind === 1) out.push({ id, kind: 'rect', x, y, w: float(rng, 60, 400), h: float(rng, 60, 300), stroke: pick(rng, COLORS), fill: 'rgba(255,255,255,0.08)' })
    else if (kind === 2) out.push({ id, kind: 'ellipse', x, y, w: float(rng, 60, 300), h: float(rng, 60, 300), stroke: pick(rng, COLORS) })
    else if (kind === 3) out.push({ id, kind: 'line', x1: x, y1: y, x2: x + float(rng, -400, 400), y2: y + float(rng, -400, 400), stroke: pick(rng, COLORS) })
    else if (kind === 4) out.push({ id, kind: 'arrow', x1: x, y1: y, x2: x + float(rng, -400, 400), y2: y + float(rng, -400, 400), stroke: pick(rng, COLORS) })
    else if (kind === 5) {
      const points: number[] = []
      let px = x
      let py = y
      for (let p = 0; p < int(rng, 12, 40); p++) {
        px += float(rng, -30, 30)
        py += float(rng, -30, 30)
        points.push(px, py)
      }
      out.push({ id, kind: 'freehand', points, stroke: pick(rng, COLORS) })
    } else if (anchorIds.length >= 2) {
      out.push({ id, kind: 'connector', fromId: pick(rng, anchorIds), toId: pick(rng, anchorIds), stroke: pick(rng, COLORS) })
    }
  }
  return out
}

function makeTiles(): TileSpec {
  const tileSize = 512
  const levels = [1, 2, 4, 8].map((scale) => ({
    scale,
    cols: Math.ceil(WORLD.w / (tileSize * scale)),
    rows: Math.ceil(WORLD.h / (tileSize * scale)),
  }))
  return { worldW: WORLD.w, worldH: WORLD.h, tileSize, levels }
}

export type SceneKey = 'map' | 'images300' | 'pins1000' | 'mixed' | 'secondary'

export function buildScenes(seed: number): Record<SceneKey, Scene> {
  const base = { decorations: [] as SceneDecoration[], labelsVisible: true }
  const mapRng = mulberry32(seed ^ hashString('map'))
  const map: Scene = {
    id: 'map',
    ...base,
    images: makeImages(mapRng, 40, 'map'),
    pins: makePins(mapRng, 200, 'map'),
    tiles: makeTiles(),
  }

  const imgRng = mulberry32(seed ^ hashString('images300'))
  const images300: Scene = {
    id: 'images300',
    ...base,
    images: makeImages(imgRng, 300, 'i300'),
    pins: [],
  }

  const pinRng = mulberry32(seed ^ hashString('pins1000'))
  const pins1000: Scene = {
    id: 'pins1000',
    ...base,
    images: [],
    pins: makePins(pinRng, 1000, 'p1k'),
  }

  const mixRng = mulberry32(seed ^ hashString('mixed'))
  const mixImages = makeImages(mixRng, 80, 'mix')
  const mixPins = makePins(mixRng, 150, 'mix')
  const anchors = [...mixImages.map((i) => i.id), ...mixPins.map((p) => p.id)]
  const mixed: Scene = {
    id: 'mixed',
    images: mixImages,
    pins: mixPins,
    decorations: makeDecorations(mixRng, 300, 'mix', anchors),
    labelsVisible: true,
  }

  const secRng = mulberry32(seed ^ hashString('secondary'))
  const secondary: Scene = {
    id: 'secondary',
    ...base,
    images: makeImages(secRng, 60, 'sec'),
    pins: makePins(secRng, 100, 'sec'),
  }

  return { map, images300, pins1000, mixed, secondary }
}

/** Stable FNV-1a checksum over the structural JSON of all scenes. */
export function scenesChecksum(scenes: Record<SceneKey, Scene>): string {
  const json = JSON.stringify(scenes, (_k, v: unknown) =>
    typeof v === 'number' ? Math.round((v as number) * 1e6) / 1e6 : v,
  )
  return hashString(json).toString(16)
}
