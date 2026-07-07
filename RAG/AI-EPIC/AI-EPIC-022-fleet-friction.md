---
node_id: AI-EPIC-022
tags:
  - EPIC
  - infrastructure
  - tooling
date_created: 2026-07-06
date_completed: 2026-07-07
kanban_status: completed
AI_IMP_spawned:
---

# AI-EPIC-022-fleet-friction

> Born from the 2026-07-06 meta-analysis of every AI-LOG and Issues
> Encountered section: four root-cause clusters recur beneath
> "one-off" ticket friction because no single ticket owns the
> shared surface. Owner approved the remediation batch same night.

## Problem Statement/Feature Scope

(1) Electron's postinstall silently ships a husk `dist/` in every
fresh worktree — ~15 recurrences of a five-landmine manual repair,
one lost Codex validation pass. (2) CommandGateway stamps one
observed revision across parallel executes, so every burst after
the first commit conflicts — three tickets papered over it
(`checkRevision:false`, one hand-rolled chain). (3) Scene apply is
async with no promise-shaped primitive, so every
navigate-then-read site hand-rolls try/retry/timeout and each new
one regresses as a "flake". (4) SQLite CHECK-enums force FK-aware
table rebuilds every time a domain grows, and parallel agents
collide on migration numbers — handled as CONVENTIONS (CLAUDE.md),
no IMP.

## Proposed Solution(s)

AI-IMP-111 repair-electron script + pre-e2e guard; AI-IMP-112
gateway serialization + parallel-burst guard test; AI-IMP-113
scene-ready promise primitive + call-site migration. Conventions
land with the epic cut.

## Path(s) Not Taken

No pnpm/electron version dance (the postinstall bug is upstream
fragility; we self-heal instead). No global revision bus across
the two gateways — the documented `checkRevision:false` rule for
id-targeted stable-record mutations stays.

## Success Metrics

A fresh worktree runs e2e with zero manual electron surgery; two
parallel CreatePlacements both commit with the revision check ON;
no renderer site reads `items()` synchronously after navigation.

## Requirements

### Functional Requirements

- [x] FR-1: scripts/repair-electron.sh (AI-IMP-111)
- [x] FR-2: gateway burst serialization (AI-IMP-112)
- [x] FR-3: scene-ready primitive (AI-IMP-113)
- [x] FR-4: conventions recorded in CLAUDE.md (with the epic cut)

### Non-Functional Requirements

- The repair script is idempotent and safe to run when nothing is
  broken.

## Implementation Breakdown

AI-IMP-111 · AI-IMP-112 · AI-IMP-113. All three closed by 2026-07-06;
conventions (CHECK-enum ban, migration-number reservation, benchmark
environment check) recorded in CLAUDE.md at the epic cut. Success
metrics held in practice across the EPIC-016/018 waves: fresh agent
worktrees ran e2e with zero electron surgery (playwright globalSetup
auto-repairs), and no new navigate-then-read flake has appeared since
the AI-IMP-113 call-site migration.

Shipped in v0.10.0.
