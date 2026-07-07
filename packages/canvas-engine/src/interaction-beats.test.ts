import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  approachClearance,
  awayDisplay,
  awayFinished,
  clamp01,
  DragBeat,
  easeOutCubic,
  nudgeFinished,
  nudgeOffset,
  NEUTRAL_DISPLAY,
  pressFinished,
  pressScale,
  strainFinished,
  strainOffset,
} from './interaction-beats'

describe('easing primitives', () => {
  it('easeOutCubic pins 0→0, 1→1 and clamps out-of-range t', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
    expect(easeOutCubic(-5)).toBe(0)
    expect(easeOutCubic(5)).toBe(1)
    // Ease-OUT: fast then slow — past the midpoint by t=0.5.
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5)
  })

  it('clamp01 bounds to [0,1]', () => {
    expect(clamp01(-1)).toBe(0)
    expect(clamp01(2)).toBe(1)
    expect(clamp01(0.3)).toBe(0.3)
  })
})

describe('DragBeat — grab lift → hold → settle (one beat per gesture)', () => {
  const timings = { liftMs: 120, settleMs: 150 }

  it('lifts up ~1% and raises the shadow, then holds', () => {
    const beat = new DragBeat(timings, 0.01)
    expect(beat.phase).toBe('lifting')
    expect(beat.display().scale).toBe(1) // t=0
    expect(beat.shadow()).toBe(0)
    beat.advance(120)
    expect(beat.phase).toBe('lifted')
    expect(beat.display().scale).toBeCloseTo(1.01, 6)
    expect(beat.shadow()).toBe(1)
    // Holds while the drag continues — no drift, no loop.
    beat.advance(1000)
    expect(beat.phase).toBe('lifted')
    expect(beat.display().scale).toBeCloseTo(1.01, 6)
  })

  it('caps the lift scale at +1% throughout (never overshoots)', () => {
    const beat = new DragBeat(timings, 0.01)
    for (let t = 0; t <= 120; t += 5) {
      expect(beat.display().scale).toBeLessThanOrEqual(1.01 + 1e-9)
      expect(beat.display().scale).toBeGreaterThanOrEqual(1)
      beat.advance(5)
    }
  })

  it('settles in ONE ease-out with NO bounce (monotonic ≥1 → 1) and terminates', () => {
    const beat = new DragBeat(timings, 0.01)
    beat.advance(120) // lifted at 1.01
    beat.release()
    expect(beat.phase).toBe('settling')
    let prev = beat.display().scale
    expect(prev).toBeCloseTo(1.01, 6)
    for (let i = 0; i < 40; i++) {
      beat.advance(5)
      const s = beat.display().scale
      // Never dips below rest (no bounce) and never rises (monotonic).
      expect(s).toBeGreaterThanOrEqual(1 - 1e-9)
      expect(s).toBeLessThanOrEqual(prev + 1e-9)
      prev = s
    }
    expect(beat.finished).toBe(true)
    expect(beat.display().scale).toBe(1)
    expect(beat.shadow()).toBe(0)
  })

  it('a release mid-lift settles smoothly from the partial scale', () => {
    const beat = new DragBeat(timings, 0.01)
    beat.advance(60) // partway up
    const partial = beat.display().scale
    expect(partial).toBeGreaterThan(1)
    expect(partial).toBeLessThan(1.01)
    beat.release()
    expect(beat.display().scale).toBeCloseTo(partial, 6) // starts where it was
    beat.advance(150)
    expect(beat.finished).toBe(true)
    expect(beat.display().scale).toBe(1)
  })

  it('is inert once done — advancing never re-arms it', () => {
    const beat = new DragBeat(timings, 0.01)
    beat.advance(120)
    beat.release()
    beat.advance(150)
    expect(beat.finished).toBe(true)
    beat.advance(10_000)
    expect(beat.phase).toBe('done')
    expect(beat.display().scale).toBe(1)
  })
})

