import { Texture } from 'pixi.js'
import { invoke, convertFileSrc } from '@tauri-apps/api/core'
import { paintCanvas, canvasToPngBytes } from './textures'
import { round } from './metrics'

/**
 * The whole point of AI-IMP-240's asset-protocol risk (#1). Instead of
 * the 217 harness's in-memory `Texture.from(canvas)`, every texture here
 * lands on disk as a real PNG (painted in the WebView, written via a Rust
 * command) and is streamed back through Tauri's asset protocol
 * (`convertFileSrc` → `fetch`). That exercises the exact hot path an
 * image-heavy real port would run: local file → custom protocol →
 * WKWebView decode → GPU upload.
 *
 * Two consumers:
 *   - `loadAssetTexture` is wired into the engine's TextureBudget, so the
 *     synthetic board renders through the asset protocol end to end.
 *   - `probeAssetProtocol` is a Pixi-independent latency/caching/ceiling
 *     probe on its OWN file set (`probe-*`), so its cold numbers are not
 *     polluted by scene fetches.
 */

const PREFIX = 'ew-asset://'

function bytesToBase64(bytes: Uint8Array): string {
  // Chunked to avoid blowing the call-stack arg limit on multi-MB blobs.
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

const pathCache = new Map<string, string>() // contentHash -> absolute disk path

/** Paint (if absent) and persist the PNG for a given engine asset url,
 * returning its absolute disk path. Idempotent + cached in-session. */
async function ensureOnDisk(url: string): Promise<string> {
  const hash = url.startsWith(PREFIX) ? url.slice(PREFIX.length) : url
  const cached = pathCache.get(hash)
  if (cached) return cached
  const info = await invoke<{ path: string; exists: boolean }>('texture_path', { hash })
  if (!info.exists) {
    // paintCanvas is fed the FULL url exactly like 217 so texture pixel
    // size (hashString of the prefixed url) matches the WebKit baseline.
    const canvas = paintCanvas(url)
    const bytes = await canvasToPngBytes(canvas)
    await invoke('write_texture', { hash, b64: bytesToBase64(bytes) })
  }
  pathCache.set(hash, info.path)
  return info.path
}

// ---- scene loader wired into the engine -----------------------------------

interface FetchSample {
  ms: number
  bytes: number
}
const sceneFetch: FetchSample[] = []

/** Engine loadTexture: disk PNG → asset protocol fetch → decode → GPU. */
export async function loadAssetTexture(url: string): Promise<Texture> {
  const path = await ensureOnDisk(url)
  const assetUrl = convertFileSrc(path)
  const t0 = performance.now()
  const resp = await fetch(assetUrl)
  const blob = await resp.blob()
  sceneFetch.push({ ms: performance.now() - t0, bytes: blob.size })
  const bitmap = await createImageBitmap(blob)
  const texture = Texture.from(bitmap)
  texture.source.autoGenerateMipmaps = true
  return texture
}

/** Pre-write every scene texture to disk so the 30 s sweep measures pure
 * asset-protocol *reads* (no paint / no write contaminating frame times). */
export async function prewarmScene(
  count: number,
  onProgress?: (frac: number) => void,
): Promise<void> {
  for (let i = 0; i < count; i++) {
    await ensureOnDisk(`${PREFIX}hash-${i}`)
    if (onProgress && i % 10 === 0) onProgress(i / count)
  }
  onProgress?.(1)
}

function stats(samples: number[]): {
  n: number
  minMs: number
  medianMs: number
  p95Ms: number
  maxMs: number
  meanMs: number
} {
  if (samples.length === 0) return { n: 0, minMs: 0, medianMs: 0, p95Ms: 0, maxMs: 0, meanMs: 0 }
  const s = [...samples].sort((a, b) => a - b)
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))]!
  const mean = s.reduce((a, b) => a + b, 0) / s.length
  return {
    n: s.length,
    minMs: round(s[0]!, 3),
    medianMs: round(at(0.5), 3),
    p95Ms: round(at(0.95), 3),
    maxMs: round(s[s.length - 1]!, 3),
    meanMs: round(mean, 3),
  }
}

export function sceneFetchSummary(): ReturnType<typeof stats> & { totalBytes: number } {
  return { ...stats(sceneFetch.map((f) => f.ms)), totalBytes: sceneFetch.reduce((a, f) => a + f.bytes, 0) }
}

// ---- dedicated asset-protocol probe (own files) ---------------------------

/**
 * Cold + warm asset-protocol read latency over `count` distinct files,
 * plus a size-ceiling sweep. Uses `probe-*` files so nothing here is
 * cached by the scene. Cold = first fetch this session; warm = immediate
 * repeat (surfaces any WKWebView/OS caching).
 */
export async function probeAssetProtocol(
  count: number,
  onProgress?: (frac: number) => void,
): Promise<{
  count: number
  cold: ReturnType<typeof stats>
  warm: ReturnType<typeof stats>
  avgFileBytes: number
  sizeCeiling: { requestedMB: number; bytes: number; ms: number; ok: boolean; error?: string }[]
}> {
  const n = Math.min(count, 200) // cap the probe set; 200 distinct files is plenty
  const paths: string[] = []
  let totalBytes = 0
  for (let i = 0; i < n; i++) {
    // paint a probe-specific texture and persist it
    const url = `${PREFIX}probe-${i}`
    const info = await invoke<{ path: string; exists: boolean }>('texture_path', { hash: `probe-${i}` })
    if (!info.exists) {
      const canvas = paintCanvas(url)
      const bytes = await canvasToPngBytes(canvas)
      await invoke('write_texture', { hash: `probe-${i}`, b64: bytesToBase64(bytes) })
    }
    paths.push(info.path)
    if (onProgress && i % 10 === 0) onProgress((i / n) * 0.5)
  }

  const cold: number[] = []
  const warm: number[] = []
  for (let i = 0; i < n; i++) {
    const assetUrl = convertFileSrc(paths[i]!)
    let t0 = performance.now()
    const r1 = await fetch(assetUrl)
    const b1 = await r1.blob()
    cold.push(performance.now() - t0)
    totalBytes += b1.size
    t0 = performance.now()
    const r2 = await fetch(assetUrl)
    await r2.blob()
    warm.push(performance.now() - t0)
    if (onProgress && i % 10 === 0) onProgress(0.5 + (i / n) * 0.5)
  }
  onProgress?.(1)

  // size-ceiling sweep: raw binary blobs of increasing size through the
  // same protocol. Probes any payload cap / failure mode.
  const sizeCeiling: { requestedMB: number; bytes: number; ms: number; ok: boolean; error?: string }[] = []
  for (const mb of [8, 32, 128]) {
    try {
      const p = await invoke<string>('write_blob', { sizeMb: mb })
      const assetUrl = convertFileSrc(p)
      const t0 = performance.now()
      const r = await fetch(assetUrl)
      const buf = await r.arrayBuffer()
      sizeCeiling.push({ requestedMB: mb, bytes: buf.byteLength, ms: round(performance.now() - t0, 2), ok: true })
    } catch (e) {
      sizeCeiling.push({ requestedMB: mb, bytes: 0, ms: 0, ok: false, error: String(e) })
    }
  }

  return {
    count: n,
    cold: stats(cold),
    warm: stats(warm),
    avgFileBytes: n > 0 ? Math.round(totalBytes / n) : 0,
    sizeCeiling,
  }
}
