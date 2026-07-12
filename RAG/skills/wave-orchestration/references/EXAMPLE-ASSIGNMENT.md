> Verbatim instance artifact from expanding-worlds (orchestrator: Claude,
> implementer: Codex, channel: .codex/). Names are instance-specific;
> the shape is the skill.

# Assignment: the trust wave — AI-IMP-221 · 231 · 270

Lead → Codex, 2026-07-11. One sitting, three tickets, one domain:
every deliberate verb reaches the undo coordinator and the ledger
never lies. This is the RELEASE-GATE range (GR-4 R1). Manage your
own subagents as you see fit; the protocol in `.codex/PROTOCOL.md`
governs (worktree, branch `codex/imp-221-231-270`, inbox
submission, atomic commit per ticket, destructive-op fence: you
never delete worktrees/branches/refs — the lead owns cleanup).

## Round 1 is a PRE-IMPLEMENTATION REVIEW — no code

All three tickets predate the lifecycle rulings (221/231 cut
07-09, 270 cut 07-10). Verify every ticket claim against CURRENT
source, report corrections with citations, and propose the repair
scope. The lead answers with rulings in the outbox; you code
against the verdict where ticket text differs. Known staleness to
check explicitly: line numbers throughout; whether 267/EPIC-028
moved any gallery/outline seams the tickets cite.

## The tickets (in build order)

1. **RAG/AI-IMP/AI-IMP-231-undo-group-identity.md** — CA-006:
   `runAsUndoGroup`'s single module-global `pendingGroup` means
   temporally overlapping groups merge. Done = explicit group
   tokens; commits join only their token's group; nested same-token
   joins, temporal overlap never merges. Build FIRST — 221 stacks
   on correct group identity.
2. **RAG/AI-IMP/AI-IMP-221-gallery-undo-coordination.md** — the
   gallery action bar + trash view issue raw envelopes
   (GalleryActionBar.svelte, TrashView.svelte); bulk verbs never
   reach the coordinator; CA-005 stale redo. Done = every bulk
   verb is ONE undo group per gesture (trash n / tag n / restore),
   `RestoreRecord` joins structural undo (inverse re-trashes),
   empty-trash stays honestly outside.
3. **RAG/AI-IMP/AI-IMP-270-create-and-attach-redo.md** — the
   convicted CreateNoteAndAttach redo defect (inverse:null → replay
   collides with the trashed title-reserving row). You convicted
   this one yourself in the caption sitting; the ticket carries the
   RestoreAndAttachNote-shaped fix direction.

## Normative supplement (post-dates the tickets — binding)

The lifecycle bundle rulings are ratified and BIND this range
where ticket text is older:

- **GR-4 R1 scope**: "every commit path reaches the coordinator"
  governs USER GESTURES ONLY. The AI-IMP-271 tag-sync system
  writes (direct ProjectService envelopes in typed utility ops)
  are deliberately outside the ledger and MUST NOT be routed
  through the coordinator or disturbed. Do not "fix" them.
- **GR-4 R2 / G2+G5 R1-R2**: one gesture = one entry, bulk
  included; partial failure splits the receipt (toast counts),
  never the group; the shipped summary-toast copy is ratified
  verbatim — do not reword.
- **G2+G5 R3**: restore is undoable, purge is not — empty-trash
  never joins undo; its impact-as-fact confirm is ratified as-is.
- **G2+G5 R4**: the inverse of a bulk verb RE-SELECTS what it
  brings back (undo restores the selection too). If the selection
  seam makes this expensive, say so in round 1 rather than
  building it degraded.
- **GR-4 R5**: any new user commit after undo clears redo,
  unconditionally (the 230 seam is law).

## Fences

- Renderer/undo domain only: `apps/desktop/src/renderer/undo/`,
  the gallery/trash/note surfaces the tickets cite, and their
  tests. NO schema work — there is no migration number assigned
  to this range; if you believe you need one, STOP and say so in
  a submission (0009/0010 are taken; do not touch migrations).
- Do not touch: `RAG/` beyond the three assigned tickets (never
  INDEX.md / HUMAN-TESTING.md / DESIGN-QUEUE.md), `.github/`,
  `packages/persistence/src/migrations/`, `apps/desktop/src/main/`
  (the updater ticket is being lead-built there in parallel —
  collision risk), `e2e/outline.spec.ts` (fresh 277 pins).
- Validation: `set -o pipefail` on every chain; full
  `CI=true pnpm check` at the tip (build + units + lint + spike +
  e2e — read counts, not exit codes; report the failed line if any
  exists); `pnpm -r build` before any e2e run.

## Report contents (each round)

Per PROTOCOL.md, plus: counts for every suite you ran (packages /
desktop units / e2e), the undo-policy matrix diff if you touch
UNDO_POLICY (231/221 will — UnassignTagFromNode stays exempt, that
reclassification belongs to a FUTURE T2 ticket, not this range),
and candid friction notes — they feed the wave retro.
