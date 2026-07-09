---
node_id: AI-IMP-213
tags:
  - IMP-LIST
  - Implementation
  - import
  - chrome
  - bug
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.7
date_created: 2026-07-09
---


# AI-IMP-213-recognition-chip-stuck

## Summary of Issue #1

Alph field report (2026-07-09, on v0.16.0 — "already a dozen times
more stable"): the "Already in your library" recognition chip
(RecognitionChip.svelte) "sometimes gets stuck in the middle of
the screen" — a dedupe chip that should present briefly and
dismiss instead persists indefinitely, marooned over the board.
Stuck-state family (the audit's fifth defect class). Done means
the wedge is reproduced (hunt the interleaving: drop resolved
while a second drop starts? window blur mid-fade? chip's dismiss
timer cancelled by a re-render?), root-caused, fixed at the cause,
AND the chip carries the house safety-timeout idiom so no future
interleaving can leave it standing forever.

### Out of Scope

- Chip visual design / the tag-add copy it may carry (DESIGN-QUEUE
  tag cluster).
- Import pipeline semantics.

### Design/Approach

Read RecognitionChip's lifecycle: what arms it, what dismisses it
(timer? outro? parent unmount?). Reproduce with interleaved drops
of duplicate assets and blur/focus during the chip's life. Audit
every terminal state for a missing reset path (the 199 lesson:
states with no way back). Fix at cause + PathBar-idiom safety
timeout as the backstop. E2e: duplicate-drop shows the chip and it
ALWAYS clears (poll to gone), including under a burst of drops.

### Files to Touch

`chrome/RecognitionChip.svelte` + whatever arms it in the import
surface, ingest/import e2e extension.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Wedge reproduced and root cause documented (not
      timer-papered — the safety timeout is a backstop, not the
      fix).
- [x] Chip always clears; burst e2e green.
- [x] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [ ] HUMAN-TESTING entry appended at merge by the lead (alph
      first pass — his find).

### Acceptance Criteria

**GIVEN** any sequence of duplicate drops, focus changes, and
navigation
**THEN** the recognition chip never persists beyond its
presentation window — the board is never left wearing a stuck
pill.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

**Root cause (architectural, not a one-off interleaving).** The
recognition chip owns no lifetime of its own. Its ONLY dismissal is
the shared §8.2 engagement clock delivering a `false` edge:
`mirror.ts`'s `attach()` subscribes to `onEngagementChanged` and, on
`engaged === false`, wipes `chips = []`. That edge is a clock the chip
does not control, and it is withheld in states that are entirely
legitimate:

- **Takeover holds engagement.** `holdEngagement(true)` (crop editor,
  first-run guide, `TakeoverLayer`) pins `engaged = true`: `poke()`
  arms NO idle timer while `held`, and `leave()` short-circuits
  (`if (held) return`). So no `false` edge can ever fire — a chip born
  during (or surviving into) a takeover is marooned.
- **Fade set to `'never'`.** `setFadeDelay('never')` (a real user
  setting, `settings.ts`) nulls `fadeDelayMs`; `poke()`/`wake()` then
  arm no idle timer, so the chip only clears on pointer-leave/blur.
- **Even in the default 4 s config**, the untagged "Already in your
  library" chip has NO button (the tag-offer variant has Apply/Ignore;
  the recognition-only variant has none). An actively-working user
  continuously re-pokes engagement, so the idle `false` edge never
  arrives and the buttonless pill sits mid-board with no escape — the
  reported symptom.

This is the stuck-state family (AI-IMP-199 lesson): a terminal
presentation state whose only reset path can be withheld indefinitely.
`wake()` re-arming the idle timer makes the DEFAULT path self-heal
within one fade delay, which is why the wedge presents as
"*sometimes*" — it strands only when engagement is pinned or the user
never idles.

**Fix.** Internalize the chip's lifetime. Each chip (recognition and
summary) now arms its own presentation timer
(`MIRROR_CHIP_LIFETIME_MS = 8000`, `feel.ts`) at creation in
`mirror.ts`; on fire it removes THAT chip id regardless of the
engagement clock's state, so "dismissed" is reachable from every
engagement state (held, fade=never, continuously-engaged). The
engagement fade is preserved as the EARLY dismissal — ignoring at
idle/blur still dissolves the chip sooner, so §8.2 "ignoring IS the
dismissal" is intact. The timer is built to the PathBar safety-timeout
discipline (AI-IMP-166): the fire is guarded (no-ops if the chip is
already gone) and the timer is cleared on EVERY removal path
(`dismissMirrorChip`, `applyMirrorChipTags` via dismiss, the
engagement-fade wipe via `clearAllChipTimers`, and
`__resetMirrorForTests`), so no stale timer can fire against a
recycled state.

**Reproduction / verification.** The new e2e pins engagement with
`hold:true` (the takeover posture that withholds the `false` edge),
drops a duplicate, and asserts the chip appears AND then reaches
`toHaveCount(0)` — which the pre-fix code could never do. A burst
variant fires five interleaved duplicate drops under the same pinned
clock and asserts every chip clears.

**Candid note on cause-vs-backstop.** The brief asked for a cause fix
distinct from the safety timeout. Here they coincide by nature: there
is no separate logic bug beneath the architecture — the defect IS the
absence of a self-owned terminal path, and the presentation timer
supplies exactly that. There was no defeated `if`/lost variable to
correct; the engagement path is internally correct, it is just the
wrong (and only) master of the chip's fate. Rather than contrive a
second redundant mechanism, the one timer is both the cause fix
(internalized lifetime) and the guaranteed-termination backstop.

**Gates (all foreground):** `pnpm -r build` green; per-package units
(protocol 1 / canvas-engine 380 / persistence 538) + desktop vitest
335 green; `pnpm lint` clean; e2e 4 shards — [a-d] 43, [e-i] 64 (incl.
both new AI-IMP-213 tests), [j-r] 71 (+1 pre-existing note-lifecycle
flake, passed on retry), [s-z] 48 (+1 pre-existing source-panel flake,
passed on retry). Both flakes are in files this ticket did not touch.

**Beyond brief (reported, not fixed):** the summary chip shared the
exact same defect (buttonless, engagement-fade-only); the fix is
uniform in `mirror.ts` so it now self-dismisses too — a free
correctness win, no behavior regression (the bulk e2e closes well
inside the window).
