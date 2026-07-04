import type { AdapterFactory } from './adapter'
import { createNoopAdapter } from './adapters/noop'

/**
 * Adapter registry. AI-IMP-002 registers 'pixi'; AI-IMP-003 registers
 * 'konva'. Each entry lazy-imports its renderer so the bundle only
 * pays for what runs.
 */
export const adapters: Record<string, AdapterFactory> = {
  noop: createNoopAdapter,
  konva: () => import('./adapters/konva').then((m) => m.createKonvaAdapter()),
}
