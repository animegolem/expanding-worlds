<script lang="ts">
  import NotePane from './NotePane.svelte'
  import Workspace from './Workspace.svelte'
  import { attachServiceStatus } from './chrome/status'

  // Service lifecycle → §8.6 toasts + perch (AI-IMP-066). Attached
  // here — before the canvas mounts — so an outage during startup
  // still raises its condition (§11.4: never a silent hang).
  attachServiceStatus()
</script>

<!--
  Provisional workspace layout per RFC-0001 §8.2: persistent note pane
  on the left, main workspace with the floating chrome frame. Status
  lives in toasts and the §8.6 perch — no docked strip.
-->
<div class="shell">
  <NotePane />
  <Workspace />
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
    grid-template-areas: 'note-pane workspace';
    /* The note pane sizes itself (300px, 28px collapsed). */
    grid-template-columns: auto 1fr;
    grid-template-rows: 1fr;
    height: 100%;
  }
</style>
