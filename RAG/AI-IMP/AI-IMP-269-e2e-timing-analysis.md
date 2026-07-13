---
node_id: AI-IMP-269
tags:
  - IMP-LIST
  - Implementation
  - ci
  - testing
  - analysis
kanban_status: planned
depends_on: [AI-IMP-268]
parent_epic:
confidence_score: 0.7
date_created: 2026-07-10
date_completed:
---


# AI-IMP-269-e2e-timing-analysis

## Summary of Issue #1

The desktop e2e suite has accrued ticket-by-ticket for months
(60+ spec files) with no holistic pass over runtime cost or
coverage overlap. AI-IMP-268 fixes the delivery mechanics
(sharding, doc-skip, cancellation); this ticket is the
MEASUREMENT-FIRST analysis the owner asked for (2026-07-10):
rank where the minutes actually go, identify duplicate coverage,
and propose targeted consolidations — a REPORT with proposals for
owner sign-off, NOT preemptive test deletion. Done means: a
ranked per-spec/per-test timing table from real CI runs, an
overlap analysis of the top offenders, and consolidation
proposals each carrying the regression-pin transfer argument
(which surviving test covers the removed scenario, cited).

### Out of Scope

- Deleting or merging any test in THIS ticket (each accepted
  proposal becomes its own small ticket).
- Perf suite (local hardware gate, not CI).
- Unit suites (sub-minute; not worth the risk).

### Design/Approach

Gather: Playwright's JSON reporter (or the CI log durations) from
3-5 recent full runs; aggregate per spec file and per test; count
app launches per spec (launchApp calls — each costs seconds on
CI). Rank by total time. For the top ~10 files: map what each
test proves (the ticket/conviction it pins, from comments and git
blame) and where arcs overlap (e.g., multiple specs each walking
seed→open-note→edit before their distinct assertion). Proposal
shapes to consider: shared-launch consolidation within a spec
(serial tests reusing one app instance where isolation is not the
point), seed helpers replacing UI-walked setup, merging specs
that pin the same conviction from different tickets. Each
proposal names its risk and its pin-transfer. CRITICAL RULE:
tests are regression pins tied to convictions — a "duplicate" is
only removable when the surviving pin provably covers the same
failure mode.

## Summary of Issue #2 — the source-panel flake, ROOT-CAUSED (lead, 2026-07-12)

The standing flake (`source-panel.spec.ts:68`, fails ~1-in-3 wave
gates cold, always passes on retry) is a DATA-ARMING RACE, not
timing noise, and no poll timeout will ever fix it:

- The spec waits for `[data-testid="source-cell"]` to exist, then
  dispatches a synthetic dragstart→drop (spec ~:102-119).
- But cells render from the INDEX only; each cell's `contentHash`
  arrives later via IntersectionObserver-batched item fetches
  (`SourcePanel.svelte:146-199`).
- `beginCellDrag` (`SourcePanel.svelte:229-238`) refuses to arm
  when `items[nodeId]?.contentHash` is missing: `preventDefault()`,
  NO payload set. The drop then carries an empty DataTransfer, the
  board ingests nothing, and the poll at :131 times out — observed
  failing identically at BOTH 5s and 15s budgets (nothing retries
  the drag, so the wait can never succeed). Cold first attempt
  6.6s-fail / warm retry 1.9s-pass matches exactly.

Fix shape (small, cuttable with or before this analysis): the cell
should expose its armed state (e.g., `data-armed` when contentHash
is present — or the drag affordance renders only when armed, which
also closes the PRODUCT gap below), and the spec waits for armed,
not for present. PRODUCT NOTE for the kit/GR-3 ledger: a real user
dragging a just-revealed cell in the pre-arm window gets a
silently dead drag (preventDefault, no ghost, no voice) — a named-
silence violation in miniature; visible-affordance-when-armed
retires it.

### Files to Touch

- New `RAG/spike-reports/` or ticket-appended report (analysis
  artifact; no product code).
- Follow-up tickets cut per accepted proposal.
- (Issue #2) `apps/desktop/e2e/source-panel.spec.ts` +
  `SourcePanel.svelte` armed-state exposure.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Per-spec + per-test timing table from ≥3 real CI runs,
      ranked, with launch counts per spec.
- [ ] Overlap analysis of the top ~10 files: what each pins,
      where arcs duplicate.
- [ ] Consolidation proposals with pin-transfer citations and
      estimated savings; owner sign-off requested.
- [ ] Accepted proposals cut as tickets; nothing deleted here.

### Acceptance Criteria

**GIVEN** the last several full e2e CI runs
**WHEN** the analysis lands
**THEN** the owner can see where every CI minute goes, ranked
**AND** every consolidation proposal names the test it would
remove, the pin that survives, and the minutes it saves
**AND** no test changes ship without a per-proposal sign-off.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

## Summary of Issue #3 — CI input dispatch costs ~1s per mouse step (lead, 2026-07-13)

Trace-measured on the dock-wave oracle reruns (runs 29216938460 /
29218326828 / 29219899725, all deterministic): on the ubuntu runner
under xvfb, EVERY multi-step `mouse.move` costs ~1.02s per step —
eleven `steps: 4` drags at exactly 4.1s each in one test — while the
same suite runs the same drags in milliseconds locally.
`backgroundThrottling: false` is already set for hidden test windows
(main/index.ts:819), so this is not the renderer timer clamp;
suspects are GPU-less compositing frame cadence under xvfb (input
dispatch awaiting frames) or Linux occlusion handling for
never-shown windows. This is the substrate of the whole suite's CI
cost (19-minute shards ≈ 16s/test average vs ~1.4s locally) — fixing
it would roughly halve CI wall time and retire a class of
budget-edge timeouts. Immediate mitigation shipped with the dock
wave close: decorations.spec's budget raised 120s→240s, sized to the
measured runner. The analysis here should measure per-step cost
directly (a probe spec), then trial: xvfb frame rate flags, Electron
`show:true` under xvfb (windows are "visible" to X but unseen),
offscreen rendering mode, and Playwright input dispatch options.
