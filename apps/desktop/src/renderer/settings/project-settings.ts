import type { SetSettingResponse } from '@ew/protocol'
import { toast } from '../chrome/status'

export type ProjectSettingPersist = (key: string, value: unknown) => Promise<SetSettingResponse>

export interface ProjectSettingState {
  read(key: string): unknown
  apply(key: string, value: unknown): void
}

export interface ProjectSettingWriter {
  write(key: string, value: unknown): Promise<boolean>
}

/** Gate an effect that would otherwise advertise an unsaved draft. */
export async function runAfterProjectSettingSaved<T>(
  save: () => Promise<boolean>,
  run: () => Promise<T>,
): Promise<T | null> {
  if (!(await save())) return null
  return run()
}

interface PendingWrite {
  value: unknown
  promise: Promise<boolean>
}

/** One result-aware project-setting writer for renderer surfaces. Values
 * apply optimistically, persistence is serialized per key, and only the
 * latest failed write rolls back to the last confirmed value. Identical
 * in-flight writes share their promise (the remote blur + Test race). */
export function createProjectSettingWriter(
  state: ProjectSettingState,
  persist: ProjectSettingPersist = (key, value) => window.ew.settings.setProject(key, value),
): ProjectSettingWriter {
  const confirmed = new Map<string, unknown>()
  const generations = new Map<string, number>()
  const tails = new Map<string, Promise<boolean>>()
  const pending = new Map<string, PendingWrite>()

  const write = (key: string, value: unknown): Promise<boolean> => {
    const matching = pending.get(key)
    if (matching && Object.is(matching.value, value)) return matching.promise

    const tail = tails.get(key)
    if (!tail) {
      const current = state.read(key)
      if (Object.is(current, value)) return Promise.resolve(true)
      confirmed.set(key, current)
    }

    const generation = (generations.get(key) ?? 0) + 1
    generations.set(key, generation)
    state.apply(key, value)

    const run = async (): Promise<boolean> => {
      let result: SetSettingResponse | null = null
      let transportMessage: string | null = null
      try {
        result = await persist(key, value)
      } catch (err) {
        transportMessage = err instanceof Error ? err.message : String(err)
      }

      if (result?.ok) {
        confirmed.set(key, value)
        return true
      }

      if (generations.get(key) === generation) state.apply(key, confirmed.get(key))
      const message = result && !result.ok ? result.message : transportMessage
      toast(`Couldn't save that project setting${message ? ` — ${message}` : ''}`, {
        kind: 'error',
        surface: 'project-settings-save-failed',
      })
      return false
    }

    const prior = tail ?? Promise.resolve(true)
    const promise = prior.then(run).finally(() => {
      if (tails.get(key) === promise) tails.delete(key)
      if (pending.get(key)?.promise === promise) pending.delete(key)
    })
    tails.set(key, promise)
    pending.set(key, { value, promise })
    return promise
  }

  return { write }
}
