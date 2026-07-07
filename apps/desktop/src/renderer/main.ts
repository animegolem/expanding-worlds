import { mount } from 'svelte'
import App from './App.svelte'
import './theme.css'
// §7.1 editor face (AI-IMP-131): bundled Maple Mono @font-face + the
// note-text scale. Import order after theme.css so its tokens resolve.
import './editor-face.css'
// §8.2 decision 06 (AI-IMP-167): the universal menu CASCADE keyframe —
// one global home so both menu families (MenuPopover + the imperative
// ContextMenu builder) share the identical open grammar.
import './chrome/menu-cascade.css'
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

// §7.1 editor face for canvas-baked note text (AI-IMP-131): card
// title/excerpt are Pixi Text, which bakes glyphs from whatever the
// browser has loaded at bake time. @font-face alone loads lazily (on
// first DOM use), so warm the three faces now — from the local bundle
// this resolves well before the first scene applies (IPC project load
// is slower), and any note edit re-bakes the card regardless.
if (typeof document !== 'undefined' && document.fonts) {
  void document.fonts.load("400 1rem 'Maple Mono'")
  void document.fonts.load("italic 400 1rem 'Maple Mono'")
  void document.fonts.load("700 1rem 'Maple Mono'")
}
