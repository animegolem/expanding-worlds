---
node_id: 2026-07-07-LOG-AI-the-roundtrip-the-pin-and-four-epic-closes
tags:
  - AI-log
  - development-summary
  - export-import
  - signature-pin
  - epic-close
closed_tickets: [AI-IMP-135, AI-IMP-145, AI-IMP-148, AI-IMP-149, AI-IMP-150, AI-IMP-154, AI-IMP-157, AI-IMP-158, AI-IMP-159, AI-IMP-160, AI-IMP-161, AI-IMP-162, AI-IMP-163, AI-IMP-164, AI-IMP-165, AI-IMP-167, AI-IMP-168, AI-IMP-134, AI-IMP-140]
created_date: 2026-07-07
related_files:
  - packages/persistence/src/export/ (new: manifest, project-export, project-import, active-only)
  - apps/desktop/src/main/net-guard.ts
  - apps/desktop/src/renderer/note/ (NotePanel, panels, paper/, folding, format-bar, dialect-freeze)
  - apps/desktop/src/renderer/canvas/ (charms-ui, crop-editor, host beats/ghosts)
  - apps/desktop/src/renderer/chrome/ (takeover, first-run, menu-cascade, TitleStrip)
  - apps/desktop/src/renderer/undo/ (undo-store group capture)
  - packages/persistence/src/queries-*.ts (usable-canvas predicate)
  - RAG/RFC-0001 (revs 0.57 → 0.66)
confidence_score: 0.9
---

# 2026-07-07-LOG-AI-the-roundtrip-the-pin-and-four-epic-closes

## Work Completed

The second half of 2026-07-07 (continuation of the twelve-closes
session; access extended through 07-12 mid-day, ending the sprint
clock). Nineteen tickets closed, four epics shipped as releases:
EPIC-022 fleet friction (v0.10.0), EPIC-023 paper note lifecycle
(v0.11.0), EPIC-018 rich text (v0.12.0), EPIC-016 menus (v0.13.0).

The lead-built centerpiece is the §16 roundtrip: `.ewproj` export
(157 — manifest-first ZIP, stored media, active-only variant with an
FK-checked filter) and import (158 — stream-hash verification,
typed refusals, table-by-table EXACT roundtrip diff), then hardened
through two adversarial Codex rounds (162 + round 3): the hex-form
v4-mapped IPv6 SSRF bypass (reproduced, closed), NAT64/6to4
translation prefixes, the manifest-binding invariant (asset sha256
MUST equal its content-address basename), db integrity + blob
presence before the rename, bookmark predicate parity, DEST_EXISTS.

Agent waves closed the front-end queue: 145 first-run guide (P2
fixed as 160: takeover input blockers), 134/135 the open book and
its lifecycle (tear/tape/place/pull-pin + rotation gate), 148/149/150
folding + format bar + the dialect freeze, 140 image radius/shadow,
154 decoration undo at the gesture, 159 crop editor (display-only UV
crop), 163 owner-trashed read-model sweep (+ canvasText), 164
connector-anchor undo restore, 161 charm-bar adorned bounds, 165
frameless shell, 167 the cascade, 168 gallery slider + Quick Look.

The 161 merge exposed the pre-ladder z inversion (panels at literal
8 under charms at rung 100); the fix landed AI-IMP-143's deferred
band port — panels/takeover/chrome/popover/modal roots now sit on
named rungs with `rung:` comments.

RFC revs 0.57–0.66 in one day: export container (OQ 11 closed),
cross-canvas undo presence fence, the universal viewer (+ reading
state, true OS fullscreen, connectors-address-never-extend), §17/§18
sign-off reconciliation (items 27–30), the Signature Pin pass, §8.5
indicator reconciliation, and the dialect URL-cluster growth ruling.

In flight at log time: AI-IMP-166 (signature pin + bookmark beat,
Opus agent). Cut and waiting: 169 (sign-off gap tests, to cut), 170
(dialect growth), 138/152/140-leftovers. EPIC-008 FR-5/FR-6 (the
Phase 1 audit) is the lead's next thread — evidence map done, audit
skeleton in scratchpad, owner will read the audit and flush
HUMAN-TESTING (which grew ~10 entries today).

## Session Commits

