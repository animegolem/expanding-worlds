import type { CommandResult } from '@ew/commands'
import type { CommandGroupToken } from '@ew/canvas-engine'

interface ImportedAsset {
  ok: boolean
  assetId?: string
  message?: string
}

export interface IdentityProfileDeps {
  importAsset(input: { bytes: Uint8Array; originalFilename: string }): Promise<ImportedAsset>
  group<T>(run: (token: CommandGroupToken) => Promise<T>): Promise<T>
  setAppearance(
    nodeId: string,
    assetId: string,
    token: CommandGroupToken,
  ): Promise<CommandResult>
}

export type IdentityProfileResult =
  | { status: 'committed' }
  | { status: 'failed'; message: string }

/** Import is the ordinary managed-asset ingress; the durable face mutation is
 * one fail-stop undo group. A failed apply leaves only a GC-eligible orphan. */
export async function setIdentityProfileImage(
  deps: IdentityProfileDeps,
  nodeId: string,
  file: File,
): Promise<IdentityProfileResult> {
  // Windows shell drags can omit MIME even for valid image files. Let the
  // managed-asset ingress sniff those bytes; reject only a declared non-image.
  if (file.type.length > 0 && !file.type.startsWith('image/')) {
    return { status: 'failed', message: 'Choose an image for this world’s face' }
  }
  const imported = await deps.importAsset({
    bytes: new Uint8Array(await file.arrayBuffer()),
    originalFilename: file.name || 'image',
  })
  if (!imported.ok || !imported.assetId) {
    return { status: 'failed', message: imported.message || 'Image import failed' }
  }
  return deps.group(async (token) => {
    const result = await deps.setAppearance(nodeId, imported.assetId!, token)
    if (result.status === 'committed') return { status: 'committed' }
    return {
      status: 'failed',
      message:
        result.status === 'error'
          ? result.message
          : 'The project changed underneath — try setting the face again',
    }
  })
}
