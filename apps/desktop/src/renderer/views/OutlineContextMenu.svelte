<script lang="ts">
  import type { OutlineContextMenuGroup } from '../outline/context-menu'
  import ActionContextMenu from './ActionContextMenu.svelte'

  const { x, y, groups, onclose }: {
    x: number
    y: number
    groups: readonly OutlineContextMenuGroup[]
    onclose: () => void
  } = $props()

</script>

<ActionContextMenu
  {x}
  {y}
  {groups}
  {onclose}
  testid="outline-context-menu"
  ariaLabel="Outline row actions"
/>
