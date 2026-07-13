import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SceneDecoration } from '@ew/canvas-engine'
import type { CommandResult } from '@ew/commands'
import type { CanvasHostHandle } from './host'
import { commitRestyle, restyleEligibility, restyleValues } from './selection-restyle'

function decoration(kind: string, data: Record<string, unknown>, id = kind): SceneDecoration {
  return { itemKind: 'decoration', id, kind, data, renderOrder: 1, locked: 0, hidden: 0, groupId: null, anchorStartPlacementId: null, anchorEndPlacementId: null }
}

function committed(commandId: string): CommandResult {
  return { status: 'committed', commandId, revision: 2, affected: [], inverse: null }
}

describe('selection restyle eligibility', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('classifies the complete ◧ decoration census without admitting mixed families', () => {
    const text = decoration('text', { x: 0, y: 0, text: 'a', fontSize: 16, color: 'white' })
    const rect = decoration('shape', { shape: 'rect', x: 0, y: 0, width: 10, height: 10, stroke: 'white', strokeWidth: 2 }, 'rect')
    const ellipse = decoration('shape', { shape: 'ellipse', x: 0, y: 0, width: 10, height: 10, stroke: 'white', strokeWidth: 2 }, 'ellipse')
    const line = decoration('line', { x1: 0, y1: 0, x2: 10, y2: 10, stroke: 'white', strokeWidth: 2 })
    expect(restyleEligibility([text]).family).toBe('text')
    expect(restyleEligibility([text, { ...text, id: 'text-2' }]).family).toBe('text')
    expect(restyleEligibility([rect]).family).toBe('rect')
    expect(restyleEligibility([rect, ellipse]).family).toBe('shape')
    expect(restyleEligibility([ellipse, line]).family).toBe('stroke')
    expect(restyleEligibility([text, rect])).toMatchObject({ family: null, reason: expect.any(String) })
  })

  it('reads a stable lead snapshot for the kit controls', () => {
    const shape = decoration('shape', { shape: 'rect', x: 0, y: 0, width: 10, height: 10, stroke: 'red', strokeWidth: 3, fill: 'blue', cornerRadius: .2 })
    expect(restyleValues(shape)).toMatchObject({ stroke: 'red', strokeWidth: 3, fill: 'blue', cornerRadius: .2 })
  })

  it('commits a bulk patch in one tokened undo group', async () => {
    const a = decoration('line', { x1: 0, y1: 0, x2: 10, y2: 10, stroke: 'white', strokeWidth: 2 }, 'a')
    const b = decoration('line', { x1: 20, y1: 0, x2: 30, y2: 10, stroke: 'white', strokeWidth: 2 }, 'b')
    vi.stubGlobal('window', { ew: { project: { query: vi.fn().mockResolvedValue({ ok: true, result: [a, b] }) } } })
    const calls: Array<{ payload: unknown; token: symbol }> = []
    const execute = vi.fn(async (_type: string, payload: unknown, options: { groupToken: symbol }) => {
      calls.push({ payload, token: options.groupToken })
      return committed(`command-${calls.length}`)
    })
    await commitRestyle({ canvasId: 'canvas' } as CanvasHostHandle, [a, b], 'stroke', { stroke: 'red' }, execute)
    expect(calls).toHaveLength(2)
    expect(calls[0]!.token).toBe(calls[1]!.token)
    expect(calls.map((call) => (call.payload as { set: { data: { stroke: string } } }).set.data.stroke)).toEqual(['red', 'red'])
  })

  it('fail-stops a bulk patch at the first refused command', async () => {
    const items = ['a', 'b', 'c'].map((id, index) => decoration('line', { x1: index, y1: 0, x2: index + 1, y2: 1, stroke: 'white', strokeWidth: 2 }, id))
    vi.stubGlobal('window', { ew: { project: { query: vi.fn().mockResolvedValue({ ok: true, result: items }) } } })
    let count = 0
    const execute = vi.fn(async () => {
      count += 1
      return count === 2
        ? { status: 'conflict', commandId: 'command-2', expectedRevision: 1, actualRevision: 2 } satisfies CommandResult
        : committed(`command-${count}`)
    })
    await expect(commitRestyle({ canvasId: 'canvas' } as CanvasHostHandle, items, 'stroke', { strokeWidth: 3 }, execute)).rejects.toThrow('conflict')
    expect(execute).toHaveBeenCalledTimes(2)
  })
})
