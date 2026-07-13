import { describe, expect, it, vi } from 'vitest'
import type { CommandResult } from '@ew/commands'
import type { CommandGroupToken } from '@ew/canvas-engine'
import { setIdentityProfileImage, type IdentityProfileDeps } from './identity-profile'

function image(): File {
  return new File([new Uint8Array([1, 2, 3])], 'face.png', { type: 'image/png' })
}

function deps(): IdentityProfileDeps {
  return {
    importAsset: vi.fn(async () => ({ ok: true, assetId: 'asset-1' })),
    group: vi.fn(async (run) => run(Symbol('group') as CommandGroupToken)),
    setAppearance: vi.fn(async (): Promise<CommandResult> => ({
      status: 'committed', commandId: 'command-1', revision: 2, affected: [], inverse: null,
    })),
  }
}

describe('identity profile image', () => {
  it('imports and applies the face inside exactly one undo group', async () => {
    const d = deps()
    await expect(setIdentityProfileImage(d, 'node-1', image())).resolves.toEqual({ status: 'committed' })
    expect(d.importAsset).toHaveBeenCalledOnce()
    expect(d.group).toHaveBeenCalledOnce()
    expect(d.setAppearance).toHaveBeenCalledWith('node-1', 'asset-1', expect.any(Symbol))
  })

  it('fails stop when import or appearance apply refuses', async () => {
    const d = deps()
    vi.mocked(d.importAsset).mockResolvedValue({ ok: false, message: 'disk full' })
    await expect(setIdentityProfileImage(d, 'node-1', image())).resolves.toEqual({
      status: 'failed', message: 'disk full',
    })
    expect(d.group).not.toHaveBeenCalled()

    const d2 = deps()
    vi.mocked(d2.setAppearance).mockResolvedValue({
      status: 'error', commandId: 'command-2', code: 'IO', message: 'write refused',
    })
    await expect(setIdentityProfileImage(d2, 'node-1', image())).resolves.toEqual({
      status: 'failed', message: 'write refused',
    })
  })

  it('refuses non-images before import', async () => {
    const d = deps()
    const file = new File(['words'], 'note.txt', { type: 'text/plain' })
    await expect(setIdentityProfileImage(d, 'node-1', file)).resolves.toMatchObject({ status: 'failed' })
    expect(d.importAsset).not.toHaveBeenCalled()
  })

  it('lets managed-asset sniffing decide files whose shell omitted MIME', async () => {
    const d = deps()
    const file = new File([new Uint8Array([1, 2, 3])], 'shell-drag.png')
    await expect(setIdentityProfileImage(d, 'node-1', file)).resolves.toEqual({ status: 'committed' })
    expect(d.importAsset).toHaveBeenCalledOnce()
  })
})
