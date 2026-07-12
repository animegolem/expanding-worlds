<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { itemWorldAABB, type ScenePlacement } from '@ew/canvas-engine'
  import { uuidv7 } from '@ew/domain'
  import { placeAnchoredElement, type AnchoredElementOptions } from '../chrome/anchored-placement-dom'
  import { requestOpenNote } from '../note/open-note'
  import TitleConflictDialog, { type TitleConflict } from '../note/TitleConflictDialog.svelte'
  import { appSettings, setAppSetting } from '../settings/settings'
  import Button from '../ui/Button.svelte'
  import TextInput from '../ui/TextInput.svelte'
  import { Z } from '../z'
  import type { CanvasHostHandle } from './host'
  import { requestCaptionEditor } from './caption-request'
  import { commitCaptionPromotion, type PromotionRoute } from './caption-promotion'

  let {
    handle,
    hostElement,
    placementId,
    onclose,
  }: {
    handle: CanvasHostHandle
    hostElement: HTMLElement
    placementId: string
    onclose: () => void
  } = $props()

  const placement = $derived(
    handle.controller
      .items()
      .find((item): item is ScenePlacement => item.itemKind === 'placement' && item.id === placementId),
  )
  const caption = $derived(placement?.caption ?? '')
  const initialRouting = appSettings().captionPromotionRouting
  let route = $state<PromotionRoute | null>(initialRouting === 'ask' ? null : initialRouting)
  let remember = $state(false)
  let bodyTitle = $state('')
  let bodyTitleInput = $state<HTMLInputElement | null>(null)
  let working = $state(initialRouting === 'title')
  let error = $state<string | null>(null)
  let partial = $state(false)
  let conflict = $state<TitleConflict | null>(null)
  let conflictRoute = $state<PromotionRoute | null>(null)

  function anchor(): AnchoredElementOptions {
    const bounds = placement ? itemWorldAABB(placement) : null
    const camera = handle.controller.camera
    const topLeft = bounds ? camera.worldToScreen({ x: bounds.x, y: bounds.y }) : { x: 0, y: 0 }
    const bottomRight = bounds
      ? camera.worldToScreen({ x: bounds.x + bounds.width, y: bounds.y + bounds.height })
      : topLeft
    return {
      anchor: {
        x: Math.min(topLeft.x, bottomRight.x),
        y: Math.min(topLeft.y, bottomRight.y),
        width: Math.abs(bottomRight.x - topLeft.x),
        height: Math.abs(bottomRight.y - topLeft.y),
      },
      host: { x: 0, y: 0, width: hostElement.clientWidth, height: hostElement.clientHeight },
      x: { preferred: 'center' },
      y: { preferred: 'after', fallback: 'before' },
      gap: 8,
      margin: 8,
    }
  }

  function failureMessage(prefix: string, result: { status: string; message?: string }): string {
    if (result.status === 'error') return `${prefix}: ${result.message ?? 'command refused'}`
    return `${prefix}: the project changed underneath (retry)`
  }

  function titleConflict(
    result: { status: string; code?: string; details?: Record<string, unknown> },
    requestedTitle: string,
  ): TitleConflict | null {
    if (result.status !== 'error' || result.code !== 'NOTE_TITLE_CONFLICT') return null
    const details = result.details ?? {}
    return {
      flow: 'promotion',
      requestedTitle,
      existingNoteId: String(details['existingNoteId'] ?? ''),
      conflictingLifecycle: details['conflictingLifecycle'] === 'trashed' ? 'trashed' : 'active',
    }
  }

  async function promote(nextRoute: PromotionRoute, alreadyWorking = false): Promise<void> {
    if (!placement || placement.noteId !== null || caption.length === 0) {
      onclose()
      return
    }
    if (working && !alreadyWorking) return
    const requestedTitle = nextRoute === 'title' ? caption : bodyTitle.trim()
    if (requestedTitle.length === 0) {
      error = 'Give the note a title.'
      await tick()
      bodyTitleInput?.focus()
      return
    }
    working = true
    error = null
    partial = false
    try {
      const outcome = await commitCaptionPromotion(
        (commandType, payload, options) => handle.gateway.execute(commandType, payload, options),
        {
          placementId: placement.id,
          nodeId: placement.nodeId,
          noteId: uuidv7(),
          caption,
          route: nextRoute,
          ...(nextRoute === 'body' ? { bodyTitle: requestedTitle } : {}),
        },
      )
      if (outcome.status === 'committed') {
        if (remember && initialRouting === 'ask') {
          setAppSetting('captionPromotionRouting', nextRoute)
        }
        onclose()
        return
      }
      if (outcome.status === 'create-refused') {
        const found = titleConflict(outcome.result, requestedTitle)
        if (found) {
          conflictRoute = nextRoute
          conflict = found
        } else {
          error = failureMessage('Could not create the note', outcome.result)
        }
        return
      }
      partial = true
      error = failureMessage(
        'The note was created, but its caption could not be cleared',
        outcome.result,
      )
    } catch (reason) {
      error = `Could not promote the caption: ${reason instanceof Error ? reason.message : String(reason)}`
    } finally {
      working = false
    }
  }

  function chooseBody(): void {
    route = 'body'
    error = null
    void tick().then(() => bodyTitleInput?.focus())
  }

  function chooseDifferent(): void {
    const failedRoute = conflictRoute
    conflict = null
    conflictRoute = null
    if (failedRoute === 'body') {
      route = 'body'
      void tick().then(() => bodyTitleInput?.focus())
      return
    }
    const targetPlacementId = placementId
    onclose()
    // Let the conflict button's click finish before focusing the editor.
    // Opening during the same activation lets the retiring button take
    // focus back, immediately blurring (and committing/closing) it.
    setTimeout(() => requestCaptionEditor(targetPlacementId), 50)
  }

  function openExisting(noteId: string): void {
    requestOpenNote(noteId)
    onclose()
  }

  async function restoreExisting(noteId: string): Promise<void> {
    const result = await handle.gateway.execute('RestoreRecord', { kind: 'note', id: noteId })
    if (result.status === 'committed') {
      requestOpenNote(noteId)
      onclose()
      return
    }
    conflict = null
    conflictRoute = null
    error = failureMessage('Could not restore the conflicting note', result)
  }

  function onKeydown(event: KeyboardEvent): void {
    if (!conflict && event.key === 'Escape' && !working) {
      event.preventDefault()
      onclose()
    }
  }

  onMount(() => {
    if (!placement || placement.caption === null || placement.noteId !== null) {
      onclose()
      return
    }
    if (initialRouting === 'title') void promote('title', true)
    else if (initialRouting === 'body') void tick().then(() => bodyTitleInput?.focus())
  })
