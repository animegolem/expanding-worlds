import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { CommandEnvelope, CommandResult, ProjectChangedEvent } from '@ew/commands'
import type {
  ExecuteCommandResponse,
  ImportAssetResponse,
  PingResponse,
  RunQueryResponse,
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
  },
}

export type EwApi = typeof api

contextBridge.exposeInMainWorld('ew', api)
