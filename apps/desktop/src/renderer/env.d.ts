import type { EwApi } from '../preload/index'

declare module '*.svelte' {
  import type { Component } from 'svelte'
  const component: Component
  export default component
}

declare global {
  interface Window {
    ew: EwApi
  }
}

export {}
