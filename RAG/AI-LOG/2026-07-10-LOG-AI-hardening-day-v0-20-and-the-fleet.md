---
node_id: 2026-07-10-LOG-AI-hardening-day
tags:
  - AI-log
  - development-summary
  - hardening
  - release
  - field-reports
closed_tickets:
  - AI-IMP-242
  - AI-IMP-249
  - AI-IMP-250
  - AI-IMP-251
  - AI-IMP-252
  - AI-IMP-255
  - AI-IMP-256
  - AI-IMP-262
created_date: 2026-07-10
related_files:
  - RAG/AI-EPIC/AI-EPIC-027-hardening-and-consolidation.md
  - CHANGELOG.md
  - RAG/DESIGN-QUEUE.md
  - packages/persistence/src/lock-probe.spec.ts
  - apps/desktop/src/renderer/chrome/PathBar.svelte
  - packages/canvas-engine/src/renderers/placement.ts
confidence_score: 0.9
---

# 2026-07-10-LOG-AI-hardening-day-v0-20-and-the-fleet

## Work Completed

EPIC-027 cut and two-thirds executed in one day. Wave 1 (Sol,
xhigh): AI-IMP-250/251/252 — the §8.8 anchored-placement helper,
the project-setting codec (merged C10-011), the node-appearance
codec — reviewed, gated, merged. The in-context Codex then
resolved ALL 14 C10 control-flow findings atomically; lead-merged
with two dedup resolutions (C10-011's parallel writer dropped for
251's; project.ts union) — record ticket AI-IMP-256. v0.20.0 "the
hardening build" tagged and released with the new CHANGELOG.md
convention (backfilled v0.5.0+; For-testers voice = release body).
The Windows CI leg hit 3/3 green and merged (242+249 closed) after
the electron-husk step (the pnpm husk proved cross-platform).
alph's v0.20.0 field reports produced: AI-IMP-255 (OS drag band
blacked out all chrome — engagement band-enter fix, shipped in
v0.20.0), AI-IMP-257 (path bar click-dead — the no-drag class had
NO backing CSS rule; fixed + guard test), AI-IMP-262 (label blur —
zoom-bucket re-raster, agent-built, merged), and queued 258 (loose
-note panel), 259 (path containment), 260 (delete loose notes),
261 (asset content dedup, MIGRATION 0008 RESERVED). Design:
launcher-IS-the-project-picker direction recorded; spatial Home
tester-endorsed; traveling-tags-via-category proposal + close-time
inbox sync recorded (alph confirm pending). AI-IMP-263: the
post-merge probe zero-winner was CONVICTED as fixture PID reuse
(protocol exonerated); Codex round-2 fixture fix is on ci/imp-263
awaiting the Windows oracle. AI-IMP-264 cut (lock.ts full-file
review found real P1s) — blocked on 263's merge.

## Session Commits

bf3b9f8c EPIC-027 cut · 5fceb908 wave-1 tickets · df7eaaa8
CHANGELOG convention · e657d00d 249 round-4 diagnosis (+ c8402b81
electron step on the leg) · cff35f38 wave-1 merge close ·
3a600331 AI-IMP-255 · c7c0b1a2 C10 resolutions merge · 685cc564
v0.20.0 release commit + tag · dbd2697e Windows leg merge ·
1c4df079/7f82e25b/080447b1 design-queue + 263 cut + 262 review ·
f8e3b5fa 262 merge · 1b74d708 Windows stragglers (guard-scan
separators, hookTimeout) · 0e4cb128 257 fix + 262 cut ·
plus ci/imp-263 pushes (d88a7043 diagnostics, 34e05a9a fixture
fix — Codex commits, lead-pushed).

## Issues Encountered

THREE LEAD ERRORS, all caught by process and recorded where they
happened: (1) the C10 merge briefly committed LIVE conflict
markers (a failed Edit went unnoticed) — 43 persistence suites
died at transform; (2) TWO gate chains masked failures behind
grep/tail without pipefail (one reported exit 0 over those 43
failures; one blessed wave 1 with 4 real e2e failures hiding) —
CLAUDE.md now carries the pipefail rule; (3) AI-IMP-263 was cut on
a false "four identical failures" premise — Codex's evidence table
corrected it (2 probe, 1 guard-scan separators, 2 hook timeouts)
and source-falsified the lead's orchestration hypothesis. Also:
wave-1's codec correctly refused two e2e seeds speaking an untyped
dialect (missing crop key; PIXEL-SPACE crop silently stored by old
handlers — the audit's premise demonstrated in our own suite);
seeds fixed, codec unchanged. The C10-011 double-build (Sol wave
vs Codex batch, same finding) cost one review round — base-
freshness checks added to briefs.

## Tests Added

Wave 1: codec round-trips, malformed-payload pins, settings
corruption/decoder/rollback, anchored-placement unit suite +
adoption guard scan. C10 batch: per-commit regressions across all
14 (capability registry, path-safety, net-guard classifier,
db-transaction, flush coordinator, undo repair state, snapshot
checkpoint gate, texture residency, theme/background latest-wins).
Lead: engagement.test.ts (band-enter leave semantics, 4),
drag-region-guard.test.ts (no-drag-without-rule scan, 3).
262 agent: label raster resolution suite (6). Codex 263: probe
diagnostics + recycled-corpse retry-policy regression.

## Next Steps

IMMEDIATE: monitor bs5i6tvq9 watches ci/imp-263 round 2 (fixture
fix, 34e05a9a) — on green: merge to main (no-ff), close 263, arm
a three-consecutive-green MAIN gate, then greenlight AI-IMP-264
(lock hardening: readHolder error-collapse P1, guardIsStale P1
candidate, release/guard EPERM P2s, doc drift — each with fault
injection; Codex session holds context). Main stays intermittently
probe-red until that merge — known, not news. OWNER-PENDING: alph
verdict on traveling-tags (DESIGN-QUEUE entry PROPOSED);
HUMAN-TESTING has 257 (both platforms) + 262 (alph, display
scaling); the Home/naming/launcher cluster wants its design
session. QUEUED BUILDS: 258 (bisect owed), 260, 261 (migration
0008), 253/254 + P3 helper tail (FR-18..24). Read first: EPIC-027
(FR state), DESIGN-QUEUE top two entries, .codex/outbox/imp-263.md
(the amend verdict + fix contract), AI-IMP-264 (fenced scope).
Convention reminders that bit today: pipefail in every gate chain;
conflict-marker scan after any failed Edit during a merge; verify
all four run logs before claiming a pattern.
