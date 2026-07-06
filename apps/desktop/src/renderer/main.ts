import { mount } from 'svelte'
import App from './App.svelte'
import './theme.css'
import { initSettings } from './settings/settings'
import { applyTheme, type ThemeName } from './theme'

const target = document.getElementById('app')
if (!target) throw new Error('renderer: #app mount point missing')

window.__ewTheme = {
  apply: applyTheme,
  current: () => (document.documentElement.dataset['theme'] as ThemeName | undefined) ?? 'dark',
}

// §11.5: settings apply before first paint (theme, fade delay,
// opacity) so the window never flashes the defaults; a failed load
// falls back to them inside initSettings.
void initSettings().finally(() => mount(App, { target }))
