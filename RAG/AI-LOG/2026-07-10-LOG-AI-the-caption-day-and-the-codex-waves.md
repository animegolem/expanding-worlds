---
node_id: 2026-07-10-LOG-AI-the-caption-day
tags:
  - AI-log
  - development-summary
  - field-reports
  - release
  - design
closed_tickets:
  - AI-IMP-258
  - AI-IMP-260
  - AI-IMP-263
  - AI-IMP-265 (cut)
  - AI-IMP-266
  - AI-IMP-267
  - AI-IMP-268
created_date: 2026-07-10
related_files:
  - RAG/RFC-0001-Core-Note-Node-and-Canvas-Model.md
  - RAG/DESIGN-QUEUE.md
  - RAG/AI-IMP/AI-IMP-270-create-and-attach-redo.md
  - .github/workflows/ci.yml
  - CHANGELOG.md
confidence_score: 0.9
---

# 2026-07-10-LOG-AI-the-caption-day-and-the-codex-waves

## Work Completed

The second half of hardening day (see the sibling 2026-07-10 log).
AI-IMP-263 closed clean: round-2 fixture fix merged, three-green
gate passed as three probe executions on the merged tip, protocol
exonerated for the record. AI-IMP-258 (loose-note panel): review
KILLED both ticket premises — one mount path already existed and
NOTHING regressed (v0.16 byte-equivalent); convicted causes were
the anchorless spawn parking close under the charm rail
(elementFromPoint → charm-search: "close" opened SEARCH) and a
grab-area gap; fixed by honoring the store's day-one screen
contract (free-floating panels + ⠿ grip). AI-IMP-260: TrashNote
had ZERO dispatchers; outline loose-bin row + panel empty-uses row
now dispatch via the gateway-backed note port; acceptance
corrected to the ratified matrix (Trash view is recovery, not
Mod+Z). v0.21.0 "the field-report build" tagged (lesson: let the
workflow create the release, edit the body after — my pre-created
release broke its create step; artifacts hand-attached).

THE CAPTION ARC, Discord to shipped in one day: alph's "I
couldn't write 'I like the blue' without attaching a note and
titling it" diagnosed as IDENTITY-FORCING (the register between
note and decoration was missing); owner ratified the seven-point
proposal with two amendments (routing dialogue with remembered
choice; caption charm); RFC rev 0.68 §4.5 written; AI-IMP-266/267
cut and built by the CODEX WAVE (its own subagent fan-out +
internal pre-merge review — the owner's proposed setup, validated
on first use). Codex's round-1 review corrected my tickets four
ways (migration reservation swap 266↔261 → caption is 0008;
@ew/commands home; app-tier AppSettings codec not 251's; the
CreateNoteAndAttach composition) and caught missed scope
(lifecycle inverse rows would have silently dropped captions).
Round-3 review convicted INHERITED redo rot: CreateNoteAndAttach
undo cannot redo (inverse:null → replay collides with the trashed
title-reserving row) — 267 ships honest refusal; AI-IMP-270 cut
for the real RestoreAndAttachNote-shaped inverse. Both merges
lead-reviewed (flipY bounds claim independently verified against
main's own math), Windows-oracle gated, counts reproduced.
v0.22.0 "the caption build" tagged with tester-voice notes.

AI-IMP-268: CI convicted and rebalanced in an afternoon — the
full e2e ran single-worker inside check (44 of every push's 45
minutes, doc-only pushes included). Now: paths-ignore for
RAG/**+md, per-ref cancellation, 4-way e2e shards. Measured: 14.1
min code pushes, ZERO for docs, shards sum to the exact pre-split
245. AI-IMP-269 cut (measurement-first e2e overlap analysis,
report-then-sign-off). AI-IMP-265 cut (text-in-shape, owner's
second ask). Design: traveling tags REOPENED by the owner — the
caption absorbed world-tags' annotation job; candidate ruling ONE
tag universe, lead-refined to MIRROR-EDGE SYNC (tags sync where a
mirror exists; no lanes, no filing decision); three-question alph
agenda in DESIGN-QUEUE.

## Session Commits (this log's half)

e0c15f6f 263 merge · a4c63178 263 gate armed · 8f6ccafc 263
closed · 5b378831 265 cut · 1fcffd98 258 · a50f2d8f caption
DESIGN-QUEUE · 8604ebae 260 · a0cc541d+tag v0.21.0 · 8157671b
outline fact-check · 3676fb42 RFC 0.68 + 266/267 cut · a2de2802
ticket supersedes · a8d02fb3 268 · 0fceb86c/e6cc9ae4 268 close ·
278e4a3a 266 merge · 6ad791ef 266 closed · 3b595464 267 rulings +
270 cut · a96a1611 267 merge + lint fixup · 403ba6fe 267 closed ·
6c382cee tags reopened · f6462793+tag v0.22.0.

## Issues Encountered

- Lead gate gap: my worktree re-runs covered build/units/e2e but
  NOT lint/spike-typecheck — the 267 oracle's check job caught a
  dead e2e helper my gate missed. STANDING FIX: lead re-runs use
  full `pnpm check:ci`.
- Release process: pre-creating the GitHub release breaks the
  workflow's own create step (v0.21.0 — artifacts hand-attached).
  STANDING FIX: workflow creates, lead edits the body after
  (v0.22.0 done this way, clean).
- Mid-flight ticket edits during an ACTIVE Codex round risk
  collision — owner flagged; edits held, rulings carried by the
  outbox verdict instead ("code against the verdict where they
  differ"), tickets synced after the round settled. Keep this
  discipline.
- zsh =word expansion bit again (echo ====). Quote it.
- pnpm no-TTY purge guard on local runs: CI=true prefix.

## Tests Added

258: panels-free-floating store contract + loose-note-panel e2e
(hit-testing, drag persistence, tether guard). 260:
loose-note-trash e2e (outline round trip via Trash view, panel
path, placed-note negative). 266 (Codex): migration/handler/
lifecycle-inverse/read-model-negative suites, caption layout
units, caption e2e. 267 (Codex): routing/remember/conflict/
fail-stop injection both stages/honest-redo-refusal, caption e2e
grown to 7. 268: the pipeline itself (shard-count equality
asserted at close).

## Next Steps

QUEUED BUILDS: AI-IMP-264 (lock hardening quartet — Codex,
greenlit since 263), AI-IMP-270 (CreateNoteAndAttach redo inverse
— Codex or Sol), AI-IMP-269 (e2e timing analysis), AI-IMP-261
(asset dedup, NOW MIGRATION 0009 after the swap), AI-IMP-265
(text-in-shape, homework-gated), 253/254 + EPIC-027 P3 tail.
OWNER-PENDING: alph on v0.22.0 (HUMAN-TESTING: captions + the two
feel questions — early wrap, connectedness/mat), the reopened
traveling-tags conversation (mirror-edge sync agenda in
DESIGN-QUEUE), Home/launcher design session, 259's display half.
Read first: DESIGN-QUEUE top entries, AI-IMP-270's fence, the
.codex outbox verdicts (channel state: nothing queued to Codex
tonight; 264 and 270 are the next sittings' candidates).
