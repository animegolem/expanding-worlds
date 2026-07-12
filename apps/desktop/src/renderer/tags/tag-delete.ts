import type { CommandResult } from '@ew/commands'
import type { CommandExecutionOptions, CommandGroupToken } from '@ew/canvas-engine'

type Execute = (
  type: string,
  payload: unknown,
  options?: CommandExecutionOptions,
) => Promise<CommandResult>
type Group = <T>(fn: (token?: CommandGroupToken) => Promise<T>) => Promise<T>

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
  return group(async (groupToken) => {
    const options = groupToken === undefined ? {} : { groupToken }
    const deleted = await execute('DeleteTag', { tagId }, options)
    if (deleted.status !== 'committed') return { deleted, suppressed: null }
    const suppressed = await execute('SuppressTagSync', { nameKey: key }, options)
    return { deleted, suppressed }
  })
}
