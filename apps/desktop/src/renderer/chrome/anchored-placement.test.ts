import { readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { placeAnchored, pointAnchor } from './anchored-placement'

const HOST = { x: 0, y: 0, width: 800, height: 600 }
const SURFACE = { width: 200, height: 100 }

describe('placeAnchored (§8.8)', () => {
  it('places a normal surface on its preferred sides', () => {
    expect(
      placeAnchored({
        anchor: { x: 300, y: 300, width: 100, height: 40 },
        surface: SURFACE,
        host: HOST,
        x: { preferred: 'center' },
        y: { preferred: 'before', fallback: 'after' },
        gap: 8,
        margin: 8,
      }),
    ).toEqual({ x: 250, y: 192, flipped: false })
  })

  it('flips when the preferred side has no room', () => {
    expect(
      placeAnchored({
        anchor: { x: 300, y: 10, width: 100, height: 40 },
        surface: SURFACE,
        host: HOST,
        x: { preferred: 'center' },
        y: { preferred: 'before', fallback: 'after' },
        gap: 8,
        margin: 8,
      }),
    ).toEqual({ x: 250, y: 58, flipped: true })
  })

  it('clamps into the region left after named chrome bands', () => {
    const placed = placeAnchored({
      anchor: pointAnchor(790, 590),
      surface: SURFACE,
      host: HOST,
      bands: { right: 80, bottom: 60 },
      x: { preferred: 'start' },
      y: { preferred: 'start' },
      margin: 8,
    })
    expect(placed).toEqual({ x: 512, y: 432, flipped: false })
  })

  it('pins an oversize surface to the leading margin and never goes negative', () => {
    const placed = placeAnchored({
      anchor: pointAnchor(20, 20),
      surface: { width: 400, height: 300 },
      host: { x: 0, y: 0, width: 240, height: 180 },
      x: { preferred: 'start', fallback: 'before' },
      y: { preferred: 'after', fallback: 'before' },
      margin: 8,
    })
    expect(placed).toEqual({ x: 8, y: 8, flipped: false })
  })

  it('pins safely for a zero-size host', () => {
    const placed = placeAnchored({
      anchor: pointAnchor(0, 0),
      surface: SURFACE,
      host: { x: 0, y: 0, width: 0, height: 0 },
      x: { preferred: 'after' },
      y: { preferred: 'after' },
      margin: 8,
    })
    expect(placed.x).toBe(8)
    expect(placed.y).toBe(8)
  })

  it('keeps TagPanel on-screen when its host is narrower than the measured panel', () => {
    const placed = placeAnchored({
      anchor: pointAnchor(100, 40),
      surface: { width: 330, height: 290 },
      host: { x: 0, y: 0, width: 280, height: 500 },
      x: { preferred: 'start' },
      y: { preferred: 'after', fallback: 'before' },
      gap: { y: 6 },
      margin: 8,
    })
    expect(placed.x).toBeGreaterThanOrEqual(8)
  })
})

describe('anchored-surface adoption guard', () => {
  it('keeps surface-local clamps out of renderer code except documented lifecycle projections', () => {
    const renderer = fileURLToPath(new URL('..', import.meta.url))
    const exemptions = new Set(['note/NotePanel.svelte', 'note/NotePanels.svelte'])
    const patterns = [
      /Math\.min\([\s\S]{0,240}(?:client(?:Width|Height)|inner(?:Width|Height)|(?:bounds|host|viewport|view)\.(?:width|height))\s*-/,
      /function\s+(?:clampInto|panelStyle|chipStyle)\s*\(/,
    ]
    const files: string[] = []
    const visit = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) visit(path)
        else if (['.ts', '.svelte'].includes(extname(path)) && !path.endsWith('.test.ts')) files.push(path)
      }
    }
    visit(renderer)

    const offenders = files
      .filter((path) => patterns.some((pattern) => pattern.test(readFileSync(path, 'utf8'))))
      .map((path) => relative(renderer, path).split('\\').join('/'))
      .filter((path) => !exemptions.has(path))
    expect(offenders).toEqual([])
  })
})
