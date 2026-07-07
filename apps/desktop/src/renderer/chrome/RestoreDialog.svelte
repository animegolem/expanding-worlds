<!--
  Restore from backup… (RFC §11.4 rev 0.52, AI-IMP-121): a DIALOG, not
  a takeover — "leaving is not browsing" (§8.2), so time travel stays a
  small deliberate modal over the board rather than a full-window view.
  It lists the project's dated snapshots (the generated messages read as
  the poor-man's event log), and materializing a chosen one creates a
  NEW sibling project directory — never in-place. The §9 confirm names
  what will be created and states the current project is untouched.
  Portals to the root overlay host (§8.8 law 2) like Help/About; Esc or
  a scrim click closes. The list is a custom keyboard list — never a
  <datalist> (it segfaults hidden Electron).
-->
<script lang="ts">
  import type { RestoreResult, SnapshotEntry } from '@ew/protocol'
  import { overlayPortal } from '../note/panels'

  const { onclose }: { onclose: () => void } = $props()

  type Phase =
    | { kind: 'loading' }
    | { kind: 'error'; message: string }
    | { kind: 'list' }
    | { kind: 'confirm'; entry: SnapshotEntry }
    | { kind: 'restoring'; entry: SnapshotEntry }
    | { kind: 'done'; dir: string }
    | { kind: 'failed'; message: string }

  let entries = $state<SnapshotEntry[]>([])
  let phase = $state<Phase>({ kind: 'loading' })

  $effect(() => {
    let live = true
    void window.ew.snapshot
      .list()
      .then((list) => {
        if (!live) return
        entries = list
        phase = { kind: 'list' }
      })
      .catch((err: unknown) => {
        if (!live) return
        phase = { kind: 'error', message: err instanceof Error ? err.message : String(err) }
      })
    return () => {
      live = false
    }
  })

  $effect(() => {
    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onclose()
      }
    }
    // Capture so Esc closes the dialog before the menu/takeover sees it.
    window.addEventListener('keydown', onKeydown, true)
    return () => window.removeEventListener('keydown', onKeydown, true)
  })

  // The committer ISO timestamp reads as a human date+time in the user's
  // locale; the generated message carries the note/asset counts.
  function humanDate(iso: string): string {
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
  }

  function shortSha(sha: string): string {
    return sha.slice(0, 7)
  }

  async function confirmRestore(entry: SnapshotEntry): Promise<void> {
    phase = { kind: 'restoring', entry }
    let result: RestoreResult
    try {
      result = await window.ew.snapshot.restore(entry.sha)
    } catch (err) {
      phase = { kind: 'failed', message: err instanceof Error ? err.message : String(err) }
      return
    }
    phase = result.ok
      ? { kind: 'done', dir: result.dir }
      : { kind: 'failed', message: result.message }
  }
</script>

