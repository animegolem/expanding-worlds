import { describe, expect, it } from 'vitest'
import { CommandRegistry } from '@ew/commands'
import {
  registerAssetHandlers,
  registerBookmarkHandlers,
  registerCanvasHandlers,
  registerDecorationHandlers,
  registerFrameHandlers,
  registerLifecycleHandlers,
  registerNodeHandlers,
  registerNoteHandlers,
  registerPinHandlers,
  registerPlacementHandlers,
  registerTagHandlers,
} from '@ew/persistence'
import { UNDO_POLICY } from './renderer/undo/undo-store'

/**
 * AI-IMP-233 / Sol CA-008: the command→undo policy matrix must classify
 * EVERY durable command, forever. This test diffs the matrix against the
 * authoritative persistence command registry — the same handler groups
 * `openProjectService` registers (service.ts). A new command shipped
 * without a matrix row turns this red (registry ⊄ matrix); a stale matrix
 * row that names no real command turns it red too (matrix ⊄ registry).
 *
 * It lives OUTSIDE src/renderer/** on purpose: RFC-0001 §11.1 forbids
 * renderer code from importing @ew/persistence, but this cross-boundary
 * invariant check must enumerate the real registry. Registration is
 * IO-free (no DB), so we build the registry directly; UNDO_POLICY is a
 * pure data table with no renderer runtime dependencies.
 */
function registeredCommandTypes(): string[] {
  const registry = new CommandRegistry<unknown>()
  const groups = [
    registerNodeHandlers,
    registerNoteHandlers,
    registerAssetHandlers,
    registerCanvasHandlers,
    registerPlacementHandlers,
    registerTagHandlers,
    registerDecorationHandlers,
    registerLifecycleHandlers,
    registerPinHandlers,
    registerBookmarkHandlers,
    registerFrameHandlers,
  ]
  for (const register of groups) {
    ;(register as unknown as (r: CommandRegistry<unknown>) => void)(registry)
  }
  return registry.commandTypes()
}

describe('undo policy matrix ↔ command registry (AI-IMP-233)', () => {
  const registered = new Set(registeredCommandTypes())
  const classified = new Set(Object.keys(UNDO_POLICY))

  it('classifies every registered durable command (no command ships unclassified)', () => {
    const unclassified = [...registered].filter((type) => !classified.has(type)).sort()
    expect(unclassified, `unclassified commands: ${unclassified.join(', ')}`).toEqual([])
  })

  it('names no command the registry does not have (no stale matrix rows)', () => {
    const stale = [...classified].filter((type) => !registered.has(type)).sort()
    expect(stale, `stale matrix rows: ${stale.join(', ')}`).toEqual([])
  })

  it('gives every row a valid class and a non-empty reason', () => {
    for (const [type, entry] of Object.entries(UNDO_POLICY)) {
      expect(['captured', 'group-only', 'exempt'], `${type}`).toContain(entry.class)
      expect(entry.why.length, `${type} needs a reason`).toBeGreaterThan(0)
    }
  })
})
