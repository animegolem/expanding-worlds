---
node_id: AI-IMP-243
tags:
  - IMP-LIST
  - Implementation
  - v2
  - analysis
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.7
date_created: 2026-07-09
---


# AI-IMP-243-rust-persistence-seam-analysis

## Summary of Issue #1

The V2 sketch's stated bet is that the Electron main/node:sqlite
half is "cleanly seamed behind packages/protocol, so a Rust
persistence port is a fenced job." Nobody has verified the bet.
Done means a REPORT (no code): the complete inventory of the
utility's protocol surface (every message type, payload shape,
and semantic contract the renderer depends on), every place
node:sqlite/node-specific behavior leaks through that seam
(SQLite pragmas, WAL/checkpoint rituals, fs layout assumptions,
the lock protocol, snapshot git invocations), what a Rust
equivalent needs (rusqlite mapping, migration strategy, the
recovery pass), and a fenced-job verdict: is the port a bounded
project or does something structural leak? Suited to a long-run
grinder (Terra/Sol) — dense citations, well-defined endpoint.

### Out of Scope

- Any code, any Tauri work (240 owns the shell).
- Sync semantics (git-as-sync is its own design conversation).

### Design/Approach

Delegate to Codex (long-run analysis profile) or run as a lead
side-track: read packages/protocol end to end; trace every
utility message handler to its persistence calls; grep the
renderer for direct assumptions about utility behavior beyond
the protocol types; catalog node-isms in packages/persistence
(node:sqlite API surface used, fs patterns, child_process git).
Report → RAG/spike-reports/rust-persistence-seams.md with the
inventory tables + verdict + a port-order recommendation.

### Files to Touch

`RAG/spike-reports/rust-persistence-seams.md`, this ticket.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Protocol surface inventory (every message, cited).
- [ ] Node-ism catalog in persistence (cited).
- [ ] Fenced-job verdict + port-order recommendation.
- [ ] Lead verifies citations before accepting (the Terra/Sol
      triage rule).

### Acceptance Criteria

**GIVEN** the report
**THEN** the V2 decision can weigh the Rust port as a scoped
project with named risks — or knows exactly why it is not one.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
