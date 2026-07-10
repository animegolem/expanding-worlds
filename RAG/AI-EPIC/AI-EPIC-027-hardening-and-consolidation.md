# AI-EPIC
---
node_id: AI-EPIC-027
tags:
  - EPIC
  - AI
  - hardening
  - consolidation
  - pre-1.0
date_created: 2026-07-10
date_completed:
kanban_status: in-progress
AI_IMP_spawned:
  - AI-IMP-250
  - AI-IMP-251
  - AI-IMP-252
  - AI-IMP-253
  - AI-IMP-254
---

# AI-EPIC-027-hardening-and-consolidation

## Problem Statement/Feature Scope

Two 2026-07-10 audits, verified against source, define the pre-1.0
correctness-and-cohesion debt. The Codex control-flow audit
(RAG/CODE-AUDIT-2026-07-10-CODEX.md) found 14 defects — 5 P1 (note
loss on failed flush, a renderer-controlled arbitrary-directory
restore capability, symlink escape from the managed tree, an
incomplete SSRF address classifier, concurrent-import staging
collision), 7 P2, 2 P3. The helper-consistency audit
(RAG/CODE-AUDIT-2026-07-10-HELPER-CONSISTENCY.md) found 9 families
(4 P2, 5 P3) whose common disease is INCOMPLETE ADOPTION — a seam
is extracted for its own fence, sibling call sites keep local
copies that then diverge (the §8.8 clamp, node-appearance codec,
setting storage, the E2E launcher). Both are the predictable
residue of three days of fenced parallel development: agents
solved locally, and nobody consolidated across fences. This epic
is the consolidation-and-hardening pass that makes the surface
coherent and closes the trust-boundary holes before any 1.0.

## Proposed Solution(s)

Work the two audits as one epic, in the recommended severity
order. The correctness P1/P2s (Codex) lead; the helper
consolidations (both audits) follow and are ideal well-fenced
mechanical wave work. Each finding becomes one AI-IMP ticket cut
from its audit entry (evidence + repair scope already written);
this epic tracks the set. Cross-audit overlaps are merged: the
direct-command-envelope views, the checkRevision siblings, and the
persistence temp-cleanup helper appear in both records and get ONE
ticket each. The pre-implementation review process (2026-07-10)
applies to every ticket — the audit entry is the hypothesis, the
builder verifies before repairing.

## Path(s) Not Taken

- Cutting 25 loose IMP tickets now — the epic holds the scope; IMPs
  are cut per wave as slots open, numbers assigned then.
- Re-litigating accepted gaps: DNS rebinding (net-guard, 057/124),
  the undo group-identity fence (231), growing-domain validation as
  SQLite CHECK (stays in handlers).
- AI-IMP-249 Windows lock work (active, excluded by both audits).
- Design-lifecycle closure (the document-of-actions epic owns it) —
  this epic is correctness + code cohesion, not UX arcs.

## Success Metrics

