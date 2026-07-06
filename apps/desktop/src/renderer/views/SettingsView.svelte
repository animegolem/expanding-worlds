<!--
  Settings takeover content (RFC §11.5, AI-IMP-074): the full Phase 1
  inventory, exhaustible in one glance. Controls commit on click —
  there is no save step — and appearance changes apply live to the
  world behind the translucent inset sheet (TakeoverLayer owns the
  sheet chrome). Features that don't exist yet render aria-disabled
  with an "arrives with…" tooltip, the same grammar as the waiting
  rail charms. Tiers are invisible here: app-tier keys go through the
  settings store, trash retention dispatches its §9 command.
-->
<script lang="ts">
  import {
    COMMAND_SET_TRASH_RETENTION,
    type SetTrashRetentionPayload,
    type TrashRetention,
  } from '@ew/commands'
  import { toast } from '../chrome/status'
  // §8.2 keymap registry (AI-IMP-117): the Keyboard section reads the
  // declared bindings. The side-effect import guarantees they are
  // registered even if this view somehow renders before main's import.
  import '../keys/bindings'
  import { bindingsInScope, formatCombo, type Scope } from '../keys/registry'
  import {
    APP_SETTING_DEFAULTS,
    appSettings,
    onAppSettingsChanged,
    setAppSetting,
    type AppSettings,
  } from '../settings/settings'

  let settings = $state<AppSettings>({ ...APP_SETTING_DEFAULTS })
  let retention = $state<TrashRetention>('never')
  let projectId = $state<string | null>(null)
  let projectSettings = $state<Record<string, unknown>>({})

  $effect(() => onAppSettingsChanged((next) => (settings = { ...next })))

  $effect(() => {
    void (async () => {
      try {
        const project = await runQuery<{ id: string }>('getProject')
        projectId = project.id
        retention = await runQuery<TrashRetention>('getTrashRetention')
        projectSettings = await runQuery<Record<string, unknown>>('getSettings')
      } catch {
        // The rows render on defaults; retention control disables
        // itself while projectId is unknown.
      }
    })()
  })

  async function runQuery<T>(name: string, args?: unknown): Promise<T> {
    const response = await window.ew.project.query(name, args)
    if (!response.ok) throw new Error(`${name} failed: ${response.code}`)
    return response.result as T
  }

  const RETENTIONS: TrashRetention[] = ['never', '30d', '60d', '90d']
  async function setRetention(value: TrashRetention): Promise<void> {
    if (!projectId || value === retention) return
    const previous = retention
    retention = value
    const result = await window.ew.project.execute({
      commandId: window.ew.util.newId(),
      projectId,
      commandType: COMMAND_SET_TRASH_RETENTION,
      commandVersion: 1,
      issuedAt: new Date().toISOString(),
      payload: { retention: value } satisfies SetTrashRetentionPayload,
    })
    if (result.status !== 'committed') {
      retention = previous
      const detail = result.status === 'error' ? result.message : 'revision conflict'
      toast(`Couldn't change Trash retention: ${detail}`, { kind: 'error' })
    }
  }

  const FLAT_SWATCHES = [1, 2, 3, 4, 5, 6].map((n) => `--ew-canvas-flat-${n}`)
  const isMac = navigator.platform.startsWith('Mac')

  const FADE_MIN_S = 1
  const FADE_MAX_S = 15
  function fadeSeconds(): number {
    return settings.fadeDelayMs === 'never'
      ? FADE_MAX_S
      : Math.round(settings.fadeDelayMs / 1000)
  }

  const RETENTION_LABELS: Record<TrashRetention, string> = {
    never: 'Never',
    '30d': '30 days',
    '60d': '60 days',
    '90d': '90 days',
  }

  // §8.2: every registered binding, grouped by scope, view-only.
  // Rebinding is deferred (§8.2) — the head note states the plan
  // rather than the page reading finished-and-limited.
  const KEYBOARD_SCOPES: Array<{ scope: Scope; label: string }> = [
    { scope: 'global', label: 'Everywhere' },
    { scope: 'board', label: 'On a board' },
    { scope: 'gallery', label: 'In the gallery' },
  ]
  const keyboardGroups = KEYBOARD_SCOPES.map(({ scope, label }) => ({
    label,
    bindings: bindingsInScope(scope),
  })).filter((group) => group.bindings.length > 0)
</script>

