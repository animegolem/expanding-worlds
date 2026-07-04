import type { Op, RendererAdapter, Scene } from '../adapter'

/**
 * Renders nothing; validates the harness end to end and provides the
 * measurement floor (pure harness overhead) to subtract mentally from
 * real adapter numbers.
 */
export function createNoopAdapter(): Promise<RendererAdapter> {
  let host: HTMLElement | null = null
  const adapter: RendererAdapter = {
    name: 'noop',
    mount(el: HTMLElement): Promise<void> {
      host = el
      return Promise.resolve()
    },
    loadScene(_scene: Scene): Promise<void> {
      return Promise.resolve()
    },
    applyOp(_op: Op): void {
      /* intentionally empty */
    },
    unmount(): Promise<void> {
      host = null
      void host
      return Promise.resolve()
    },
  }
  return Promise.resolve(adapter)
}
