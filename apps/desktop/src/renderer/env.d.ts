import type { EwApi } from '../preload/index'

declare global {
  interface Window {
    ew: EwApi
  }
}

export {}
