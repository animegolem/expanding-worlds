---
node_id: AI-IMP-172
tags:
  - IMP-LIST
  - Implementation
  - undo
  - bug
kanban_status: completed
depends_on: []
parent_epic: [[AI-EPIC-008-export-import-signoff]]
confidence_score: 0.95
date_created: 2026-07-07
date_completed: 2026-07-07
---


# AI-IMP-172-decline-toast-board-name

## Summary of Issue #1

Found by AI-IMP-169's cross-canvas walk: the rev 0.58 decline notice
NEVER names the board. `boardLabel()` in
`apps/desktop/src/renderer/undo/undo-store.ts` reads `row.noteTitle`
from `getOutlineTree`, but the projection returns `label`
(noteTitle ?? shortCode) — `noteTitle` does not exist in its rows.
The local `OutlineRow` interface is applied by CAST, so TypeScript
never saw the mismatch, and the undo-stack unit tests inject
`boardLabel` as a harness dep — the real wiring had zero coverage.
Every decline falls through to the generic "another board" phrasing,
violating §17 item 19 / §10.2 rev 0.58 ("a notice naming that
board"). Done means the toast names the board (title, else the
short code per the quick-open label convention) and the 169 e2e
asserts it end to end.

### Out of Scope

- Navigation-on-undo (explicitly deferred at rev 0.58).
- Toast phrasing changes beyond the name slot.

### Design/Approach

One-line correction: match the projection's actual field —
`row.label`, quoted as the title was (`“${row.label}”`). `label` is
never null (short-code fallback in the query), so untitled boards
name themselves by short code, consistent with quick-open and the
outline. The generic "another board" branch remains for canvases the
projection omits (trashed/purged) and query failures. Fix the
`OutlineRow` interface to `{ canvasId, label }` so the cast tells
the truth. Validation is AI-IMP-169's cross-canvas e2e
(undo.spec.ts), which asserts the toast contains "Ruins Board" —
red before this fix, green after.

### Files to Touch

`apps/desktop/src/renderer/undo/undo-store.ts` (boardLabel + the
OutlineRow interface). ~4 LOC.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] boardLabel reads `label`; OutlineRow interface matches the
      projection.
- [x] AI-IMP-169's cross-canvas decline e2e green (toast names
      “Ruins Board”).
- [x] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + the
      undo spec hidden.

### Acceptance Criteria

**GIVEN** a structural edit made on a titled board B
**WHEN** the user presses Mod+Z while standing on another board
**THEN** the decline toast names B by its title (short code when
untitled), and the entry stays undoable from B.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

The defect class is worth naming for future reviews: a renderer-side
`as`-cast interface over an IPC query result asserted a field
(`noteTitle`) the projection never returned, and the unit suite
injected the whole function as a harness dependency — so neither the
type checker nor the tests could see it. The e2e that walks the real
seam (169) caught it on first run. Pattern to watch: any local
interface cast over `response.result` should be checked against the
query's actual SELECT/return shape.
