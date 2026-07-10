---
node_id: AI-IMP-251
tags:
  - IMP-LIST
  - Implementation
  - persistence
  - settings
  - consolidation
kanban_status: planned
depends_on: []
parent_epic: [[AI-EPIC-027-hardening-and-consolidation]]
confidence_score: 0.7
date_created: 2026-07-10
date_completed:
---


# AI-IMP-251-project-setting-codec

## Summary of Issue #1

Two audits, one ticket (EPIC-027 FR-16 merged with FR-11).
HC-003: `settings.ts` centralizes safe project-setting storage —
`setProjectSetting` owns the upsert (`packages/persistence/src/
settings.ts:14-33`), `getProjectSetting` catches malformed JSON
(`:35-50`) — but the trash-retention paths bypass both
(`queries-lifecycle.ts:231-239` unguarded parse;
`handlers/lifecycle.ts:755-774` repeats SELECT+parse+upsert) and
whole-map `getSettings` parses every row uncontained (`:53-62`), so
one malformed row degrades inconsistently or throws. C10-011: the
settings UI ignores the typed write result and optimistically
mutates local state (`SettingsView.svelte:213-215`, `:247-258` via
`preload/index.ts:95-108`, `utility/index.ts:469-483`) — backup/
remote UI can claim success while nothing persisted. Done means:
all project-setting storage routes through the helpers, reads take
a key-specific decoder so parseable-but-invalid values fall back
visibly, whole-map has a tested per-key fallback policy, and the
settings UI is result-aware (the AI-IMP-237 pattern extended to
project settings).

### Out of Scope

- App-tier settings (AI-IMP-237 owns those; already atomic).
- Moving domain validation out of command handlers — allowed-value
  checks (e.g. `handlers/lifecycle.ts:755-761`) STAY in handlers.
- Any SQLite CHECK constraint (growing-domain rule).
- Snapshot-engine behavior itself (C10-010 is separate).

### Design/Approach

Extend `getProjectSetting` with an optional decoder/validator
parameter (`(raw: unknown) => T | undefined`); undefined →
fallback + a debug-visible note, mirroring the existing corruption
path. Migrate `getTrashRetention` and `SetTrashRetention` onto the
helpers; the handler keeps its allowed-value validation and calls
`setProjectSetting` for storage. Whole-map `getSettings` returns
per-key fallbacks for bad rows instead of throwing (audit's stated
preference). Renderer side: a result-aware write path in
SettingsView that rolls back optimistic state and surfaces the
persistence error; failure-injection tests for no-project,
read-only, and forced write failure.

PRE-IMPLEMENTATION REVIEW (standing process): verify both audits'
citations against current source first; record corrections here.

### Files to Touch

- `packages/persistence/src/settings.ts`: decoder param; whole-map
  per-key fallback.
- `packages/persistence/src/queries-lifecycle.ts:231-239`: route
  through `getProjectSetting`.
- `packages/persistence/src/handlers/lifecycle.ts:755-774`:
  validation stays; storage via helpers.
- `packages/persistence/src/settings.test.ts` (+ lifecycle tests):
  malformed row, parseable-but-invalid, whole-map policy.
- `apps/desktop/src/renderer/views/SettingsView.svelte`:
  result-aware writes, rollback on failure.
- `apps/desktop/src/preload/index.ts` /
  `apps/desktop/src/utility/index.ts`: only if the result is not
  already surfaced end-to-end (verify in review).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Pre-implementation review: HC-003 + C10-011 citations
      verified; corrections recorded in this ticket.
- [ ] `getProjectSetting` accepts a key decoder;
      parseable-but-invalid falls back (test proves it).
- [ ] Trash-retention read/write paths routed through the helpers;
      handler validation unchanged and still tested.
- [ ] `getSettings` whole-map policy: one malformed row cannot
      take down the settings view (test proves it).
- [ ] SettingsView project-setting writes are result-aware:
      injected write failure rolls back optimistic state and shows
      the error; remote test cannot report Connected on an unsaved
      draft.
- [ ] `pnpm -r build`, package units, desktop `npx vitest run`
      green. (Electron e2e supplied by the lead at merge.)

### Acceptance Criteria

**Scenario:** a hand-corrupted settings row and a failing write.
**GIVEN** a project whose `trash_retention` row holds invalid JSON
**WHEN** the settings view and `getTrashRetention` read it
**THEN** both fall back to the default without throwing
**AND GIVEN** a project-setting write that fails at persistence
**WHEN** the user toggles backup settings
**THEN** the UI rolls back and shows the persistence error rather
than claiming success.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
