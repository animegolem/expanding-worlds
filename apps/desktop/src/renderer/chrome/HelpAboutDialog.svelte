<!--
  Help/About (RFC §8.2): the ☰ menu's one live self-teaching card —
  app name, the REAL running version (main's app.getVersion via the
  preload seam, never hardcoded), and the repo address as plain text.
  Portals to the root overlay host (§8.8 law 2): the menu popover is
  a small clipped box, so a backdropped dialog must escape it. Esc or
  a click on the scrim closes.
-->
<script lang="ts">
  import { overlayPortal } from '../note/panels'

  const { onclose }: { onclose: () => void } = $props()

  const REPO_URL = 'https://github.com/animegolem/expanding-worlds'

  let version = $state('')

  $effect(() => {
    let live = true
    void window.ew.app
      .getVersion()
      .then((v) => {
        if (live) version = v
      })
      .catch(() => undefined)
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
</script>

<!-- Click-off closes; Esc closes via the window handler above, so the
     scrim needs no key handler of its own. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="scrim"
  role="presentation"
  onclick={onclose}
  use:overlayPortal
>
  <!-- Stop clicks inside the card from reaching the scrim's close. -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-label="About Expanding Worlds"
    tabindex="-1"
    data-testid="help-about-dialog"
    onclick={(event) => event.stopPropagation()}
  >
    <h2>Expanding Worlds</h2>
    <p class="version" data-testid="help-about-version">
      Version {version || '…'}
    </p>
    <p class="repo" data-testid="help-about-repo">{REPO_URL}</p>
    <div class="actions">
      <button type="button" data-testid="help-about-close" onclick={onclose}>Close</button>
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
    /* Portaled into the root overlay host (pointer-events:none); opt
       back into hit-testing so the scrim catches close clicks. */
    pointer-events: auto;
  }

  .dialog {
    max-width: 90%;
    min-width: 15rem;
    padding: 0.9rem 1.1rem;
    background: var(--ew-paper-page);
    color: var(--ew-text);
    border: 1px solid var(--ew-paper-border-focus);
    border-radius: 6px;
    box-shadow: 0 6px 18px var(--ew-dialog-scrim);
  }

  h2 {
    margin: 0 0 0.4rem;
    font-size: 0.95rem;
    font-weight: 600;
  }

  .version {
    margin: 0 0 0.3rem;
    font-size: 0.8rem;
  }

  .repo {
    margin: 0 0 0.7rem;
    font-size: 0.75rem;
    font-family: ui-monospace, monospace;
    opacity: 0.75;
    word-break: break-all;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
  }

  .actions button {
    padding: 0.3rem 0.7rem;
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }
</style>
