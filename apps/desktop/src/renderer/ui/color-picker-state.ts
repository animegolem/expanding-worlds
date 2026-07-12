export interface HsvColor { h: number; s: number; v: number }

const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value))

export function normalizeHex(value: string): string | null {
  const raw = value.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(raw)) return `#${[...raw].map((part) => part + part).join('').toLowerCase()}`
  return /^[0-9a-f]{6}$/i.test(raw) ? `#${raw.toLowerCase()}` : null
}

export function hexToHsv(value: string): HsvColor | null {
  const hex = normalizeHex(value)
  if (!hex) return null
  const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255)
  const max = Math.max(r!, g!, b!), min = Math.min(r!, g!, b!), delta = max - min
  let h = 0
  if (delta !== 0) {
    if (max === r) h = ((g! - b!) / delta) % 6
    else if (max === g) h = (b! - r!) / delta + 2
    else h = (r! - g!) / delta + 4
    h = (h * 60 + 360) % 360
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max }
}

export function hsvToHex({ h, s, v }: HsvColor): string {
  const hue = ((h % 360) + 360) % 360, saturation = clamp(s), value = clamp(v)
  const chroma = value * saturation, x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1)), m = value - chroma
  const sector = Math.floor(hue / 60)
  const rgb = sector === 0 ? [chroma, x, 0] : sector === 1 ? [x, chroma, 0] : sector === 2 ? [0, chroma, x] : sector === 3 ? [0, x, chroma] : sector === 4 ? [x, 0, chroma] : [chroma, 0, x]
  return `#${rgb.map((part) => Math.round((part + m) * 255).toString(16).padStart(2, '0')).join('')}`
}

export function recentColors(previous: readonly string[], color: string, limit = 12): string[] {
  const normalized = normalizeHex(color)
  if (!normalized) return [...previous]
  return [normalized, ...previous.map(normalizeHex).filter((entry): entry is string => Boolean(entry) && entry !== normalized)].slice(0, limit)
}

export function svFromPoint(rect: { left: number; top: number; width: number; height: number }, x: number, y: number): Pick<HsvColor, 's' | 'v'> {
  return { s: clamp((x - rect.left) / Math.max(1, rect.width)), v: 1 - clamp((y - rect.top) / Math.max(1, rect.height)) }
}

export function hueFromPoint(rect: { left: number; width: number }, x: number): number {
  return clamp((x - rect.left) / Math.max(1, rect.width)) * 360
}
