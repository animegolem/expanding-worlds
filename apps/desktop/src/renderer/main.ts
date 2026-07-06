import { mount } from 'svelte'
import App from './App.svelte'
import './theme.css'
// §8.2 keymap registry (AI-IMP-117): declare every binding once at
// boot, before any tooltip or the settings Keyboard section reads it.
import './keys/bindings'
import { initThumbnailPipeline } from './assets/thumbnails'
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

// §11.2 background thumbnail generation (AI-IMP-076): drains the
// derivative queue after boot and after every asset import; never
// blocks anything above.
initThumbnailPipeline()
