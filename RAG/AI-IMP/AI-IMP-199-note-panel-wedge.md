---
node_id: AI-IMP-199
tags:
  - IMP-LIST
  - Implementation
  - notes
  - panels
  - bug
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.65
date_created: 2026-07-08
---


# AI-IMP-199-note-panel-wedge

## Summary of Issue #1

Owner review FAIL (2026-07-08, hit while testing AI-IMP-086):
clicking a node's note "opens immediately and closes, and now I
can't open the notes anymore for that node" — a WEDGED state:
after one open-then-instant-close, that node's panel never opens
again for the session. Severity-wise this is the worst finding of
the pass (a core surface dying permanently). Likely family: the
open/close race machinery — an open guard (generation token,
one-panel rule, or the AI-IMP-183 input-blocker/panel-retire
interplay) left holding a "panel open" or "closing" flag that
never clears, so subsequent opens no-op or instant-close. The
instant open-close itself is the same signature as the 193 spawn
flash (unpositioned/unguarded first paint) — suspect shared cause.
Done means the wedge is reproduced (unit or e2e), root-caused, and
fixed so note opens are idempotent and recoverable: no click
sequence can leave a node's note permanently unopenable.

### Out of Scope

- Spawn position/flash polish (AI-IMP-193 — coordinate; if one
  root cause fixes both, close both honestly).
- Panel presentation (194).

### Design/Approach

Hunt the repro first: rapid open/close clicks, open-while-closing
(the 171 lesson: closing ghosts eat re-opens), open during the
engagement fade, panel open + immediate click-away. Audit every
boolean/token in panels.ts / NotePanel open-close lifecycle for
states with no reset path (the audit's "stuck states" class —
window blur mid-open, animationend missed). The fix must include a
self-healing property: any terminal state must be re-enterable
(match the PathBar phase machine's safety-timeout idiom from
AI-IMP-166). E2e: the click sequence that wedged + spam-clicking
a note charm 10× fast always ends openable.

### Files to Touch

`note/panels.ts`, `NotePanel.svelte`/`NotePanels.svelte` lifecycle,
e2e in the note/panels spec.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Wedge reproduced and root cause documented.
- [ ] No open/close sequence leaves a note unopenable (spam e2e);
      stuck states get safety timeouts.
- [ ] Coordinated verdict with 193 (same cause or not — stated).
- [ ] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
      e2e.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** any sequence of note-open and note-close clicks, however
fast
**THEN** the panel always ends in a recoverable state and the next
open works.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
