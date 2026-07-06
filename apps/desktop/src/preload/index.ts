import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { uuidv7 } from '@ew/domain'
import type { CommandEnvelope, CommandResult, ProjectChangedEvent } from '@ew/commands'
import type {
  ExecuteCommandResponse,
  ImportAssetResponse,
  PingResponse,
  RunQueryResponse,
  ServiceStatusEvent,
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
}

export type EwApi = typeof api

contextBridge.exposeInMainWorld('ew', api)
