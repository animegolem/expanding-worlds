import type { CommandResult } from '@ew/commands'

type Execute = (type: string, payload: unknown) => Promise<CommandResult>
type Group = <T>(fn: () => Promise<T>) => Promise<T>

export interface LocalTagDeleteResult {
  deleted: CommandResult
  suppressed: CommandResult | null
}

/** Delete and tombstone are one deliberate local gesture. Fail-stop is
 * significant: suppression is never attempted if DeleteTag did not commit. */
export function deleteLocalTag(
  execute: Execute,
  group: Group,
  tagId: string,
  key: string,
): Promise<LocalTagDeleteResult> {
  return group(async () => {
    const deleted = await execute('DeleteTag', { tagId })
    if (deleted.status !== 'committed') return { deleted, suppressed: null }
    const suppressed = await execute('SuppressTagSync', { nameKey: key })
    return { deleted, suppressed }
  })
}
