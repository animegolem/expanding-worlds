<!--
  Completing tag add-field (RFC §4.8 rev 0.45, AI-IMP-108): the second
  door for "assign at the moment of arranging" — the same grammar as
  the `#` charm popover, mounted in the note panel's chip row (§8.5).
  Type → existing tags complete by name_key, Enter assigns the typed
  name, novel text creates-and-assigns in one gesture. Completion is a
  custom list (NEVER <datalist> — it segfaults hidden Electron windows,
  AI-IMP-069). The find-or-create logic is the shared tag-assign helper.
-->
<script lang="ts">
  import { onMount } from 'svelte'
  import {
    assignTagByName,
    filterTagCompletions,
    type ExecuteCommand,
    type TagOption,
  } from './tag-assign'
  import { runAsUndoGroup } from '../undo/undo-store'

  const {
    nodeId,
    execute,
    onAssigned,
  }: {
    nodeId: string
    execute: ExecuteCommand
    /** Refresh the chips in place after a successful assign. */
    onAssigned: () => void
  } = $props()

  let tagName = $state('')
  let focused = $state(false)
  let allTags = $state<TagOption[]>([])
  let busy = $state(false)
  let errorMessage = $state<string | null>(null)

  async function loadVocab(): Promise<void> {
    const response = await window.ew.project.query('listTags')
    if (response.ok) allTags = response.result as TagOption[]
  }
  onMount(loadVocab)

  function completions(): TagOption[] {
    return tagName.trim().length === 0 ? [] : filterTagCompletions(allTags, tagName)
  }

  async function assign(name: string): Promise<void> {
    if (busy) return
    busy = true
    errorMessage = null
    try {
      // AI-IMP-182: one add-tag gesture = one Mod+Z. The group folds the
      // create-and-assign pair into a single entry (both GROUP_ONLY).
      const outcome = await runAsUndoGroup((groupToken) =>
        assignTagByName(
          (commandType, payload) => execute(commandType, payload, { groupToken }),
          nodeId,
          name,
          allTags,
        ),
      )
      if (outcome.status !== 'committed') {
        errorMessage = "that tag didn't stick — try again."
        return
      }
      tagName = ''
      // Refresh the vocabulary so a just-created tag completes next,
      // then let the panel rebuild its chips.
      await loadVocab()
      onAssigned()
    } finally {
      busy = false
    }
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault()
      void assign(tagName)
    }
  }
</script>

<span class="tag-add" data-testid="tag-add-field">
  <input
    type="text"
    data-testid="tag-add-input"
    placeholder="add tag…"
    bind:value={tagName}
    disabled={busy}
    onfocus={() => (focused = true)}
    onblur={() => (focused = false)}
    onkeydown={onKeydown}
  />
  {#if focused && tagName && completions().length > 0}
    <span class="completions" data-testid="tag-add-completions">
      {#each completions() as tag (tag.id)}
        <button
          type="button"
          data-testid="tag-add-option"
          onpointerdown={(event) => {
            event.preventDefault()
            void assign(tag.name)
          }}
        >
          {tag.name}
        </button>
      {/each}
    </span>
  {/if}
</span>
{#if errorMessage}<span class="assign-error" role="alert">{errorMessage}</span>{/if}

<style>
  .tag-add {
    position: relative;
    display: inline-flex;
  }

  .assign-error { color: var(--ew-danger); font-size: 0.7rem; }

  input {
    width: 6.5rem;
    box-sizing: border-box;
    padding: 0 0.45rem;
    border: 1px solid var(--ew-paper-chip-border);
    border-radius: 8px;
    background: var(--ew-paper-page);
    color: var(--ew-paper-chip-text);
    font: inherit;
    font-size: 0.7rem;
    line-height: 1.5;
  }

  input:focus {
    outline: none;
    border-color: var(--ew-paper-border-focus);
  }

  .completions {
    position: absolute;
    top: calc(100% + 0.2rem);
    left: 0;
    z-index: 1;
    display: flex;
    flex-direction: column;
    min-width: 7rem;
    background: var(--ew-surface-menu);
    border: 1px solid var(--ew-border);
    border-radius: 6px;
    overflow: hidden;
  }

  .completions button {
    padding: 0.2rem 0.5rem;
    background: transparent;
    border: none;
    color: var(--ew-text);
    font: inherit;
    font-size: 0.7rem;
    text-align: left;
    cursor: pointer;
  }

  .completions button:hover {
    background: var(--ew-surface-raised);
  }
</style>
