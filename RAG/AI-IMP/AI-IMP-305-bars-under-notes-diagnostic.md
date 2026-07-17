---
node_id: AI-IMP-305
tags:
  - IMP-LIST
  - Implementation
  - chrome
  - z-ladder
  - feel-pass
kanban_status: completed
depends_on:
parent_epic: [[AI-EPIC-030-the-ratified-law-wave]]
confidence_score: 0.6
date_created: 2026-07-16
date_completed: 2026-07-17
---

# AI-IMP-305-bars-under-notes-diagnostic

## Summary of Issue #1

Feel-pass finding, still UNDIAGNOSED (deliberately carried without
a hypothesis since 2026-07-13): "the new bars are displaying
incorrectly underneath it [notes] and moving the dock." Two
distinct symptoms: chrome bars rendering BENEATH note panels
(violates the z-ladder — chrome rung 400 over panel rung 200,
`ChromeLayer.svelte:104–115` / `z.ts:15–24`; ledger DOCK-LAYER-01),
and something DISPLACING the dock (violates DOCK-GEO-03: the
defaults row must grow upward and take no space from the dock —
`Dock.svelte:237–248,339–345` translate only the defaults row, so
the displacement source is unknown). This ticket is
DIAGNOSIS-FIRST: reproduce both symptoms, convict the mechanism
with evidence (rects, `elementsFromPoint`, screenshots), record
the conviction in this ticket, THEN fix. Done means: both
symptoms reproduced → convicted → fixed → regression-pinned.

### Out of Scope

Any speculative refactor of the z-ladder; note posture work (the
notes epic); fixing symptoms whose mechanism is not yet convicted
— a fix without a recorded conviction is a violation of this
ticket, not a completion of it.

### Design/Approach

Evidence before hypothesis (the dock-wave lesson: the lead burned
a round guessing; the trace convicted). Reproduce on a board with
pinned + free note panels overlapping the dock footprint at both
densities, defaults row toggling, and a takeover cycle (AI-IMP-302
interaction). Capture per-symptom: full rect inventory
(dock stack, defaults row, note panels), `elementsFromPoint`
samples at dock control centers (LAYER-01 recipe), and DOM
stacking-context census (who created a context between rungs).
Candidate mechanism space to CHECK, not assume: a note panel
mounting inside a stacking context above chrome's; a transform on
an ancestor creating an accidental context; the defaults-row
translate leaking to the main row under a specific toggle order;
reservation double-application shifting the dock. Fix at the
convicted seam only, with the smallest change that restores the
ladder/geometry; pin with unit + e2e.

### Files to Touch

Unknown until conviction — expected neighborhood:
`apps/desktop/src/renderer/chrome/z.ts`,
`apps/desktop/src/renderer/chrome/ChromeLayer.svelte`,
`apps/desktop/src/renderer/chrome/Dock.svelte`,
`apps/desktop/src/renderer/note/NotePanel.svelte`.
`apps/desktop/test/e2e/*`: LAYER-01 + GEO-03 regression pins.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] Attempt to reproduce symptom A (bars under notes): exact
      recipe recorded with screenshot + rect/hit evidence; record
      an evidence-backed exoneration if the overlap remains lawful.
- [x] Reproduce symptom B (dock displacement): exact recipe +
      before/after main-row rects.
- [x] Classify mechanism A with cited code (stacking context /
      mount point / rung constant); no production fix without a
      convicted defect.
- [x] Convict mechanism B likewise.
- [x] DOCK-LAYER-01 e2e pin: every enabled main-row control first
      hit-test owner at center under an overlapping pinned AND free
      note; no A fix because the ruled overlap was exonerated.
- [x] Fix B; DOCK-GEO-03 e2e pin: main-row rect identical
      before/during/after each defaults row at both densities.
- [x] Evidence bundle: before/after captures keyed to
      DOCK-LAYER-01 + DOCK-GEO-03.

### Acceptance Criteria

**Scenario:** A pinned note overlaps the dock.
**GIVEN** a pinned note panel intersecting the dock footprint.
**WHEN** the board renders and the pointer samples each enabled
main-row control's center.
**THEN** every sample returns the dock control as first hit-test
owner, and the dock draws over the panel.

**Scenario:** Toggling defaults rows.
**WHEN** text, shape, and line defaults open and close repeatedly
at both densities.
**THEN** the main row's rect is identical before, during, and
after every toggle.

### Issues Encountered

<!--
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

#### Round-1 source verification (2026-07-16)

- Static source currently EXONERATES an ordinary pinned/free note-panel
  z-order defect. `ChromeLayer` is the sibling at z 400
  (`renderer/chrome/ChromeLayer.svelte:104-115`), while all ordinary panels
  are trapped in `panels-layer` at z 200
  (`renderer/note/NotePanels.svelte:388-405`), matching the named ladder
  (`renderer/z.ts:15-24`). A child z-index inside a panel cannot escape that
  parent stacking context. The root overlay host at z 600 is reserved for
  modal-family surfaces such as the big editor
  (`renderer/CanvasHost.svelte:187-198,222-230`), which are intentionally
  above chrome and excluded by DOCK-LAYER-01.
