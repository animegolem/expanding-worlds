#!/usr/bin/env node
/**
 * Generates the placeholder seed-image set for the first-open library
 * example (RFC-0001 §14.4, AI-IMP-094). These are PROGRAMMATIC
 * stand-ins — distinct gradient/pattern compositions, one visual
 * family per fictional artist — committed as output so the build
 * never depends on this script. They are queued to be replaced by a
 * curated public-domain set (see resources/seed/LICENSE.md).
 *
 * Plain-node PNG encoder: RGB8, filter 0 rows, zlib IDAT. No deps.
 *
 *   node scripts/generate-seed.mjs
 */
import { Buffer } from 'node:buffer'
import console from 'node:console'
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SIZE = 384
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps/desktop/resources/seed')

// ---------------------------------------------------------- png bits

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})

function crc32(bytes) {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

/** paint(x, y) -> [r, g, b] over a SIZE×SIZE canvas. */
function encodePng(paint) {
  const raw = Buffer.alloc(SIZE * (1 + SIZE * 3))
  for (let y = 0; y < SIZE; y++) {
    const row = y * (1 + SIZE * 3)
    raw[row] = 0 // filter: none
    for (let x = 0; x < SIZE; x++) {
      const [r, g, b] = paint(x, y)
      const at = row + 1 + x * 3
      raw[at] = clamp(r)
      raw[at + 1] = clamp(g)
      raw[at + 2] = clamp(b)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(SIZE, 0)
  ihdr.writeUInt32BE(SIZE, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type: truecolor RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)))
const lerp = (a, b, t) => a + (b - a) * t
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)]

// ------------------------------------------------------ compositions
// Three fictional artists, one visual family each; every image is a
// distinct palette + construction so thumbnails read apart at 168px.

const N = SIZE - 1

const IMAGES = [
  // Aster Vale — atmospheric vertical gradients.
  ['01-aster-vale-dawn.png', (x, y) => mix([252, 210, 153], [90, 84, 158], y / N)],
  ['02-aster-vale-dusk.png', (x, y) => mix([46, 35, 84], [222, 98, 98], y / N)],
  ['03-aster-vale-sea.png', (x, y) => {
    const band = Math.sin((y / N) * Math.PI * 6) * 12
    return mix([18, 66, 96], [148, 216, 216], y / N + band / 255)
  }],
  // Juniper Brandt — hard geometry.
  ['04-juniper-brandt-stripes.png', (x) =>
    Math.floor(x / 48) % 2 === 0 ? [214, 66, 52] : [244, 236, 214]],
  ['05-juniper-brandt-checker.png', (x, y) =>
    (Math.floor(x / 64) + Math.floor(y / 64)) % 2 === 0 ? [32, 46, 60] : [232, 196, 80]],
  ['06-juniper-brandt-rings.png', (x, y) => {
    const d = Math.hypot(x - N / 2, y - N / 2)
    return Math.floor(d / 36) % 2 === 0 ? [86, 128, 100] : [240, 240, 228]
  }],
  // Milo Ferren — radial and diagonal fields.
  ['07-milo-ferren-glow.png', (x, y) => {
    const d = Math.hypot(x - N / 2, y - N / 2) / (N / 1.4)
    return mix([255, 236, 180], [64, 26, 84], Math.min(1, d))
  }],
  ['08-milo-ferren-slant.png', (x, y) => mix([28, 96, 88], [230, 154, 62], (x + y) / (2 * N))],
  ['09-milo-ferren-ember.png', (x, y) => {
    const d = Math.hypot(x - N * 0.7, y - N * 0.75) / N
    return mix([250, 120, 40], [40, 18, 34], Math.min(1, d * 1.6))
  }],
]

mkdirSync(OUT_DIR, { recursive: true })
let total = 0
for (const [name, paint] of IMAGES) {
  const png = encodePng(paint)
  writeFileSync(join(OUT_DIR, name), png)
  total += png.length
  console.log(`${name}  ${(png.length / 1024).toFixed(1)} KB`)
}
console.log(`total ${(total / 1024).toFixed(1)} KB across ${IMAGES.length} images`)
