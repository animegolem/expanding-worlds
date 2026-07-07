import { describe, expect, it } from 'vitest'
import { createOpenGeneration } from './open-generation'

// AI-IMP-155 fix 3: the stale-open guard behind openFrameMenu. A token
// captured before an await is fresh until a render/close (bump) happens,
// after which the awaiting open must bail rather than paint over a newer
// menu.
describe('createOpenGeneration', () => {
  it('starts fresh: a captured token is not stale without a bump', () => {
    const gen = createOpenGeneration()
    const token = gen.current()
    expect(gen.isStale(token)).toBe(false)
  })

  it('goes stale after a bump (a newer open/close happened)', () => {
    const gen = createOpenGeneration()
    const token = gen.current()
    gen.bump()
    expect(gen.isStale(token)).toBe(true)
  })

  it('a token captured after the bump is fresh again', () => {
    const gen = createOpenGeneration()
    gen.bump()
    const token = gen.current()
    expect(gen.isStale(token)).toBe(false)
  })

  it('stays stale across multiple bumps (never wraps back to matching)', () => {
    const gen = createOpenGeneration()
    const token = gen.current()
    gen.bump()
    gen.bump()
    gen.bump()
    expect(gen.isStale(token)).toBe(true)
  })

  it('models the race: an in-flight open captured before a newer open bails', () => {
    const gen = createOpenGeneration()
    // Frame open captures the generation, then awaits its settings read.
    const frameToken = gen.current()
    // A newer context menu renders during the await (render() -> close()
    // bumps the generation).
    gen.bump()
    // The frame open resolves: it is now stale and must not render.
    expect(gen.isStale(frameToken)).toBe(true)
  })
})
