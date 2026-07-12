---
node_id: 2026-07-11-LOG-AI-the-cursor-the-constitution-and-the-setup-day
tags:
  - AI-log
  - development-summary
  - design
  - delegation
  - release
closed_tickets:
  - AI-IMP-277
  - AI-IMP-278
created_date: 2026-07-11
related_files:
  - RAG/RFC-0001-Core-Note-Node-and-Canvas-Model.md
  - RAG/DESIGN-QUEUE.md
  - RAG/skills/wave-orchestration/
  - RAG/CODE-AUDIT-2026-07-11-LOC-MODULARITY.md
  - RAG/scripts/validate-tickets.sh
  - RAG/scripts/approve-loc-review.sh
confidence_score: 0.9
---

# 2026-07-11-LOG-AI-the-cursor-the-constitution-and-the-setup-day

## Work Completed

FIELD REPORT №1 ANSWERED SAME-DAY: alph's "no click is
disorienting" convicted as hover-follow (`onpointerenter` set
selection; NO cursor key existed). AI-IMP-277 lead-built: hover
inert, deliberate selection (click/pointerdown), THREE dialects
at once (arrows/HJKL/WASD — WASD keeps the cleanup loop
left-handed with a pen), org ←/→ (unfold / fold-or-parent), plus
a dialog gate fencing a live capture-phase leak (bare Enter under
the trash confirm reached the verb map). AI-IMP-278 lead-built:
the update perch — launch check (packaged, silent-fail), Settings
Updates row, win/mac tray with template/badged glyphs, narrow
open-download door; e2e never spawns trays.

DESIGN SWEEP (owner rulings, one sitting): no-slug app-wide
(launcher cluster CLOSED; 259 display half unblocked) · second
text-zoom axis killed · release gate informal until 1.0 · updater
shape · rail = lenses + perch (⧉ dissolves into the picker-as-
zoom-overlay + gallery scope; ☰ → title strip; BOARD MENU MOVES
TO THE BOARD'S CRUMB — every menu on the noun it operates) ·
search → UNIVERSAL COMMAND PALETTE (functional ruling; kit
session queued) · dock species split (slim toolbelt + ONE shape
tool with flyout filling toward Miro + one arrange charm popover
+ zoom as corner chrome) · rail position dissolves into the kit
spacing pass.

THE LIFECYCLE BUNDLE: reviewed all ten docs pre-lock (sign-off
with 2 substantive + 3 trivial corrections — T2×sync collision
verified in the planner, GR-4 wording that convicted the ratified
271 system writes); owner's 1.1 rev applied every correction and
added T2 R6 (per-node suppression). RFC REV 0.70 folds the DOMAIN
rulings in (silence budget §8.6; retention-at-open §9.1; end-
session GC §9.8; restore-captured/purge-honest/bulk-one-group
§9.7; user-gesture ledger scope + the birth-group navigating-undo
exception to rev 0.58 §10.2; End Session lives §11.4; T2 remove +
suppression §4.8); presentation grammar stays kit-normative per
the EPIC-028 precedent.

THE SHOP GREW TOOLS: LOC audit (Codex) accepted+merged — boundary
-first, ten R1 candidates, keep-cohesive list; review-currency
ledger accepted+merged (approve-loc-review.sh; Size Watch says
review current/stale by exact blob — live-validated the same day
by 278's +61 LOC). Fresh-eyes skill review (owner + low-context
instance) caught a REAL protocol contradiction (accepted-verdict
still told Codex to delete its own worktree, predating the fence)
— reconciled in the live PROTOCOL.md; skill rev 2 adopted
(constitution section, BRIEF/VERDICT/SPEC/AGENTS/PROTOCOL
templates, amend example) + validate-tickets.sh whose first run
found 27 REAL record defects — all repaired (corpus 334/0), source
templates fixed so they stop breeding. CLAUDE.md carries both new
conventions. RAG/skills/wave-orchestration is the portable
two-model-shop skill.

THE SETUP DAY (owner out tomorrow): triaged all 33 open IMPs
(nothing wrongly open; 093 un-deferred — export shipped; 217 back
to planned; EPIC-007 adopted 219/220/224). Cut SEVEN closure
tickets from the ratified bundle: 279 three-state · 280 missing
exits · 281 named silences · 282 pin arc · 283 board-born · 284
link repair (dep 270) · 285 tag remove (dep 231, MIGRATION 0011
RESERVED). Wrote FOUR assignment briefs for sequential sittings:
trust wave (231→221→270) · sweeps (220→219, after trust) · locks
(264+244, independent) · GR wave (280→281→279→282, after trust).
World wave (283/284/285) briefs after those land.

## Issues Encountered

- Merging from an isolated CLONE needs `git fetch <clone-path>
  <branch>` first — `git merge <sha>` can't see clone objects
  (first sitting through the new flow).
- My premature INDEX regen aborted the first ledger merge (dirty
  file); checkout + re-merge cured it.
- Codex's audit report claimed "worktree clean" while the worktree
  held uncommitted probe/tooling material — fence held, claim
  false; called out in the verdict; the rebuilt ledger submission
  was honest.
- The bundle's GR-4 as-written convicted 271's ratified system
  writes; §10.2 now scopes the ledger to user gestures explicitly.
- B1 R6 vs rev 0.58 decline-in-place was a REAL conflict; resolved
  as the scoped birth-group exception (the only navigating undo).

## Tests Added

277: 3 unit cases (twelve keys, modifiers, parity) + 1 e2e (hover
inert, dialects, fold keys, dialog gate) + 3 hover-select e2e call
sites reworked. 278: 15 units (semver/asset-pick/verdicts); tray
is human-close. Full gates green both (e2e 256 then 255+1 flaky
pre-existing). validate-tickets.sh guards the record corpus
(334/0).

## Next Steps

OWNER FIRES SITTINGS IN ORDER: `.codex/ASSIGNMENT-trust-wave.md`
→ `-sweeps-wave.md` → `-locks-wave.md` (anytime) →
`-gr-wave.md`. Lead reviews per protocol; verdict latency is
pager duty. THEN: world wave briefs (283/284/285). Owner-pending:
lock kit 1.3 + commit the design-dir reorg (audits→RAG/audits
moved on disk, uncommitted; ledger tsv refs want a sed when the
LOC audit moves); v0.24.x tag call for 277+278 (patch tags not
durably authorized); HUMAN-TESTING flushes (update perch, cursor,
axis, one-universe, captions); alph contact on delete-scope
grammar + inspector conversation. Read first: this log,
RAG/INDEX.md kanban, .codex/ASSIGNMENT-*.md, RFC §20's rev 0.70
entry.
