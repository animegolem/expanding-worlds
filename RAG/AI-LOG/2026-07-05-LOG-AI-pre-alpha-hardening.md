---
node_id: 2026-07-05-LOG-AI-pre-alpha-hardening
tags:
  - AI-log
  - development-summary
  - hardening
  - feel
closed_tickets:
  - AI-IMP-053
  - AI-IMP-054
  - AI-IMP-055
  - AI-IMP-056
  - AI-IMP-057
  - AI-IMP-058
  - AI-EPIC-012
created_date: 2026-07-05
related_files:
  - apps/desktop/src/main/index.ts
  - apps/desktop/src/main/net-guard.ts
  - packages/persistence/src/lock.ts
  - apps/desktop/src/renderer/canvas/host.ts
  - apps/desktop/src/renderer/DecorationToolbar.svelte
  - apps/desktop/src/renderer/note/open-note.ts
  - packages/canvas-engine/src/decoration-data.ts
  - apps/desktop/e2e/helpers.ts
  - apps/desktop/e2e/recovery.spec.ts
  - RAG/RFC-0001-Core-Note-Node-and-Canvas-Model.md
confidence_score: 0.9
---

# 2026-07-05-LOG-AI-pre-alpha-hardening

## Work Completed

AI-EPIC-012 cut and closed in one session from the owner's parking-
lot notes plus two external code reviews (triaged in conversation;
owner approved the batch and the hardening-before-EPIC-006
sequencing). Landed: utility-process crash safety with automatic
restart and a visible StatusStrip state; same-host dead-pid lock
reclaim (the true fix for the owner's black-canvas relaunches);
deterministic scene-applied events replacing every renderer refresh
timer; selection-aware restyling for drawn decorations plus rect
corner rounding; feel constants (zoom floor 0.002, guide alpha 0.5,
label ratio 0.14); double-click-the-label inline note rename routed
through the rename seam; wiki-link follow-gesture tooltips; an SSRF
guard on URL import; and consolidated e2e helpers with notes.spec
fully migrated. RFC rev 0.16 records Q20 (pin dialog surface), Q21
(hidden-notes tension), the live-preview reading mode as
deferred-with-scope, decoration restylability, and the §11.4
dead-holder reclaim + no-silent-hang rules.

## Session Commits

a9971df epic + tickets + RFC 0.16; 13b613e IMP-053 (crash safety +
lock reclaim); d9ad7e2 IMP-054 (scene-applied events); 6def79b
IMP-055 (restyle + rounding); 3b7bfa5 IMP-056 (constants, label
rename, affordance); d7d0819 IMP-057 (SSRF guard, helpers, epic
close). One commit per ticket, all pushed; CI green throughout.

## Issues Encountered

The recovery e2e's first failure exposed the deeper truth behind the
owner's black-canvas launches: automatic restart hit the §11.4
corpse-lock window (a killed holder's heartbeat stays fresh 30 s).
The lock now reclaims immediately when the recorded holder is
same-host with a provably dead pid — this also resolves the parked
PROJECT_LOCKED proposal's worst half. IMP-048's-era relink design
had already shown the reviews' value; this session added two more
latent test races the suite had been hiding: Playwright's click
`modifiers` option never reaches synthesized pointer events in
Electron (canvas shift-clicks need keyboard.down/up), and slice.spec
read decorationVisible synchronously after an async scene apply.
Both fixed. The SSRF guard needed a test-only bypass env because the
import spec's success fixture legitimately serves from 127.0.0.1.
Parked without tickets, per the triage: curved pen arrows,
TextureBudget LRU, live-preview mode itself, the license file (MIT
leaning), Create Pin dialog removal (waits for its chrome-era
replacement, Q20).

## Tests Added

recovery.spec (utility kill → structured rejection → status →
sub-second recovery); lock dead-holder reclaim unit test (spawned
dead child pid); cornerRadius validator cases; selection-restyle e2e
(single + multi-select, fill none, rounding); label-rename e2e; SSRF
rejection e2e; suite now 38 e2e + 352 persistence + 235 engine + 38
domain.

## Next Steps

EPIC-006 (navigation & discovery) is next on the owner's word:
tabs, node library, quick-open, bookmarks/history, the §7.4 grouped
location chooser, cross-canvas navigation. Read the EPIC-005 and
release-engineering logs first; remember the pane's active-canvas =
root assumption breaks with tabs, and close-epic → bump version →
tag v0.6.0 ships it. The owner's remaining parking-lot items
(pins Q20, hidden notes Q21, curved arrows, live preview) have RFC
homes and wait for explicit prioritization.

## Addendum — AI-IMP-058 (same session)

A second external review pass (owner-run) produced four findings;
three were validated in conversation and shipped as AI-IMP-058
(the fourth, SSRF, was stale — already landed as AI-IMP-057):
(1) UUIDv7 invariant sweep — 29 v4 sites across 11 renderer files
plus the gateway, envelope validator tightened to v7 command ids,
preload util.newId for e2e envelopes (23 sites migrated); the sweep
script's import-insertion heuristic bit once (landed an import
inside CreatePinDialog's doc comment — builds pass on comments,
only the runtime e2e caught it; all placements audited after).
(2) Lock reclaim verify-after-write — the losing racer of a stale
reclaim now throws PROJECT_LOCKED instead of running a second
writer; unit-tested via a renameSync interleave hook. (3) Phantom
Create and Place carries the typed draft (CreatePin note.create
body) and the blur-materialize race is gone. EPIC-012 closed for
the second and final time, FR-1..11, CI green.
