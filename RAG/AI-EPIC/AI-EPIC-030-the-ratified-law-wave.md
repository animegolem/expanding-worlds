---
node_id: AI-EPIC-030
tags:
  - EPIC
  - AI
  - design-adoption
  - chrome
  - feel-pass
date_created: 2026-07-16
date_completed: 2026-07-17
kanban_status: completed
AI_IMP_spawned:
  - AI-IMP-301
  - AI-IMP-302
  - AI-IMP-303
  - AI-IMP-304
  - AI-IMP-305
---

# AI-EPIC-030-the-ratified-law-wave

## Problem Statement

The v0.25.0 feel pass found the gap class no gate measured: the app
was contract-true and hand-false. The owner's findings triaged into
straight bugs (takeover click-through; bars rendering under notes
and displacing the dock), implementation-vs-intent gaps (a 44-line
ColorPicker with every drawn part and none of the drawn behavior),
and design law that did not yet exist. Kits 1.5/1.6 wrote the
missing law and RFC rev 0.73 ratified it (rulings 40–46: takeover
chrome migration, minimum width 960, density triad, the proportion
law, the dismissal swallow). This epic enforces the ratified law in
code and closes the feel pass's bug lanes — everything buildable
now that is NOT the notes epic (which charters separately on the
posture verbs and proportion law).

## Proposed Solution

Five tickets, one Codex wave under the standard goal-loop protocol
(round-1 pre-implementation review before code; atomic commit per
ticket; wave-gate evidence train; verdict before close). The wave
report carries the observability contract's EVIDENCE BUNDLE:
promise-keyed screenshots at stress points for every draft dock
card a ticket touches (the ledger is DRAFT — evidence is captured,
classification is per the six-way scheme, exceptions are
request-only).

## Path(s) Forward

- AI-IMP-301 — the dismissal swallow, enforced app-wide (§8.8.6).
- AI-IMP-302 — the takeover chrome migration (ruling 40, §8.2).
- AI-IMP-303 — ColorPicker to drawn behavior + the three color
  doors from one MRU (ledger convictions).
- AI-IMP-304 — frame law: minWidth 960 + density triad plumbing.
- AI-IMP-305 — bars-under-notes diagnostic and fix (layering).

## Close (2026-07-17 — shipped in v0.26.0)

One wave, four rounds, all five tickets landed as five atomic
commits (merge `ae68aee5`; oracle run 29544465545 "success").
Round 1 corrected the mislabeled density mapping before code; the
evidence-bundle pilot caught two defects pre-submission
(restore-toast swallowed over Trash; picker containment); the
oracle caught a cross-platform focus-order race at the takeover
boundary (Escape reaching the underlying view when Search's
autofocus hadn't settled — deterministic on Windows/Linux,
invisible on macOS) that round 4 convicted at the TakeoverLayer
host after honestly retracting round 3's mount-order diagnosis.
Two missing-promise findings and one ledger correction went to
the cosign queue. PH-002 trial data recorded (r1 verdict 3m43s).

## Success Metrics

Full local suite green at or above the v0.25.0 floors (persistence
659 · canvas-engine 410 · desktop unit 570 · e2e 274) plus the new
assertions each ticket adds; CI oracle green on Windows/Linux; the
five feel-pass defect reproductions each demonstrated fixed in the
evidence bundle; on close, minor bump + tag per release convention.
