import { expect, test } from '@playwright/test'
import { launchApp } from './helpers'

/**
 * §8.5 placed-image body treatment (AI-IMP-140): board-presentation
 * radius + soft drop shadow, derived from theme tokens through the host
 * resources bridge. The treatment is separate display geometry — it must
 * never bake into the source, so the managed asset stays byte-identical
 * after the treated image renders (exports/crop previews read original
 * pixels). Runs on any GPU (no perf thresholds asserted here).
 */
test('placed image wears the radius + shadow; source pixels stay untouched', async () => {
  const { app, win } = await launchApp('ew-e2e-treatment-')

  const seeded = await win.evaluate(async () => {
    // A small generated PNG, imported once.
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const ctx = canvas.getContext('2d')!
    for (let i = 0; i < 16; i += 1) {
      ctx.fillStyle = `hsl(${(i * 53) % 360} 65% 50%)`
      ctx.fillRect((i % 4) * 32, Math.floor(i / 4) * 32, 32, 32)
    }
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/png'),
    )
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      (b) => b.toString(16).padStart(2, '0'),
    ).join('')
    const imported = await window.ew.project.importAsset({
      bytes,
      originalFilename: 'treat.png',
    })
    if (!('assetId' in imported) || !imported.assetId) throw new Error('import failed')
    const project = await window.ew.project.query('getProject')
    if (!project.ok) throw new Error(project.message)
    const { id: projectId } = project.result as { id: string }
    const placementId = crypto.randomUUID()
    const result = await window.ew.project.execute({
      commandId: window.ew.util.newId(),
      projectId,
      commandType: 'CreatePin',
      commandVersion: 1,
      issuedAt: new Date().toISOString(),
      payload: {
        nodeId: crypto.randomUUID(),
        canvasId: window.__ewDebug!.canvasId(),
        placementId,
        x: 400,
        y: 300,
        appearance: { kind: 'image', assetId: imported.assetId, crop: null },
      },
    })
    if (result.status !== 'committed') throw new Error(`seed: ${result.status}`)
    return { placementId, digest, byteLength: bytes.byteLength }
  })

  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)
  // Zoom-fit so the image enters the viewport and its texture goes resident.
  await win.getByTestId('zoom-fit').click()
  await expect
    .poll(() => win.evaluate((id) => window.__ewDebug!.placementBody(id), seeded.placementId))
    .toBe('image')

  // Treatment as applied: the shared shadow child is present, the radius
  // comes from --ew-node-radius (3px), and the alpha from --ew-node-shadow.
  const treatment = await win.evaluate(
    (id) => window.__ewDebug!.placementTreatment(id),
    seeded.placementId,
  )
  expect(treatment).not.toBeNull()
  expect(treatment!.hasShadow).toBe(true)
  expect(treatment!.radius).toBe(3)
  expect(treatment!.shadowAlpha).toBeCloseTo(0.3, 2)

  // Untouched pixels (§6.7 / §8.5): re-fetch the managed blob and compare
  // digests — rendering the treated image never rewrote the source.
  const roundTrip = await win.evaluate(async (expected) => {
    const response = await fetch(`ew-asset://${expected.digest}`)
    if (!response.ok) return { ok: false as const, status: response.status }
    const bytes = new Uint8Array(await response.arrayBuffer())
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      (b) => b.toString(16).padStart(2, '0'),
    ).join('')
    return { ok: true as const, byteLength: bytes.byteLength, matches: digest === expected.digest }
  }, seeded)
  expect(roundTrip).toMatchObject({
    ok: true,
    byteLength: seeded.byteLength,
    matches: true,
  })

  await app.close()
})
