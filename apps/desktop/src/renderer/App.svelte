<script lang="ts">
  import Workspace from './Workspace.svelte'
  import { attachServiceStatus } from './chrome/status'

  // Service lifecycle → §8.6 toasts + perch (AI-IMP-066). Attached
  // here — before the canvas mounts — so an outage during startup
  // still raises its condition (§11.4: never a silent hang).
  attachServiceStatus()
</script>

<!--
  The window is the board (RFC §8.2, AI-IMP-064): the canvas fills
  the shell; chrome floats over it and notes live in §8.5 floating
  panels. Nothing docks, nothing reflows.
-->
<div class="shell">
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
    grid-template-areas: 'workspace';
    grid-template-columns: 1fr;
    grid-template-rows: 1fr;
    height: 100%;
  }
</style>
