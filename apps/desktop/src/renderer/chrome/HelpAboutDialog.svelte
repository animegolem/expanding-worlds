<!--
  Help/About (RFC §8.4 rev 0.55, AI-IMP-137): the ☰ menu's one live
  self-teaching card, ratified copy. Plain type where a mark would go
  (deliberately no logo); the version and RFC revision print in mono —
  the version is main's real app.getVersion (never hardcoded) and the
  RFC rev is injected at BUILD time from the RFC header (__RFC_REV__,
  electron.vite.config.ts). A two-line product sentence carries the
  copies-never-touches promise; one "all keyboard shortcuts" link opens
  Settings → Keyboard; the repo address sits in micro mono.

  Portals to the root overlay host (§8.8 law 2): the menu popover is a
  small clipped box, so a backdropped dialog must escape it. Esc or a
  click on the scrim closes.
-->
<script lang="ts">
  import { overlayPortal } from '../note/panels'
  import { openTakeover } from './takeover'

  // `onclose` dismisses this dialog; `onCloseRail` closes the ☰ popover
  // that hosts it. The shortcuts link must close the rail before the
  // Settings takeover opens — the dialog lives INSIDE MenuPopover's
  // `{#if}`, so the rail's close unmounts it, and without it the popover
  // (z 500) stays painted over the takeover (z 300). AI-IMP-155.
  const { onclose, onCloseRail }: { onclose: () => void; onCloseRail: () => void } = $props()

  const REPO_URL = 'https://github.com/animegolem/expanding-worlds'
  // Injected at build time from the RFC header (see env.d.ts).
  const RFC_REV = __RFC_REV__

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

  function openKeyboardShortcuts(): void {
    // Close the rail FIRST (unmounting this dialog with it), then open
    // the takeover — mirroring the Settings row's ordering so the ☰
    // popover never lingers above the takeover. openTakeover is module
    // state, so it still runs after this component unmounts. AI-IMP-155.
    onCloseRail()
    openTakeover('settings')
    // Best-effort: bring the Keyboard section into view once the
    // settings takeover has mounted. Retries briefly, then gives up.
    let tries = 0
    const scroll = (): void => {
      const section = document.querySelector('[data-testid="settings-section-keyboard"]')
      if (section) {
        section.scrollIntoView({ block: 'start' })
        return
      }
      if (tries++ < 20) requestAnimationFrame(scroll)
    }
    requestAnimationFrame(scroll)
  }
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
    <h2 class="wordmark">Expanding Worlds</h2>

    <p class="meta" data-testid="help-about-version">
      Version {version || '…'} · RFC {RFC_REV}
    </p>

    <p class="tagline" data-testid="help-about-tagline">
      An art-first board where any picture can become a doorway.
      Your pictures are copied in, never touched.
    </p>

    <button
      type="button"
      class="shortcuts"
      data-testid="help-about-shortcuts"
      onclick={openKeyboardShortcuts}
    >
      all keyboard shortcuts ▸
    </button>

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
    min-width: 17rem;
    padding: 1rem 1.15rem;
    background: var(--ew-paper-page);
    color: var(--ew-text);
    border: 1px solid var(--ew-paper-border-focus);
    border-radius: 6px;
    box-shadow: 0 6px 18px var(--ew-dialog-scrim);
  }

  /* Plain type where a mark would go — deliberately no logo. */
  .wordmark {
    margin: 0 0 0.5rem;
    font-size: 1rem;
    font-weight: 600;
    letter-spacing: 0.01em;
  }

  .meta {
    margin: 0 0 0.7rem;
    font-family: ui-monospace, monospace;
    font-size: 0.78rem;
    opacity: 0.85;
  }

  .tagline {
    margin: 0 0 0.8rem;
    font-size: 0.82rem;
    line-height: 1.45;
    max-width: 24rem;
  }

  .shortcuts {
    display: inline-block;
    margin: 0 0 0.9rem;
    padding: 0;
    font: inherit;
    font-size: 0.8rem;
    color: var(--ew-accent);
    background: transparent;
    border: none;
    cursor: pointer;
  }

  .shortcuts:hover {
    text-decoration: underline;
  }

  .repo {
    margin: 0 0 0.9rem;
    font-size: 0.68rem;
    font-family: ui-monospace, monospace;
    opacity: 0.6;
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
