<script lang="ts">
  import NotePane from './NotePane.svelte'
  import StatusStrip from './StatusStrip.svelte'
  import Workspace from './Workspace.svelte'
</script>

<!--
  Provisional workspace layout per RFC-0001 §8.2: persistent note pane
  on the left, tabbed main workspace, status strip along the bottom.
-->
<div class="shell">
  <NotePane />
  <Workspace />
  <StatusStrip />
</div>

<style>
  :global(html, body) {
    margin: 0;
    height: 100%;
  }

  :global(body) {
    font: 14px/1.5 system-ui, sans-serif;
    color: #222;
  }

  :global(#app) {
    height: 100%;
  }

  .shell {
    display: grid;
    grid-template-areas:
      'note-pane workspace'
      'status status';
    /* The note pane sizes itself (300px, 28px collapsed). */
    grid-template-columns: auto 1fr;
    grid-template-rows: 1fr auto;
    height: 100%;
  }
</style>