- All 5 Codex P1s closed with regression tests before a 1.0 tag.
- Each consolidated helper family has ONE seam + a guard test/scan
  that fails when a new site hand-rolls the pattern (the drift
  can't silently return).
- No behavior regression: the full gate (units + 4-shard e2e +
  Windows leg) stays green across the wave.

## Requirements

### Functional Requirements — Codex control-flow (correctness)

- [ ] FR-1 (C10-001, P1): a failed note flush never loses the draft;
      destructive callers (switch/close/quit) retain the buffer on
      non-commit; main flush ack carries success.
- [ ] FR-2 (C10-002, P1): restore/open fuses selection+execution in
      main (or an opaque sender-bound capability); no raw renderer
      directory path reaches the privileged open — the 229 pattern
      applied to restore.
- [ ] FR-3 (C10-003, P1): managed roots/files reject symlinks;
      realpath containment before every read/write/protocol/delete.
- [ ] FR-4 (C10-004, P1): net-guard classifies literal AND resolved
      addresses against a complete special-purpose/global-reachable
      set (100.64.0.0/10 incl. 100.100.100.200); deny non-global.
- [ ] FR-5 (C10-005, P1): imports reserve the final destination
      atomically pre-await, use request-owned staging, promote
      exclusively; concurrent-import regression.
- [ ] FR-6 (C10-006, P2): flush acks are request-ID'd, sender-bound,
      success-carrying; per-renderer serialize/supersede.
- [ ] FR-7 (C10-007, P2): tx depth updates only after successful
      commit/release; outer-commit failure does plain ROLLBACK.
- [ ] FR-8 (C10-008, P2): runtime payload schemas at the command
      registry boundary; inverse handlers enforce the same domain
      invariants (finite geometry, frame membership) — or inverses
      become server-issued opaque capabilities.
- [ ] FR-9 (C10-009, P2): grouped undo executes atomically in the
      command service (or preserves an explicit repair state); no
      committed-prefix-then-fail.
- [ ] FR-10 (C10-010, P2): snapshot aborts/defers on a typed
      CHECKPOINT_FAILED instead of committing a stale db.
- [x] FR-11 (C10-011, P2): project-setting writes are result-aware;
      backup/remote UI never claims success on an unsaved draft
      (the 237 pattern extended to project settings).
- [ ] FR-12 (C10-012, P2): BackgroundSync owns and destroys its
      textures+sources (stale, replaced, teardown) under a budget.
- [ ] FR-13 (C10-013/014, P3): theme application and background
      re-apply are latest-wins (generation token).

### Functional Requirements — helper consolidation

- [ ] FR-14 (HC-001, P2): E2E launcher adoption — migrate the 12
      raw-launch specs to the isolated launcher; guard scan against
      new bare electron.launch.
- [x] FR-15 (HC-002, P2): the §8.8 ONE anchored-surface clamp helper
      (anchor, surface, free region/bands, side, gap); migrate all
      surfaces; undersized-host unit cases; guard scan.
- [x] FR-16 (HC-003, P2): project-setting codec — route storage
      through the safe helpers; key-specific decoder so invalid
      values fall back visibly (merge with FR-11).
- [x] FR-17 (HC-004, P2): node-appearance codec — one validate/encode/
      decode used by CreatePin, SetNodeAppearance, UnplaceCard.
- [ ] FR-18 (HC-005, P3): requireActive* record guards in one module.
- [ ] FR-19 (HC-006, P3): tag resolver/completion exported separately
      from single-node assign; Gallery keeps bulk accounting.
- [ ] FR-20 (HC-007, P3): renderer query-unwrap adapter + one
      commandFailureMessage formatter.
- [ ] FR-21 (HC-008, P3): canvas-engine math/rect primitives (NOT
      crop's NaN clamp).
- [ ] FR-22 (HC-009, P3): gallery row-plan single source for keyboard
      + virtualization.
- [ ] FR-23 (merged, both audits): the checkRevision siblings
      (board-tooling, charms-ui — 238's flagged leftovers) and the
      direct-command-envelope views (Trash/Settings/GalleryActionBar,
      via 221's seam + FR-1's flush) — one ticket each, deduped.
- [ ] FR-24 (both audits): rmTempDir helper for the 58 persistence
      test cleanups.

### Non-Functional Requirements

- Every consolidation ships a guard (test or lint scan) that makes
  the drift structurally non-recurring — the four-state "Integrated"
  bar, not just "extracted."
- Growing-domain validation stays in handlers, never SQLite CHECK.
- Trust-boundary fixes carry failure-injection regressions.

## Implementation Breakdown

(IMP tickets cut per wave as slots open; numbers assigned at cut
per AGENTS.md. Recommended order: Codex P1s → Codex P2s → the
anchored clamp + codecs → the mechanical helper tail. HC/C10 IDs
map 1:1 to FRs above.)

**Wave 1 — function unification (cut 2026-07-10):**

- [x] AI-IMP-250 anchored-surface-placement (FR-15 / HC-002) —
      core, assigned to Sol (xhigh)
- [x] AI-IMP-251 project-setting-codec (FR-16 + FR-11 merged /
      HC-003 + C10-011) — core, assigned to Sol (xhigh)
- [x] AI-IMP-252 node-appearance-codec (FR-17 / HC-004) — core,
      assigned to Sol (xhigh)
- [ ] AI-IMP-253 e2e-helper-adoption (FR-14 / HC-001) — mechanical,
      unassigned
- [ ] AI-IMP-254 persistence-test-temp-cleanup (FR-24) —
      mechanical, unassigned

Codex P1 correctness tickets (FR-1..5) are the next cut. The P3
helper tail (FR-18..22) and the FR-23 merged items stay here until
a slot opens; FR-23's envelope-views half additionally waits on
FR-1's flush correlation.
