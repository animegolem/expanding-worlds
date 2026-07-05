import { uuidv7 } from '@ew/domain'
import { isHittable, type SceneDecoration } from '@ew/canvas-engine'
import type { CanvasHostHandle } from './host'

/**
 * Decoration selection controls (§6.8, AI-IMP-021): group/ungroup,
 * lock/unlock, hide/show over the existing commands. Group semantics:
 * clicking one member selects the whole group — the selection
 * listener expands any partially selected group to its (hittable)
 * members, so a group drag flows through the normal gesture pipeline
 * as one TransformContent. Hidden decorations stay in the scene
 * snapshot (invisible), which is what the hidden-items list reads.
 */

export interface DecorationsUi {
  selectedDecorations(): SceneDecoration[]
  hiddenDecorations(): SceneDecoration[]
  groupSelection(): Promise<void>
  ungroupSelection(): Promise<void>
  setLockedOnSelection(locked: boolean): Promise<void>
  hideSelection(): Promise<void>
  show(decorationId: string): Promise<void>
  destroy(): void
}

export function createDecorationsUi(handle: CanvasHostHandle): DecorationsUi {
  const { controller, gateway } = handle

  const decorations = (): SceneDecoration[] =>
    controller
      .items()
      .filter((item): item is SceneDecoration => item.itemKind === 'decoration')

  // Group expansion: selecting any member selects the whole group.
  // selection.set() re-notifies synchronously; on the re-entrant call
  // the expansion is already complete, so it returns without setting
  // again (loop guard by fixpoint).
  const offSelection = controller.selection.onChanged((ids) => {
    if (ids.length === 0) return
    const items = controller.items()
    const groups = new Set<string>()
    const selected = new Set(ids)
    for (const item of items) {
      if (
        item.itemKind === 'decoration' &&
        item.groupId !== null &&
        selected.has(item.id)
      ) {
        groups.add(item.groupId)
      }
    }
    if (groups.size === 0) return
    const expanded = new Set(ids)
    for (const item of items) {
      if (
        item.itemKind === 'decoration' &&
        item.groupId !== null &&
        groups.has(item.groupId) &&
        isHittable(item)
      ) {
        expanded.add(item.id)
      }
    }
    if (expanded.size !== ids.length) controller.selection.set([...expanded])
  })

  const selectedDecorations = (): SceneDecoration[] =>
    decorations().filter((d) => controller.selection.has(d.id))

  return {
    selectedDecorations,

    hiddenDecorations() {
      return decorations().filter((d) => d.hidden === 1)
    },

    async groupSelection() {
      const ids = selectedDecorations().map((d) => d.id)
      if (ids.length < 2) return
      await gateway.execute('GroupDecorations', {
        groupId: uuidv7(),
        canvasId: handle.canvasId,
        decorationIds: ids,
      })
    },

    async ungroupSelection() {
      const groupIds = new Set(
        selectedDecorations()
          .map((d) => d.groupId)
          .filter((g): g is string => g !== null),
      )
      for (const groupId of groupIds) {
        await gateway.execute('UngroupDecorations', { groupId })
      }
      // Restore individual selection semantics: keep the current ids
      // selected; without groupIds the expansion listener is inert.
    },

    async setLockedOnSelection(locked: boolean) {
      for (const d of selectedDecorations()) {
        if ((d.locked === 1) === locked) continue
        await gateway.execute('UpdateDecoration', { decorationId: d.id, set: { locked } })
      }
    },

    async hideSelection() {
      const targets = selectedDecorations().filter((d) => d.hidden === 0)
      for (const d of targets) {
        await gateway.execute('UpdateDecoration', { decorationId: d.id, set: { hidden: true } })
      }
      // Hidden items are unhittable; drop them from the selection.
      const hiddenIds = new Set(targets.map((d) => d.id))
      controller.selection.set(controller.selection.ids().filter((id) => !hiddenIds.has(id)))
    },

    async show(decorationId: string) {
      await gateway.execute('UpdateDecoration', { decorationId, set: { hidden: false } })
    },

    destroy() {
      offSelection()
    },
  }
}
