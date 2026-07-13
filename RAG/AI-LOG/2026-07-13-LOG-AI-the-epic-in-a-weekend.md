---
node_id: 2026-07-13-LOG-AI-the-epic-in-a-weekend
tags:
  - AI-log
  - development-summary
  - design-adoption
  - delegation
  - release
closed_tickets:
  - AI-IMP-286
  - AI-IMP-287
  - AI-IMP-288
  - AI-IMP-289
  - AI-IMP-290
  - AI-IMP-291
  - AI-IMP-292
  - AI-IMP-293
  - AI-IMP-294
  - AI-IMP-295
  - AI-IMP-296
  - AI-IMP-297
  - AI-IMP-298
  - AI-IMP-299
  - AI-IMP-300
created_date: 2026-07-13
related_files:
  - RAG/AI-EPIC/AI-EPIC-029-the-kit-adoption-push.md
  - RAG/RFC-0001-Core-Note-Node-and-Canvas-Model.md
  - RAG/scripts/wave-gate.sh
  - RAG/scripts/wave-close.sh
  - RAG/design/KIT-CHANGELOG.md
confidence_score: 0.93
---

# 2026-07-13-LOG-AI-the-epic-in-a-weekend

## Work Completed

EPIC-029 (the kit adoption push) went from cut to CLOSED in ~36
hours: fifteen tickets, four phases, four Codex waves under the
goal-loop protocol, two releases. Main ends at v0.25.0; RFC at rev
0.72.

- **Ratification arc**: the owner's kit push reviewed as one object
  → RFC rev 0.71 (§8.8.3 reservation frame, §8.8.4 charm halo, §8.3
  palette rewrite incl. same-day fzf grammar, GR-5 ratified with
  lead guards, caption plaque + row meta); kit packages 1.0→1.4
  landed with the correction queue riding the zip; rev 0.72 added
  §7.4's one scoped exception (canvas-owner places live in ◎).
- **Frame wave** (286/287/288 + r3 gutter correction Codex's own
  audit caught post-merge). **Dock wave** (289/290/291) — three
  rounds; the red oracle turned out to be RUNNER ARITHMETIC (~1s per
  mouse-move step on GPU-less xvfb, trace-measured; AI-IMP-269 #3),
  not the probe race we fixed first; CI now uploads failure evidence
  + traces retries. **v0.24.1 intermediate tag** shipped that night
  so the first tester had a build before his Campus France morning.
  **Nav wave** (292/294/295/293) — the capability seam (one-use
  main-issued open tokens), Mod+K palette, ◎ corner, four-rung rail;
  r3 fixed a stale test coordinate (traffic-light inset, Codex's
  sharper mechanism). **Content wave** (296–300) — reading flight,
  plaques, one lens, gallery/settings adoption; two mid-wave
  read-projection corrections ratified at acceptance; both guard
  allowlists ended EMPTY and absolute.
- **The wave trains** (owner-directed, RGB-Agent pattern):
  `wave-gate.sh` (merge→build→counts-vs-floors→oracle,
  halt-on-divergence, evidence file, never touches main) and
  `wave-close.sh` ran three live trials — one correct halt on a red
  oracle, two clean closes. The incident rules are now structural.
- Records: RAG reorg captured (audits/, design/archive/, queue
  move — byte-verified before delete-halves); KIT-CHANGELOG grew the
  design-package section; DESIGN-GAPS carries six kit-1.5 items;
  validate-tickets `--changed` now sees tracked-unstaged edits.

## Issues Encountered

- Lead misdiagnosis cost the dock wave a round (probe race was real
  but not causal) — answered by instrumenting CI instead of guessing
  twice; the trace convicted the runner.
- The content wave's STOP-and-ask notes sat unseen: the lead's
  inbox watcher greped ONE filename and Codex's correction notes
  were separate files; Codex proceeded past the stop
  (conspicuously, correctly-sized, both ratified). PROTOCOL now
  carries the ~1h gate-timing note + the park-don't-self-authorize
  norm; lead watchers watch the whole dir.
- wave-close ran before the acceptance verdict once (archived an
  amend); ordering documented in the script header.
- FETCH_HEAD got clobbered mid-review by a background process —
  review commands now pin explicit shas.
- cwd-relative path bites recurred (4th occurrence) — background
  chains must cd explicitly per command.

## Tests Added

Via merges: persistence 658→659, canvas-engine 408→410, desktop
unit 531→570, hidden-window e2e 268→274 — including the reservation
edge pins, byte-exact flight restore, plaque replay-proofing,
measured click-away geometry, and the empty-allowlist guard
assertions.

## Next Steps

- Release body edit for v0.25.0 when the workflow finishes (For
  testers voice over the install notes).
- The second Codex session's RFC-vs-code audit report is still
  outstanding → triage into RAG/audits/ + tickets when it lands.
- Owner: HUMAN-TESTING queue has five entries (v0.24.1 + v0.25.0
  are the vehicles); kit 1.5 items wait in DESIGN-GAPS; phase-1
  sign-off review is the natural next epic-scale conversation,
  alongside EPIC-025 (palette picker) and the AI-IMP-269 CI-speed
  prize (~halves CI wall time).
- Standing debt: source-panel flake fix (269 #2) is cuttable;
  AI-IMP-204 gallery inspector design still open.
