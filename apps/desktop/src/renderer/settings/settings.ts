/**
 * §11.5 unified settings store (AI-IMP-074): one facade over both
 * tiers. App-tier keys ride main's app-settings.json over IPC and
 * follow the application; project-tier keys live in the project
 * database (trash retention through its SetTrashRetention command,
 * future per-project prefs through the non-undoable set-setting
 * verb). Consumers subscribe here and never care which tier a key
 * is. Settings commit on interaction — there is no save step — and
 * this store performs the live side effects (theme, fade clock,
 * window opacity); passive consumers (charm corner, title strip,
 * flat canvas color) subscribe and read.
 */
import { setFadeDelay } from '../chrome/engagement'
import { CHROME_FADE_DELAY_MS } from '../chrome/feel'
import { toast } from '../chrome/status'
import { applyTheme, type ThemeName } from '../theme'

export type FadeDelay = number | 'never'
export type CharmCorner = 'lower-right' | 'upper-right'
export type TitleStripMode = 'hover' | 'always' | 'never'
export type MenuPlacement = 'rail' | 'system'
export type CaptionPromotionRouting = 'ask' | 'title' | 'body'
/** §6.9 (AI-IMP-205): mouse vs trackpad wheel muscle memory. Chromium
 * cannot tell a mouse wheel from a trackpad two-finger scroll — both
 * arrive as plain wheel events — so this is a deliberate choice, not a
 * detection. `trackpad` (default) keeps plain wheel = pan; `mouse`
 * routes plain wheel into zoom-at-cursor (the PureRef/Figma scheme).
 * Pinch (ctrl-wheel) and Cmd+wheel zoom in BOTH schemes. */
export type NavigationScheme = 'trackpad' | 'mouse'

export interface AppSettings {
  theme: ThemeName
  charmCorner: CharmCorner
  fadeDelayMs: FadeDelay
  titleStrip: TitleStripMode
  /** 0.3–1; the floor is enforced main-side too. */
  windowOpacity: number
  /** An --ew-canvas-flat-N token name, or 'off' for the theme surface. */
  flatCanvasColor: string
  /** Windows/Linux only (§11.5); inert on macOS. */
  menuPlacement: MenuPlacement
  /** §6.9 (AI-IMP-205): plain-wheel muscle memory. Default trackpad. */
  navigationScheme: NavigationScheme
  /** §4.5 (AI-IMP-267): where caption text goes when promoted to a note. */
  captionPromotionRouting: CaptionPromotionRouting
}

export const APP_SETTING_DEFAULTS: AppSettings = {
  theme: 'dark',
  charmCorner: 'lower-right',
  fadeDelayMs: CHROME_FADE_DELAY_MS,
  titleStrip: 'hover',
  windowOpacity: 1,
  flatCanvasColor: 'off',
  menuPlacement: 'rail',
  navigationScheme: 'trackpad',
  captionPromotionRouting: 'ask',
}

type Listener = (settings: AppSettings) => void

let current: AppSettings = { ...APP_SETTING_DEFAULTS }
const listeners = new Set<Listener>()
let initialized = false

function notify(): void {
  for (const listener of listeners) listener(current)
}

/** Persisted values are user files: trust nothing, fall back per key. */
function sanitize(raw: Record<string, unknown>): AppSettings {
  const next = { ...APP_SETTING_DEFAULTS }
  const theme = raw['theme']
  if (theme === 'dark' || theme === 'light' || theme === 'glass') next.theme = theme
  const corner = raw['charmCorner']
  if (corner === 'lower-right' || corner === 'upper-right') next.charmCorner = corner
  const fade = raw['fadeDelayMs']
  if (fade === 'never' || (typeof fade === 'number' && Number.isFinite(fade) && fade > 0)) {
    next.fadeDelayMs = fade
  }
  const strip = raw['titleStrip']
  if (strip === 'hover' || strip === 'always' || strip === 'never') next.titleStrip = strip
  const opacity = raw['windowOpacity']
  if (typeof opacity === 'number' && Number.isFinite(opacity)) {
    next.windowOpacity = Math.min(1, Math.max(0.3, opacity))
  }
  const flat = raw['flatCanvasColor']
  if (flat === 'off' || (typeof flat === 'string' && flat.startsWith('--ew-canvas-flat-'))) {
    next.flatCanvasColor = flat
  }
  const menu = raw['menuPlacement']
  if (menu === 'rail' || menu === 'system') next.menuPlacement = menu
  const nav = raw['navigationScheme']
  if (nav === 'trackpad' || nav === 'mouse') next.navigationScheme = nav
  const captionRouting = raw['captionPromotionRouting']
  if (captionRouting === 'ask' || captionRouting === 'title' || captionRouting === 'body') {
    next.captionPromotionRouting = captionRouting
  }
  return next
}

