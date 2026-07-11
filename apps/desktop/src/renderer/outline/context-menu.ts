import type { OutlineVerb, OutlineVerbGroup, OutlineVerbId } from './actions'

/** Pure context-menu projection; the Svelte surface owns positioning/closing. */
export interface OutlineContextMenuItem {
  id: OutlineVerbId
  label: string
  shortcut: string
  danger: boolean
  run?: () => void
  disabledReason?: string
}

export interface OutlineContextMenuGroup {
  id: OutlineVerbGroup
  items: readonly OutlineContextMenuItem[]
}

const GROUP_ORDER: readonly OutlineVerbGroup[] = ['primary', 'note-and-tag', 'danger']

/**
 * Preserve the inventory's offers exactly while adding menu dividers through
 * groups. Disabled reasons are data, not tooltips, so the renderer can print
 * them inline. The destructive group is always final and contains only trash.
 */
export function buildOutlineContextMenu(
  inventory: readonly OutlineVerb[],
): readonly OutlineContextMenuGroup[] {
  const groups = GROUP_ORDER.flatMap((id): OutlineContextMenuGroup[] => {
    const items = inventory
      .filter((verb) => verb.group === id)
      .map(({ id, label, shortcut, danger, run, disabledReason }) => ({
        id,
        label,
        shortcut,
        danger,
        ...(run ? { run } : {}),
        ...(disabledReason ? { disabledReason } : {}),
      }))
    return items.length > 0 ? [{ id, items }] : []
  })

  validateOutlineContextMenu(groups)
  return groups
}

export function validateOutlineContextMenu(groups: readonly OutlineContextMenuGroup[]): void {
  const items = groups.flatMap((group) => group.items)
  const groupIds = groups.map((group) => group.id)
  if (new Set(groupIds).size !== groupIds.length) {
    throw new Error('outline menu: a group may appear only once')
  }
  const order = groupIds.map((id) => GROUP_ORDER.indexOf(id))
  if (order.some((position, index) => index > 0 && position <= order[index - 1]!)) {
    throw new Error('outline menu: groups are out of canonical order')
  }
  const itemIds = items.map((item) => item.id)
  if (new Set(itemIds).size !== itemIds.length) {
    throw new Error('outline menu: a verb may appear only once')
  }
  const danger = groups.find((group) => group.id === 'danger')
  if (danger && groups.at(-1) !== danger) {
    throw new Error('outline menu: destructive group must be last')
  }
  if (danger && (danger.items.length !== 1 || danger.items[0]?.id !== 'trash')) {
    throw new Error('outline menu: destructive group must contain trash alone')
  }
  for (const group of groups) {
    for (const item of group.items) {
      if (item.danger !== (group.id === 'danger')) {
        throw new Error(`outline menu: "${item.id}" has the wrong danger treatment`)
      }
      const modes = Number(item.run !== undefined) + Number(item.disabledReason !== undefined)
      if (modes !== 1) throw new Error(`outline menu: "${item.id}" must be enabled or disabled`)
      if (item.disabledReason !== undefined && item.disabledReason.trim() === '') {
        throw new Error(`outline menu: "${item.id}" needs a visible disabled reason`)
      }
    }
  }
}
