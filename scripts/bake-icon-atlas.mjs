#!/usr/bin/env node
/**
 * Bakes the six node-object icon masters (star · pin · flag · heart ·
 * bolt · leaf — RFC-0001 §8.2, AI-IMP-132) into a single texture
 * atlas plus its frame metadata, committed as OUTPUT so the build
 * never depends on this script (the same doctrine as
 * generate-seed.mjs). It runs at AUTHORING time, not in `pnpm build`
 * or CI — that keeps every build machine free of a native SVG
 * rasterizer. Re-run it only when a master or a tier changes:
 *
 *   node scripts/bake-icon-atlas.mjs
 *
 * Authoring dependency: `resvg` on PATH (Homebrew: `brew install
 * resvg`). resvg renders the whole atlas SVG to one PNG in a single
 * call, so no image-packing library is needed.
 *
 * The icons are colour-FIXED per the kit (icons-objects guideline):
 * pin=blue, star=gold, flag=red, heart=pink, bolt=orange, leaf=green.
 * The SVG masters already encode those colours, so there is NO
 * runtime tint — the atlas ships the finished pixels. The one runtime
 * colour is the sub-threshold DOT, whose token the host resolves
 * (canvas-engine never reads CSS); this script only records the token
 * NAME per icon in the metadata.
 *
 * At bake the masters' hand-tuned glosses (.35–.45) are normalised to
 * the shipped token --ew-obj-gloss = rgba(255,255,255,0.42).
 *
 * Outputs (all committed):
 *   apps/desktop/resources/icons/obj-atlas.png   reference raster
 *   apps/desktop/resources/icons/obj-atlas.json  reference metadata
 *   apps/desktop/src/renderer/canvas/icon-atlas.generated.ts
 *     the module the renderer host + charm switcher import: the atlas
 *     PNG as a base64 data URL, the per-icon/per-tier frame rects,
 *     the per-icon normalised-SVG data URLs (chrome previews), and
 *     the per-icon dot-colour token names. Embedding as a data URL
 *     keeps it uniform across tsc, vitest, electron-vite dev, and the
 *     packaged app with no asset-pipeline plumbing.
 */
import { Buffer } from 'node:buffer'
import console from 'node:console'
import process from 'node:process'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..')
const mastersDir = join(repoRoot, 'apps/desktop/resources/icons/masters')
const resourcesDir = join(repoRoot, 'apps/desktop/resources/icons')
const generatedPath = join(
  repoRoot,
  'apps/desktop/src/renderer/canvas/icon-atlas.generated.ts',
)

/** Icon id → master filename + fixed colour family (kit-ratified). The
 * dot token is the sub-threshold degradation colour; the family names
 * the object-gradient set the master already carries. */
const ICONS = [
  { id: 'star', color: 'gold', dotToken: '--ew-node-dot-gold' },
  { id: 'pin', color: 'blue', dotToken: '--ew-node-dot-blue' },
  { id: 'flag', color: 'red', dotToken: '--ew-node-dot-red' },
  { id: 'heart', color: 'pink', dotToken: '--ew-node-dot-pink' },
  { id: 'bolt', color: 'orange', dotToken: '--ew-node-dot-orange' },
  { id: 'leaf', color: 'green', dotToken: '--ew-node-dot-green' },
]

/** Source raster sizes in the atlas (the §8.2 shrink ladder). The
 * renderer picks the smallest tier >= the icon's rendered px, so
 * downscaling stays crisp and extreme zoom-in tops out at 128. */
const TIERS = [128, 64, 32]
const PAD = 2
const VIEWBOX = 24

/** Normalise every white gloss highlight to the shipped gloss token
 * alpha (0.42). Masters ship hand-tuned .35–.45; the token unifies. */
function normalizeGloss(svg) {
  return svg.replace(/rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*[0-9.]+\s*\)/g, 'rgba(255,255,255,0.42)')
}

/** Inner markup of a master (between the outer <svg> tags), with its
 * gradient id made unique so nested icons don't collide in one doc. */
