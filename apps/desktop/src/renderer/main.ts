import { mount } from 'svelte'
import App from './App.svelte'
import './theme.css'
import { applyTheme, type ThemeName } from './theme'

const target = document.getElementById('app')
if (!target) throw new Error('renderer: #app mount point missing')

window.__ewTheme = {
  apply: applyTheme,
  current: () => (document.documentElement.dataset['theme'] as ThemeName | undefined) ?? 'dark',
}

mount(App, { target })
