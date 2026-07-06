---
node_id: AI-IMP-088
tags:
  - IMP-LIST
  - Implementation
  - persistence
  - protocol
kanban_status: completed
depends_on:
parent_epic: [[AI-EPIC-015-library-and-cross-project-sourcing]]
confidence_score: 0.75
date_created: 2026-07-06
date_completed: 2026-07-06
---

# AI-IMP-088-secondary-project-seam

## Summary of Issue #1

Every EPIC-015 surface needs a SECOND project open concurrently:
the scope toggle browses the library's gallery from a world, source
panels browse an arbitrary project read-only, and the inbox mirror
writes into the library while a world is foreground. The utility
process hosts exactly one ProjectService today. This ticket is the
interface everything else consumes (lead-built): a secondary
project handle in the utility, read-only opening in persistence
(§11.1), the library-project designation in app config, and the
protocol/preload verbs. Done = a world can query the designated
library's gallery and import into it over the seam, with lock
semantics decided and tested.

### Out of Scope

- All UI (tickets 089–094).
- More than ONE secondary open at a time (a source panel replaces
  the prior source; the library handle is managed separately).
- Cross-project references of any kind (§14.4 guardrail).

### Design/Approach

Persistence: `openProjectService(dir, { readOnly: true })` — SQLite
opens with query-only enforcement (PRAGMA query_only), execute/
importAsset/setSetting throw EW_READ_ONLY, recovery SKIPS repairs
(read-only must not mutate; §11.4 recovery runs only on writable
open), and the §11.1 lock is NOT taken (read-only never blocks the
owner; a stale lock does not block read-only open). The mirror's
LIBRARY handle opens WRITABLE with the ordinary lock — §14.4
already specifies the locked-library fallback (queue or notice,
never block the drop). Utility: a `secondary` slot beside the
primary — open-secondary / close-secondary / secondary-query /
secondary-import verbs routed by an explicit target field, not
parallel channels. Main config: `libraryProjectDir` app setting +
get/set IPC. Preload mirrors the verbs under ew.secondary. The
utility owns re-open on path change; a dead secondary never takes
the primary down (independent error surface, ok:false responses).

### Files to Touch

`packages/persistence/src/project.ts`, `service.ts`, `lock.ts`
(+tests): readOnly option, EW_READ_ONLY, lock skip.
`packages/protocol/src/index.ts`: secondary verbs + target routing.
`apps/desktop/src/main/` (utility host + config + IPC routes).
`apps/desktop/src/preload/index.ts`: ew.secondary.
Unit tests in persistence; one e2e proving a second window-less
secondary open + query + close.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] persistence readOnly open: query_only enforced, execute/
      import/setSetting throw EW_READ_ONLY, recovery skipped, lock
      untouched; units incl. opening a project that is ALSO open
      writable elsewhere.
- [x] library handle path: writable secondary open takes the
      ordinary lock; a locked library yields a typed failure the
      mirror can queue on (no crash, no block).
- [x] protocol: open/close/query/import secondary verbs; envelope
      routing; utility slot lifecycle (replace-on-open, close on
      project close, primary unaffected by secondary death).
- [x] main: libraryProjectDir app setting + IPC; preload
      ew.secondary surface.
- [x] e2e: open a fixture project as secondary from a running
      world, run getGalleryIndex against it, close it; primary
      revision unchanged throughout.
- [x] Full gates.

### Acceptance Criteria

**GIVEN** a world open in the window and a second project on disk
**WHEN** the renderer opens it as a read-only secondary and runs
gallery queries
**THEN** results return from the secondary, every write verb
against it fails EW_READ_ONLY, and the secondary took no lock.
**GIVEN** the designated library is open in another app instance
**WHEN** the mirror's writable open is attempted
**THEN** a typed lock failure returns and the foreground project is
untouched.

### Issues Encountered

Landed lead-built. Notes: libraryProjectDir needs NO new main code
— the generic app-settings get/set covers arbitrary keys, so the
designation is just a key (089 consumes it). Read-only opens double
the guarantee (connection readOnly + PRAGMA query_only) and demand
the CURRENT schema (EW_SCHEMA_MISMATCH tells the user to open
writable once). Thumbnail claim/complete return null on read-only —
a source serves the derivatives it has; missing ones are 089's
placeholder concern. Secondaries take no change-event subscription
(live everything-scope updates are a later ticket if a surface
wants them) and replace-on-open is implemented but not e2e-pinned.
Gates: 423/270/36 units (5 new read-only, incl. held-lock typed
refusal), 89 e2e (2 new: source browse + library import), lint.

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
