import { isTextData, type CommandGroupToken, type SceneDecoration } from '@ew/canvas-engine'
import type { CommandResult } from '@ew/commands'
import { runAsUndoGroup } from '../undo/undo-store'
import { measureTextWorld } from './text-entry'
import type { CanvasHostHandle } from './host'
export type RestyleFamily = 'text' | 'stroke' | 'shape' | 'rect'

const STROKE_KINDS = new Set(['shape', 'line', 'arrow', 'path', 'connector'])

export interface RestyleEligibility {
  family: RestyleFamily | null
  reason: string | null
}

/** The ruled ◧ census. Placements never enter this helper. A bulk
 * selection is eligible only when every selected decoration shares a
 * control family, so a gesture never silently skips half a selection. */
export function restyleEligibility(items: readonly SceneDecoration[]): RestyleEligibility {
  if (items.length === 0) return { family: null, reason: 'Restyle needs a drawn shape or text' }
  if (items.every((item) => item.kind === 'text' && isTextData(item.data))) {
    return { family: 'text', reason: null }
  }
  if (!items.every((item) => STROKE_KINDS.has(item.kind))) {
    return { family: null, reason: 'Restyle needs one shared style family' }
  }
  const allShapes = items.every((item) => item.kind === 'shape')
  if (!allShapes) return { family: 'stroke', reason: null }
  const allRects = items.every((item) => (item.data as { shape?: string }).shape === 'rect')
  return { family: allRects ? 'rect' : 'shape', reason: null }
}

export interface RestyleValues {
  stroke: string
  strokeWidth: number
  fill: string
  color: string
  fontSize: number
  fontFamily: string
  bold: boolean
  italic: boolean
  cornerRadius: number
}

export function restyleValues(lead: SceneDecoration): RestyleValues {
  const data = lead.data as Record<string, unknown>
  return {
    stroke: typeof data['stroke'] === 'string' ? data['stroke'] : '',
    strokeWidth: typeof data['strokeWidth'] === 'number' ? data['strokeWidth'] : 2,
    fill: typeof data['fill'] === 'string' ? data['fill'] : '',
    color: typeof data['color'] === 'string' ? data['color'] : '',
    fontSize: typeof data['fontSize'] === 'number' ? data['fontSize'] : 16,
    fontFamily: typeof data['fontFamily'] === 'string' ? data['fontFamily'] : 'sans-serif',
    bold: data['bold'] === true,
    italic: data['italic'] === true,
    cornerRadius: typeof data['cornerRadius'] === 'number' ? data['cornerRadius'] : 0,
  }
}

export type RestyleExecute = (
  commandType: string,
  payload: unknown,
  options: { groupToken: CommandGroupToken },
) => Promise<CommandResult>

function failure(result: CommandResult): Error {
  if (result.status === 'error') return new Error(result.message)
  return new Error(`Restyle failed: ${result.status}`)
}

/** Compose against fresh rows and commit one fail-stop undo group. */
export async function commitRestyle(
  host: CanvasHostHandle,
  targets: readonly SceneDecoration[],
  family: RestyleFamily,
  patch: Record<string, unknown>,
  execute: RestyleExecute = (type, payload, options) => host.gateway.execute(type, payload, options),
): Promise<void> {
  const response = await window.ew.project.query('getCanvasContents', { canvasId: host.canvasId })
  if (!response.ok) throw new Error('Restyle failed: the canvas could not be read')
  const byId = new Map(
    (response.result as Array<{ id: string; data?: unknown }>).map((item) => [item.id, item]),
  )
  await runAsUndoGroup(async (groupToken) => {
    for (const target of targets) {
      const fresh = byId.get(target.id)
      if (!fresh || typeof fresh.data !== 'object' || fresh.data === null)
        throw new Error('Restyle failed: the selection changed')
      const base = fresh.data as Record<string, unknown>
      const next: Record<string, unknown> = { ...base }
      if (family === 'text') {
        Object.assign(next, patch)
        if (!isTextData(next)) throw new Error('Restyle failed: invalid text style')
        Object.assign(next, measureTextWorld(next.text, next))
      } else {
        if (typeof patch['stroke'] === 'string') next['stroke'] = patch['stroke']
        if (typeof patch['strokeWidth'] === 'number' && patch['strokeWidth'] > 0)
          next['strokeWidth'] = patch['strokeWidth']
        if ((family === 'shape' || family === 'rect') && 'fill' in patch) {
          if (patch['fill'] === null) delete next['fill']
          else if (typeof patch['fill'] === 'string') next['fill'] = patch['fill']
        }
        if (family === 'rect' && typeof patch['cornerRadius'] === 'number')
          next['cornerRadius'] = patch['cornerRadius']
      }
      const result = await execute(
        'UpdateDecoration',
        { decorationId: target.id, set: { data: next } },
        { groupToken },
      )
      if (result.status !== 'committed') throw failure(result)
    }
  })
}
