import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { DB_FILENAME, openProjectService, type ProjectService } from '@ew/persistence'
import type { ProjectRequest, ProjectResponse, UtilityEnvelope, UtilityMessage } from '@ew/protocol'
import { clearLibraryExample, seedLibrary } from './seed-library'

/**
 * Project utility process (RFC-0001 §13.2): hosts the authoritative
 * project service. Requests arrive id-correlated from main;
 * project-changed events are pushed uncorrelated as they commit.
 */

let service: ProjectService | null = null
let unsubscribe: (() => void) | null = null

/** §14.4 secondary slots (AI-IMP-088): source = read-only browse,
 * library = writable mirror target. Independent of the primary — a
 * secondary failure surfaces as ok:false, never as a dead utility.
 * No change-event subscription: fan-out for secondaries is a later
 * ticket's concern if a surface needs it. */
const secondaries: Record<'source' | 'library', ProjectService | null> = {
  source: null,
  library: null,
}

function closeSecondary(target: 'source' | 'library'): void {
  try {
    secondaries[target]?.close()
  } catch {
    // A close failure must not poison the slot.
  }
  secondaries[target] = null
}

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
        const { repairs, integrityErrors } = service.recovery()
        return {
          type: 'init-project',
          ok: true,
          project: service.info(),
          recovery: { repairs, integrityErrors },
        }
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

    case 'checkpoint-wal': {
      // §11.4 involuntary end-session (AI-IMP-096): truncate the WAL
      // on the PRIMARY and on the LIBRARY secondary (it takes mirror
      // writes). The source slot is read-only and no-ops in the
      // service; a closed slot or closed project is simply skipped.
      // A failure here is benign — report it typed, never throw.
      try {
        service?.checkpoint()
        const library = secondaries.library
        if (library && !library.readOnly) library.checkpoint()
        return { type: 'checkpoint-wal', ok: true }
      } catch (err) {
        return {
          type: 'checkpoint-wal',
          ok: false,
          code: 'CHECKPOINT_FAILED',
          message: err instanceof Error ? err.message : String(err),
        }
      }
    }

    case 'snapshot-write-notes': {
      // §16/§11.4 session snapshot (AI-IMP-120): regenerate the
      // readable notes/ tree on the PRIMARY's single writer (refreshing
      // §7.8 blocks) and hand back counts for the commit message. Runs
      // BEFORE the caller's checkpoint-wal, which then seals the block
      // refresh into project.sqlite. Read-only/absent project reports
      // typed failure — main falls back to a db-only commit.
      if (!service || service.readOnly) {
        return {
          type: 'snapshot-write-notes',
          ok: false,
          code: 'NO_PROJECT',
          message: 'no writable project is open',
        }
      }
      try {
        const { notes, assets } = service.writeNotesTree()
        return { type: 'snapshot-write-notes', ok: true, notes, assets }
      } catch (err) {
        return {
          type: 'snapshot-write-notes',
          ok: false,
          code: 'NOTES_TREE_FAILED',
          message: err instanceof Error ? err.message : String(err),
        }
      }
    }

    case 'close-project': {
      unsubscribe?.()
      unsubscribe = null
      service?.close()
      service = null
      // Secondaries are scoped to the foreground project session.
      closeSecondary('source')
      closeSecondary('library')
      return { type: 'close-project', ok: true }
    }

    case 'open-secondary': {
      // §14.4 create-new library (AI-IMP-094): LIBRARY only — a
      // source opens read-only, so creating one is a contradiction.
      if (request.createIfMissing === true && request.target !== 'library') {
        return {
          type: 'open-secondary',
          ok: false,
          code: 'INVALID_TARGET',
          message: 'createIfMissing applies to the library slot only — a source opens read-only',
        }
      }
      try {
        closeSecondary(request.target) // replace-on-open
        const creating =
          request.createIfMissing === true && !existsSync(join(request.dir, DB_FILENAME))
        const options: { readOnly: boolean; createIfMissing?: boolean; title?: string } = {
          readOnly: request.target === 'source',
        }
        if (request.createIfMissing === true) options.createIfMissing = true
        if (request.title !== undefined) options.title = request.title
        const secondary = openProjectService(request.dir, options)
        secondaries[request.target] = secondary
        // First open teaches by example (§14.4): a FRESH library is
        // seeded here, in-process against the new service, through
        // ordinary commands. Designating an EXISTING project never
        // seeds (creating === false). A failed seed does not fail
        // the open — the library itself is fine; report seeded.
        let seeded = false
        if (creating && request.seedDir !== undefined) {
          try {
            await seedLibrary(secondary, request.seedDir)
            seeded = true
          } catch (err) {
            console.error('[utility] library example seed failed:', err)
          }
        }
        return {
          type: 'open-secondary',
          ok: true,
          project: secondary.info(),
          created: creating,
          seeded,
        }
      } catch (err) {
        secondaries[request.target] = null
        const code =
          err instanceof Error && 'code' in err && typeof err.code === 'string'
            ? err.code
            : 'OPEN_SECONDARY_FAILED'
        return {
          type: 'open-secondary',
          ok: false,
          code,
          message: err instanceof Error ? err.message : String(err),
        }
      }
    }

    case 'close-secondary': {
      closeSecondary(request.target)
      return { type: 'close-secondary', ok: true }
    }

    case 'clear-library-example': {
      // §14.4 the explainer's one power, over the seam (AI-IMP-094):
      // enumerate by the shared 'example' tag in the LIBRARY slot and
      // trash through ordinary TrashNode commands.
      const library = secondaries.library
      if (!library) {
        return {
          type: 'clear-library-example',
          ok: false,
          code: 'NO_SECONDARY',
          message: 'no library project is open',
        }
      }
      try {
        return { type: 'clear-library-example', ok: true, trashed: clearLibraryExample(library) }
      } catch (err) {
        return {
          type: 'clear-library-example',
          ok: false,
          code: 'CLEAR_FAILED',
          message: err instanceof Error ? err.message : String(err),
        }
      }
    }

    case 'secondary-query': {
      const secondary = secondaries[request.target]
      if (!secondary) {
        return {
          type: 'secondary-query',
          ok: false,
          code: 'NO_SECONDARY',
          message: `no ${request.target} project is open`,
        }
      }
      const result = secondary.query(request.name, request.args)
      return result.ok
        ? { type: 'secondary-query', ok: true, result: result.result }
        : { type: 'secondary-query', ok: false, code: result.code, message: result.message }
    }

    case 'secondary-import': {
      const secondary = secondaries[request.target]
      if (!secondary) {
        return {
          type: 'secondary-import',
          ok: false,
          code: 'NO_SECONDARY',
          message: `no ${request.target} project is open`,
        }
      }
      try {
        const input: { bytes: Uint8Array; originalFilename: string; sourceUrl?: string } = {
          bytes: request.bytes,
          originalFilename: request.originalFilename,
        }
        if (request.sourceUrl !== undefined) input.sourceUrl = request.sourceUrl
        const { assetId, deduplicated } = await secondary.importAsset(input)
        return { type: 'secondary-import', ok: true, assetId, deduplicated }
      } catch (err) {
        const code =
          err instanceof Error && 'code' in err && typeof err.code === 'string'
            ? err.code
            : 'IMPORT_FAILED'
        return {
          type: 'secondary-import',
          ok: false,
          code,
          message: err instanceof Error ? err.message : String(err),
        }
      }
    }

    case 'ingest-from-secondary': {
      // §14.4 ingest-by-copy (AI-IMP-090): reads from the secondary,
      // WRITES into the primary. The secondary's {db, dir} read
      // handle comes from its own service (ingestSource()), so no
      // separate dir bookkeeping exists to drift out of sync.
      if (!service) {
        return {
          type: 'ingest-from-secondary',
          ok: false,
          code: 'NO_PROJECT',
          message: 'no project is open',
        }
      }
      const secondary = secondaries[request.target]
      if (!secondary) {
        return {
          type: 'ingest-from-secondary',
          ok: false,
          code: 'NO_SECONDARY',
          message: `no ${request.target} project is open`,
        }
      }
      try {
        const result = await service.ingestFrom(secondary.ingestSource(), {
          contentHash: request.contentHash,
          border: request.border,
        })
        return {
          type: 'ingest-from-secondary',
          ok: true,
          nodeId: result.nodeId,
          assetId: result.assetId,
          deduplicated: result.deduplicated,
          sourceProjectId: result.sourceProjectId,
        }
      } catch (err) {
        const code =
          err instanceof Error && 'code' in err && typeof err.code === 'string'
            ? err.code
            : 'INGEST_FAILED'
        return {
          type: 'ingest-from-secondary',
          ok: false,
          code,
          message: err instanceof Error ? err.message : String(err),
        }
      }
    }

    case 'mirror-to-library': {
      // §14.4 inbox mirror (AI-IMP-092): the exact inverse of
      // ingest-from-secondary — reads from the PRIMARY's {db, dir}
      // handle, WRITES into the library slot. Border 'none' by
      // construction: the mirror is one-way and carries bytes plus
      // provenance, never world curation.
      if (!service) {
        return {
          type: 'mirror-to-library',
          ok: false,
          code: 'NO_PROJECT',
          message: 'no project is open',
        }
      }
      const library = secondaries.library
      if (!library) {
        return {
          type: 'mirror-to-library',
          ok: false,
          code: 'NO_SECONDARY',
          message: 'no library project is open',
        }
      }
      try {
        const result = await library.ingestFrom(service.ingestSource(), {
          contentHash: request.contentHash,
          border: 'none',
        })
        return {
          type: 'mirror-to-library',
          ok: true,
          nodeId: result.nodeId,
          assetId: result.assetId,
          deduplicated: result.deduplicated,
        }
      } catch (err) {
        const code =
          err instanceof Error && 'code' in err && typeof err.code === 'string'
            ? err.code
            : 'MIRROR_FAILED'
        return {
          type: 'mirror-to-library',
          ok: false,
          code,
          message: err instanceof Error ? err.message : String(err),
        }
      }
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

    case 'set-setting': {
      if (!service) {
        return { type: 'set-setting', ok: false, code: 'NO_PROJECT', message: 'no project is open' }
      }
      try {
        service.setSetting(request.key, request.value)
        return { type: 'set-setting', ok: true }
      } catch (err) {
        return {
          type: 'set-setting',
          ok: false,
          code: 'SET_SETTING_FAILED',
          message: err instanceof Error ? err.message : String(err),
        }
      }
    }

    case 'claim-thumbnail-job': {
      if (!service) {
        return {
          type: 'claim-thumbnail-job',
          ok: false,
          code: 'NO_PROJECT',
          message: 'no project is open',
        }
      }
      try {
        return { type: 'claim-thumbnail-job', ok: true, job: service.claimThumbnailJob() }
      } catch (err) {
        return {
          type: 'claim-thumbnail-job',
          ok: false,
          code: 'CLAIM_FAILED',
          message: err instanceof Error ? err.message : String(err),
        }
      }
    }

    case 'submit-thumbnail': {
      if (!service) {
        return {
          type: 'submit-thumbnail',
          ok: false,
          code: 'NO_PROJECT',
          message: 'no project is open',
        }
      }
      try {
        const landed = service.completeThumbnailJob({
          jobId: request.jobId,
          bytes: request.bytes,
        })
        if (landed) {
          post({
            kind: 'thumbnail-ready',
            assetId: landed.assetId,
            contentHash: landed.contentHash,
          })
        }
        return { type: 'submit-thumbnail', ok: true }
      } catch (err) {
        return {
          type: 'submit-thumbnail',
          ok: false,
          code: 'SUBMIT_FAILED',
          message: err instanceof Error ? err.message : String(err),
        }
      }
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

  }
}

process.parentPort.on('message', (event) => {
  const { id, payload } = event.data as UtilityEnvelope<ProjectRequest>
  void handle(payload).then((response) => post({ kind: 'response', id, payload: response }))
})
