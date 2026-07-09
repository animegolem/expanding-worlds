import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { exec, launchApp, launchAppInDir } from './helpers'

/**
 * §14.4 inbox mirror (AI-IMP-092): a drop into a world also performs
 * a second ordinary import into the library — one-way, hash-
 * recognized, never blocking the foreground drop. Covered here: the
 * first-drop ask (both buttons), mirror-on landing an unplaced
 * library node, duplicate-drop recognition with the tag offer, and
 * mirror-off leaving the library untouched.
 *
 * The library is a fixture project seeded in a first launch (the
 * ingest.spec two-launch pattern); the world under test designates
 * it via the libraryProjectDir app setting at runtime.
 */

const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg=='

function dropPngs(
  win: Page,
  files: Array<{ base64: string; name: string }>,
  at = { x: 140, y: 120 },
): Promise<void> {
  return win.evaluate(
    (spec: { files: Array<{ base64: string; name: string }>; x: number; y: number }) => {
      const dt = new DataTransfer()
      for (const file of spec.files) {
        const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0))
        dt.items.add(new File([bytes], file.name, { type: 'image/png' }))
      }
      const host = document.querySelector('[data-testid="canvas-host"]')!
      const rect = host.getBoundingClientRect()
      host.dispatchEvent(
        new DragEvent('drop', {
          dataTransfer: dt,
          clientX: rect.left + spec.x,
          clientY: rect.top + spec.y,
          bubbles: true,
          cancelable: true,
        }),
      )
    },
    { files, ...at },
  )
}

function dropPng(
  win: Page,
  base64: string,
  name: string,
  at = { x: 140, y: 120 },
): Promise<void> {
  return dropPngs(win, [{ base64, name }], at)
}

/** A synthetic 1x1 PNG in `color`, distinct bytes per color. */
function synthPng(win: Page, color: string): Promise<string> {
  return win.evaluate((fill) => {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = fill
    ctx.fillRect(0, 0, 1, 1)
    return canvas.toDataURL('image/png').split(',')[1]!
  }, color)
}

function placements(win: Page): Promise<number> {
  return win.evaluate(() => window.__ewDebug!.sceneStats().placements)
}

/** Unplaced-node count in the LIBRARY slot; -1 while the mirror has
 * not opened it yet (poll fodder). getGalleryIndex, not
 * listNodeLibrary: the gallery index excludes the root node, which
 * would otherwise count as "unplaced" in every project. */
function libraryUnplacedCount(win: Page): Promise<number> {
  return win.evaluate(async () => {
    const response = await window.ew.secondary.query('library', 'getGalleryIndex', {
      unplaced: true,
    })
    if (!response.ok) return -1
    return (response.result as unknown[]).length
  })
}

/** Hidden-window engagement poke: chips dissolve at the next idle,
 * so anything asserting on one keeps the clock fresh first. */
function poke(win: Page): Promise<void> {
  return win.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('ew-test-set-engagement', { detail: { engaged: true } }),
    )
  })
}

/** Seed a library project directory; optionally with the 1px PNG on
 * a node tagged 'Character Ref' (the recognition fixture). */
async function seedLibrary(withTaggedImage: boolean): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'ew-e2e-mirror-lib-'))
  const { app, win } = await launchAppInDir(dir)
  if (withTaggedImage) {
    const imported = await win.evaluate((b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      return window.ew.project.importAsset({ bytes, originalFilename: 'ref.png' })
    }, PNG_1PX)
    expect(imported.ok, JSON.stringify(imported)).toBe(true)
    const assetId = (imported as { ok: true; assetId: string }).assetId
    const nodeId = await win.evaluate(() => window.ew.util.newId())
    const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
    await exec(win, 'CreatePin', {
      nodeId,
      canvasId,
      placementId: await win.evaluate(() => window.ew.util.newId()),
      x: 10,
      y: 10,
      appearance: { kind: 'image', assetId, crop: null },
    })
    const tagId = await win.evaluate(() => window.ew.util.newId())
    await exec(win, 'CreateTag', { tagId, name: 'Character Ref' })
    await exec(win, 'AssignTagToNode', { tagId, nodeId })
  }
  await app.close()
  return dir
}

