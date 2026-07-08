import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CanvasHostHandle } from '../canvas/host'
import { requestRevealNote } from './open-note'

/**
 * AI-IMP-184 (M-20): revealNote resolves an async getNoteUses before it
 * seats the "Fly here" chooser. Without a generation token an OLDER
 * activation whose query resolves LAST would hijack the chooser the user
 * is now interacting with. These tests drive the race — two reveals in
 * flight, the older resolving after the newer — and assert the stale one
 * is ignored.
 */

vi.mock('./project-port', () => ({
  createNoteProjectPort: vi.fn(() => new Promise<never>(() => {})), // never settles
}))

interface QueryResponse {
  ok: boolean
  result: unknown
}

// Pending getNoteUses resolvers, in call order, so a test resolves them
// out of order to model the race.
let noteUsesResolvers: Array<(response: QueryResponse) => void> = []

type Handler = (event: { type: string; detail: unknown }) => void
let handlers: Map<string, Set<Handler>>

function stubWindow(): void {
  handlers = new Map()
  const win = {
    addEventListener: (type: string, handler: Handler) => {
      if (!handlers.has(type)) handlers.set(type, new Set())
      handlers.get(type)!.add(handler)
    },
    removeEventListener: (type: string, handler: Handler) => {
      handlers.get(type)?.delete(handler)
    },
    dispatchEvent: (event: { type: string; detail: unknown }) => {
      for (const handler of handlers.get(event.type) ?? []) handler(event)
      return true
    },
    ew: {
      app: { onFlushRequest: () => () => {} },
      settings: { onProjectChanged: () => () => {} },
      project: {
        query: (name: string) => {
          if (name === 'getNoteUses') {
            return new Promise<QueryResponse>((resolve) => noteUsesResolvers.push(resolve))
          }
          // getSettings (attachLandmarks) and anything else: empty ok.
          return Promise.resolve({ ok: true, result: {} })
        },
      },
    },
  }
  ;(globalThis as unknown as { window: unknown }).window = win
}

function fakeHandle(): CanvasHostHandle {
  return {
    canvasId: 'canvas-1',
    controller: {
      selection: { onChanged: () => () => {} },
      items: () => [],
    },
  } as unknown as CanvasHostHandle
}

/** A two-placement uses view, so revealNote takes the chooser branch
 * (not the single-placement fly, which would need navigation plumbing). */
function usesFor(noteId: string): QueryResponse {
  return {
    ok: true,
    result: {
      totalPlacements: 2,
      canvases: [
        {
          canvasId: 'canvas-1',
          canvasTitle: noteId,
          isRoot: true,
          nodes: [
            {
              nodeId: `node-${noteId}`,
              placements: [{ placementId: `${noteId}-a` }, { placementId: `${noteId}-b` }],
            },
          ],
        },
      ],
    },
  }
}

describe('revealNote staleness guard (AI-IMP-184 M-20)', () => {
  beforeEach(() => {
    noteUsesResolvers = []
    stubWindow()
  })
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window
    vi.resetModules()
  })

  it('ignores an older reveal whose query resolves after a newer one', async () => {
    const { attachPanels, onChooserChanged } = await import('./panels')
    attachPanels(fakeHandle())

    let chooserNoteId: string | null = null
    onChooserChanged((state) => {
      chooserNoteId = state?.noteId ?? null
    })

    // Two "Fly here" activations land back to back; both start their
    // getNoteUses query before either resolves.
    requestRevealNote('note-old', 'Old')
    requestRevealNote('note-new', 'New')
    expect(noteUsesResolvers).toHaveLength(2)

    // The NEWER query resolves first and seats its chooser.
    noteUsesResolvers[1]!(usesFor('note-new'))
    await Promise.resolve()
    await Promise.resolve()
    expect(chooserNoteId).toBe('note-new')

    // The OLDER query resolves last — it is stale and must NOT hijack
    // the chooser the user is now looking at.
    noteUsesResolvers[0]!(usesFor('note-old'))
    await Promise.resolve()
    await Promise.resolve()
    expect(chooserNoteId).toBe('note-new')
  })

  it('a lone reveal still seats its chooser (guard does not block the happy path)', async () => {
    const { attachPanels, onChooserChanged } = await import('./panels')
    attachPanels(fakeHandle())

    let chooserNoteId: string | null = null
    onChooserChanged((state) => {
      chooserNoteId = state?.noteId ?? null
    })

    requestRevealNote('note-solo', 'Solo')
    expect(noteUsesResolvers).toHaveLength(1)
    noteUsesResolvers[0]!(usesFor('note-solo'))
    await Promise.resolve()
    await Promise.resolve()
    expect(chooserNoteId).toBe('note-solo')
  })
})