function applySideEffects(previous: AppSettings): void {
  if (current.theme !== previous.theme) {
    // Glass may fall back to dark platform-side; the stored CHOICE
    // stays glass so the same config follows the user to a Mac. A
    // second notify fires once tokens have actually flipped, so
    // token-reading subscribers (stage color) repaint correctly.
    void applyTheme(current.theme).then(() => notify())
  }
  if (current.fadeDelayMs !== previous.fadeDelayMs) setFadeDelay(current.fadeDelayMs)
  if (current.windowOpacity !== previous.windowOpacity) {
    void window.ew.window.setOpacity(current.windowOpacity)
  }
}

/** Load once at boot, apply everything, and stay in cross-window
 * sync. Safe to await before mount; failures leave the defaults. */
export async function initSettings(): Promise<void> {
  if (initialized) return
  initialized = true
  try {
    const raw = await window.ew.settings.appAll()
    current = sanitize(raw)
    // CA-015 (AI-IMP-237): main flags a corrupt-file recovery once,
    // on the read that discovers it. A silent reset to defaults would
    // leave theme/library/first-run changes unexplained, so this is a
    // loud §8.6 toast rather than a quiet fallback.
    if (raw['recovered'] === true) {
      toast("Settings couldn't be read and were reset to defaults", {
        kind: 'error',
        surface: 'app-settings-recovered',
      })
    }
  } catch {
    current = { ...APP_SETTING_DEFAULTS }
  }
  await applyTheme(current.theme)
  setFadeDelay(current.fadeDelayMs)
  if (current.windowOpacity !== 1) void window.ew.window.setOpacity(current.windowOpacity)
  window.ew.settings.onAppChanged(({ key, value }) => {
    const next = sanitize({ ...current, [key]: value })
    const previous = current
    if (next[key as keyof AppSettings] === previous[key as keyof AppSettings]) return
    current = next
    applySideEffects(previous)
    notify()
  })
  notify()
}

export function appSettings(): AppSettings {
  return current
}

export function setAppSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
  if (current[key] === value) return
  const previous = current
  current = { ...current, [key]: value }
  applySideEffects(previous)
  notify()
  // Optimistic apply stays instant; a failed persist reverts it
  // instead of vanishing (CA-015 — the old code discarded this
  // promise entirely, so a rejection neither rolled back nor
  // notified).
  void window.ew.settings.setApp(key, value).then((result) => {
    if (result.ok) return
    if (current[key] !== value) return // superseded by a later set
    const stale = current
    current = { ...current, [key]: previous[key] }
    applySideEffects(stale)
    notify()
    toast(`Couldn't save that setting${result.message ? ` — ${result.message}` : ''}`, {
      kind: 'error',
      surface: 'app-settings-save-failed',
    })
  })
}

/** Fires immediately with the current settings; returns unsubscribe. */
export function onAppSettingsChanged(listener: Listener): () => void {
  listeners.add(listener)
  listener(current)
  return () => listeners.delete(listener)
}

/** Test-only: wipe module state so unit tests stay independent
 * (matches chrome/status.ts's __resetStatusForTests pattern). */
export function __resetSettingsForTests(): void {
  current = { ...APP_SETTING_DEFAULTS }
  listeners.clear()
  initialized = false
}
