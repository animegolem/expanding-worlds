import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { uuidv7 } from '@ew/domain'
import { CommandRegistry, type CommittedResult } from '@ew/commands'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Dispatcher, type CommandContext } from './dispatcher'
import { registerDecorationHandlers } from './handlers/decorations'
import { createProject, type ProjectHandle } from './project'
import { QueryRegistry } from './queries'
import { registerSearchQueries, type SearchResults } from './queries-search'

/**
 * AI-IMP-021: the normative canvas-text data shape is
 * {x, y, text, fontSize, color[, width]} (world units, RFC §4.9).
 * canvas_text_fts extracts json '$.text', so a text decoration
 * created through the service with the full shape MUST be findable
 * via searchProject. Guards the FTS contract against schema drift.
 */

let dir: string
let handle: ProjectHandle
let dispatcher: Dispatcher
let queries: QueryRegistry
let queryCtx: Omit<CommandContext, 'now'>

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-canvas-text-'))
  handle = createProject(dir, 'Canvas Text Data Test')
  const registry = new CommandRegistry<CommandContext>()
  registerDecorationHandlers(registry)
  dispatcher = new Dispatcher(handle, registry)
  queries = new QueryRegistry()
  registerSearchQueries(queries)
  queryCtx = {
    db: handle.db,
    projectId: handle.projectId,
    rootNodeId: handle.rootNodeId,
    rootCanvasId: handle.rootCanvasId,
  }
})

afterEach(() => {
  handle.close()
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
})

function committed(commandType: string, payload: unknown): CommittedResult {
  const result = dispatcher.execute({
    commandId: uuidv7(),
    projectId: handle.projectId,
    commandType,
    commandVersion: 1,
    issuedAt: new Date().toISOString(),
    payload,
  })
  expect(result).toMatchObject({ status: 'committed' })
  return result as CommittedResult
}

function search(q: string): SearchResults {
  const result = queries.run(queryCtx, 'searchProject', { query: q })
  expect(result).toMatchObject({ ok: true })
  return (result as { result: SearchResults }).result
}

describe('canvas text decoration data shape and FTS (AI-IMP-021)', () => {
  it('a text decoration created with the normative data shape is found by searchProject', () => {
    const decorationId = uuidv7()
    committed('CreateDecoration', {
      decorationId,
      canvasId: handle.rootCanvasId,
      kind: 'text',
      data: {
        x: 120.5,
        y: -40,
        text: 'ancient watchtower ruins',
        fontSize: 16,
        color: '#dde3ea',
      },
    })

    const hits = search('watchtower')
    expect(hits.canvasText).toEqual([
      {
        decorationId,
        canvasId: handle.rootCanvasId,
        snippet: expect.stringContaining('[watchtower]') as unknown as string,
      },
    ])
    expect(hits.notes).toEqual([])
    expect(hits.tags).toEqual([])
    expect(hits.assets).toEqual([])
  })

  it('editing data.text through UpdateDecoration keeps the FTS row current', () => {
    const decorationId = uuidv7()
    const data = {
      x: 0,
      y: 0,
      text: 'harbor light',
      fontSize: 24,
      color: '#ffcc00',
      width: 200,
    }
    committed('CreateDecoration', {
      decorationId,
      canvasId: handle.rootCanvasId,
      kind: 'text',
      data,
    })
    expect(search('harbor').canvasText).toHaveLength(1)

    committed('UpdateDecoration', {
      decorationId,
      set: { data: { ...data, text: 'granite jetty' } },
    })
    expect(search('harbor').canvasText).toEqual([])
    expect(search('jetty').canvasText).toHaveLength(1)
  })
})
