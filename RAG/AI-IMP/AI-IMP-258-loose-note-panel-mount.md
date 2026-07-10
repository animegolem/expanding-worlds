---
node_id: AI-IMP-258
tags:
  - IMP-LIST
  - Implementation
  - renderer
  - notes
  - field-report
kanban_status: completed
depends_on: []
parent_epic:
confidence_score: 0.55
date_created: 2026-07-10
date_completed: 2026-07-10
---


# AI-IMP-258-loose-note-panel-mount

## Summary of Issue #1

alph, v0.20.0, 2026-07-10, two symptoms on the note editor panel:
(1) "eternally tethered to upper right corner, can never drag it
around" — and drag WORKED in his first build (~v0.16), so this is
a REGRESSION with a bisect owed; (2) on a LOOSE note (no placement
— e.g. opened from gallery/outline), "the pin/expand/close buttons
don't work at all." LEAD HYPOTHESIS (unverified): the unplaced-note
panel mount takes a different path from the placed-note panel and
wires neither the drag grip nor the control charms; the tether may
be the §8.8 anchored default with no drag handler attached. The
pre-implementation review must (a) reproduce both on a packaged
build, (b) bisect the drag regression (suspects: the panel-identity
work in EPIC-023, wave 4/5 refactors, or AI-IMP-250's migration —
NotePanel was an explicit 250 guard EXEMPTION, so verify it wasn't
half-migrated), (c) supersede this hypothesis with cited causes
BEFORE repair. Done means: a loose note's panel drags like a
placed note's and its pin/expand/close all function.

### Out of Scope

- Delete-loose-notes (AI-IMP-260).
- Reading-as-camera-verb / note lifecycle design (DESIGN-QUEUE).
- Panel spawn POSITION policy (only drag-after-spawn + controls).

### Design/Approach

Review first (above). Likely shape: one panel mount path for
placed and loose notes, differing only in anchor source — the
loose path reuses the placed path's grip and charm wiring rather
than a parallel mount. Regression tests at the component level for
both mounts (grip present, charms dispatch); e2e covers the placed
path already — add a loose-note open+drag+close spec if the
harness supports it (no OS layer involved here, so e2e CAN prove
this one).

### Files to Touch

(Census in review; expected:)
- `apps/desktop/src/renderer/note/panels.ts` / panel mount
  components — the loose-note path.
- Note panel drag/grip wiring.
- e2e: a loose-note panel spec.
- `RAG/HUMAN-TESTING.md`: alph re-check entry.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Pre-implementation review: both symptoms reproduced; drag
      regression bisected to a commit; causes cited here.
      REVIEW VERDICT (2026-07-10, live e2e repro + hit-testing;
      scratch specs imp258-repro*.spec.ts, folded into the final
      regression spec): the lead hypothesis is SUPERSEDED — there
      is NO parallel mount path and NO regression. One mount path
      serves placed and loose notes already; every finding below
      reproduces IDENTICALLY on v0.16.0 (NotePanel.svelte and
      CharmRail.svelte are byte-equivalent in every load-bearing
      line — anchorless default, pinned-only drag gate since
      AI-IMP-064, header markup, rail geometry, 7 charms). alph's
      "drag worked in my first build" was the PLACED-note path
      (tether → pin → drag); loose notes are a new usage path for
      him. Convicted causes, from a real instance at 1280×800:
      (1) CLOSE IS DEAD, deterministically: the anchorless
      default (NotePanel.svelte layout(), `pos = {x: view.width -
      width - 16, y: 56}`) parks the panel's right edge under the
      CharmRail column (right: 0.6rem, top: 2.4rem, 32×220px,
      chrome-above-panels per the §8.8 ladder) —
      elementFromPoint at panel-close's center returns
      charm-search, so "close" OPENS THE SEARCH TAKEOVER. Both
      elements anchor right, so the collision holds at every
      window size. (2) PIN WORKS but is invisible: pinPanel keeps
      pos for an anchorless panel — zero feedback, reads as dead.
      (3) EXPAND WORKS (click opened the big editor); "expand
      dead" in the field report is collateral of (1)/(2) chaos —
      no defect found. (4) DRAG: onHeaderPointerDown refuses
      unpinned panels (by §8.5 design, unchanged since 064) and
      the header is almost entirely title-input + buttons, both
      excluded as drag starts — a pinned drag from the ~3px free
      sliver DID move the panel (−200,+150), so the machinery is
      intact and the grab AREA is the defect. Note: the store's
      own contract anticipated the fix — PanelRecord.screen is
      documented "Screen-fixed position once pinned (or for
      anchorless panels)" but layout() never honors screen for
      unpinned anchorless records.
- [x] One mount path: loose-note panel gets grip + working
      pin/expand/close.
      SUPERSEDED-AND-SATISFIED: there was already exactly one
      mount path (review above). The actual repairs, all in
      NotePanel.svelte: (1) the anchorless spawn default moves
      to `view.width - width - 56`, clear of the charm rail's
      column, so pin/expand/close all hit-test to themselves —
      close now closes instead of opening search; (2) a `grip`
      drag handle (⠿, panel-grip) renders at the header's left
      exactly when dragging is honored (pinned or free-floating).
- [x] Drag regression fixed at cause (not re-implemented around).
      NO REGRESSION EXISTED (review above) — the cause was a
      latent day-one gap, fixed at cause: the anchorless fallback
      is now FREE-FLOATING — it honors the store's documented
      `record.screen` contract (`pos = record.screen ?? default`)
      and onHeaderPointerDown accepts unpinned free-floating
      panels. Tethered panels still refuse drags (layout owns
      them); corner/point/bound behavior untouched. A dragged
      position survives camera relayouts and carries into a
      later pin.
- [x] Component tests for both mounts; loose-note e2e spec green.
      Adjusted to the repo's actual idiom (store-level vitest, no
      Svelte component mounting exists in this codebase):
      panels-free-floating.test.ts pins the store half (movePanel
      persists screen on an unpinned record; pin keeps it); the
      DOM half is e2e/loose-note-panel.spec.ts (3 tests): every
      control hit-tests to ITSELF via elementFromPoint + close
      closes with no collateral takeover; grip-drag without
      pinning + position holds across a camera relayout + pin
      keeps the spot; placed-note tether unchanged (no grip,
      drag refused). Gate: desktop vitest 406 passed/1 skipped
      (49 files); e2e panels/notes/note-lifecycle/panel-flyto/
      note-metadata/loose-note-panel 46/46, pipefail on.
- [x] HUMAN-TESTING entry for alph.

### Acceptance Criteria

**GIVEN** a note with no placement opened from the gallery
**WHEN** its panel spawns
**THEN** the panel can be dragged anywhere in the window
**AND** pin, expand, and close each perform their verb
**AND** a placed note's panel behaves identically.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- The ticket's two premises both fell in review: there is no
  parallel mount path, and nothing regressed — v0.16.0's
  NotePanel and CharmRail are equivalent in every load-bearing
  line, so alph's "drag worked in my first build" was the
  placed-note path. The bisect item is satisfied by that negative
  result with citations, not a commit.
- "Expand dead" reproduced as WORKING; recorded as collateral of
  the close-opens-search chaos. If alph still sees a dead expand
  on Windows after this build, it is a NEW report.
- Deliberate scope choice: the tethered slot's `screen` persists
  across content swaps (drag a loose note's panel, open another
  loose note — the panel stays where you put it). Window-like and
  §8.5-consistent; flagged here in case the feel pass disagrees.
- Component-mount tests don't exist as an idiom in this repo;
  the checklist's "component tests" landed as store-contract
  vitest + the e2e spec (details on the item).