async function designateLibrary(win: Page, dir: string): Promise<void> {
  await win.evaluate((d) => window.ew.settings.setApp('libraryProjectDir', d), dir)
}

async function setMirror(win: Page, value: boolean): Promise<void> {
  const set = await win.evaluate((v) => window.ew.settings.setProject('mirror_drops', v), value)
  expect(set.ok, JSON.stringify(set)).toBe(true)
}

test('mirror on: drop pins immediately, library gains one unplaced node; duplicate drop recognizes', async () => {
  const libDir = await seedLibrary(false)
  const { app, win } = await launchApp('ew-e2e-mirror-on-')
  await designateLibrary(win, libDir)
  await setMirror(win, true)

  await dropPng(win, PNG_1PX, 'capture.png')
  // The foreground pin never waits on the mirror.
  await expect.poll(() => placements(win), { timeout: 10_000 }).toBe(1)
  // The mirror opens the library slot lazily and lands ONE unplaced
  // node (bytes copied through the ordinary staged pipeline).
  await expect.poll(() => libraryUnplacedCount(win), { timeout: 10_000 }).toBe(1)

  // Same bytes again: the world dedupes ('deduped' still checks the
  // library), the library recognizes — no second copy, a transient
  // chip instead (untagged library → no tag offer, just recognition).
  await poke(win)
  await dropPng(win, PNG_1PX, 'capture-again.png', { x: 240, y: 200 })
  await expect.poll(() => placements(win), { timeout: 10_000 }).toBe(2)
  await expect(win.getByTestId('mirror-chip')).toBeVisible({ timeout: 10_000 })
  expect(await libraryUnplacedCount(win)).toBe(1)

  await app.close()
})

/** Pin engagement ON with hold:true — the takeover posture (crop
 * editor / first-run guide) that nulls the idle fade clock and
 * short-circuits leave(). The engagement false-edge that USED to be
 * the chip's only dismissal never arrives here. */
function pinEngagement(win: Page): Promise<void> {
  return win.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('ew-test-set-engagement', { detail: { engaged: true, hold: true } }),
    )
  })
}

test('recognition chip self-dismisses even with engagement pinned (AI-IMP-213)', async () => {
  // The stuck-chip wedge: with the engagement fade pinned on (a
  // takeover holds it, or the fade is set to 'never'), the chip's
  // designed dismissal edge never fires — and the untagged
  // "Already in your library" chip has no button to close it. The
  // per-chip presentation timer must clear it regardless.
  const libDir = await seedLibrary(false)
  const { app, win } = await launchApp('ew-e2e-mirror-stuck-')
  await designateLibrary(win, libDir)
  await setMirror(win, true)

  // Seed the library with the 1px bytes (first drop mirrors one node).
  await dropPng(win, PNG_1PX, 'seed.png')
  await expect.poll(() => libraryUnplacedCount(win), { timeout: 10_000 }).toBe(1)

  await pinEngagement(win)

  // Duplicate drop → the buttonless recognition chip.
  await dropPng(win, PNG_1PX, 'dup.png', { x: 240, y: 200 })
  const chip = win.getByTestId('mirror-chip')
  await expect(chip).toBeVisible({ timeout: 10_000 })

  // With engagement pinned, ONLY the presentation timer can dismiss
  // it — the board must not be left wearing the pill.
  await expect(chip).toHaveCount(0, { timeout: 15_000 })

  await app.close()
})

