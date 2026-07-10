---
node_id: AI-IMP-256
tags:
  - IMP-LIST
  - Implementation
  - hardening
  - review
kanban_status: completed
depends_on: []
parent_epic: [[AI-EPIC-027-hardening-and-consolidation]]
confidence_score: 0.9
date_created: 2026-07-10
date_completed: 2026-07-10
---


# AI-IMP-256-codex-epic-027-resolutions-merge

## Summary of Issue #1

The record ticket for the `codex/epic-027-resolutions` batch: the
in-context Codex session (author of the control-flow audit)
resolved ALL 14 C10 findings as atomic commits (bd09e1fd..27de4efa,
base e657d00d) with per-commit regression tests, validated locally
including full Electron e2e (243/243, six shards — the desktop
session runs Electron, unlike sandboxed clones). This ticket
records the lead review and merge (`c7c0b1a2`) so EPIC-027's
FR-1..13 have a kanban artifact; the commits map 1:1 to C10 IDs
and thus to the FRs.

### Out of Scope

- FR-14/18-24 (helper tail) and AI-IMP-253/254 — still open.
- The dropped C10-011 implementation (see below) — no scope lost;
  AI-IMP-251 shipped the same finding first.

### Design/Approach

Lead review protocol: branch fetched from the temp worktree before
anything else; boundary pass (fences clean across 53 files — no
lock.ts, e2e specs, workflows, INDEX.md); the P1 quintet
read line-by-line — C10-002's sender-bound one-use
MaterializedProjectOpenRegistry (the 229 pattern), C10-003's
path-safety module, C10-004's IANA-complete non-global classifier
(incl. 100.64/10, PCP/TURN anycast carve-outs, mapped/NAT64/6to4
embedded-address unwrapping), C10-001's rejecting flush with
retained dirty buffer, C10-005's pre-await reservation. C10-007
verified against the lead's own confirmation of the
double-decrement; the isTransaction-derived depth recovery is
stronger than the ticketed sketch. P2/P3s reviewed at approach
level, carried by their per-commit regressions.

Merge resolutions: `project.ts` union (251 seeding + C10-003
layout assertions); `SettingsView.svelte` keeps AI-IMP-251's
`createProjectSettingWriter`, C10-011's parallel
`project-setting-writer.ts` dropped (same finding, built
independently against a pre-wave-1 base; 251 merged first).
C10-002's openToken flow through SettingsView preserved.

### Files to Touch

(See merge `c7c0b1a2` — 53 files; conflict resolutions in
`packages/persistence/src/project.ts` and
`apps/desktop/src/renderer/views/SettingsView.svelte`.)

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Branch fetched and secured locally before review.
- [x] Boundary pass: no fenced files in the 53-file diff.
- [x] P1 logic review (C10-001..005) + C10-007 line-level.
- [x] Overlap dedup: C10-011 dropped for 251; C10-008 confirmed
      disjoint from 252 (registry/inverse handlers, not the codec).
- [x] Merge committed with both-sides project.ts and ours-side
      writer resolution; no conflict markers; no stray
      project-setting-writer references.
- [ ] Full gate green on merged main (build, package units,
      desktop vitest, full e2e) — REQUIRED before the v0.20.0 tag.

### Acceptance Criteria

**GIVEN** merged main at `c7c0b1a2`
**WHEN** the full local gate runs
**THEN** build, package units, desktop units, and the complete e2e
suite pass
**AND** EPIC-027 FR-1..13 are closed by commits mapped 1:1 to
their audit IDs.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
The initial merge commit briefly carried the dropped C10-011
writer files (git rm refused staged paths); amended with -f before
push. C10-011's duplicate implementation cost was one review
round, not lost work — the wave-1/parallel-Codex race is the
expected price of two builders on one audit; base-freshness checks
go in future briefs.

TWO LEAD ERRORS CAUGHT BY THE GATE, recorded honestly: (1) the
project.ts conflict resolution silently failed (Edit refused an
unread file) and the merge was committed with LIVE CONFLICT
MARKERS — 43 persistence suites failed at transform; (2) the first
gate chain MASKED that failure (grep swallowed the pipeline exit,
no pipefail) and reported exit 0 — the same false-green class as
the Playwright waitForFunction lesson. Repaired, amended (final
merge hash c7c0b1a2), full gate re-run WITH pipefail before the
tag. Rules reinforced: gate chains always `set -o pipefail`; any
merge with a failed Edit gets a tree-wide conflict-marker scan
before commit.

THIRD FINDING from the unmasked gate: wave 1's e2e validation was
ALSO misread — 4 real failures (3 search + 1 slice) hid behind the
same unpiped tail and my "238 passed, 1 flaky" green call. Cause:
two e2e seeds spoke an untyped dialect the new appearance codec
rightly refuses — search.spec omitted the required `crop` key, and
slice.spec:257 passed a PIXEL-SPACE crop ({x:4,width:32}) that
pre-codec handlers silently stored, which is HC-004/C10-008's
entire premise demonstrated in our own suite. Ruling: the codec is
correct (every product caller passes crop explicitly; the typed
payload requires it); the seeds were fixed to the §4.6 normalized
contract. Full suite re-run before tag.
