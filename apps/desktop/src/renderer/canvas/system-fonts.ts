/**
 * Installed-font enumeration (§4.9 rev 0.13, AI-IMP-037) via
 * Chromium's Local Font Access API. Lazily loaded on first request
 * (the API wants a user gesture) and cached; any failure — API
 * absent, permission denied — falls back to the curated stacks, so
 * the type row always works. Selections should be stored WITH a
 * generic fallback (`withFallback`) so boards opened on machines
 * lacking the font degrade instead of breaking.
 */

export interface FontOption {
  label: string
  value: string
}

export const FONT_STACKS: FontOption[] = [
  { label: 'Sans', value: 'sans-serif' },
  { label: 'Serif', value: 'serif' },
  { label: 'Mono', value: 'monospace' },
]

interface LocalFontData {
  family: string
}

declare global {
  interface Window {
    queryLocalFonts?: () => Promise<LocalFontData[]>
  }
}

let cached: FontOption[] | null = null

/** Wraps a concrete family with a generic fallback for portability. */
export function withFallback(family: string): string {
  if (FONT_STACKS.some((stack) => stack.value === family)) return family
  return `"${family.replace(/"/g, '')}", sans-serif`
}

export async function loadFontOptions(): Promise<FontOption[]> {
  if (cached) return cached
  if (typeof window.queryLocalFonts !== 'function') return FONT_STACKS
  try {
    const fonts = await window.queryLocalFonts()
    const families = [...new Set(fonts.map((f) => f.family))].sort((a, b) =>
      a.localeCompare(b),
    )
    cached = [
      ...FONT_STACKS,
      ...families.map((family) => ({ label: family, value: withFallback(family) })),
    ]
    return cached
  } catch {
    return FONT_STACKS
  }
}
