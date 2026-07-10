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
  import { DROP_BEHAVIOR_KEY, DROP_BEHAVIOR_VALUES, type DropBehavior } from '@ew/protocol'
  import { showFirstRun } from '../chrome/first-run'
  import { toast } from '../chrome/status'
  import { closeTakeover } from '../chrome/takeover'
  import { tooltip } from '../chrome/tooltip'
  import Button from '../ui/Button.svelte'
  import TextInput from '../ui/TextInput.svelte'
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
  import { ProjectSettingWriter } from '../settings/project-setting-writer'

  let settings = $state<AppSettings>({ ...APP_SETTING_DEFAULTS })
  let retention = $state<TrashRetention>('never')
  let projectId = $state<string | null>(null)
  let projectSettings = $state<Record<string, unknown>>({})
  const projectSettingWriter = new ProjectSettingWriter({
    current: () => projectSettings,
    replace: (next) => (projectSettings = next),
    persist: async (key, value) => {
      const result = await window.ew.settings.setProject(key, value)
      return result.ok ? { ok: true } : { ok: false, message: result.message }
    },
    report: (message) => void toast(message, { kind: 'error' }),
  })

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

  // §7.8 metadata sections (AI-IMP-119): per-section global defaults,
  // project-tier settings written through the non-undoable set-setting
  // verb (no migration). Defaults: Placements ON, Provenance ON,
  // Timestamps OFF.
  type MetadataSection = 'placements' | 'provenance' | 'timestamps'
  const METADATA_SECTION_DEFAULTS: Record<MetadataSection, boolean> = {
    placements: true,
    provenance: true,
    timestamps: false,
  }
  function metadataDefault(key: MetadataSection): boolean {
    const raw = projectSettings['note_metadata_defaults'] as
      | Partial<Record<MetadataSection, unknown>>
      | undefined
    const value = raw?.[key]
    return typeof value === 'boolean' ? value : METADATA_SECTION_DEFAULTS[key]
  }
  async function setMetadataDefault(key: MetadataSection, value: boolean): Promise<void> {
    const next: Record<MetadataSection, boolean> = {
      placements: metadataDefault('placements'),
      provenance: metadataDefault('provenance'),
      timestamps: metadataDefault('timestamps'),
      [key]: value,
    }
    await projectSettingWriter.write('note_metadata_defaults', next, 'note metadata defaults')
  }

  // §11.4 session snapshots (AI-IMP-120): the per-project mode enum is
  // an ordinary project setting (key snapshot_mode). Git presence and
  // the backup disk size come from main lazily when this view opens.
  type SnapshotMode = 'off' | 'commit' | 'commit-push'
  let snapshotStatus = $state<{ gitAvailable: boolean; sizeBytes: number | null } | null>(null)
  $effect(() => {
    void (async () => {
      try {
        snapshotStatus = await window.ew.snapshot.status()
      } catch {
        snapshotStatus = null
      }
    })()
  })
  // §16 portable export (AI-IMP-157; container rev 0.57): the .ewproj
  // roundtrip archive. The rev-0.18 doctrine: the estimated size is a
  // LIVE FOOTER FACT; past the warn threshold the FIRST export adds
  // one acknowledge line — confirmed once per project, never repeated,
  // never a gate. The threshold is an application preference.
  const EXPORT_WARN_DEFAULT_BYTES = 2 * 1024 * 1024 * 1024
  let exportEstimate = $state<number | null>(null)
  let exportWarnBytes = $state(EXPORT_WARN_DEFAULT_BYTES)
  let exportActiveOnly = $state(false)
  let exportNeedsAck = $state(false)
  let exportProgress = $state<{ bytesWritten: number; bytesTotal: number } | null>(null)
  $effect(() => {
    void (async () => {
      try {
        const estimate = await window.ew.export.estimate()
        exportEstimate = estimate.ok ? estimate.bytes : null
        const app = await window.ew.settings.appAll()
        const warn = app['exportWarnBytes']
        if (typeof warn === 'number' && warn > 0) exportWarnBytes = warn
      } catch {
        exportEstimate = null
      }
    })()
    return window.ew.export.onProgress((progress) => {
      exportProgress = progress
    })
  })
  async function runExport(acknowledged: boolean): Promise<void> {
    const oversize = exportEstimate !== null && exportEstimate > exportWarnBytes
    const acked = projectSettings['export_size_acknowledged'] === true
    if (oversize && !acked && !acknowledged) {
      exportNeedsAck = true
      return
    }
    if (exportNeedsAck) {
      exportNeedsAck = false
      await projectSettingWriter.write(
        'export_size_acknowledged',
        true,
        'export acknowledgement',
      )
    }
    exportProgress = { bytesWritten: 0, bytesTotal: exportEstimate ?? 0 }
    try {
      // Fused: main owns the save dialog and forwards the picked path
      // itself (AI-IMP-229). null means the dialog was cancelled.
      const result = await window.ew.export.chooseAndRun(exportActiveOnly)
      if (result === null) return
      if (result.ok) {
        toast(
          `Exported ${result.notes} note${result.notes === 1 ? '' : 's'} and ${result.assets} image${
            result.assets === 1 ? '' : 's'
          } (${formatBackupSize(result.bytesWritten)})`,
        )
      } else {
        toast(`Export failed: ${result.message}`, { kind: 'error' })
      }
    } finally {
      exportProgress = null
    }
  }
  // §16 import (AI-IMP-158): pick a .ewproj, land it as a sibling
  // project, offer to open it (the restore relaunch path).
  let importedDir = $state<string | null>(null)
  let importedOpenToken = $state<string | null>(null)
  let importing = $state(false)
  async function runImport(): Promise<void> {
    const archive = await window.ew.export.chooseArchive()
    if (!archive) return
    importing = true
    importedDir = null
    importedOpenToken = null
    try {
      const result = await window.ew.export.import(archive)
      if (result.ok) {
        importedDir = result.dir
        importedOpenToken = result.openToken
        toast(
          `Imported "${result.title}" — ${result.notes} note${result.notes === 1 ? '' : 's'}, ${
            result.assets
          } image${result.assets === 1 ? '' : 's'}`,
        )
      } else {
        toast(`Import refused: ${result.message}`, { kind: 'error' })
      }
    } finally {
      importing = false
    }
  }
  function snapshotMode(): SnapshotMode {
    const raw = projectSettings['snapshot_mode']
    return raw === 'commit' || raw === 'commit-push' ? raw : 'off'
  }
  async function setSnapshotMode(mode: SnapshotMode): Promise<void> {
    await projectSettingWriter.write('snapshot_mode', mode, 'backup mode')
  }
  function formatBackupSize(bytes: number | null): string {
    if (bytes === null) return 'no snapshots yet'
    const kb = bytes / 1024
    if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB`
    const mb = kb / 1024
    if (mb < 1024) return `${mb.toFixed(1)} MB`
    return `${(mb / 1024).toFixed(2)} GB`
  }

  // §11.4 remote push (AI-IMP-122): the commit-push variant is the
  // Advanced backup mode — its remote URL surfaces only once commit-push
  // is chosen (two deliberate acts, §11.5 constitution: nothing
  // network-shaped is ambient). The URL is an ordinary project setting
  // (key snapshot_remote, no migration). Never a <datalist> — a plain
  // text field, so no history of private repo URLs is ever offered.
  let remoteDraft = $state('')
  let remoteTest = $state<{ state: 'idle' | 'testing' | 'ok' | 'fail'; message?: string }>({
    state: 'idle',
  })
  function storedRemote(): string {
    const raw = projectSettings['snapshot_remote']
    return typeof raw === 'string' ? raw : ''
  }
  // Seed the draft from the stored URL and re-seed whenever settings
  // change externally (mode flips, saves). Typing never re-triggers this
  // — it depends on projectSettings, not the draft — so the field is not
  // clobbered mid-edit.
  $effect(() => {
    remoteDraft = storedRemote()
  })
  async function saveRemote(url: string): Promise<boolean> {
    const trimmed = url.trim()
    if (trimmed === storedRemote()) return true
    remoteTest = { state: 'idle' } // the target changed; a prior result is stale
    return projectSettingWriter.write('snapshot_remote', trimmed, 'backup remote')
  }
  async function testRemote(url: string): Promise<void> {
    const trimmed = url.trim()
    if (!(await saveRemote(trimmed))) {
      remoteTest = { state: 'fail', message: 'The remote could not be saved.' }
      return
    }
    remoteTest = { state: 'testing' }
    const result = await window.ew.snapshot.testConnection(trimmed)
    remoteTest = result.ok ? { state: 'ok' } : { state: 'fail', message: result.message }
  }

  // §4.9 rev 0.38 multi-drop behavior (AI-IMP-129): an ordinary
  // project-tier setting (key drop_behavior). `ask` shows the once-per-
  // drop modal; the concrete values skip it. Set by the modal's
  // remember tick or changed back to Ask here.
  const DROP_BEHAVIOR_LABELS: Record<DropBehavior, string> = {
    ask: 'Ask',
    sort: 'Sort',
    group: 'Group',
    'group-and-sort': 'Group & sort',
  }
  function dropBehavior(): DropBehavior {
    const raw = projectSettings[DROP_BEHAVIOR_KEY]
    return raw === 'sort' || raw === 'group' || raw === 'group-and-sort' ? raw : 'ask'
  }
  async function setDropBehavior(value: DropBehavior): Promise<void> {
    await projectSettingWriter.write(DROP_BEHAVIOR_KEY, value, 'drop behavior')
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
    { scope: 'editor', label: 'In a note' },
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
          onclick={() => setAppSetting('flatCanvasColor', 'off')}
          use:tooltip={{ name: 'Theme surface' }}
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
            aria-label={`Flat canvas color ${index + 1}`}
            onclick={() => setAppSetting('flatCanvasColor', token)}
            use:tooltip={{ name: `Flat canvas color ${index + 1}` }}
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

    <!-- §6.9 (AI-IMP-205): mouse vs trackpad wheel scheme. Chromium can't
         tell the devices apart, so this is a deliberate choice. Trackpad
         keeps two-finger scroll = pan; Mouse makes the wheel zoom. -->
    <div class="row" data-testid="settings-row-navigation-scheme">
      <span class="row-label">Navigation</span>
      {@render segmented(
        'settings-navigation-scheme',
        [
          { value: 'trackpad', label: 'Trackpad' },
          { value: 'mouse', label: 'Mouse' },
        ],
        settings.navigationScheme,
        (value) => setAppSetting('navigationScheme', value as AppSettings['navigationScheme']),
      )}
    </div>
    <p class="section-note" data-testid="settings-navigation-note">
      On a trackpad, two-finger scroll pans the board. On a mouse, the scroll wheel zooms toward the
      cursor. Either way, ⌘/Ctrl + wheel and pinch always zoom, and holding the middle mouse button
      pans.
    </p>

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

    <div class="row" data-testid="settings-row-export">
      <span class="row-label">Export project</span>
      <div class="remote-config">
        {@render segmented(
          'settings-export-scope',
          [
            { value: 'all', label: 'Everything' },
            { value: 'active', label: 'Skip trash' },
          ],
          exportActiveOnly ? 'active' : 'all',
          (value) => {
            exportActiveOnly = value === 'active'
          },
        )}
        <Button
          variant="default"
          data-testid="settings-export-run"
          style="flex: none"
          onclick={() => void runExport(false)}
          disabled={exportProgress !== null}
        >
          {exportProgress ? 'Exporting…' : 'Export…'}
        </Button>
      </div>
    </div>
    <p class="section-note" data-testid="settings-export-note">
      {#if exportProgress && exportProgress.bytesTotal > 0}
        Writing the archive — {formatBackupSize(exportProgress.bytesWritten)} of about {formatBackupSize(
          exportProgress.bytesTotal,
        )}.
      {:else}
        One .ewproj file holds the whole project — pictures, notes, boards, and trash ({#if exportActiveOnly}trash
          skipped{:else}everything{/if}). Estimated size: {formatBackupSize(exportEstimate)}. Import
        it on any machine to get the project back exactly.
      {/if}
    </p>
    <div class="row" data-testid="settings-row-import">
      <span class="row-label">Import project</span>
      <div class="remote-config">
        <Button
          variant="default"
          data-testid="settings-import-run"
          style="flex: none"
          onclick={() => void runImport()}
          disabled={importing}
        >
          {importing ? 'Importing…' : 'Import…'}
        </Button>
        {#if importedDir && importedOpenToken}
          <Button
            variant="default"
            data-testid="settings-import-open"
            style="flex: none"
            onclick={() => void window.ew.snapshot.open(importedOpenToken!)}
          >
            Open imported project
          </Button>
        {/if}
      </div>
    </div>
    <p class="section-note" data-testid="settings-import-note">
      {#if importedDir}
        Imported beside your current project. Opening it relaunches the app there.
      {:else}
        Pick a .ewproj file and it becomes a new project next to this one — nothing merges, and
        your current project is untouched. A damaged file is refused whole.
      {/if}
    </p>

    {#if exportNeedsAck}
      <p class="section-note" data-testid="settings-export-ack">
        This export is on the large side ({formatBackupSize(exportEstimate)}) — it may take a while
        and needs that much free space.
        <Button
          variant="default"
          data-testid="settings-export-ack-run"
          style="flex: none"
          onclick={() => void runExport(true)}
        >
          Export anyway
        </Button>
      </p>
    {/if}

    <div class="row" data-testid="settings-row-snapshots">
      <span class="row-label">Session snapshots</span>
      {@render segmented(
        'settings-snapshots',
        [
          { value: 'off', label: 'Off' },
          { value: 'commit', label: 'Git commit' },
          { value: 'commit-push', label: 'Commit + push' },
        ],
        snapshotMode(),
        (value) => void setSnapshotMode(value as SnapshotMode),
      )}
    </div>
    <p class="section-note" data-testid="settings-snapshots-note">
      {#if snapshotStatus && !snapshotStatus.gitAvailable}
        Snapshots need git, and the app can't find it on this machine — install git to enable them.
      {:else}
        A checkpoint saves the project, its images, and a readable notes tree to git history at every
        end session, quit, and idle pause. Backup size: {formatBackupSize(
          snapshotStatus?.sizeBytes ?? null,
        )}.
      {/if}
    </p>

    {#if snapshotMode() === 'commit-push'}
      <div class="row remote-row" data-testid="settings-row-snapshot-remote">
        <span class="row-label">Backup remote</span>
        <div class="remote-config">
          <TextInput
            variant="standard"
            data-testid="settings-snapshot-remote-url"
            placeholder="git@… or https://… repository URL"
            spellcheck="false"
            autocomplete="off"
            style="flex: 1; min-width: 0; max-width: 18rem"
            bind:value={remoteDraft}
            onblur={() => void saveRemote(remoteDraft)}
            disabled={snapshotStatus !== null && !snapshotStatus.gitAvailable}
          />
          <Button
            variant="default"
            data-testid="settings-snapshot-remote-test"
            style="flex: none"
            onclick={() => void testRemote(remoteDraft)}
            disabled={remoteTest.state === 'testing' ||
              remoteDraft.trim().length === 0 ||
              (snapshotStatus !== null && !snapshotStatus.gitAvailable)}
          >
            {remoteTest.state === 'testing' ? 'Testing…' : 'Test connection'}
          </Button>
        </div>
      </div>
      <p class="section-note remote-note" data-testid="settings-snapshot-remote-note">
        {#if remoteTest.state === 'ok'}
          <span class="ok">Connected — the remote is reachable.</span>
        {:else if remoteTest.state === 'fail'}
          <span class="fail">Couldn't reach the remote: {remoteTest.message}</span>
        {:else}
          Each snapshot commits locally, then pushes to this remote in the background — End Session
          never waits on the network. Nothing is sent until a URL is set here. Authentication uses
          your system's git credentials (ssh agent or credential helper); no secrets are stored.
        {/if}
      </p>
    {/if}

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

    <div class="row" data-testid="settings-row-drop-behavior">
      <span class="row-label">Multi-image drop</span>
      {@render segmented(
        'settings-drop-behavior',
        DROP_BEHAVIOR_VALUES.map((value) => ({ value, label: DROP_BEHAVIOR_LABELS[value] })),
        dropBehavior(),
        (value) => void setDropBehavior(value as DropBehavior),
      )}
    </div>

    <!-- §19 first-run guide (AI-IMP-145): replaying re-opens the
         walkthrough over the live board. Closing this takeover first
         lets the guide take the whole window, exactly as on first open;
         the seen flag is untouched, so it never nags on its own. -->
    <div class="row" data-testid="settings-row-first-run">
      <span class="row-label">First-run guide</span>
      <Button
        variant="default"
        data-testid="settings-replay-guide"
        onclick={() => {
          closeTakeover()
          showFirstRun()
        }}
      >
        Replay the guide
      </Button>
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

  <section data-testid="settings-section-notes">
    <h2>Note metadata</h2>
    <p class="section-note" data-testid="settings-notes-note">
      Which system sections a note's metadata block carries by default. Each note keeps its own
      on/off toggle in its panel.
    </p>
    <div class="row" data-testid="settings-row-metadata-placements">
      <span class="row-label">Placements</span>
      {@render segmented(
        'settings-metadata-placements',
        [
          { value: 'on', label: 'On' },
          { value: 'off', label: 'Off' },
        ],
        metadataDefault('placements') ? 'on' : 'off',
        (value) => void setMetadataDefault('placements', value === 'on'),
      )}
    </div>
    <div class="row" data-testid="settings-row-metadata-provenance">
      <span class="row-label">Provenance</span>
      {@render segmented(
        'settings-metadata-provenance',
        [
          { value: 'on', label: 'On' },
          { value: 'off', label: 'Off' },
        ],
        metadataDefault('provenance') ? 'on' : 'off',
        (value) => void setMetadataDefault('provenance', value === 'on'),
      )}
    </div>
    <div class="row" data-testid="settings-row-metadata-timestamps">
      <span class="row-label">Timestamps</span>
      {@render segmented(
        'settings-metadata-timestamps',
        [
          { value: 'on', label: 'On' },
          { value: 'off', label: 'Off' },
        ],
        metadataDefault('timestamps') ? 'on' : 'off',
        (value) => void setMetadataDefault('timestamps', value === 'on'),
      )}
    </div>
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

  /* §11.4 remote push (AI-IMP-122): the Advanced backup-remote row. */
  .remote-config {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex: 1;
    min-width: 0;
    justify-content: flex-end;
  }

  .remote-note .ok {
    color: var(--ew-accent);
  }

  .remote-note .fail {
    color: var(--ew-danger);
  }
</style>
