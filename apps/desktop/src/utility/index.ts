import { openProjectService, type ProjectService } from '@ew/persistence'
import type { ProjectRequest, ProjectResponse, UtilityEnvelope, UtilityMessage } from '@ew/protocol'

/**
 * Project utility process (RFC-0001 §13.2): hosts the authoritative
 * project service. Requests arrive id-correlated from main;
 * project-changed events are pushed uncorrelated as they commit.
 */

let service: ProjectService | null = null
let unsubscribe: (() => void) | null = null

function post(message: UtilityMessage): void {
  process.parentPort.postMessage(message)
}

// Async solely for import-asset (staged file IO); every other case
// resolves synchronously with unchanged behavior.
async function handle(request: ProjectRequest): Promise<ProjectResponse> {
  switch (request.type) {
    case 'ping':
      return { pong: true, from: 'utility' }

    case 'init-project': {
      try {
        unsubscribe?.()
        service?.close()
        const initOptions: { createIfMissing: boolean; title?: string } = {
          createIfMissing: request.createIfMissing,
        }
        if (request.title !== undefined) initOptions.title = request.title
        service = openProjectService(request.dir, initOptions)
        unsubscribe = service.subscribe((event) => post({ kind: 'event', event }))
        return { type: 'init-project', ok: true, project: service.info() }
      } catch (err) {
        service = null
        const code =
          err instanceof Error && 'code' in err && typeof err.code === 'string'
            ? err.code
            : 'INIT_FAILED'
        return {
          type: 'init-project',
          ok: false,
          code,
          message: err instanceof Error ? err.message : String(err),
        }
      }
    }

    case 'close-project': {
      unsubscribe?.()
      unsubscribe = null
      service?.close()
      service = null
      return { type: 'close-project', ok: true }
    }

    case 'execute-command': {
      if (!service) {
        return {
          type: 'execute-command',
          result: {
            status: 'error',
            commandId: request.envelope.commandId,
            code: 'NO_PROJECT',
            message: 'no project is open',
          },
        }
      }
      return { type: 'execute-command', result: service.execute(request.envelope) }
    }

    case 'run-query': {
      if (!service) {
        return { type: 'run-query', ok: false, code: 'NO_PROJECT', message: 'no project is open' }
      }
      const result = service.query(request.name, request.args)
      return result.ok
        ? { type: 'run-query', ok: true, result: result.result }
        : { type: 'run-query', ok: false, code: result.code, message: result.message }
    }

    case 'import-asset': {
      if (!service) {
        return { type: 'import-asset', ok: false, code: 'NO_PROJECT', message: 'no project is open' }
      }
      try {
        const input: { bytes: Uint8Array; originalFilename: string; sourceUrl?: string } = {
          bytes: request.bytes,
          originalFilename: request.originalFilename,
        }
        if (request.sourceUrl !== undefined) input.sourceUrl = request.sourceUrl
        const { assetId, deduplicated } = await service.importAsset(input)
        return { type: 'import-asset', ok: true, assetId, deduplicated }
      } catch (err) {
        const code =
          err instanceof Error && 'code' in err && typeof err.code === 'string'
            ? err.code
            : 'IMPORT_FAILED'
        return {
          type: 'import-asset',
          ok: false,
          code,
          message: err instanceof Error ? err.message : String(err),
        }
      }
    }

    case 'request-derivatives':
      return {
        type: 'request-derivatives',
        ok: false,
        code: 'NOT_IMPLEMENTED',
        message: 'derivatives land with AI-IMP-014',
      }
  }
}

process.parentPort.on('message', (event) => {
  const { id, payload } = event.data as UtilityEnvelope<ProjectRequest>
  void handle(payload).then((response) => post({ kind: 'response', id, payload: response }))
})
