import { CommandGateway } from '@ew/canvas-engine'
import { uuidv7 } from '@ew/domain'

/**
 * A renderer-level command door for surfaces that do not own a canvas host.
 * Each port threads its own observed project revision, while the gateway's
 * module-wide committed notice keeps the session undo coordinator informed.
 */
export async function createProjectCommandPort(): Promise<{
  gateway: CommandGateway
  dispose: () => void
}> {
  const response = await window.ew.project.query('getProject')
  if (!response.ok) throw new Error(response.message)
  const project = response.result as { id: string; revision: number }
  const gateway = new CommandGateway(
    { execute: (envelope) => window.ew.project.execute(envelope) },
    project.id,
    project.revision,
    uuidv7,
  )
  const unsubscribe = window.ew.project.onChanged((event) => gateway.noteRevision(event.revision))
  let disposed = false
  const dispose = (): void => {
    if (disposed) return
    disposed = true
    unsubscribe()
  }
  return { gateway, dispose }
}
