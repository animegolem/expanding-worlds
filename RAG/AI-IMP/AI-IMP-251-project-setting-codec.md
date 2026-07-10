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

#### Pre-implementation review — 2026-07-10 (`5fceb908`)

The persistence diagnosis is confirmed against current main:

- `setProjectSetting` owns the ordinary upsert at
  `packages/persistence/src/settings.ts:14-33`, while
  `getProjectSetting` catches only malformed JSON at `:35-50`.
- `getTrashRetention` still performs its own SELECT and unguarded
  parse at `queries-lifecycle.ts:231-239`; `SetTrashRetention`
  repeats SELECT, parse, and upsert at
  `handlers/lifecycle.ts:755-774`; `getSettings` still lets one
  malformed row fail the whole query at `settings.ts:53-62`.
- The handler's allowed-value check at
  `handlers/lifecycle.ts:755-761` is authoritative domain
  validation and remains in the handler.

The write-result diagnosis is also confirmed, with these scope
corrections:

1. Protocol, preload, main, and utility already preserve the typed
   result end to end (`protocol/src/index.ts:90-98`,
   `preload/index.ts:95-108`, `main/index.ts:992-999`,
   `utility/index.ts:469-483`). Main broadcasts a setting change
   only after `ok: true`; none of those files needs a repair.
2. SettingsView has five optimistic project-setting writes that
   ignore the result, not only the two backup citations:
   metadata defaults (`SettingsView.svelte:101-110`), export-size
   acknowledgement (`:153-164`), snapshot mode (`:209-216`),
   snapshot remote (`:247-253`), and multi-drop behavior
   (`:270-277`). One result-aware helper will own rollback,
   supersession, and the error toast for all five.
3. The remote field's blur-save and Test button are separate async
   paths (`SettingsView.svelte:617`, `:624`). A click can test the
   draft and report Connected before a failed save resolves. The
   test path must await a successful save before probing.
4. Whole-map fallback is necessarily per row because project
   setting keys are extensible and include ID-prefixed families.
   Known keys such as `trash_retention` use a key decoder and
   concrete fallback; malformed unknown rows are omitted (the
   existing consumers already treat absence as their per-key
   default). Both cases emit a debug-visible warning without
   exposing the stored value.
5. Project creation seeds `trash_retention` with a fourth direct
   settings INSERT at `packages/persistence/src/project.ts:93-98`.
   It runs inside the seed transaction but can still call
   `setProjectSetting`; it joins the write migration so the upsert/
   serialization grammar truly has one owner.

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

- [x] Pre-implementation review: HC-003 + C10-011 citations
      verified; corrections recorded in this ticket.
- [x] `getProjectSetting` accepts a key decoder;
      parseable-but-invalid falls back (test proves it).
- [x] Trash-retention read/write paths routed through the helpers;
      handler validation unchanged and still tested.
- [x] `getSettings` whole-map policy: one malformed row cannot
      take down the settings view (test proves it).
- [x] SettingsView project-setting writes are result-aware:
      injected write failure rolls back optimistic state and shows
      the error; remote test cannot report Connected on an unsaved
      draft.
- [x] `pnpm -r build`, package units, desktop `npx vitest run`
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

- The review proved the protocol/preload/main/utility result path
  was already complete, so none of those files changed. The repair
  lives at the persistence codec and renderer consumer boundaries.
- Project creation contained a fourth direct settings INSERT not
  named by the audit. It now seeds through `setProjectSetting`
  inside the existing transaction; the adoption scan leaves
  settings-table SQL in `settings.ts` only.
- The renderer writer serializes per key, shares identical
  in-flight writes, and rolls the latest failure back to the last
  confirmed value. Tests cover no project, read-only, forced
  rejection, and refusing to run the remote probe after a failed
  save.
- `pnpm lint` initially found one `prefer-const` issue in the new
  promise queue; it was corrected and lint reran green.
- Validation: `pnpm -r build` green; package units green (1050
  tests); desktop Vitest green (370 passed, 1 skipped); `pnpm
  lint` green. Desktop Vitest retained the existing non-fatal
  jsdom canvas diagnostics. Electron e2e was not run per the
  assignment; the lead supplies it at merge.
