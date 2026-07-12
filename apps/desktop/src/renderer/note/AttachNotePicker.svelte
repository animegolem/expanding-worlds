<!--
  Attach-note picker (RFC-0001 §6.6/§8.3, AI-IMP-049/211): the note
  charm's chooser, presented as a true command palette (CommandPalette).
  Injected verbs: `search` lists attachable ACTIVE titles via
  suggestTitles; `oncommit` attaches an existing note; `oncreate` creates
  the typed title AND attaches it, then opens the note tethered beside its
  node (§8.5) — no mouse between typing and reading. Title collisions on
  the create path route through the §7.7 dialog — Use Existing attaches
  the conflicting note.
-->
<script lang="ts">
  import { uuidv7 } from '@ew/domain'
  import type { CanvasHostHandle } from '../canvas/host'
  import CommandPalette, { type PaletteItem } from './CommandPalette.svelte'
  import { requestOpenNote } from './open-note'
  import TitleConflictDialog, { type TitleConflict } from './TitleConflictDialog.svelte'
  import { toast } from '../chrome/status'

  let {
    handle,
    nodeId,
    onclose,
  }: { handle: CanvasHostHandle; nodeId: string; onclose: () => void } = $props()

  interface Suggestion {
    title: string
    noteId: string | null
    phantom: boolean
    inTrash: boolean
  }

  let error = $state<string | null>(null)
  let conflict = $state<TitleConflict | null>(null)

  async function search(query: string): Promise<PaletteItem[]> {
    const response = await window.ew.project.query('suggestTitles', { query })
    if (!response.ok) return []
    // Attach targets are existing ACTIVE notes only (never phantoms /
    // trashed), and only ones with a real note id to attach.
    return (response.result as Suggestion[])
      .filter((s) => !s.phantom && !s.inTrash && s.noteId !== null)
      .map((s) => ({ id: s.noteId!, label: s.title }))
  }

  function createLabel(query: string): string {
    return `Create “${query}”`
  }

  /**
   * cursor-drop choice (AI-IMP-211): open the just-attached note TETHERED
   * beside its node, reusing the §8.5 anchored-open path. The palette
   * always attaches to a node that ALREADY has a placement on the active
   * canvas (the note charm sits on it), so §8.5's "a note opens tethered
   * beside its node" IS the honest "under the cursor" — and it needs no
   * new spawn-at-screen or pin-a-panel machinery, and never contradicts
   * "pinning is the user's act alone." The placement pre-exists the
   * create, so items() carries it with no scene change to await; if it is
   * somehow gone we fall back to the store's own anchor resolve.
   */
  function openBesideNode(noteId_: string, title: string): void {
    const placement = handle.controller
      .items()
      .find((item) => item.itemKind === 'placement' && item.nodeId === nodeId)
    if (placement && placement.itemKind === 'placement') {
      requestOpenNote(noteId_, {
        canvasId: handle.canvasId,
        placementId: placement.id,
        label: title,
      })
    } else {
      requestOpenNote(noteId_)
    }
  }

  async function attach(noteId_: string): Promise<void> {
    const result = await handle.gateway.execute('AttachNoteToNode', { nodeId, noteId: noteId_ })
    if (result.status === 'committed') onclose()
    else error = result.status === 'error' ? result.message : 'the project changed underneath'
  }

  async function createAndAttach(rawTitle: string): Promise<void> {
    const title = rawTitle.trim()
    if (title.length === 0) return
    const noteId_ = uuidv7()
    // AI-IMP-086: one act, ONE command — a failed attach can no longer
    // strand a loose note reserving the title.
    const created = await handle.gateway.execute('CreateNoteAndAttach', {
      nodeId,
      noteId: noteId_,
      title,
    })
    if (created.status === 'committed') {
      openBesideNode(noteId_, title)
      onclose()
      return
    }
    if (created.status === 'error' && created.code === 'NOTE_TITLE_CONFLICT') {
      const details = created.details ?? {}
      conflict = {
        flow: 'create',
        requestedTitle: title,
        existingNoteId: String(details['existingNoteId'] ?? ''),
        conflictingLifecycle: details['conflictingLifecycle'] === 'trashed' ? 'trashed' : 'active',
      }
      return
    }
    error = created.status === 'error' ? created.message : 'the project changed underneath'
  }
</script>

<CommandPalette
  testid="attach-picker"
  placeholder="Search notes or type a new title…"
  {search}
  {createLabel}
  {error}
  oncommit={(item) => void attach(item.id)}
  oncreate={(query) => void createAndAttach(query)}
  {onclose}
/>

{#if conflict}
  <TitleConflictDialog
    {conflict}
    onOpenExisting={() => (conflict = null)}
    onUseExisting={(noteId_) => {
      conflict = null
      void attach(noteId_)
    }}
    onRestoreExisting={(noteId_) => {
      conflict = null
      void (async () => {
        const restored = await handle.gateway.execute('RestoreRecord', {
          kind: 'note',
          id: noteId_,
        })
        if (restored.status === 'committed') await attach(noteId_)
        else toast("couldn't restore that note — it's still in trash.", { kind: 'error' })
      })()
    }}
    onChooseDifferent={() => (conflict = null)}
  />
{/if}
