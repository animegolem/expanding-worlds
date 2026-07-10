export type ProjectSettingWriteResult =
  | { ok: true }
  | { ok: false; message: string }

export interface ProjectSettingWriterDeps {
  current: () => Record<string, unknown>
  replace: (settings: Record<string, unknown>) => void
  persist: (key: string, value: unknown) => Promise<ProjectSettingWriteResult>
  report: (message: string) => void
}

/** Result-aware optimistic project-setting writes, serialized by key generation. */
export class ProjectSettingWriter {
  readonly #generation = new Map<string, number>()
  readonly #deps: ProjectSettingWriterDeps

  constructor(deps: ProjectSettingWriterDeps) {
    this.#deps = deps
  }

  async write(key: string, value: unknown, label: string): Promise<boolean> {
    const before = this.#deps.current()
    const hadKey = Object.hasOwn(before, key)
    const previous = before[key]
    const generation = (this.#generation.get(key) ?? 0) + 1
    this.#generation.set(key, generation)
    this.#deps.replace({ ...before, [key]: value })

    let failure: string | null = null
    try {
      const result = await this.#deps.persist(key, value)
      if (!result.ok) failure = result.message
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error)
    }
    if (failure === null) return true

    // A later write owns the visible value now; never let this older
    // failure roll it back. Its own result will settle independently.
    if (this.#generation.get(key) === generation) {
      const current = { ...this.#deps.current() }
      if (hadKey) current[key] = previous
      else delete current[key]
      this.#deps.replace(current)
    }
    this.#deps.report(`Couldn't save ${label}: ${failure}`)
    return false
  }
}
