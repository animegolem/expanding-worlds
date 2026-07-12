import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { uuidv7 } from '@ew/domain'
import type { UpdateStatus } from '../main/update-check'
import type { CommandEnvelope, CommandResult, ProjectChangedEvent } from '@ew/commands'
import type {
  CheckpointWalResponse,
  ClaimThumbnailJobResponse,
  ClearLibraryExampleResponse,
  CloseSecondaryResponse,
  DeleteLibraryTagResponse,
  ExecuteCommandResponse,
  ExportEstimateResponse,
  ExportProgressEvent,
  ExportProjectResponse,
  ImportAssetResponse,
  OpenableImportProjectResponse,
  IngestFromSecondaryResponse,
  MirrorToLibraryResponse,
  OpenSecondaryResponse,
  PingResponse,
  PrepareTagSyncLibraryResponse,
  RestoreResult,
  RunQueryResponse,
  SecondaryImportResponse,
  SecondaryQueryResponse,
  SecondaryTarget,
  ServiceStatusEvent,
  SetSettingResponse,
  SnapshotEntry,
  SnapshotPushState,
  SnapshotStatus,
  SnapshotTestConnectionResult,
  SyncTagsResponse,
  SubmitThumbnailResponse,
  ThumbnailReadyEvent,
} from '@ew/protocol'

export type FetchUrlForImportResult =
  | { ok: true; bytes: Uint8Array; filename: string }
  | { ok: false; message: string }

/** CA-015 (AI-IMP-237): app-settings:set used to resolve `true`
 * unconditionally — a failed persist vanished instead of surfacing.
 * The handler now returns this typed result so the renderer can
 * revert its optimistic value and toast on failure. */
export interface SetAppSettingResult {
  ok: boolean
  message?: string
}

/**
 * The only capability surface the sandboxed renderer receives
 * (RFC-0001 §13.2): the Project API of §11.3. Nothing else crosses
 * the bridge.
 */
