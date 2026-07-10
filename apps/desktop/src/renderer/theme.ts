export type ThemeName = 'dark' | 'light' | 'glass'

let applyGeneration = 0

function stampedTheme(): ThemeName {
  const theme = document.documentElement.dataset['theme']
  return theme === 'light' || theme === 'glass' ? theme : 'dark'
}

export async function applyTheme(theme: ThemeName): Promise<ThemeName> {
  const generation = ++applyGeneration
  if (theme === 'glass') {
    document.documentElement.dataset['theme'] = 'glass'
    const applied = await window.ew.window.setVibrancy(true)
    if (generation !== applyGeneration) return stampedTheme()
    if (applied) return 'glass'
    await window.ew.window.setVibrancy(false)
    if (generation !== applyGeneration) return stampedTheme()
    document.documentElement.dataset['theme'] = 'dark'
    return 'dark'
  }

  await window.ew.window.setVibrancy(false)
  if (generation !== applyGeneration) return stampedTheme()
  document.documentElement.dataset['theme'] = theme
  return theme
}

export function themeTokenValue(token: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  if (value.length === 0) throw new Error(`theme token is not defined: ${token}`)
  return value
}
