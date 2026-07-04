/** Deterministic PRNG (mulberry32) so every run sees identical fixtures. */
export type Rng = () => number

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export const int = (rng: Rng, min: number, max: number) =>
  min + Math.floor(rng() * (max - min + 1))

export const float = (rng: Rng, min: number, max: number) =>
  min + rng() * (max - min)

export const pick = <T>(rng: Rng, arr: readonly T[]): T => {
  const v = arr[Math.floor(rng() * arr.length)]
  if (v === undefined) throw new Error('pick from empty array')
  return v
}
