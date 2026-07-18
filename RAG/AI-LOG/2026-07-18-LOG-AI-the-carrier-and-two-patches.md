---
node_id: 2026-07-18-LOG-AI-the-carrier-and-two-patches
tags:
  - AI-log
  - development-summary
  - infrastructure
  - release
  - tester-feedback
closed_tickets:
  - AI-IMP-306
  - AI-IMP-259
  - AI-IMP-269
created_date: 2026-07-18
related_files:
  - RAG/AI-EPIC/AI-EPIC-031-the-notes-epic.md
  - RAG/design/promises/note-paper.md
  - .codex/PROTOCOL.md
  - CHANGELOG.md
confidence_score: 0.92
---

# 2026-07-18-LOG-AI-the-carrier-and-two-patches

## Work Completed

The window the comms problem died in. Two patches shipped
(v0.26.1 live; v0.26.2 in flight), two epics chartered/advanced,
and the shop grew a durable nervous system that was drilled,
adversarially hardened, and in production the same day.

- **THE CARRIER** (owner: "whatever solves it, easy, low
  latency"): Phase-A core built in `~/git/_tooling_/carrier/`
  per the settled notification-architecture design — immutable
  Markdown mailbox · receipts only for non-derivable facts ·
  derivable SQLite index · explicit digest-bound `ack-file`
  ritual. Then the four-test DROP-OUT DRILL (T4 found real:
  pending age died on rebuild → BORN receipts), then two Codex
  review rounds found FIVE more P1/P2s, ending in DETERMINISTIC
  EVENT IDENTITY (sync-before-rebuild now RECOVERS instead of
  duplicating). Phase-A CLOSED per reviewer condition. Live
  protocol amended (the processing ritual is installed
  authority); the public repo-bootstrap skill ships carrier.py +
  doctrine + drill. Already earned: restored three archive gaps
  from carrier artifacts mid-wave. Remaining: app-server idle-
  wake proof (Codex, queued), Phase-C worker matrix.
- **STRAGGLERS WAVE → v0.26.1** (306/259/269 closed; 224 split,
  in-progress): five rounds over the new channel. Round 1 killed
  259's containment premise constitutionally, convicted
  snapshot-before-sweep (swallowed failure, sweep ran — typed
  fail-stop landed with injected proof), and caught AGENTS.md
  contradicting PROTOCOL (fixed, `82cc0033`). The 269 experiment
  concluded HONESTLY: hidden-Xvfb costs ~997ms/pointer-action
  (linear, probe-measured); shown-Xvfb cut it 9× but was
  REJECTED by its own retention gate (walls unmoved, shards
  destabilized) — both red runs preserved as evidence. Blink
  taught us the 1/64-CSS-pixel layout quantum. Ship: pill-to-Home
  with phantom arrows dead, app-wide no-slug display labels,
  the GC fail-stop.
- **ALPH WAVE round 1 verdicted** (307–311 → v0.26.2): all five
  field defects convicted at the CORRECT layer — two of the
  lead's diagnoses were wrong-layer (307 is renderer texture
  re-acquisition, NOT undo; 309 is a trashed NODE owning an
  active note, not a trashed note). Five rulings issued:
  descendant-outranks-frame selection, restore-and-navigate +
  "name 2" series, pins are circles sized to the ghost at drop,
  gallery menu generalizes the Outliner seam with a places
  chooser (never deterministic-first). Implementation in flight.
- **Chartered**: AI-EPIC-031 (notes, census-first, 312+
  reserved) + note-paper promise ledger (8 cards BEFORE the wave
  this time); alph field doc triaged (5 bugs cut, 4 design items
  queued incl. the arrange-envelope/frames-as-units law).
  PH-007 CI-clarity lane opened (headline pre-read: every CI job
  does its own install+build, zero caching).
- **Precedents archived**: Codex's fence-brush self-report
  (bright line kept, no read-only carve-out); the comms-vigilance
  symmetric norms; consultation lane at ~8 settles this window.

## Issues Encountered

- The lead's own ear violated the harness's restart law (watcher
  re-arm baselined away stragglers round 2) — fixed with the
  persisted acked-fingerprint watcher (v3), which is PH-003's
  rule applied to its author.
- Two lead ticket diagnoses would have shipped wrong-layer fixes
  without round-1 review (309, 311) — the strongest evidence yet
  for review-before-code; also the checkpoint-lane pattern
  (baseline oracle → one-variable flip → retention gate) is now
  proven wave grammar.
- cwd-relative bites recurred (6th, 7th); a pathspec-filtered git
  diff returned empty against a name-status M once (blob-level
  diff used instead; unexplained, watch for recurrence).

## Tests Added

Via merges: persistence 659→662, desktop 570→581, e2e 274→281
CI-mode (+3 perf local) — path-bar rest/reveal pins with the
layout-quantum tolerance, display-label censuses, snapshot
fail-stop injection, the input-cadence probe, named-stage
SourcePanel evidence.

## Next Steps

- Alph wave round 2 → gate → v0.26.2 (evidence bundle keyed to
  ledger recipes).
- Notes census (Codex filler) → cut AI-IMP-312+ → the flagship
  wave. Graph (EPIC-021) charter after.
- PH-007 CI census once alph closes (setup duplication is
  hypothesis #1; 269's cadence data is banked input).
- OWNER, one at a time: dock-ledger COSIGN (rev 4, zero
  dependencies — unblocks the pilot + seam ticket) · 0.26.x feel
  pass (also confirms the drill-echo item-1 staleness) · kit
  sitting owes touch band numerics + bar-☰ redraw + EPIC-025
  palette-grid page.
