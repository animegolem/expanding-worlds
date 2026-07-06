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
}

export {}