const api = {
  util: {
    /** Invariant 1: UUIDv7 for application-generated persisted ids.
     * Exposed so e2e evaluate blocks (which cannot import workspace
     * packages) mint compliant command ids. */
    newId: (): string => uuidv7(),
  },
  test: {
    /** Recovery e2e only: main registers the handler solely under
     * EW_TEST_HOOKS=1, so this rejects in production. */
    killUtility: (): Promise<boolean> =>
      ipcRenderer.invoke('test:kill-utility') as Promise<boolean>,
    /** AI-IMP-096 e2e only: drive the checkpoint-wal verb through the
     * real main→utility→service path. Main registers the handler
     * solely under EW_TEST_HOOKS=1. */
    checkpointWal: (): Promise<CheckpointWalResponse> =>
      ipcRenderer.invoke('test:checkpoint-wal') as Promise<CheckpointWalResponse>,
    /** AI-IMP-120 e2e only: drive one snapshot moment (flush → notes →
     * checkpoint → commit) through the real main path. Gated under
     * EW_TEST_HOOKS=1 main-side. */
    snapshot: (trigger: 'idle' | 'rest' | 'end-session'): Promise<boolean> =>
      ipcRenderer.invoke('test:snapshot', trigger) as Promise<boolean>,
  },
  window: {
    /** §8.2 frameless shell: the renderer draws Linux window controls
     * and pads the strip to clear macOS traffic lights, so it needs the
     * host platform. 'darwin' | 'win32' | 'linux' | … */
    platform: process.platform,
    setVibrancy: (enabled: boolean): Promise<boolean> =>
      ipcRenderer.invoke('window:set-vibrancy', enabled) as Promise<boolean>,
    setOpacity: (value: number): Promise<boolean> =>
      ipcRenderer.invoke('window:set-opacity', value) as Promise<boolean>,
    /** §8.2 Linux drawn window controls (no-op'd by the main handlers on
     * platforms with native controls, but only wired into the strip on
     * Linux). */
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize') as Promise<void>,
    toggleMaximize: (): Promise<void> =>
      ipcRenderer.invoke('window:toggle-maximize') as Promise<void>,
    close: (): Promise<void> => ipcRenderer.invoke('window:close') as Promise<void>,
  },
  /** §11.5 settings, both tiers (AI-IMP-074). App-tier lives with
   * main (app-settings.json); project-tier writes go through the
   * non-undoable set-setting verb, reads through project.query
   * ('getSettings'). */
  settings: {
    appAll: (): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke('app-settings:get') as Promise<Record<string, unknown>>,
    setApp: (key: string, value: unknown): Promise<SetAppSettingResult> =>
      ipcRenderer.invoke('app-settings:set', key, value) as Promise<SetAppSettingResult>,
    onAppChanged: (callback: (change: { key: string; value: unknown }) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, change: { key: string; value: unknown }): void =>
        callback(change)
      ipcRenderer.on('app-settings:changed', listener)
      return () => ipcRenderer.removeListener('app-settings:changed', listener)
    },
    setProject: (key: string, value: unknown): Promise<SetSettingResponse> =>
      ipcRenderer.invoke('project:set-setting', key, value) as Promise<SetSettingResponse>,
    onProjectChanged: (
      callback: (change: { key: string; value: unknown }) => void,
    ): (() => void) => {
      const listener = (_event: IpcRendererEvent, change: { key: string; value: unknown }): void =>
        callback(change)
      ipcRenderer.on('project:setting-changed', listener)
      return () => ipcRenderer.removeListener('project:setting-changed', listener)
    },
  },
  app: {
    /** §8.2 Help/About: the running app version from main's packaged
     * metadata (app.getVersion), so the dialog never hardcodes it. */
    getVersion: (): Promise<string> =>
      ipcRenderer.invoke('app:get-version') as Promise<string>,
    /** AI-IMP-278: main owns the releases fetch; the renderer only
     * asks and renders the verdict. */
    checkForUpdate: (): Promise<UpdateStatus> =>
      ipcRenderer.invoke('update:check') as Promise<UpdateStatus>,
    currentUpdateStatus: (): Promise<UpdateStatus | null> =>
      ipcRenderer.invoke('update:status-current') as Promise<UpdateStatus | null>,
    onUpdateStatus: (callback: (status: UpdateStatus) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, status: UpdateStatus): void => callback(status)
      ipcRenderer.on('update:status', listener)
      return () => ipcRenderer.removeListener('update:status', listener)
    },
    /** Opens the last check's download URL — main refuses anything else. */
    openUpdateDownload: (): Promise<boolean> =>
      ipcRenderer.invoke('update:open-download') as Promise<boolean>,
    /**
     * §10.2 quit flush: main intercepts window close, asks the
     * renderer to commit pending editor buffers, and waits for the
     * ack (bounded by a timeout on the main side).
     */
    onFlushRequest: (callback: () => Promise<void>): (() => void) => {
      const listener = (_event: IpcRendererEvent, request: { requestId?: unknown }): void => {
        if (typeof request?.requestId !== 'string') return
        void Promise.resolve()
          .then(callback)
          .then(
            () => ipcRenderer.send('app:flush-done', { requestId: request.requestId, ok: true }),
            () => ipcRenderer.send('app:flush-done', { requestId: request.requestId, ok: false }),
          )
      }
      ipcRenderer.on('app:flush', listener)
      return () => ipcRenderer.removeListener('app:flush', listener)
    },
  },
  nav: {
    /** §8.1 gesture-first Back/Forward: swipe / mouse X-buttons,
     * forwarded from main; the renderer owns the history. */
    onGesture: (callback: (direction: 'back' | 'forward') => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, direction: 'back' | 'forward'): void =>
        callback(direction)
      ipcRenderer.on('nav:gesture', listener)
      return () => ipcRenderer.removeListener('nav:gesture', listener)
    },
  },
  project: {
    ping: (): Promise<PingResponse> => ipcRenderer.invoke('project:ping') as Promise<PingResponse>,
    execute: async (envelope: CommandEnvelope): Promise<CommandResult> => {
      const response = (await ipcRenderer.invoke(
        'project:execute',
        envelope,
      )) as ExecuteCommandResponse
      return response.result
    },
    query: (name: string, args?: unknown): Promise<RunQueryResponse> =>
      ipcRenderer.invoke('project:query', name, args) as Promise<RunQueryResponse>,
    importAsset: (input: {
      bytes: Uint8Array
      originalFilename: string
      sourceUrl?: string
    }): Promise<ImportAssetResponse> =>
      ipcRenderer.invoke('project:import-asset', input) as Promise<ImportAssetResponse>,
    fetchUrlForImport: (url: string): Promise<FetchUrlForImportResult> =>
      ipcRenderer.invoke('project:fetch-url', url) as Promise<FetchUrlForImportResult>,
    onChanged: (callback: (event: ProjectChangedEvent) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, change: ProjectChangedEvent): void =>
        callback(change)
      ipcRenderer.on('project:event', listener)
      return () => ipcRenderer.removeListener('project:event', listener)
    },
    /** Utility-process health (AI-IMP-053): restarting / ok / failed. */
    onServiceStatus: (callback: (event: ServiceStatusEvent) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, status: ServiceStatusEvent): void =>
        callback(status)
      ipcRenderer.on('project:service', listener)
      return () => ipcRenderer.removeListener('project:service', listener)
    },
    /** The latest health event, for attach-time catch-up — cold-boot
     * events fire before App mounts (AI-IMP-106). */
    serviceStatus: (): Promise<ServiceStatusEvent | null> =>
      ipcRenderer.invoke('project:service-current') as Promise<ServiceStatusEvent | null>,
  },
  /** §11.4 session snapshots (AI-IMP-120): the Settings readout — git
   * presence and the backup's disk size. The mode enum itself is an
   * ordinary project setting, read/written through the settings bridge
   * (getSettings / setProject). */
  snapshot: {
    status: (): Promise<SnapshotStatus> =>
      ipcRenderer.invoke('snapshot:status') as Promise<SnapshotStatus>,
    /** §11.4 restore (AI-IMP-121): the dated snapshot list (newest
     * first) for the Restore from backup… picker. Empty when snapshots
     * are off / there is no history yet. */
    list: (): Promise<SnapshotEntry[]> =>
      ipcRenderer.invoke('snapshot:list') as Promise<SnapshotEntry[]>,
    /** Materialize the chosen snapshot into a NEW sibling directory —
     * never in-place. Resolves with the created directory or a typed
     * failure. */
    restore: (sha: string): Promise<RestoreResult> =>
      ipcRenderer.invoke('snapshot:restore', sha) as Promise<RestoreResult>,
    /** Open Restored Project: relaunch the app on the restored
     * directory (the standard cold-boot open path). */
    open: (openToken: string): Promise<boolean> =>
      ipcRenderer.invoke('restore:open', openToken) as Promise<boolean>,
    /** §11.4 remote push (AI-IMP-122): the deliberate Test connection
     * action (git ls-remote) behind the Advanced remote-URL row. The
     * ONLY network call the user triggers by hand. */
    testConnection: (url: string): Promise<SnapshotTestConnectionResult> =>
      ipcRenderer.invoke('snapshot:test-connection', url) as Promise<SnapshotTestConnectionResult>,
    /** §8.6 ongoing-push perch + once-per-episode failure toast: the
     * background push's state, pushed from main as it advances. */
    onPushState: (callback: (state: SnapshotPushState) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, state: SnapshotPushState): void => callback(state)
      ipcRenderer.on('snapshot:push-state', listener)
      return () => ipcRenderer.removeListener('snapshot:push-state', listener)
    },
    /** The latest push state, for attach-time catch-up — a push begun
     * before a new window mounts is not lost to the race. */
    pushState: (): Promise<SnapshotPushState | null> =>
      ipcRenderer.invoke('snapshot:push-state-current') as Promise<SnapshotPushState | null>,
  },
  /** §16 portable export (AI-IMP-157; container rev 0.57): the
   * `.ewproj` roundtrip archive. Main owns the save dialog; the
   * utility streams the archive; progress broadcasts ride
   * export:progress. */
  export: {
    /** Fused choose-and-export (AI-IMP-229; CA-004): main owns the save
     * dialog AND forwards the picked path itself — the renderer never
     * names a path, closing the confused-deputy overwrite surface.
     * Resolves the export result, or null when the dialog was cancelled. */
    chooseAndRun: (activeOnly: boolean): Promise<ExportProjectResponse | null> =>
      ipcRenderer.invoke('export:choose-and-run', activeOnly) as Promise<
        ExportProjectResponse | null
      >,
    /** §16 rev-0.18 live size footer: stat-walk source-byte estimate. */
    estimate: (): Promise<ExportEstimateResponse> =>
      ipcRenderer.invoke('export:estimate') as Promise<ExportEstimateResponse>,
    onProgress: (callback: (progress: ExportProgressEvent) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, progress: ExportProgressEvent): void =>
        callback(progress)
      ipcRenderer.on('export:progress', listener)
      return () => ipcRenderer.removeListener('export:progress', listener)
    },
    /** §16 import (AI-IMP-158): pick a `.ewproj`; null on cancel. */
    chooseArchive: (): Promise<string | null> =>
      ipcRenderer.invoke('import:choose-archive') as Promise<string | null>,
    /** Materialize the archive as a collision-safe sibling project.
     * Typed refusal; a failed import leaves nothing on disk. Open the
     * result through snapshot.open (the restore relaunch path). */
    import: (archivePath: string): Promise<OpenableImportProjectResponse> =>
      ipcRenderer.invoke('import:run', archivePath) as Promise<OpenableImportProjectResponse>,
  },
  /** §14.4 secondary project slots (AI-IMP-088): source = read-only
   * browse of another project, library = the writable mirror target.
   * Same query vocabulary as the primary; writes into source refuse
   * EW_READ_ONLY at the service. */
  secondary: {
    /** `options.createIfMissing` (AI-IMP-094, library target only)
     * creates the project when the directory holds none — and seeds
     * the §14.4 first-open example into a fresh create. */
    open: (
      target: SecondaryTarget,
      dir: string,
      options?: { createIfMissing?: boolean; title?: string },
    ): Promise<OpenSecondaryResponse> =>
      ipcRenderer.invoke('secondary:open', target, dir, options) as Promise<OpenSecondaryResponse>,
    /** The default location the create-new-library path proposes. */
    defaultLibraryDir: (): Promise<string> =>
      ipcRenderer.invoke('library:default-dir') as Promise<string>,
    /** §14.4 clear-the-example (AI-IMP-094): trash every node tagged
     * 'example' in the OPEN library slot via ordinary commands. */
    clearLibraryExample: (): Promise<ClearLibraryExampleResponse> =>
      ipcRenderer.invoke('secondary:clear-library-example') as Promise<ClearLibraryExampleResponse>,
    close: (target: SecondaryTarget): Promise<CloseSecondaryResponse> =>
      ipcRenderer.invoke('secondary:close', target) as Promise<CloseSecondaryResponse>,
    query: (target: SecondaryTarget, name: string, args?: unknown): Promise<SecondaryQueryResponse> =>
      ipcRenderer.invoke('secondary:query', target, name, args) as Promise<SecondaryQueryResponse>,
    importAsset: (
      target: SecondaryTarget,
      input: { bytes: Uint8Array; originalFilename: string; sourceUrl?: string },
    ): Promise<SecondaryImportResponse> =>
      ipcRenderer.invoke('secondary:import-asset', target, input) as Promise<SecondaryImportResponse>,
    /** §14.4 ingest-by-copy (AI-IMP-090): pull one asset by content
     * hash from the secondary into the PRIMARY, applying the tag
     * border ('none' | 'all' | picked tag names). */
    ingest: (
      target: SecondaryTarget,
      input: { contentHash: string; border: 'none' | 'all' | string[] },
    ): Promise<IngestFromSecondaryResponse> =>
      ipcRenderer.invoke('secondary:ingest', target, input) as Promise<IngestFromSecondaryResponse>,
    /** §14.4 inbox mirror (AI-IMP-092): the inverse direction —
     * ingest the primary's bytes (by content hash) into the LIBRARY
     * slot as an unplaced node, border 'none' by construction. */
    mirrorToLibrary: (input: { contentHash: string }): Promise<MirrorToLibraryResponse> =>
      ipcRenderer.invoke('secondary:mirror', input) as Promise<MirrorToLibraryResponse>,
  },
  /** §4.8 one tag universe: deliberately narrow typed operations. Main
   * owns the designated-library path; no renderer-supplied filesystem
   * target or generic secondary execute capability crosses this seam. */
  tagSync: {
    libraryAvailability: (): Promise<PrepareTagSyncLibraryResponse> =>
      ipcRenderer.invoke('tag-sync:library-availability') as Promise<PrepareTagSyncLibraryResponse>,
    pull: (): Promise<SyncTagsResponse> =>
      ipcRenderer.invoke('tag-sync:pull') as Promise<SyncTagsResponse>,
    deleteLibraryTag: (nameKey: string): Promise<DeleteLibraryTagResponse> =>
      ipcRenderer.invoke('tag-sync:delete-library-tag', nameKey) as Promise<DeleteLibraryTagResponse>,
  },
  /** §11.2 renderer-driven thumbnail pipeline (AI-IMP-076): the
   * renderer claims queued jobs, generates WebP thumbnails with
   * Chromium codecs, and submits bytes back to the utility. */
  derivatives: {
    /** The full response — ok:false (service down, project not yet
     * open) is distinct from an empty queue, and the drive loop
     * treats them differently. */
    claimThumbnailJob: (): Promise<ClaimThumbnailJobResponse> =>
      ipcRenderer.invoke('project:claim-thumbnail-job') as Promise<ClaimThumbnailJobResponse>,
    submitThumbnail: (input: {
      jobId: string
      bytes: Uint8Array | null
    }): Promise<SubmitThumbnailResponse> =>
      ipcRenderer.invoke('project:submit-thumbnail', input) as Promise<SubmitThumbnailResponse>,
    onThumbnailReady: (callback: (event: ThumbnailReadyEvent) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, ready: ThumbnailReadyEvent): void =>
        callback(ready)
      ipcRenderer.on('asset:thumbnail-ready', listener)
      return () => ipcRenderer.removeListener('asset:thumbnail-ready', listener)
    },
  },
}

export type EwApi = typeof api

contextBridge.exposeInMainWorld('ew', api)
