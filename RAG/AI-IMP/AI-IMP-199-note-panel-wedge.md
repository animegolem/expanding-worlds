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

- [x] Wedge reproduced and root cause documented.
- [x] No open/close sequence leaves a note unopenable (spam e2e);
      stuck states get safety timeouts.
- [x] Coordinated verdict with 193 (same cause or not — stated).
- [x] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
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

**Root-cause verdict (and the 193 coupling).** The owner-reported
"opens immediately and closes, then can't open anymore for that node"
is TWO braided defects, neither of which is a store-level open/close
wedge:

1. *"Opens immediately and closes"* = the AI-IMP-193 spawn flash. The
   tethered panel mounts at the placeholder `pos {0,0}` and only earns
   a real position on the next rAF `layout()` — for that gap it painted
   in the window's upper-left. Read as a panel that "appeared and
   vanished." Fixed in 193 (hold `visibility:hidden` + inert until the
   first `layout()` places it; mount schedules that layout immediately).

2. *"Can't open anymore"* = the AI-IMP-116 world-scale FADE-at-floor —
   the SAME root cause as AI-IMP-200. At the zoom levels boards live at
   (≈0.2–0.4) a tethered panel scaled to a stamp and, below the 0.4
   floor, faded to `opacity:0` with `pointer-events:none`. The note WAS
   open (record present) but invisible and un-clickable; the one-tethered
   rule then swapped every re-open onto that same invisible slot, so it
   read as permanently unopenable. Reproduced by an e2e opening a note at
   board zoom 0.3 → pane opacity 0.5 and dropping toward 0. CURED by
   200's hold-at-floor (the panel now holds at a legible, interactable
   screen size at board zoom; it fades only in deep overview).

So: 199 and **193 are NOT the same cause** (correcting the ticket's
suspicion — 193 is the unpositioned first paint); 199's "unopenable"
half **shares its cause with 200** (the world-scale fade). Honest close:
199 is resolved by the 193 gate + the 200 hold-at-floor, plus the
defensive hardening below.

**Audit of every boolean/token for a no-reset-path (the ticket's ask).**
The store's open/close is already race-hardened (AI-IMP-171 ghost-eats-
reopen, AI-IMP-184/185 generation tokens); spam e2e (open+instant-close
×10, event-interleaved open-while-closing ×14) always ends openable both
before and after this change — there is no store wedge. The ONE terminal
state with no reset path was the big-editor takeover-family input
blocker: `attachPanels`' detach teardown nulled `bigEditorKey` but never
RELEASED `bigEditorBlocker`, so its predicate closure stayed registered
past a canvas swap (a latent `takeoverActive()` leak). Fixed: teardown
now releases and nulls it, mirroring `closeBigEditor`. The big-editor
tuck in `NotePanels` already carries the PathBar safety-timeout idiom
(`tuckTimer` force-clears `bigTucking`/`bigEditorKey` if the beat is
missed) — verified self-healing under the tuck-race repro, left as is.

**Adjacent finding (reported, not the wedge).** Reopening a DIFFERENT
note that reuses the tethered slot while a torn big editor is mid-tuck
briefly reparents the new buffer into the tucking host (~200ms) before
recovering — a transient glitch, not a permanent wedge; the tuck-race
e2e confirms final recovery. Left for a follow-up.

**Also fixed here (surfaced by the 200 undock work):** `pinHere()` did
not `schedule()` a relayout (unlike `tearOut()`), so pinning at board
zoom left the sticky at the held tethered scale until the next pan.
Added the schedule — see AI-IMP-200 notes.