test('burst of interleaved duplicate drops: every chip clears (AI-IMP-213)', async () => {
  const libDir = await seedLibrary(false)
  const { app, win } = await launchApp('ew-e2e-mirror-burst-')
  await designateLibrary(win, libDir)
  await setMirror(win, true)

  await dropPng(win, PNG_1PX, 'seed.png')
  await expect.poll(() => libraryUnplacedCount(win), { timeout: 10_000 }).toBe(1)

  // Pin the fade clock so no idle fade can rescue any chip: only the
  // per-chip timers may clear them.
  await pinEngagement(win)

  // A burst of duplicate drops at distinct anchors — each recognizes
  // the seeded bytes and raises its own chip.
  for (let i = 0; i < 5; i++) {
    await dropPng(win, PNG_1PX, `burst-${i}.png`, { x: 120 + i * 30, y: 120 + i * 20 })
  }
  // At least one chip stood up...
  await expect
    .poll(() => win.getByTestId('mirror-chip').count(), { timeout: 10_000 })
    .toBeGreaterThan(0)
  // ...and the board ends clear of every recognition chip.
  await expect(win.getByTestId('mirror-chip')).toHaveCount(0, { timeout: 20_000 })

  await app.close()
})

test('recognition offers the library tags; apply merges them onto the fresh node', async () => {
  const libDir = await seedLibrary(true)
  const { app, win } = await launchApp('ew-e2e-mirror-rec-')
  await designateLibrary(win, libDir)
  await setMirror(win, true)

  await poke(win)
  await dropPng(win, PNG_1PX, 'dup.png')
  await expect.poll(() => placements(win), { timeout: 10_000 }).toBe(1)
  const chip = win.getByTestId('mirror-chip')
  await expect(chip).toBeVisible({ timeout: 10_000 })
  await expect(chip).toContainText('apply its tags')

  await poke(win)
  await win.getByTestId('mirror-chip-apply').click()
  // Apply find-or-creates by name_key and assigns to the fresh node.
  await expect
    .poll(
      async () => {
        const tags = await win.evaluate(() => window.ew.project.query('listTags'))
        if (!tags.ok) return null
        const row = (tags.result as Array<{ name: string; nodeCount: number }>).find(
          (t) => t.name === 'Character Ref',
        )
        return row ? row.nodeCount : null
      },
      { timeout: 10_000 },
    )
    .toBe(1)
  // Strictly one-way: recognition copied nothing INTO the library
  // (its single node is the fixture's placed one — zero unplaced).
  expect(await libraryUnplacedCount(win)).toBe(0)

  await app.close()
})

test('bulk drop collapses the mirror to one summary chip', async () => {
  // Library already holds the 1px PNG: five of the six dropped files
  // recognize, one (distinct bytes) mirrors — the strip path must
  // collapse everything into ONE summary chip, zero per-drop chips.
  const libDir = await seedLibrary(true)
  const { app, win } = await launchApp('ew-e2e-mirror-bulk-')
  await designateLibrary(win, libDir)
  await setMirror(win, true)

  await poke(win)
  const green = await synthPng(win, '#00ff00')
  await dropPngs(win, [
    { base64: PNG_1PX, name: 'a.png' },
    { base64: PNG_1PX, name: 'b.png' },
    { base64: PNG_1PX, name: 'c.png' },
    { base64: PNG_1PX, name: 'd.png' },
    { base64: PNG_1PX, name: 'e.png' },
    { base64: green, name: 'f.png' },
  ])
  await expect.poll(() => placements(win), { timeout: 20_000 }).toBe(6)

  const summary = win.getByTestId('mirror-summary-chip')
  await expect(summary).toBeVisible({ timeout: 15_000 })
  await expect(summary).toContainText('1 drop mirrored to your library · 5 recognized')
  await expect(win.getByTestId('mirror-chip')).toHaveCount(0)
  expect(await libraryUnplacedCount(win)).toBe(1)

  await app.close()
})

