---
node_id: AI-IMP-173
tags:
  - IMP-LIST
  - Implementation
  - audit
  - process
kanban_status: in-progress
depends_on: []
parent_epic:
confidence_score: 0.75
date_created: 2026-07-07
---


# AI-IMP-173-swarm-stability-audit

## Summary of Issue #1

Phase 1 shipped (HEAD 50ed3ebe, PHASE-1-SIGNOFF.md); the week ahead
is owner + friend testing. Before that testing leans on the build,
we want systematic confidence that what shipped is stable — the
Codex review of this head found four real control-flow defects
(navigation early-return, Escape propagation leak, rotation-blind
geometry, async menu race), and that defect class lives at seams
BETWEEN modules, invisible to file-by-file review and to the suite.
This ticket runs a one-wave parallel review swarm: ~10 Sonnet
agents, each assigned a non-overlapping CONTROL-FLOW domain (not a
file list), tracing every entry point in their domain to its
terminal effect, hunting the five defect classes that have actually
bitten this codebase, writing findings + an anchor-coverage table to
per-agent shard files. An Opus aggregator dedups and ranks the
shards (Codex's four findings seeded in) into one master list; the
lead verifies every P1/P2 against the code before it becomes a
ticket. Done means the owner holds one cohesive severity-ranked
issue list covering the app's control-flow surface, with verified
findings ticketed.

### Out of Scope

- Fixing anything found (each confirmed finding becomes its own
  ticket or joins a testing-week batch).
- The Redis broker / warm-pool load-balancer design (drawer item;
  one wave with pre-partitioned domains needs no claim arbitration).
- Running builds or tests (static adversarial review only; agents
  are read-only on the repo).

### Design/Approach

Lead partitions the app into ~10 control-flow domains (keyboard,
pointer/gestures, navigation/history, menus/popovers, undo,
IPC-cast seams, domain handlers vs §5, scene sync, notes/panels/
search, persistence lifecycle). Each Sonnet brief is self-contained:
domain + starting anchors, the five bitten defect classes with the
real examples, the RFC as correctness oracle, a strict finding
format (severity/file:line/flow/scenario/confidence/how-to-verify),
a mandatory ANCHORS coverage table, read-only + no-git + no-build
fences, and the escalation line. Shards land in the session
scratchpad. Aggregation is one Opus agent; verification is the lead.

### Files to Touch

None in-repo besides this ticket + INDEX (audit outputs live in the
scratchpad until findings become tickets).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Domain partition + self-contained briefs; Codex seed shard
      written.
- [ ] Wave spawned; all shards collected with ANCHORS coverage
      tables.
- [ ] Opus aggregation → master P-ranked list.
- [ ] Lead verification of every P1/P2 (reproduce the flow in the
      code before believing).
- [ ] Ranked list delivered to the owner; confirmed findings cut as
      tickets.

### Acceptance Criteria

**GIVEN** the shipped Phase 1 head
**WHEN** the swarm wave, aggregation, and lead verification complete
**THEN** the owner holds one severity-ranked issue list whose P1/P2
entries are lead-verified against the code, with per-domain anchor
coverage stated, and every confirmed finding tracked as a ticket.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
