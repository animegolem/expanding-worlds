/**
 * Renderer-side thumbnail generator (RFC-0001 §11.2, AI-IMP-076).
 * The codec decision: Chromium IS the app's codec — every §4.7
 * format the board can display decodes here, hardware-accelerated,
 * with zero native dependencies (preserving the AI-IMP-009 stance).
 * The drive loop pulls queued jobs from the utility (which owns the
 * queue and the derivative files), decodes the original through the
 * ew-asset protocol, downscales into a bounded box, encodes WebP
 * WITH ALPHA (the one re-encode in the system must not be where
 * transparency dies — EPIC-014 NFR), and submits the bytes back.
 * A failed decode submits null: the job marks failed and the grid
 * falls back to the original. Claiming does not lock, so a renderer
 * that dies mid-job leaves it queued — the next drive self-heals.
 */

/** Long-edge bound; sources smaller than the box are never upscaled. */
const THUMB_BOX = 512
const WEBP_QUALITY = 0.82

let driving = false

/** Drains the derivative queue; concurrent calls collapse into the
 * running drive (re-triggering during a drive is safe and cheap). */
export async function driveThumbnails(): Promise<void> {
  if (driving) return
  driving = true
  try {
    for (;;) {
      const job = await window.ew.derivatives.claimThumbnailJob()
      if (!job) return
      let bytes: Uint8Array | null = null
      try {
        bytes = await generateThumbnail(job.contentHash)
      } catch {
        bytes = null // undecodable source: submit the failure
      }
      await window.ew.derivatives.submitThumbnail({
        jobId: job.jobId,
        assetId: job.assetId,
        contentHash: job.contentHash,
        bytes,
      })
    }
  } finally {
    driving = false
  }
}

async function generateThumbnail(contentHash: string): Promise<Uint8Array> {
  const response = await fetch(`ew-asset://${contentHash}`)
  if (!response.ok) throw new Error(`asset fetch failed: ${response.status}`)
  const blob = await response.blob()
  // First frame for animated sources (GIF): a thumbnail is a still.
  const bitmap = await createImageBitmap(blob)
  try {
    const scale = Math.min(1, THUMB_BOX / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    ctx.drawImage(bitmap, 0, 0, width, height)
    const out = await canvas.convertToBlob({ type: 'image/webp', quality: WEBP_QUALITY })
    return new Uint8Array(await out.arrayBuffer())
  } finally {
    bitmap.close()
  }
}

/**
 * Wires the drive triggers once per window: the backfill queue on
 * service-ready, and every committed asset import. Idempotent per
 * module instance.
 */
let wired = false
export function initThumbnailPipeline(): void {
  if (wired) return
  wired = true
  window.ew.project.onServiceStatus((event) => {
    if (event.status === 'ok') void driveThumbnails()
  })
  window.ew.project.onChanged((event) => {
    if (event.commandType === 'CommitAssetImport') void driveThumbnails()
  })
  // The window may attach after main finished init (no further
  // service-status broadcast): one unconditional kick covers it. A
  // claim before the project opens just returns null.
  void driveThumbnails()
}
