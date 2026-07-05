import { describe, expect, it } from 'vitest'
import { TextureBudget } from './texture-budget'

function fakeTexture(width: number, height: number) {
  return {
    width,
    height,
    destroyed: false,
    destroy() {
      this.destroyed = true
    },
  }
}

function makeBudget(maxIdleBytes: number) {
  const loads: string[] = []
  const budget = new TextureBudget(async (url: string) => {
    loads.push(url)
    // 100×100 → 40_000 bytes each.
    return fakeTexture(100, 100)
  }, maxIdleBytes)
  return { budget, loads }
}

describe('TextureBudget', () => {
  it('refcounts acquires and shares one in-flight load', async () => {
    const { budget, loads } = makeBudget(1e9)
    const [a, b] = await Promise.all([budget.acquire('h1', 'u1'), budget.acquire('h1', 'u1')])
    expect(a).toBe(b)
    expect(loads).toEqual(['u1'])
    expect(budget.stats()).toMatchObject({ textures: 1, residentBytes: 40_000 })

    budget.release('h1')
    expect(budget.stats()).toMatchObject({ residentBytes: 40_000 }) // still one ref
    budget.release('h1')
    expect(budget.stats()).toMatchObject({ residentBytes: 0, idleBytes: 40_000 })
  })

  it('keeps idle textures under the budget and evicts LRU-first', async () => {
    // Budget fits exactly one idle 40_000-byte texture.
    const { budget } = makeBudget(50_000)
    const t1 = (await budget.acquire('h1', 'u1')) as { destroyed: boolean }
    const t2 = (await budget.acquire('h2', 'u2')) as { destroyed: boolean }
    budget.release('h1') // idle: h1
    budget.release('h2') // idle: h1, h2 → over budget → evict h1 (older)
    expect(t1.destroyed).toBe(true)
    expect(t2.destroyed).toBe(false)
    expect(budget.stats()).toMatchObject({ textures: 1, idleBytes: 40_000 })
  })

  it('re-acquiring an idle texture revives it without a reload', async () => {
    const { budget, loads } = makeBudget(1e9)
    const first = await budget.acquire('h1', 'u1')
    budget.release('h1')
    const second = await budget.acquire('h1', 'u1')
    expect(second).toBe(first)
    expect(loads).toEqual(['u1'])
  })

  it('releaseAll destroys idle textures and dooms live ones', async () => {
    const { budget } = makeBudget(1e9)
    const idle = (await budget.acquire('h1', 'u1')) as { destroyed: boolean }
    budget.release('h1')
    const live = (await budget.acquire('h2', 'u2')) as { destroyed: boolean }
    budget.releaseAll()
    expect(idle.destroyed).toBe(true)
    expect(live.destroyed).toBe(false) // still referenced
    budget.release('h2') // final release of a doomed texture destroys it
    expect(live.destroyed).toBe(true)
    expect(budget.stats()).toEqual({ textures: 0, residentBytes: 0, idleBytes: 0 })
  })

  it('acquire after releaseAll loads fresh', async () => {
    const { budget, loads } = makeBudget(1e9)
    await budget.acquire('h1', 'u1')
    budget.releaseAll()
    budget.release('h1')
    await budget.acquire('h1', 'u1')
    expect(loads).toEqual(['u1', 'u1'])
  })
})
