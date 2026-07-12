---
node_id: AI-IMP-231
tags:
  - IMP-LIST
  - Implementation
  - undo
  - P2
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.75
date_created: 2026-07-09
---


# AI-IMP-231-undo-group-identity

## Summary of Issue #1

Sol audit CA-006 (P2, probe-verified): `runAsUndoGroup` uses ONE
module-global `pendingGroup` accumulator — any group starting
while another is open silently JOINS it. Multi-file import holds
its group open across file I/O and scene waits while the renderer
stays interactive, so an unrelated note/tag/board action lands
inside the import's group and one Mod+Z reverses both (probe:
interleaved groups collapsed to one entry). Done means group
identity is explicit and operation-scoped: a group token per
runAsUndoGroup call; commits join a group only when issued under
that token's scope (async-context or explicit threading); nested
same-token calls join, temporal overlap NEVER merges.

### Out of Scope

- Fail-stop of the flows holding groups open (232 — but its
  bounded waits shrink this window; same wave).
- GROUP_ONLY breadth semantics (182, shipped).

### Design/Approach

Replace the global with token-scoped accumulation. Simplest
honest mechanism given the codebase's explicit style:
runAsUndoGroup creates a token and passes it through the callback
(callers thread it to their execute calls), OR an AsyncLocalStorage
scope if the renderer bundle supports it cleanly — builder probes
both, picks, and documents (STOP if neither can cover the import
path without distortion). Port Sol's probe: overlapping groups →
two distinct undo entries, each reversing only its own commits.

### Files to Touch

`renderer/undo/undo-store.ts` + spec; the runAsUndoGroup call
sites that must thread the token (import-surfaces, gestures,
menus).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Group membership is token-scoped; overlap never merges;
      nesting joins only same-token.
- [x] Probe regression: interleaved groups → separate entries.
- [x] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** a multi-file import in flight and a tag edit made
meanwhile
**WHEN** the user presses Mod+Z
**THEN** only the tag edit reverses — the import remains its own
single undo action.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

**TRUST-WAVE IMPLEMENTATION (2026-07-12) — the earlier STOP below is
superseded by the round-1 verdict.** Current review found 29 group sites across
17 callers, not the older ~15 estimate. The lead widened the fence to the
canvas-engine gateway and every caller, making explicit renderer-local token
threading possible without AsyncLocalStorage, IPC, schema, or main-process
changes. `CommandGateway` now broadcasts the token beside (never inside) the
durable envelope; every grouped execute carries it, and genuine nested
composition explicitly reuses the owner token.

The review also found that token identity alone was insufficient: completion-
order recording would put a long import above a later tag gesture. The verdict
ratified start-order reservations. A later finalized gesture may undo over an
older open reservation; Undo aimed at the newest open gesture speaks
`still importing — that step isn't ready to undo`. The regression suite covers
both overlap orders, same-token nesting, distinct-token nesting, a bare commit
during a parked group, and the exact decline voice. Import names its open
operation and threads the token through its nested frame composition.

**STOPPED — mechanism blocked within this wave's fence.** The ticket
required probing the two named mechanisms and STOPPING "if neither can
cover the import path without distortion." Neither can:

1. **AsyncLocalStorage — UNAVAILABLE.** The renderer window is
   `sandbox: true, contextIsolation: true, nodeIntegration: false`
   (`apps/desktop/src/main/index.ts:740-744`). `node:async_hooks` /
   `AsyncLocalStorage` is a Node API not exposed to the sandboxed
   renderer; the undo store runs in the renderer. No ALS to scope a
   group token across awaits.

2. **Explicit token threading — requires distorting ~15 fenced call
   sites.** Commits are attributed to a group by a MODULE-LEVEL listener
   (`onCommittedAnywhere`), decoupled from the `runAsUndoGroup` call. To
   attribute correctly, the group token must reach each `execute` call,
   i.e. every `runAsUndoGroup` site must thread the token into its
   commands AND the gateway/`CommittedNotice` must carry it. There are
   ~15 `runAsUndoGroup` sites — `canvas/import-surfaces.ts` (the CA-006
   caller), `canvas/host.ts`, `canvas/board-tooling.ts`,
   `canvas/charms-ui.ts`, `canvas/decorations-ui.ts`,
   `canvas/crop-editor.ts`, `note/NotePanel.svelte`, `note/panels.ts`,
   `note/note-editor.ts`, `tags/TagPanel.svelte`, `tags/TagAddField.svelte`,
   `chrome/BookmarkMenu.svelte`, `chrome/bookmarks.ts`,
   `menus/ContextMenu.ts`. The import path itself lives in
   `import-surfaces.ts`, which this wave's fence forbids touching — so
   threading cannot cover the import path at all here.

**Why no in-fence partial fix.** The hard requirement is "temporal
overlap NEVER merges; nested same-token joins." Distinguishing a NESTED
`runAsUndoGroup` (called from within the outer's fn — must join) from a
TEMPORALLY-OVERLAPPING one (called from an independent event turn while
the outer is parked at an await — must NOT join) requires knowing the
async call-tree across awaits. That is exactly what ALS provides and a
synchronous global cannot. A LIFO group-stack was considered: it fixes
the overlap case for two properly-wrapped groups (each commits while its
own frame is on top), but it turns genuine NESTED calls into separate
entries — violating "nested joins" and regressing existing single-entry
compositions (`host.ts` move-and-frame relies on nested-inline join). It
also still merges a BARE captured commit issued during a long import.
Shipping it would trade one wrong behavior for another and break a
ratified invariant — not acceptable as "done," and unratified.

**Left in place:** the global `pendingGroup` (unchanged) and a SKIPPED
executable spec `it.skip('overlapping groups stay separate ... (CA-006)')`
in `undo-store.test.ts` — Sol's CA-006 probe, ported, asserting the
DESIRED two-entries outcome, ready to un-skip when the mechanism lands.

**Recommended path (lead decision):** widen a future ticket's fence to
thread an explicit group token through the `runAsUndoGroup` sites and add
`groupToken` to `CommandGateway.execute` + `CommittedNotice` (the honest
mechanism given the renderer's explicit style and the sandbox), OR gate
this on AI-IMP-232 first (its bounded waits shrink the overlap window,
though they do not close it). No code from this ticket was committed.
