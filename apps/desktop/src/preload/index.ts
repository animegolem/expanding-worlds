import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { uuidv7 } from '@ew/domain'
import type { CommandEnvelope, CommandResult, ProjectChangedEvent } from '@ew/commands'
import type {
  ClaimThumbnailJobResponse,
  ClearLibraryExampleResponse,
  CloseSecondaryResponse,
  ExecuteCommandResponse,
  ImportAssetResponse,
  IngestFromSecondaryResponse,
  OpenSecondaryResponse,
  PingResponse,
  RunQueryResponse,
  SecondaryImportResponse,
  SecondaryQueryResponse,
  SecondaryTarget,
  ServiceStatusEvent,
  SetSettingResponse,
  SubmitThumbnailResponse,
  ThumbnailReadyEvent,
} from '@ew/protocol'

export type FetchUrlForImportResult =
  | { ok: true; bytes: Uint8Array; filename: string }
  | { ok: false; message: string }

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
  },
  window: {
    setVibrancy: (enabled: boolean): Promise<boolean> =>
      ipcRenderer.invoke('window:set-vibrancy', enabled) as Promise<boolean>,
    setOpacity: (value: number): Promise<boolean> =>
      ipcRenderer.invoke('window:set-opacity', value) as Promise<boolean>,
  },
  /** §11.5 settings, both tiers (AI-IMP-074). App-tier lives with
   * main (app-settings.json); project-tier writes go through the
   * non-undoable set-setting verb, reads through project.query
   * ('getSettings'). */
  settings: {
    appAll: (): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke('app-settings:get') as Promise<Record<string, unknown>>,
    setApp: (key: string, value: unknown): Promise<boolean> =>
      ipcRenderer.invoke('app-settings:set', key, value) as Promise<boolean>,
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
    /**
     * §10.2 quit flush: main intercepts window close, asks the
     * renderer to commit pending editor buffers, and waits for the
     * ack (bounded by a timeout on the main side).
     */
    onFlushRequest: (callback: () => Promise<void>): (() => void) => {
      const listener = (): void => {
        void Promise.resolve()
          .then(callback)
          .catch(() => undefined)
          .then(() => ipcRenderer.send('app:flush-done'))
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
