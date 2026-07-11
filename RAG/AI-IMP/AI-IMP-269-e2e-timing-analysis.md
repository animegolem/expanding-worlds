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

### Files to Touch

- New `RAG/spike-reports/` or ticket-appended report (analysis
  artifact; no product code).
- Follow-up tickets cut per accepted proposal.

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
