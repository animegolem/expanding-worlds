/**
 * Tile pyramid math for oversized backgrounds (§6.7/§12.2): originals
 * larger than the GPU texture cap render as a grid of tiles, with
 * power-of-two downscale levels for far zooms. Pure functions — the
 * bitmap slicing lives behind the host's TileTextureSource.
 * World units equal full-resolution image pixels, so a tile's dest
 * rect is its source rect regardless of level.
 */

export const TILE_SIZE = 2048

export interface TileAddress {
  level: number
  /** Source rect in FULL-RESOLUTION image pixels (== world dest rect). */
  sx: number
  sy: number
  sw: number
  sh: number
}

/** Coarsest useful level: the whole image fits in a handful of tiles. */
export function maxLevel(imageWidth: number, imageHeight: number, tileSize = TILE_SIZE): number {
  const largest = Math.max(imageWidth, imageHeight)
  if (largest <= tileSize) return 0
  return Math.ceil(Math.log2(largest / tileSize))
}

/**
 * Level whose texel density best matches the zoom: at zoom 1 the full
 * resolution (level 0) is needed; each halving of zoom tolerates one
 * more downscale level without visible softening.
 */
export function levelForZoom(zoom: number, top: number): number {
  if (zoom >= 1) return 0
  const wanted = Math.floor(Math.log2(1 / zoom))
  return Math.max(0, Math.min(top, wanted))
}

/**
 * Tile grid for one level. Tiles cover `tileSize × 2^level` image
 * pixels each, so every level's slices upload at ≤ tileSize texels.
 */
export function planLevelTiles(
  imageWidth: number,
  imageHeight: number,
  level: number,
  tileSize = TILE_SIZE,
): TileAddress[] {
  const span = tileSize * 2 ** level
  const tiles: TileAddress[] = []
  for (let sy = 0; sy < imageHeight; sy += span) {
    for (let sx = 0; sx < imageWidth; sx += span) {
      tiles.push({
        level,
        sx,
        sy,
        sw: Math.min(span, imageWidth - sx),
        sh: Math.min(span, imageHeight - sy),
      })
    }
  }
  return tiles
}

export interface WorldRect {
  x: number
  y: number
  width: number
  height: number
}

/** Tile-vs-view intersection in world (= image pixel) space. */
export function tileVisible(tile: TileAddress, view: WorldRect): boolean {
  return (
    tile.sx < view.x + view.width &&
    view.x < tile.sx + tile.sw &&
    tile.sy < view.y + view.height &&
    view.y < tile.sy + tile.sh
  )
}

/**
 * Host-provided bitmap slicer: the renderer decodes the original once
 * (ImageBitmap survives beyond the GPU cap) and serves per-tile
 * textures downscaled by 2^level. Injectable so the tiled path tests
 * without a browser decoder.
 */
export interface TileTextureSource {
  readonly width: number
  readonly height: number
  texture(tile: TileAddress): Promise<unknown>
  destroy(): void
}