{#snippet segmented(
  testid: string,
  options: { value: string; label: string }[],
  selected: string,
  pick: (value: string) => void,
)}
  <div class="segmented" role="group">
    {#each options as option (option.value)}
      <button
        type="button"
        class="segment"
        class:selected={selected === option.value}
        data-testid={`${testid}-${option.value}`}
        aria-pressed={selected === option.value}
        onclick={() => pick(option.value)}
      >
        {option.label}
      </button>
    {/each}
  </div>
{/snippet}

{#snippet deferredRow(label: string, note: string, hint: string, testid: string)}
  <div class="row deferred" data-testid={testid} aria-disabled="true" title={hint}>
    <span class="row-label">{label}</span>
    <span class="row-note">{note}</span>
  </div>
{/snippet}

<div class="settings" data-testid="settings-view">
  <section>
    <h2>Appearance</h2>

    <div class="row" data-testid="settings-row-theme">
      <span class="row-label">Theme</span>
      {@render segmented(
        'settings-theme',
        [
          { value: 'dark', label: 'Dark' },
          { value: 'light', label: 'Light' },
          { value: 'glass', label: 'Glass' },
        ],
        settings.theme,
        (value) => setAppSetting('theme', value as AppSettings['theme']),
      )}
    </div>

    {@render deferredRow(
      'Grid',
      'none · lines · dots',
      'arrives with the grid feature',
      'settings-row-grid',
    )}

    <div class="row" data-testid="settings-row-flat-color">
      <span class="row-label">Flat canvas color</span>
      <div class="swatches">
        <button
          type="button"
          class="swatch off"
          class:selected={settings.flatCanvasColor === 'off'}
          data-testid="settings-flat-off"
          aria-pressed={settings.flatCanvasColor === 'off'}
          title="Theme surface"
          onclick={() => setAppSetting('flatCanvasColor', 'off')}
        >
          ×
        </button>
        {#each FLAT_SWATCHES as token, index (token)}
          <button
            type="button"
            class="swatch"
            class:selected={settings.flatCanvasColor === token}
            style={`background: var(${token})`}
            data-testid={`settings-flat-${index + 1}`}
            aria-pressed={settings.flatCanvasColor === token}
            onclick={() => setAppSetting('flatCanvasColor', token)}
          >
          </button>
        {/each}
      </div>
    </div>

    <div class="row" data-testid="settings-row-opacity">
      <span class="row-label">Window opacity</span>
      <input
        type="range"
        min="0.3"
        max="1"
        step="0.05"
        value={settings.windowOpacity}
        data-testid="settings-opacity"
        oninput={(event) =>
          setAppSetting('windowOpacity', Number(event.currentTarget.value))}
      />
    </div>
  </section>

  <section>
    <h2>Behavior</h2>

    <div class="row" data-testid="settings-row-charm-corner">
      <span class="row-label">Charm corner</span>
      {@render segmented(
        'settings-charm-corner',
        [
          { value: 'lower-right', label: 'Lower right' },
          { value: 'upper-right', label: 'Upper right' },
        ],
        settings.charmCorner,
        (value) => setAppSetting('charmCorner', value as AppSettings['charmCorner']),
      )}
    </div>

    <div class="row" data-testid="settings-row-fade">
      <span class="row-label">Chrome fade delay</span>
      <div class="fade-controls">
        <input
          type="range"
          min={FADE_MIN_S}
          max={FADE_MAX_S}
          step="1"
          value={fadeSeconds()}
          disabled={settings.fadeDelayMs === 'never'}
          data-testid="settings-fade"
          oninput={(event) =>
            setAppSetting('fadeDelayMs', Number(event.currentTarget.value) * 1000)}
        />
        <span class="row-note">
          {settings.fadeDelayMs === 'never' ? '—' : `${fadeSeconds()} s`}
        </span>
        <button
          type="button"
          class="segment"
          class:selected={settings.fadeDelayMs === 'never'}
          data-testid="settings-fade-never"
          aria-pressed={settings.fadeDelayMs === 'never'}
          onclick={() =>
            setAppSetting(
              'fadeDelayMs',
              settings.fadeDelayMs === 'never' ? APP_SETTING_DEFAULTS.fadeDelayMs : 'never',
            )}
        >
          Never fade
        </button>
      </div>
    </div>

    {@render deferredRow(
      'Snap to grid',
      'off',
      'arrives with grid snapping (§6.9)',
      'settings-row-snap',
    )}

    {@render deferredRow(
      'Obsidian vault beside the project',
      projectSettings['vault_mirror'] === true ? 'on' : 'off',
      'arrives with the vault mirror (§16)',
      'settings-row-vault',
    )}

    {@render deferredRow(
      'Session snapshots',
      'off · git commit · commit + push',
      'arrives with session snapshots (§11.4)',
      'settings-row-snapshots',
    )}

    {@render deferredRow(
      'Mirror drops to library',
      projectSettings['mirror_drops'] === true ? 'on' : 'off',
      'set by the first image drop (§14.4)',
      'settings-row-mirror-drops',
    )}

    <div class="row" data-testid="settings-row-retention">
      <span class="row-label">Trash retention</span>
      {@render segmented(
        'settings-retention',
        RETENTIONS.map((value) => ({ value, label: RETENTION_LABELS[value] })),
        retention,
        (value) => void setRetention(value as TrashRetention),
      )}
    </div>
  </section>

  <section>
    <h2>Window</h2>

    <div class="row" data-testid="settings-row-title-strip">
      <span class="row-label">Title strip</span>
      {@render segmented(
        'settings-title-strip',
        [
          { value: 'hover', label: 'Hover' },
          { value: 'always', label: 'Always' },
          { value: 'never', label: 'Never' },
        ],
        settings.titleStrip,
        (value) => setAppSetting('titleStrip', value as AppSettings['titleStrip']),
      )}
    </div>

    {@render deferredRow(
      'Border',
      'on',
      'arrives with the frameless window work',
      'settings-row-border',
    )}

    {@render deferredRow(
      'Rounded corners',
      'on',
      'arrives with the frameless window work',
      'settings-row-corners',
    )}

    {#if isMac}
      {@render deferredRow(
        '☰ menu placement',
        'charm rail',
        'Windows/Linux only',
        'settings-row-menu-placement',
      )}
    {:else}
      <!-- Nothing reads menuPlacement yet (no system-menu wiring in
           CharmRail or main); a live control here would persist a
           choice that visibly does nothing. Deferred like every
           other unbuilt row until the wiring exists. -->
      {@render deferredRow(
        '☰ menu placement',
        'charm rail',
        'arrives with the system-menu wiring',
        'settings-row-menu-placement',
      )}
    {/if}
  </section>

  <section data-testid="settings-section-keyboard">
    <h2>Keyboard</h2>
    <p class="section-note" data-testid="settings-keyboard-note">
      Rebinding is coming soon — for now this is a read-only map of every shortcut.
    </p>
    {#each keyboardGroups as group (group.label)}
      <h3 class="group-head">{group.label}</h3>
      {#each group.bindings as binding (binding.id)}
        <div class="row keybinding" data-testid={`settings-key-${binding.id}`}>
          <span class="row-label">
            {binding.name}
            {#if binding.when}<span class="when">· {binding.when}</span>{/if}
          </span>
          <kbd class="combo" data-testid={`settings-key-combo-${binding.id}`}>
            {formatCombo(binding.combo)}
          </kbd>
        </div>
      {/each}
    {/each}
    <p class="section-note editor-note" data-testid="settings-keyboard-editor-note">
      The note editor has its own shortcuts (Markdown, undo, selection) that live inside the editor.
    </p>
  </section>
</div>

<style>
  .settings {
    display: flex;
    flex-direction: column;
    gap: 1.4rem;
    max-width: 34rem;
    margin: 0 auto;
  }

  h2 {
    margin: 0 0 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ew-text-muted);
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.45rem 0;
    border-bottom: 1px solid var(--ew-border);
  }

  .row-label {
    font-size: 0.85rem;
  }

  .row-note {
    font-size: 0.75rem;
    color: var(--ew-text-muted);
  }

  .row.deferred {
    opacity: 0.55;
    cursor: help;
  }

  .section-note {
    margin: 0 0 0.6rem;
    font-size: 0.75rem;
    color: var(--ew-text-muted);
  }

  .editor-note {
    margin-top: 0.8rem;
    margin-bottom: 0;
    opacity: 0.75;
  }

  .group-head {
    margin: 0.9rem 0 0.1rem;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--ew-text-subtle);
  }

  .row.keybinding {
    padding: 0.35rem 0;
  }

  .when {
    font-size: 0.7rem;
    color: var(--ew-text-muted);
  }

  .combo {
    font-family: ui-monospace, monospace;
    font-size: 0.75rem;
    color: var(--ew-text);
    background: var(--ew-surface-raised);
    border: 1px solid var(--ew-border-strong);
    border-radius: 5px;
    padding: 0.1rem 0.4rem;
    white-space: nowrap;
  }

  .segmented {
    display: flex;
    gap: 2px;
    border: 1px solid var(--ew-border-strong);
    border-radius: 6px;
    padding: 2px;
    background: var(--ew-surface-raised);
  }

  .segment {
    padding: 0.2rem 0.6rem;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--ew-text-muted);
    font: inherit;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .segment:hover {
    background: var(--ew-surface-hover);
  }

  .segment.selected {
    background: var(--ew-accent);
    color: var(--ew-on-accent);
  }

  .swatches {
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }

  .swatch {
    width: 1.4rem;
    height: 1.4rem;
    border: 1px solid var(--ew-border-strong);
    border-radius: 4px;
    cursor: pointer;
    color: var(--ew-text-muted);
    font-size: 0.8rem;
    line-height: 1;
  }

  .swatch.off {
    background: var(--ew-surface-raised);
  }

  .swatch.selected {
    outline: 2px solid var(--ew-focus-ring);
    outline-offset: 1px;
  }

  .fade-controls {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  input[type='range'] {
    accent-color: var(--ew-accent);
  }
</style>
