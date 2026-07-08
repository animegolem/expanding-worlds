<script lang="ts">
  import { onMount } from 'svelte'
  import Workspace from './Workspace.svelte'
  import { attachServiceStatus, attachSnapshotPush } from './chrome/status'
  import { mountFeelDial } from './dev/feel-dial'
  import { mountUndo } from './undo/undo-keys'

  // Service lifecycle → §8.6 toasts + perch (AI-IMP-066). Attached
  // here — before the canvas mounts — so an outage during startup
  // still raises its condition (§11.4: never a silent hang).
  attachServiceStatus()

  // §11.4 remote push (AI-IMP-122): the background push's ongoing-perch
  // and once-per-episode failure toast. Attached here so a push begun
  // in a prior window (retained state) is caught on mount.
  attachSnapshotPush()

  // §10.2 structural undo/redo stack + Mod+Z driver (AI-IMP-114).
  onMount(mountUndo)

  // AI-IMP-206 dev feel-dial: the ⌥⇧⌘F tuning overlay. Present in
  // release builds by design (the remote tester dials feel on his own
  // Windows build); hidden until the chord opens it. onMount's return
  // is the disposer.
  onMount(mountFeelDial)
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
    color: var(--ew-body-text);
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
