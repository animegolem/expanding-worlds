import type { ProjectRequest, ProjectResponse, UtilityEnvelope } from '@ew/protocol'

/**
 * Project utility process stub (RFC-0001 §13.2). EPIC-003 grows this
 * into the authoritative project service (SQLite, import, indexing);
 * for now it proves the seam by answering ping.
 */

function handle(request: ProjectRequest): ProjectResponse {
  switch (request.type) {
    case 'ping':
      return { pong: true, from: 'utility' }
  }
}

process.parentPort.on('message', (event) => {
  const { id, payload } = event.data as UtilityEnvelope<ProjectRequest>
  process.parentPort.postMessage({
    id,
    payload: handle(payload),
  } satisfies UtilityEnvelope<ProjectResponse>)
})
