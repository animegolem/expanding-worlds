import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp, launchAppInDir } from './helpers'

/**
 * §11.2 renderer-driven thumbnail pipeline (AI-IMP-076): importing
 * an image yields a WebP derivative in the background (bounded box,
 * ALPHA INTACT — the one re-encode in the system must not be where
 * transparency dies), the /thumb protocol serves it, and a deleted
 * derivatives directory regenerates on next open (§11.4 lazy
 * rebuild). The probe image is generated in-page: left half opaque
 * red, right half fully transparent, 800×600 so the 512 box bites.
 */

interface Probe {
  ok: boolean
  hash: string
}

function importProbe(win: import('@playwright/test').Page): Promise<Probe> {
  return win.evaluate(async () => {
    const canvas = new OffscreenCanvas(800, 600)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = 'rgb(255, 0, 0)'
    ctx.fillRect(0, 0, 400, 600)
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
    const result = await window.ew.project.importAsset({ bytes, originalFilename: 'probe.png' })
    return { ok: result.ok, hash }
  })
}

const thumbFile = (projectDir: string, hash: string): string =>
  join(projectDir, 'derivatives', 'thumbnails', `${hash}.webp`)

test('import grows a bounded, alpha-preserving WebP thumbnail served over /thumb', async () => {
  const { app, win, projectDir } = await launchApp('ew-e2e-thumbs-')

  const probe = await importProbe(win)
  expect(probe.ok).toBe(true)

  // The derivative lands in the background without blocking anything.
  await expect.poll(() => existsSync(thumbFile(projectDir, probe.hash)), { timeout: 15000 }).toBe(
    true,
  )

  // Served over the protocol; bounded to the 512 box (800×600 →
  // 512×384); left pixel opaque red, right pixel alpha 0.
  const check = await win.evaluate(async (hash) => {
    const response = await fetch(`ew-asset://${hash}/thumb`)
    if (!response.ok) return { status: response.status }
    const bitmap = await createImageBitmap(await response.blob())
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0)
    const left = ctx.getImageData(64, 192, 1, 1).data
    const right = ctx.getImageData(448, 192, 1, 1).data
    return {
      status: 200,
      width: bitmap.width,
      height: bitmap.height,
      left: [...left],
      right: [...right],
    }
  }, probe.hash)
  expect(check.status).toBe(200)
  expect(check.width).toBe(512)
  expect(check.height).toBe(384)
  expect(check.left![3]).toBe(255)
  expect(check.left![0]).toBeGreaterThan(200)
  expect(check.right![3]).toBe(0)

  await app.close()
})

test('deleted derivatives regenerate on next open (§11.4 lazy rebuild)', async () => {
  const first = await launchApp('ew-e2e-thumbs-rebuild-')
  const probe = await importProbe(first.win)
  expect(probe.ok).toBe(true)
  await expect
    .poll(() => existsSync(thumbFile(first.projectDir, probe.hash)), { timeout: 15000 })
    .toBe(true)
  await first.app.close()

  rmSync(join(first.projectDir, 'derivatives'), { recursive: true, force: true })

  const second = await launchAppInDir(first.projectDir)
  await expect
    .poll(() => existsSync(thumbFile(first.projectDir, probe.hash)), { timeout: 15000 })
    .toBe(true)
  await second.app.close()
})
