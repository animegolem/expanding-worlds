import type { EwApi } from '../preload/index'
import type { ThemeName } from './theme'

declare module '*.svelte' {
  import type { Component } from 'svelte'
  const component: Component
  export default component
}

declare global {
  interface Window {
    ew: EwApi
    __ewTheme: {
      apply: (theme: ThemeName) => Promise<ThemeName>
      current: () => ThemeName
    }
  }
  /** The RFC revision, injected at build time from the RFC header
   * (electron.vite.config.ts `define`). Help/About prints it. */
  const __RFC_REV__: string
}

export {}