test('missing library: one quiet notice, the foreground drop unharmed', async () => {
  // Mirror on, but NO libraryProjectDir app setting: the drop pins
  // normally and the mirror no-ops behind ONE board notice for the
  // whole session (a locked library rides the same opened.ok=false
  // path with the same posture).
  const { app, win } = await launchApp('ew-e2e-mirror-miss-')
  await setMirror(win, true)

  await poke(win)
  await dropPng(win, PNG_1PX, 'orphan.png')
  await expect.poll(() => placements(win), { timeout: 10_000 }).toBe(1)
  const notice = win.getByTestId('board-notice')
  await expect(notice).toBeVisible({ timeout: 10_000 })
  await expect(notice).toContainText('no library project is designated')

  // A second drop still imports and raises no second notice.
  await poke(win)
  const green = await synthPng(win, '#00ff00')
  await dropPng(win, green, 'orphan-2.png', { x: 260, y: 180 })
  await expect.poll(() => placements(win), { timeout: 10_000 }).toBe(2)
  await expect(win.getByTestId('board-notice')).toHaveCount(1)

  await app.close()
})

test('first-drop ask: no leaves the library untouched, yes mirrors from then on', async () => {
  const libDir = await seedLibrary(false)
  const { app, win } = await launchApp('ew-e2e-mirror-ask-')
  await designateLibrary(win, libDir)

  // Unset setting → the two-button ask, anchored to the drop. The
  // import runs either way.
  await poke(win)
  await dropPng(win, PNG_1PX, 'first.png')
  await expect.poll(() => placements(win), { timeout: 10_000 }).toBe(1)
  const ask = win.getByTestId('mirror-ask')
  await expect(ask).toBeVisible({ timeout: 10_000 })
  await win.getByTestId('mirror-ask-no').click()
  await expect(ask).not.toBeVisible()
  await expect
    .poll(async () => {
      const settings = await win.evaluate(() => window.ew.project.query('getSettings'))
      return settings.ok ? (settings.result as Record<string, unknown>)['mirror_drops'] : undefined
    })
    .toBe(false)

  // Off: another drop imports normally and mirrors nothing — the
  // library (opened here by the TEST; the mirror never opened it)
  // stays empty.
  await dropPng(win, PNG_1PX, 'second.png', { x: 260, y: 180 })
  await expect.poll(() => placements(win), { timeout: 10_000 }).toBe(2)
  const opened = await win.evaluate((d) => window.ew.secondary.open('library', d), libDir)
  expect(opened.ok, JSON.stringify(opened)).toBe(true)
  expect(await libraryUnplacedCount(win)).toBe(0)
  await win.evaluate(() => window.ew.secondary.close('library'))

  // Flip to yes through the ask in a FRESH project (once per project
  // by construction: this world's setting now exists, so its ask is
  // spent — the yes path needs a world still unset).
  await app.close()

  const second = await launchApp('ew-e2e-mirror-ask-yes-')
  await designateLibrary(second.win, libDir)
  await poke(second.win)
  await dropPng(second.win, PNG_1PX, 'third.png')
  await expect.poll(() => placements(second.win), { timeout: 10_000 }).toBe(1)
  await expect(second.win.getByTestId('mirror-ask')).toBeVisible({ timeout: 10_000 })
  await second.win.getByTestId('mirror-ask-yes').click()
  // Yes mirrors the drop that raised the ask.
  await expect.poll(() => libraryUnplacedCount(second.win), { timeout: 10_000 }).toBe(1)
  await expect
    .poll(async () => {
      const settings = await second.win.evaluate(() => window.ew.project.query('getSettings'))
      return settings.ok ? (settings.result as Record<string, unknown>)['mirror_drops'] : undefined
    })
    .toBe(true)

  // The ask never returns; further drops mirror without ceremony.
  const green = await synthPng(second.win, '#00ff00')
  await dropPng(second.win, green, 'fourth.png', { x: 300, y: 220 })
  await expect.poll(() => placements(second.win), { timeout: 10_000 }).toBe(2)
  await expect.poll(() => libraryUnplacedCount(second.win), { timeout: 10_000 }).toBe(2)
  await expect(second.win.getByTestId('mirror-ask')).not.toBeVisible()

  await second.app.close()
})