<!-- Click-off closes; Esc closes via the window handler above. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="scrim" role="presentation" onclick={onclose} use:overlayPortal>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-label="Restore from backup"
    tabindex="-1"
    data-testid="restore-dialog"
    onclick={(event) => event.stopPropagation()}
  >
    <h2>Restore from backup</h2>

    {#if phase.kind === 'loading'}
      <p class="note">Reading snapshot history…</p>
    {:else if phase.kind === 'error'}
      <p class="note error" data-testid="restore-error">
        Couldn't read the snapshot history: {phase.message}
      </p>
    {:else if phase.kind === 'list'}
      {#if entries.length === 0}
        <p class="note" data-testid="restore-empty">
          This project has no snapshots yet. Snapshots are recorded as you work once
          Session snapshots are turned on in Settings.
        </p>
      {:else}
        <p class="note">
          Pick a snapshot to restore. Each one becomes a new project folder beside this
          one — your current project is never changed.
        </p>
        <ul class="list" data-testid="restore-list">
          {#each entries as entry (entry.sha)}
            <li>
              <button
                type="button"
                class="row"
                data-testid="restore-row"
                data-sha={entry.sha}
                onclick={() => (phase = { kind: 'confirm', entry })}
              >
                <span class="row-date">{humanDate(entry.isoDate)}</span>
                <span class="row-message">{entry.message}</span>
                <span class="row-sha">{shortSha(entry.sha)}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    {:else if phase.kind === 'confirm'}
      <div data-testid="restore-confirm">
        <p class="note">
          Expanding Worlds will create a <strong>new project folder</strong> next to your
          current one — named for today's date, like
          <code>…-restored-{new Date().toISOString().slice(0, 10)}</code> — and fill it
          with the snapshot from <strong>{humanDate(phase.entry.isoDate)}</strong>.
        </p>
        <p class="note">
          Your current project is left exactly as it is. Nothing is rolled back, moved, or
          overwritten — this is a separate copy you can open on its own.
        </p>
      </div>
    {:else if phase.kind === 'restoring'}
      <p class="note" data-testid="restore-progress">Creating the restored copy…</p>
    {:else if phase.kind === 'done'}
      <div data-testid="restore-success">
        <p class="note">Restored copy created. Your current project was left untouched.</p>
        <p class="path" data-testid="restore-path">{phase.dir}</p>
      </div>
    {:else if phase.kind === 'failed'}
      <p class="note error" data-testid="restore-failed">
        The restore didn't complete: {phase.message}
      </p>
    {/if}

    <div class="actions">
      {#if phase.kind === 'confirm'}
        <button
          type="button"
          class="secondary"
          data-testid="restore-confirm-cancel"
          onclick={() => (phase = { kind: 'list' })}
        >
          Back
        </button>
        <button
          type="button"
          class="primary"
          data-testid="restore-confirm-accept"
          onclick={() => {
            if (phase.kind === 'confirm') void confirmRestore(phase.entry)
          }}
        >
          Create restored copy
        </button>
      {:else if phase.kind === 'done'}
        <button
          type="button"
          class="secondary"
          data-testid="restore-done"
          onclick={onclose}
        >
          Done
        </button>
        <button
          type="button"
          class="primary"
          data-testid="restore-open"
          onclick={() => {
            if (phase.kind === 'done') void window.ew.snapshot.open(phase.dir)
          }}
        >
          Open Restored Project
        </button>
      {:else if phase.kind === 'failed'}
        <button
          type="button"
          class="secondary"
          data-testid="restore-failed-back"
          onclick={() => (phase = { kind: 'list' })}
        >
          Back
        </button>
        <button type="button" class="primary" onclick={onclose}>Close</button>
      {:else}
        <button type="button" class="secondary" data-testid="restore-close" onclick={onclose}>
          Close
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  .scrim {
    position: absolute;
    inset: 0;
    z-index: 40;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--ew-dialog-scrim);
    pointer-events: auto;
  }

  .dialog {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    max-width: min(90%, 34rem);
    min-width: 22rem;
    max-height: 80%;
    padding: 0.9rem 1.1rem;
    background: var(--ew-paper-page);
    color: var(--ew-text);
    border: 1px solid var(--ew-paper-border-focus);
    border-radius: 6px;
    box-shadow: 0 6px 18px var(--ew-dialog-scrim);
  }

  h2 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
  }

  .note {
    margin: 0;
    font-size: 0.8rem;
    line-height: 1.4;
    color: var(--ew-text-soft);
  }

  .note.error {
    color: var(--ew-danger-muted);
  }

  .note code {
    font-family: ui-monospace, monospace;
    font-size: 0.75rem;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
  }

  .row {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: baseline;
    gap: 0.6rem;
    width: 100%;
    padding: 0.35rem 0.5rem;
    text-align: left;
    background: transparent;
    color: var(--ew-text);
    border: 1px solid var(--ew-border);
    border-radius: 4px;
    font: inherit;
    cursor: pointer;
  }

  .row:hover {
    background: var(--ew-surface-raised);
  }

  .row-date {
    font-size: 0.78rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .row-message {
    font-size: 0.72rem;
    color: var(--ew-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row-sha {
    font-family: ui-monospace, monospace;
    font-size: 0.7rem;
    color: var(--ew-text-subtle);
  }

  .path {
    margin: 0;
    padding: 0.4rem 0.5rem;
    background: var(--ew-surface-input);
    border-radius: 4px;
    font-family: ui-monospace, monospace;
    font-size: 0.72rem;
    color: var(--ew-text-soft);
    word-break: break-all;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .actions button {
    padding: 0.3rem 0.7rem;
    font: inherit;
    font-size: 0.8rem;
    border-radius: 4px;
    cursor: pointer;
  }

  .actions .primary {
    background: var(--ew-accent);
    color: var(--ew-on-accent);
    border: 1px solid var(--ew-accent);
  }

  .actions .secondary {
    background: transparent;
    color: var(--ew-text);
    border: 1px solid var(--ew-border-control);
  }
</style>
