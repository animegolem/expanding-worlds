---
node_id: AI-IMP-237
tags:
  - IMP-LIST
  - Implementation
  - main
  - settings
  - P3
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.85
date_created: 2026-07-09
---


# AI-IMP-237-atomic-app-settings

## Summary of Issue #1

Sol audit CA-015 (P3, lead-verified): app settings writes rewrite
`app-settings.json` in place (main/index.ts ~223-263) — a crash
or full disk mid-write leaves truncated JSON that the next launch
silently treats as EMPTY settings (theme, library designation,
first-run state, navigation scheme all reset, unexplained). The
renderer's optimistic set discards the persistence promise, so
failures neither roll back nor notify. Done means settings writes
are atomic (temp + fsync + rename), a parse failure on load is
LOUD (settings reset to defaults with a visible notice, and the
corrupt file is preserved beside as `.corrupt` for inspection),
and a failed persist surfaces to the renderer as a typed result
instead of vanishing.

### Out of Scope

- Settings schema/UI.
- Project-side settings (different store, already transactional).

### Design/Approach

Main: write `${path}.tmp-${pid}`, fsync, rename; on load-parse
failure, move the bad file to `.corrupt-<ts>`, seed defaults,
include a `recovered: true` flag the renderer turns into a §8.6
toast. Renderer: `setAppSetting` awaits the IPC result; on
failure, revert the optimistic value and toast (keep the
optimistic apply — the revert is the new part). Unit: truncated-
file load; e2e: a set → relaunch (existing harness pattern)
persists.

### Files to Touch

`apps/desktop/src/main/index.ts` (settings seam),
`renderer/settings/settings.ts`, specs + one e2e assert.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Atomic write path; truncated-load recovery loud + file
      preserved.
- [ ] Failed persist reverts + notifies (typed).
- [ ] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** a crash during a settings write
**WHEN** the app relaunches
**THEN** settings are either the old values or the new ones —
never silently empty — and any reset announces itself.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