describe('nudge — display-only last-px seat, decays to EXACTLY zero', () => {
  it('starts at the seed and reaches 0 at nudgeMs', () => {
    const seed = { x: 6, y: -4 }
    expect(nudgeOffset(0, seed, 40)).toEqual(seed)
    const end = nudgeOffset(40, seed, 40)
    expect(end.x).toBe(0)
    expect(end.y).toBe(0)
    expect(nudgeFinished(40, 40)).toBe(true)
    expect(nudgeFinished(20, 40)).toBe(false)
  })

  it('decays monotonically toward zero (never past the seat)', () => {
    const seed = { x: 8, y: 0 }
    let prev = seed.x
    for (let e = 0; e <= 40; e += 4) {
      const x = nudgeOffset(e, seed, 40).x
      expect(x).toBeLessThanOrEqual(prev + 1e-9)
      expect(x).toBeGreaterThanOrEqual(-1e-9)
      prev = x
    }
  })
})

describe('strain — sideways there-and-back, never lifts', () => {
  it('is 0 at both ends, peaks at px mid, and reports finished', () => {
    expect(strainOffset(0, 120, 2)).toBeCloseTo(0, 6)
    expect(strainOffset(120, 120, 2)).toBeCloseTo(0, 6)
    expect(strainOffset(60, 120, 2)).toBeCloseTo(2, 6)
    expect(strainFinished(120, 120)).toBe(true)
    expect(strainFinished(60, 120)).toBe(false)
  })
})

describe('press — lock settles −cap into the desk', () => {
  it('eases 1 → 1−cap and holds finished', () => {
    expect(pressScale(0, 150, 0.01)).toBe(1)
    expect(pressScale(150, 150, 0.01)).toBeCloseTo(0.99, 6)
    expect(pressFinished(150, 150)).toBe(true)
    // Never rises above rest.
    for (let e = 0; e <= 150; e += 10) {
      expect(pressScale(e, 150, 0.01)).toBeLessThanOrEqual(1 + 1e-9)
    }
  })
})

describe('away — delete lifts up and fades (never crumples)', () => {
  it('rises (negative y) and fades alpha to 0', () => {
    const start = awayDisplay(0, 180, 24)
    expect(start.offsetY).toBe(0)
    expect(start.alpha).toBe(1)
    const end = awayDisplay(180, 180, 24)
    expect(end.offsetY).toBeCloseTo(-24, 6)
    expect(end.alpha).toBe(0)
    expect(awayFinished(180, 180)).toBe(true)
    // Rise is upward the whole way (never downward — nothing sinks).
    for (let e = 0; e <= 180; e += 15) {
      expect(awayDisplay(e, 180, 24).offsetY).toBeLessThanOrEqual(1e-9)
    }
  })
})

describe('make-room — clearance converges and stops', () => {
  it('approaches the target and snaps to it (idles, no oscillation)', () => {
    let c = 0
    for (let i = 0; i < 200; i++) c = approachClearance(c, 6, 16, 60)
    expect(c).toBe(6) // exact snap → the host loop can idle
    // And eases back to 0 the same way.
    for (let i = 0; i < 200; i++) c = approachClearance(c, 0, 16, 60)
    expect(c).toBe(0)
  })
})

describe('NEUTRAL_DISPLAY', () => {
  it('is the identity delta', () => {
    expect(NEUTRAL_DISPLAY).toEqual({ scale: 1, offsetX: 0, offsetY: 0 })
  })
})

// ---- one-shot guard (§8.2): the beat CORE holds no self-driving loop.
// Every beat here is a pure time→delta function or a terminating state
// machine; the single shared ticker that advances them lives in the host
// (allowlisted there). This scan fails if a timer / rAF / ticker / bare
// loop-scheduling primitive ever creeps into the pure core.
describe('one-shot guard — no looping animation primitives in the beat core', () => {
  it('interaction-beats.ts calls no timer, rAF, or ticker', () => {
    const raw = readFileSync(fileURLToPath(new URL('./interaction-beats.ts', import.meta.url)), 'utf8')
    // Strip comments so prose that merely NAMES the ticker/timer (the
    // module doc explains the host owns the shared ticker) never trips
    // the scan — we forbid the CALL/ACCESS, not the word.
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    const forbidden = [
      /\bsetInterval\s*\(/,
      /\bsetTimeout\s*\(/,
      /\brequestAnimationFrame\s*\(/,
      /\.ticker\b/,
      /\bnew\s+Application\b/,
    ]
    const hits = forbidden.filter((re) => re.test(src)).map((re) => re.source)
    expect(hits, `beat core must stay a pure one-shot library; found: ${hits.join(', ')}`).toEqual(
      [],
    )
  })
})