</script>

<svelte:window onkeydown={onKeydown} />

{#if conflict}
  <TitleConflictDialog
    {conflict}
    onOpenExisting={openExisting}
    onUseExisting={() => {}}
    onRestoreExisting={(noteId) => void restoreExisting(noteId)}
    onChooseDifferent={chooseDifferent}
  />
{:else if initialRouting !== 'title' || error}
  <div
    class="promotion"
    use:placeAnchoredElement={anchor}
    role="dialog"
    aria-label="Promote caption to note"
    data-testid="promote-caption-dialog"
    style:z-index={Z.popover}
  >
    {#if initialRouting === 'ask' && !partial}
      <span class="question">Use the caption as the note’s…</span>
      <div class="actions">
        <Button
          variant="default"
          data-testid="promote-caption-title"
          disabled={working}
          onclick={() => void promote('title')}>Title</Button
        >
        <Button
          variant="default"
          data-testid="promote-caption-body"
          disabled={working}
          onclick={chooseBody}>Body</Button
        >
      </div>
    {/if}

    {#if route === 'body' && !partial}
      <form onsubmit={(event) => { event.preventDefault(); void promote('body') }}>
        <label for="promote-caption-body-title">Note title</label>
        <TextInput
          id="promote-caption-body-title"
          data-testid="promote-caption-body-title"
          variant="standard"
          bind:ref={bodyTitleInput}
          bind:value={bodyTitle}
          autocomplete="off"
        />
        <Button
          variant="accent"
          data-testid="promote-caption-submit-body"
          disabled={working || bodyTitle.trim().length === 0}
          onclick={() => void promote('body')}
        >Promote</Button>
      </form>
    {/if}

    {#if initialRouting === 'ask' && !partial}
      <label class="remember">
        <input type="checkbox" data-testid="promote-caption-remember" bind:checked={remember} />
        Remember this choice
      </label>
    {/if}

    {#if error}
      <p class="error" role="alert" data-testid="promote-caption-error">{error}</p>
      {#if partial || initialRouting === 'title'}
        <Button variant="secondary" data-testid="promote-caption-close" onclick={onclose}>Close</Button>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .promotion {
    position: absolute;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    width: min(20rem, calc(100% - 1rem));
    box-sizing: border-box;
    padding: 0.65rem 0.75rem;
    background: var(--ew-surface-menu);
    color: var(--ew-text-soft);
    border: 1px solid var(--ew-border-panel);
    border-radius: 8px;
    box-shadow: 0 8px 22px var(--ew-shadow);
    pointer-events: auto;
    font-size: 0.85rem;
  }

  .question {
    line-height: 1.3;
  }

  .actions,
  form {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  form label {
    color: var(--ew-text-muted);
    font-size: 0.78rem;
    white-space: nowrap;
  }

  form :global(.ew-text-input) {
    min-width: 0;
    flex: 1;
  }

  .remember {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--ew-text-muted);
    font-size: 0.78rem;
    cursor: pointer;
  }

  .error {
    margin: 0;
    color: var(--ew-danger-text);
    font-size: 0.78rem;
  }
</style>
