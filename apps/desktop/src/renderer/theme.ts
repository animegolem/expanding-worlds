export type ThemeName = 'dark' | 'light' | 'glass'

export async function applyTheme(theme: ThemeName): Promise<ThemeName> {
  if (theme === 'glass') {
    document.documentElement.dataset['theme'] = 'glass'
    const applied = await window.ew.window.setVibrancy(true)
    if (applied) return 'glass'
    await window.ew.window.setVibrancy(false)
    document.documentElement.dataset['theme'] = 'dark'
    return 'dark'
  }

  await window.ew.window.setVibrancy(false)
  document.documentElement.dataset['theme'] = theme
  return theme
}

export function themeTokenValue(token: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  if (value.length === 0) throw new Error(`theme token is not defined: ${token}`)
  return value
}