67 commits from the charms-deadlock hotfix (85612c8c) to the double
epic close (dcafca54); one commit per ticket or reviewed merge
throughout. Notable sequences: 157→158→162→round-3 (the roundtrip
arc, each gated 174–182/182); the wave-4/5 merges (149/154/159/
163/164 with two Codex-finding fixes); wave 6 (150/161/165/167/168)
gated as one tree at 189/189 after the z-ladder chase; RFC doc
commits pushed direct to main per the doc policy; tags v0.10.0
through v0.13.0 pushed at normal cadence (owner durably authorized
mid-session; see memory).

## Issues Encountered

- **CI-red twice.** (1) The v0.11.0 close: 135's lifecycle walk
  flaked on CI only — tearOut never rescheduled layout, so the
  binder rings cleared only when a camera/scene event happened to
  arrive; still environments (CI) never sent one. Fix: schedule()
  in tearOut like untape (4881b479). (2) Both failures were masked
  locally by ambient event traffic — environment-dependent flakes
  need still-environment thinking.
- **The z-ladder chase.** Raising panels to their rung broke three
  popover surfaces in sequence (suggestions, tag panel, quick-open)
  — each a pre-ladder literal that only worked against panels-at-8.
  Lesson: porting ONE band root forces the whole ladder; do it as
  one sweep, not incrementally.
- **Background-log truncation bit twice**: piping gates through
  `tail` destroyed failure diagnostics. Convention now: gate runs
  tee to a scratchpad log file, tail only for the summary.
- **Codex range-review confusion**: a frozen commit-range review
  re-reported already-fixed findings and a mistyped short hash
  compounded it. Convention now: give Codex branch refs for
  is-current-code-sound questions, full 40-char hashes, and a
  "check origin/main before reporting open" line.
- **Agent-fleet API instability** (mid-day): five agents killed
  mid-build by upstream errors/session caps, all resumed cleanly —
  dirty worktrees survive and resume in place; an auto-cleaned
  worktree means relaunch or self-provision (the 135 agent did the
  latter correctly). Memory updated with the nuance.
- **150's lossy-canonicalization finding**: foreign Markdown
  (links/images/tables) degrades silently on first open. Owner
  ruled the URL-cluster dialect growth (rev 0.66, AI-IMP-170);
  residue (tables/footnotes) queued for the vault-return decision
  with the proposed rule "foreign Markdown is never silently
  destroyed."

## Tests Added

Persistence: export/import suites (manifest shape, stored-vs-deflate
policy, active-only + FK check, roundtrip diff, tampered/crafted/
swapped-blob/dest-exists refusals), usable-canvas regressions ×9 (+
canvasText), connector-anchor red-green pair. Desktop: net-guard 18
(3 new vectors ×2 rounds), dialect freeze guard + corpus 35→44,
first-run blocking red-green, undo-store group-capture unit + Dock
drag e2e, beats texture-leak e2e (resident→idle), crop rect math +
crop e2e, note-lifecycle walk ×3 + rotation gate, format-bar unit +
e2e, adorned-bounds unit matrix + charms e2e, cascade e2e, gallery
Quick Look e2e ×2, frameless drag-region assertion. Suite: 159 →
189 e2e over the session.

## Next Steps

1. Merge AI-IMP-166 when it reports (signature pin + beat); close.
2. Cut + write AI-IMP-169 (sign-off gap tests: tag rename e2e,
   cycle nav/export walk, cross-canvas undo decline, retention
   default, outline trash exclusion) — the evidence map
   (scratchpad/signoff-draft.md has the full plan) says these are
   the only genuinely uncovered §17 clauses.
3. Write RAG/PHASE-1-SIGNOFF.md (FR-5 walkthrough citing the
   evidence map + FR-6 §18 audit) + AI-LOG declaring Phase 1
   complete pending owner counter-signature; owner flushes
   HUMAN-TESTING and reads the audit.
4. Close EPIC-008 (v0.14.0) and EPIC-019 (145 done; README/Pages
   remain — check scope at close) after the audit.
5. Remaining build queue: 138 frame furniture (sort-control design
   call still open), 152 hand-rules audit, 170 dialect growth,
   EPIC-007's capture-breadth design conversation (DESIGN-QUEUE).
6. Codex retro-review targets: wave 6 + the roundtrip hardening
   (give it branch refs, not ranges).