- Static source also does not convict defaults-row displacement. Only the
  defaults row receives the calculated horizontal transform
  (`renderer/chrome/Dock.svelte:237-248,339-345`); the stack is bottom-anchored
  with `column-reverse` (`renderer/chrome/Dock.svelte:577-604`), so opening a
  row should grow upward without moving the main row. A separate optical-
  center complaint remains possible because the dock uses raw viewport
  `left:50%` (`Dock.svelte:580-582`), but that is DOCK-GEO-02, not evidence of
  the reported vertical displacement.
- No exact reproduction posture, toggle order, viewport, screenshot, or DOM
  evidence accompanies the field report. “Notes” may mean an ordinary
  pinned/free panel or the modal big editor, and “moving” may mean vertical
  displacement or optical horizontal centering; those distinctions change
  whether there is a defect at all. The ticket therefore remains
  diagnosis-only after round 1 and no production seam is authorized yet.
- Focused diagnostic scope after verdict: reproduce four explicit cells
  (pinned, free, big editor, takeover cycle) at Compact and Comfortable;
  record dock/main/default/panel rects and center-point hit stacks before,
  during, and after each defaults toggle. A modal-first hit is an expected
  classification, an ordinary-panel-first hit convicts stacking, unchanged
  main-row rects exonerate GEO-03, and changed rects identify the exact
  ancestor/transform before any fix. The ticket's candidate mechanisms remain
  hypotheses until that bundle exists.

#### Diagnostic conviction recorded before implementation (2026-07-16)

The diagnosis-only Playwright probe ran the four ruled postures at 1280×800
in both shipped densities. It deliberately moved the free panel, then the
pinned panel, so each intersected the real main-row rect; it sampled every
enabled control with `elementsFromPoint`, toggled text/shape/line defaults,
opened the big editor, and cycled the outline takeover. Raw JSON is preserved
at `/private/tmp/law-wave-305-diagnostic.log`; screenshots are
`/private/tmp/law-wave-305-{compact,comfortable}-{free,pinned,big-editor,takeover,after-cycle}.png`.

**Symptom A — exonerated, not reproduced.** In both densities, the free and
pinned 320×300 panel rect `(480, 471.20)` genuinely intersected the main-row
rect `(373.93, 746.01, 532.14, 41.99)`. Every enabled control remained the
first hit owner at its center; overlapping samples then listed `dock` before
the free `note-pane` or pinned `note-panel-pinned-1`. That matches the actual
stacking contexts: ordinary panels are trapped at z 200
(`renderer/note/NotePanels.svelte:388-405`) and chrome is the sibling at z 400
(`renderer/chrome/ChromeLayer.svelte:112-123`). The big editor correctly
returned `big-editor-backdrop` first for every dock center because it portals
to the z-600 modal host (`renderer/CanvasHost.svelte:222-230`); that posture is
the documented modal exclusion, not bars incorrectly under a note. The open
outline takeover likewise left its z-400 band as the first hit owner over the
z-300 view. There is no convicted A seam and therefore no speculative A fix.

**Symptom B — reproduced and convicted.** Text, shape, and line produced the
same movement at both densities. Compact main-row `y` changed
`746.01 → 699.62 → 746.01`; Comfortable changed
`746.01 → 683.62 → 746.01`, while width/height stayed `532.14×41.99`.
The mechanism is the inverse-row interaction missed in round 1: defaults is
the first DOM child (`renderer/chrome/Dock.svelte:403-463`), main is second
(`:501-609`), and `flex-direction: column-reverse` (`:653-663`) therefore
seats defaults at the anchored bottom and pushes main upward. The defaults
row's own `translateX` is innocent. The smallest in-fence repair is to restore
ordinary column order so the first child grows above the main row while the
main row remains the bottom anchor; permanent geometry pins must assert all
three rows at both densities. This conviction was recorded before that CSS
seam was changed.

Two probe-fixture failures preceded the complete pass: pinning changes the
panel's test id and relayouts its posture, so the probe had to re-seat it using
the stable `.note-panel` class. Neither failure touched production code or
altered the conviction.

#### Repair and validation (2026-07-16)

- The convicted B seam changed only `Dock.svelte`'s stack direction from
  inverse to ordinary column order. Defaults remains the first child and now
  grows above the second-child main row; no transform, reservation, z-rung, or
  note posture code changed.
- `dock-note-law.spec.ts` permanently pins both evidence-backed outcomes. It
  seats free and pinned notes across the real main row and proves every enabled
  control owns its center; separately it asserts component-wise stationary
  main-row rects before/during/after text, shape, and line defaults in Compact
  and Comfortable, with each defaults rect above the main row.
- Before/after evidence pair:
  `/private/tmp/law-wave-305-{compact,comfortable}-before-defect.png` and
  `/private/tmp/law-wave-305-{compact,comfortable}-after.png`. The before pair
  was captured by locally recreating the convicted one-line inverse order after
  the conviction was recorded; the branch was then restored, rebuilt, and
  rerun. Raw pre-fix geometry and hit stacks remain in
  `/private/tmp/law-wave-305-diagnostic.log`.
- Validation: `pnpm -r build` green after final restoration; focused
  Playwright 10/10 across the new law pins, shell, and reservation-frame; final
  restored-fix law spec 2/2. The expected pre-existing Svelte warnings remain.
- The round-2 Linux oracle repeated a `0.0078125px` x-only difference across
  all three attempts; y, width, and height were identical. That is Chromium
  sub-pixel rounding rather than the convicted vertical displacement. The law
  test now accepts at most 1 CSS px per rect component while retaining the
  explicit above-main assertion; real row movement remains a loud failure.
