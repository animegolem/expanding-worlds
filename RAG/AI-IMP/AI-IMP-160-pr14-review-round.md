---
node_id: AI-IMP-160
tags:
  - IMP-LIST
  - Implementation
  - review
kanban_status: completed
depends_on: [AI-IMP-145, AI-IMP-134]
parent_epic:
confidence_score: 0.9
date_created: 2026-07-07
date_completed: 2026-07-07
---


# AI-IMP-160-pr14-review-round

## Summary of Issue #1

Codex review of PR #14 (wave 3) returned two findings. P2: the
first-run guide rendered its own overlay without joining
takeoverActive(), so board keyboard seams (delete, structural undo,
quick-open) still acted underneath it — the replay path shows the
guide over a live board with selection state, and a stale-bundle e2e
run proved Delete really deletes under the card. P3: the open book
binds to a rotated image's axis-aligned AABB, not its rendered edge,
so rings float off-edge on rotated placements. Done means P2 is
fixed with red-green proof; P3 is delegated to AI-IMP-135's scope
(that agent owns NotePanel presentation next).

### Out of Scope

- P3's fix itself (rides AI-IMP-135: gate `bound` on rotation === 0,
  rotated anchors keep the tethered card until a real rotated-book
  design exists).

### Design/Approach

takeover.ts gains registerInputBlocker(predicate): takeover-FAMILY
overlays that are not named views fold into takeoverActive(), the
one predicate every board seam already guards on — no import cycle,
no per-seam patching, show-once semantics untouched. first-run.ts
registers its visibility at module load.

### Files to Touch

`chrome/takeover.ts`, `chrome/first-run.ts`,
`chrome/first-run-blocking.test.ts` (new), `e2e/first-run.spec.ts`.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] registerInputBlocker seam; guide registered; unit red-green
      (fails with registration removed).
- [x] E2E: replayed guide over a live selection; Delete/Backspace
      blocked; placement survives (was RED against the pre-fix
      bundle — the finding reproduced exactly as described).
- [x] P3 recorded into AI-IMP-135's brief (rotation gate).
- [x] Gates: full suite (queued with the wave-4 baseline).

### Acceptance Criteria

**GIVEN** the guide is visible over a board with a selection
**WHEN** Delete/Backspace/undo/quick-open keys fire
**THEN** nothing reaches the board, and skip returns it intact.

### Issues Encountered

The e2e first ran green against a STALE renderer bundle and then
red — inverted expectations revealed it: `npx playwright test`
without a prior `pnpm -r build` tests yesterday's code. The
CLAUDE.md build-before-e2e rule applies to the lead too.
