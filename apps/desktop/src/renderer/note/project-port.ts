import { uuidv7 } from '@ew/domain'
import { CommandGateway } from '@ew/canvas-engine'
import type { ProjectPort } from './note-editor'

/**
 * ProjectPort over the preload bridge for the note pane (AI-IMP-044).
 * Deliberately independent of the canvas host's gateway: the editor
 * must work even when canvas boot fails, and each surface threads its
 * own observed revision. Returns the port plus a dispose for the
 * project-changed subscription.
 */
export async function createNoteProjectPort(): Promise<{
  port: ProjectPort
  dispose: () => void
}> {
  async function query<T>(name: string, args?: unknown): Promise<T> {
    const response = await window.ew.project.query(name, args)
    if (!response.ok) throw new Error(`${name} failed: ${response.code} ${response.message}`)
    return response.result as T
  }

  const project = await query<{ id: string; revision: number }>('getProject')
  const gateway = new CommandGateway(
    { execute: (envelope) => window.ew.project.execute(envelope) },
    project.id,
    project.revision,
    uuidv7,
  )
  const dispose = window.ew.project.onChanged((event) => {
    gateway.noteRevision(event.revision)
  })

  return {
    port: {
      execute: (commandType, payload, opts) =>
        gateway.execute(commandType, payload, opts?.checkRevision === false ? { checkRevision: false } : {}),
      query,
    },
    dispose,
  }
}
