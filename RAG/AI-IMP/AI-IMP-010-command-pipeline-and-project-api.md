---
node_id: AI-IMP-010
tags:
  - IMP-LIST
  - Implementation
  - commands
  - project-api
  - ipc
kanban_status: planned
depends_on: [AI-IMP-009]
parent_epic: [[AI-EPIC-003-domain-persistence-core]]
confidence_score: 0.8
date_created: 2026-07-04
date_completed:
---

# AI-IMP-010-command-pipeline-and-project-api

## Summary of Issue #1

RFC §10.1 requires every durable mutation to pass through a
serializable, versioned command envelope, and §11.3 requires the UI to
talk only through a narrow Project API. Neither exists; the utility
process still answers a ping stub. This ticket is interface-defining
(lead-built): the command envelope and dispatch pipeline (validation,
per-type versions with an upcaster hook, transaction wrapper, monotonic
project_revision, structured revision conflicts, metadata log), the
Project API surface (execute command, typed query, subscribe, import
asset, request derivatives) over utility-process IPC, and the typed
renderer bridge. Done means: a reference command (CreateNode) executes
renderer→service round-trip, conflicts and events observable, `pnpm
check` green.

### Out of Scope

All remaining command handlers (011–013); real import pipeline behind
the importAsset endpoint (014 — stub rejects until then); FTS (015);
undo stacks (EPIC-007) — but execute results must carry what an
inverse needs; recovery (016).

### Design/Approach

`@ew/commands` holds renderer-importable types: CommandEnvelope
(command_id, project_id, command_type, command_version,
expected_project_revision?, issued_at, payload), per-command payload
types, structured results (Committed{revision, effects, inverse},
Conflict{expected, actual}, DomainError e.g. NOTE_TITLE_CONFLICT
§7.7). Handlers register in a registry keyed by (type, version) with
an upcaster hook translating old payloads forward (§10.1). The
dispatcher wraps each command in one SQLite transaction: validate →
handle → bump project_revision → append command_log row — all-or-
nothing (epic NFR). Events (§11.3 subscribe): coarse
`project-changed` carrying revision, command_type, and affected record
ids/kinds — enough for UI re-query without an event-sourcing
vocabulary; delivered over parentPort and fanned out by main to
subscribed windows. Inverse support: each handler returns an inverse
command payload (invariant 24) stored in the Committed result for the
future in-memory undo stack; not persisted beyond the metadata log.
Queries: typed query registry (getNote, listNodes, etc. — minimal set
now, grown by later tickets). @ew/protocol grows request/response
unions; preload exposes `window.ew.project.{execute,query,subscribe}`.

### Files to Touch

`packages/commands/src/envelope.ts`: envelope + result types.
`packages/commands/src/payloads/*.ts`: payload types (grown later).
`packages/commands/src/registry.ts`: handler/upcaster registration.
`packages/persistence/src/dispatcher.ts`: transaction wrapper,
revision bump, command_log append, event emission.
`packages/persistence/src/queries.ts`: typed query registry.
`packages/persistence/src/handlers/nodes.ts`: CreateNode reference
handler (grown by 012).
`packages/protocol/src/index.ts`: ProjectRequest/Response unions,
event envelope.
`apps/desktop/src/utility/index.ts`: host service, route requests.
`apps/desktop/src/main/index.ts`: forward requests/events.
`apps/desktop/src/preload/index.ts`: execute/query/subscribe bridge.
`apps/desktop/e2e/shell.spec.ts`: extend round-trip assertion.
Tests beside each source file.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] `@ew/commands`: envelope, result, and error types; envelope validation (required fields, issued_at ISO, payload typed per command_type) with tests.
- [ ] Registry with (command_type, command_version) lookup and upcaster chain; test: v1 payload upcasts to v2 handler; unknown type/version yields structured error.
- [ ] Dispatcher: one transaction per command — handler writes, project_revision increment (invariant 23), command_log row (id, type, version, issued_at, resulting_revision per §10.2) — with a forced-failure test proving no partial state (epic NFR: failed command leaves no rows, no revision bump).
- [ ] expected_project_revision mismatch returns structured Conflict without touching state (test).
- [ ] Handler contract returns {effects, inverse}; CreateNode reference handler implements it; dispatcher surfaces inverse in Committed result (test executes CreateNode, executes returned inverse, state returns to prior).
- [ ] Event emission: committed command emits project-changed {revision, command_type, affected}; in-process subscriber test.
- [ ] Typed query registry with getProject, getNode, listNodes; renderer-safe result types.
- [ ] `@ew/protocol`: ProjectRequest/ProjectResponse/ProjectEvent unions replacing ping-only envelope (keep ping for liveness).
- [ ] Utility process hosts the service: open/create project on init message, route execute/query, push events via parentPort; main forwards to windows; preload exposes typed execute/query/subscribe.
- [ ] e2e: renderer executes CreateNode against a temp project and receives Committed with revision 1+; subscribe callback fires; sandbox assertions still pass.
- [ ] importAsset and requestDerivatives endpoints exist and return structured NOT_IMPLEMENTED (replaced by 014).
- [ ] `pnpm check` green; commit.

### Acceptance Criteria

**Scenario:** Reference command round-trip with conflict handling.
**GIVEN** an open project at revision N.
**WHEN** the renderer executes CreateNode with
expected_project_revision N.
**THEN** the result is Committed with revision N+1, an inverse
command, and a command_log row recording id, type, version, issued_at,
N+1.
**AND** a project-changed event with revision N+1 reaches the
subscriber.
**WHEN** a second command carries expected_project_revision N.
**THEN** it returns a structured Conflict, revision stays N+1, and no
command_log row is written.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only
comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the
sprint.
You MUST document any failed implementations, blockers or missing
tests.
-->
