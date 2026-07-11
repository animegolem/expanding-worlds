import { describe, expect, it, vi } from 'vitest'
import { pullTagsFromLibrary, type TagSyncPullDeps } from './tag-sync'

function deps() {
  const pull = vi.fn<TagSyncPullDeps['pull']>(async () => ({ ok: true, added: 0 }))
  const notice = vi.fn<(message: string) => void>()
  return { pull, notice }
}

describe('library tag pull', () => {
  it('emits one aggregate notice only when tags were added', async () => {
    const d = deps()
    d.pull.mockResolvedValue({ ok: true, added: 3 })
    await pullTagsFromLibrary(d)
    expect(d.notice).toHaveBeenCalledOnce()
    expect(d.notice).toHaveBeenCalledWith('3 tags arrived from the library')
  })

  it('silently skips unavailable and failed pulls', async () => {
    const skipped = deps()
    skipped.pull.mockResolvedValue({ ok: true, added: 0, skipped: 'unavailable' })
    await pullTagsFromLibrary(skipped)
    expect(skipped.notice).not.toHaveBeenCalled()

    const failed = deps()
    failed.pull.mockResolvedValue({ ok: false, code: 'SERVICE_UNAVAILABLE', message: 'offline' })
    await pullTagsFromLibrary(failed)
    expect(failed.notice).not.toHaveBeenCalled()
  })
})
