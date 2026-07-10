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

- [x] Protocol surface inventory (every message, cited).
- [x] Node-ism catalog in persistence (cited).
- [x] Fenced-job verdict + port-order recommendation.
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

Read-only analysis; no code touched, no validation suite run (per the
ticket's design — the report IS the deliverable). Report delivered:
`RAG/spike-reports/rust-persistence-seams.md` (SPIKE-REPORT-005).

Findings that revised the ticket's framing (documented candidly because
they feed a V2 decision):

- **The bet is TRUE but its phrasing is incomplete.** "Seamed behind
  packages/protocol" is true for the *process* boundary (21 request
  types + 4 push kinds, all in one 518-LOC types file). But the
  renderer-facing *type* contract is larger: the renderer imports
  `@ew/commands` directly (by design, `envelope.ts:4`), so the
  CommandResult/revision/64-command/38-query vocabulary is a second
  seam the protocol package does not cover.

- **Scope leak the ticket's "persistence" framing hides:** the git
  snapshot engine (`apps/desktop/src/main/snapshot.ts`, 775 LOC of
  node:fs + child_process git) lives in MAIN, not
  `packages/persistence`. It is cleanly separable (delegates every DB
  touch back over the protocol) but is part of the port scope.

- **Biggest architectural leak (L1 in the report):** asset bytes NEVER
  cross the utility seam. Main reads the content-addressed store
  directly, importing `blobRelativePath`/`thumbnailRelativePath` from
  `@ew/persistence` (`main/index.ts:6,366`). The on-disk layout
  `assets/<h[0:2]>/<hash>` is a cross-process contract as load-bearing
  as the message types — a Rust port must keep it byte-identical.

- Verdict: bounded/fenced YES. rusqlite (not SQLx) is the fit — the
  whole SQLite surface is vanilla + FTS5 + json1 + STRICT + VACUUM
  INTO, all in the `bundled` feature; no custom functions/ATTACH/exotic
  pragmas. Port difficulty concentrates in the lock protocol (`lock.ts`,
  the CA-001 split-brain risk) and the layout contract, NOT the SQL.
  Full port-order (6 steps) and top-5 risks in the report §5.

No blockers. The one open checklist item is the lead's citation
verification (the Terra/Sol triage gate), which cannot be self-checked.