function innerContent(svg, uid) {
  const inner = svg.slice(svg.indexOf('>', svg.indexOf('<svg')) + 1, svg.lastIndexOf('</svg>'))
  return inner.replace(/id="g"/g, `id="${uid}"`).replace(/url\(#g\)/g, `url(#${uid})`)
}

function run() {
  // Load + normalise the masters once.
  const masters = ICONS.map((icon) => {
    const raw = readFileSync(join(mastersDir, `obj-${icon.id}.svg`), 'utf8')
    return { ...icon, svg: normalizeGloss(raw) }
  })

  // Lay the tiers out in rows (one row per tier, one column per icon)
  // and record each frame rect.
  const frames = {}
  for (const icon of ICONS) frames[icon.id] = {}
  const groups = []
  let atlasW = 0
  let y = 0
  for (const tier of TIERS) {
    let x = 0
    for (const master of masters) {
      frames[master.id][tier] = { x, y, w: tier, h: tier }
      const uid = `g-${master.id}-${tier}`
      groups.push(
        `<svg x="${x}" y="${y}" width="${tier}" height="${tier}" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}">` +
          `${innerContent(master.svg, uid)}</svg>`,
      )
      x += tier + PAD
    }
    atlasW = Math.max(atlasW, x - PAD)
    y += tier + PAD
  }
  const atlasH = y - PAD

  const atlasSvg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${atlasW}" height="${atlasH}" ` +
    `viewBox="0 0 ${atlasW} ${atlasH}">${groups.join('')}</svg>`

  // Rasterise the whole atlas in one resvg call.
  const tmp = mkdtempSync(join(tmpdir(), 'ew-icon-atlas-'))
  const svgPath = join(tmp, 'atlas.svg')
  const pngPath = join(tmp, 'atlas.png')
  writeFileSync(svgPath, atlasSvg)
  try {
    execFileSync('resvg', ['-w', String(atlasW), '-h', String(atlasH), svgPath, pngPath])
  } catch (err) {
    console.error('resvg failed — is it installed and on PATH? (brew install resvg)')
    throw err
  }
  const png = readFileSync(pngPath)
  rmSync(tmp, { recursive: true, force: true })

  const pngDataUrl = `data:image/png;base64,${png.toString('base64')}`

  // Per-icon normalised-SVG data URLs for the DOM chrome switcher —
  // same normalised masters, crisp at any chrome size.
  const svgDataUrls = {}
  for (const master of masters) {
    svgDataUrls[master.id] = `data:image/svg+xml;base64,${Buffer.from(master.svg, 'utf8').toString('base64')}`
  }

  const dotTokens = {}
  for (const icon of ICONS) dotTokens[icon.id] = icon.dotToken

  const meta = {
    tiers: TIERS,
    atlas: { width: atlasW, height: atlasH },
    frames,
    dotTokens,
  }

  // Reference artefacts.
  mkdirSync(resourcesDir, { recursive: true })
  writeFileSync(join(resourcesDir, 'obj-atlas.png'), png)
  writeFileSync(join(resourcesDir, 'obj-atlas.json'), `${JSON.stringify(meta, null, 2)}\n`)

  // The generated module the renderer host imports.
  const banner =
    '// GENERATED by scripts/bake-icon-atlas.mjs — do not edit by hand.\n' +
    '// Node object-icon atlas (RFC-0001 §8.2, AI-IMP-132): the six\n' +
    '// masters baked at three tiers into one texture (batched: every\n' +
    '// sprite shares this base), plus chrome-size SVG previews and the\n' +
    '// per-icon sub-threshold dot-colour token names.\n'
  const body =
    `export const ICON_IDS = ${JSON.stringify(ICONS.map((i) => i.id))} as const\n\n` +
    `export const ICON_ATLAS_TIERS = ${JSON.stringify(TIERS)} as const\n\n` +
    `export const ICON_ATLAS_SIZE = ${JSON.stringify(meta.atlas)} as const\n\n` +
    `export const ICON_ATLAS_FRAMES: Record<string, Record<string, { x: number; y: number; w: number; h: number }>> = ${JSON.stringify(frames)}\n\n` +
    `export const ICON_DOT_TOKENS: Record<string, string> = ${JSON.stringify(dotTokens)}\n\n` +
    `export const ICON_SVG_DATA_URLS: Record<string, string> = ${JSON.stringify(svgDataUrls)}\n\n` +
    `export const ICON_ATLAS_PNG_DATA_URL =\n  '${pngDataUrl}'\n`
  writeFileSync(generatedPath, banner + '\n' + body)

  console.log(
    `Baked ${ICONS.length} icons × ${TIERS.length} tiers → ${atlasW}×${atlasH} atlas ` +
      `(${(png.length / 1024).toFixed(1)} KiB PNG, ${(pngDataUrl.length / 1024).toFixed(1)} KiB data URL)`,
  )
}

run()
process.exitCode = 0
