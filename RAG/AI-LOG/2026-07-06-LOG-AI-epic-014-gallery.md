---
node_id: 2026-07-06-LOG-AI-epic-014-gallery
tags:
  - AI-log
  - development-summary
  - gallery
  - thumbnails
  - process
closed_tickets:
  - AI-IMP-076
  - AI-IMP-077
  - AI-IMP-078
  - AI-IMP-079
  - AI-IMP-080
  - AI-IMP-081
created_date: 2026-07-06
related_files:
  - RAG/AI-EPIC/AI-EPIC-014-gallery.md
  - apps/desktop/src/renderer/views/GalleryView.svelte
  - apps/desktop/src/renderer/assets/thumbnails.ts
  - packages/persistence/src/queries-gallery.ts
confidence_score: 0.9
---

# 2026-07-06-LOG-AI-epic-014-gallery

## Work Completed

EPIC-013 closed through the FIRST PR round-trip: Codex's GitHub
review (once the owner's account binding un-stuck — known
openai/codex#11881 class) landed five P2s, all confirmed and fixed
on the branch (asset search dead-ends on background-only hits,
panels surviving takeovers, an unwired menuPlacement control,
canvas-text hits on trashed canvases, a stale tag-panel lens);
merge commit, epic completed. A CI-red streak was diagnosed as
Electron's setOpacity being a Linux no-op inside the new settings
e2e — hotfix PR #2, platform-gated with the persisted value
asserted everywhere.

EPIC-014 (gallery) then went cut-to-done in one day. Lead-built:
**076 thumbnails** — the codec decision went AGAINST a native dep:
the renderer's Chromium IS the codec (zero deps, format envelope
identical to the board by construction); renderer claims queued
jobs, encodes WebP-with-alpha into a 512 box, utility owns
queue/files/backfill-per-hash, main serves `/thumb` — and **077
gallery takeover** — getGalleryIndex/getGalleryItems split
(compact index for layout, windowed hydrate), virtualized rows, ⊞
live, grouped time with the header-as-jump-control. Agent-built in
sequenced worktrees: **078 facets + text posts** (SQL-composed
sort × kind × tags × cleanup; galleryTagCounts; note cells as text
posts), **079 selection + action bar** (rev 0.25 pointer grammar,
tag·place·trash, §6.10 reuse — and a REAL find: parallel place
bursts failed the §10.2 revision check, fixed by serializing with
the check on), **080 keyboard model** (cursor math pure over
indices, +17 units), **081 import strip** (batch driver over the
untouched per-file pipeline, cancel keeps committed imports).
RFC 0.25→0.30: gallery keyboard model (OQ 26 closed), iPad
satellite direction + LAZY superposition (OQ 28), pitch-bible
export (OQ 29), renderer-codec amendment, §14.4 text posts. Owner
tooling: the idle bell's classifier moved to Claude Haiku via
`claude -p` (gemma3:1b misread self-continuing wrap-ups) with a
BELL_GUARD env flag so the -p call's own hooks can't kill the bell,
and the flat 2-minute cadence is now a recorded owner preference.

## Session Commits

EPIC-013 close: eb7ea67 (wave-two AI-LOG) → f744789 (five review
fixes) → 61932b4 (epic close) → PR #1 merge 1546a29 → PR #2
0325a9b/498f620 (CI hotfix). epic-014 branch: 8cb0041 (RFC 0.25) →
cf9fb0c (epic cut) → 13cc0e5 (IMPs 076–081) → f19e5b9 (RFC 0.26) →
7ceaabc (main sync) → 5fa7c10 (RFC 0.28) → af17b7e (076) →
7e37aee → c975b56 (077) → 2e64e62 (RFC 0.29) → 518a5a4/4af6d63
(081 merge+close) → 9b7f1cb/2de15cf (078 merge+close, RFC 0.30) →
3f29328/33ecae7/63dcca3 (079 merge+follow-up+close) → 7f9d7d0
merge/9b7f8c3 (080 + FRs). Final gates: 82 desktop e2e, 404
persistence units, 36 desktop units, lint, build; CI green on
Linux through every push checked.

## Issues Encountered

**setOpacity is Windows/macOS-only** — the settings e2e was green
locally and red on every Ubuntu run; platform-blind "gates green"
claims were the real lesson. **`claude -p` runs the caller's global
hooks**: a naked classify call killed the bell loop and re-aimed
its transcript at the -p session (fixed with an env guard the hook
dispatcher checks). **078/079/080 could not run in parallel** as
the epic cut assumed — all three live in GalleryView.svelte; they
were sequenced. **The place-burst §10.2 failure** (079) is the
epic's best catch: parallel executes shared one observed revision;
serialize, don't bypass. **`--ew-text-dim` never existed** — a 077
lead mistake, copied by 078, caught by the 079 agent; the raw-color
scan doesn't catch UNDEFINED var() references (possible tiny
follow-up: a token-exists scan). **Worktree Electron repair,
complete recipe**: copy the pnpm-store dist (rm -rf first — cp
nests dist/dist), restore `path.txt` beside it, and write it with
printf — echo's newline makes spawn fail ENOENT while the binary
runs fine by hand. **e2e cannot backdate created_at**, so bucket
degradation and multi-bucket jumps are unit-tested (fixed clock)
with single-bucket e2e renders. Two specs (import-batch,
decorations) each flaked once under load, passing on retry — watch.

## Tests Added

thumbnails.spec (2: alpha-preserving /thumb round-trip via in-page
pixel sampling; derivatives regrow after deletion), gallery.spec
(2: virtualization bounds on a 223 seed, kinds, camera; empty
state), gallery-facets.spec (1 dense), gallery-selection.spec (5),
gallery-keyboard.spec (5), import-batch.spec (2). Persistence +9
(gallery read models incl. facet composition + tag counts;
derivative claim/complete/backfill incl. the per-hash dedupe bug
its own unit caught). Desktop units +25 (gallery-buckets 2,
gallery-keys 17, import-progress 6).

## Next Steps

*(Amended post-close.)* PR #3's round-trip completed inside the
session: Codex found five findings — a P1 (renderer-supplied
contentHash reached a filesystem path; fixed by deriving asset and
hash from the job row, so the submit surface carries only jobId +
bytes) and four P2s (cache-busted /thumb URLs rejected by the
protocol regex; stale hydrated gallery items, fixed with a
clear-on-change plus a generation guard; the drive loop hot-spinning
on persistent submit failure; the init/window race stranding
backfill, fixed with an initial service-ok broadcast plus a boot
retry ladder). All fixed, gates re-green (82/405/36), merge commit
b694d89, epic completed. **Versioning revised (owner decision)**:
epics do not close in numeric order, so minor-equals-epic-number is
dead — SEQUENTIAL minor per epic close, epic named in the tag
annotation and a "shipped in vX.Y.0" epic-doc line; v0.7.0 tags
this merge covering EPIC-013 + EPIC-014; CLAUDE.md updated. Owner
eyeballs invited: light-theme legibility over
art (carried), 'earlier this year' as named months, gallery cell
sizing/feel on real art. EPIC-015 (library ecosystem) is fully
scoped in §14.4: library project, scope toggle, inbox mirror,
open-as-source, tag border, seed, Allusion importer. Backlog
carried: purge-by-retention (§9), EPIC-007 undo UI, session
snapshots (rev 0.24), crop editor, composed views + booru drop RFC
turns, token-exists scan, watch the two flaky specs.
