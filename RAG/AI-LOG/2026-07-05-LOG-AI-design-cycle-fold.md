---
node_id: 2026-07-05-LOG-AI-design-cycle-fold
tags:
  - AI-log
  - development-summary
  - design
  - RFC
closed_tickets: []
created_date: 2026-07-05
related_files:
  - RAG/RFC-0001-Core-Note-Node-and-Canvas-Model.md
  - RAG/AI-EPIC/AI-EPIC-006-shell-and-local-scope.md
  - RAG/AI-EPIC/AI-EPIC-013-global-views.md
  - RAG/AI-EPIC/AI-EPIC-014-library-and-cross-project-sourcing.md
  - RAG/Design-Artifacts-v1.0.zip
confidence_score: 0.95
---

# 2026-07-05-LOG-AI-design-cycle-fold

## Work Completed

A documentation-and-design session, no application code. The owner
ran a multi-turn UI design cycle with a design consult (14 wireframe
turns, two feedback letters authored here, two reply memos) and the
results were folded into RFC-0001 across three revisions:

**Rev 0.17 — the shell model.** §8.2 replaced wholesale: the window
is the board, two-scopes-two-physics (node-local panels anchored to
what summoned them; global takeovers), charm rail, dock, engagement
cadence, tooltip rule; workspace tabs, the docked note pane, and the
status strip retired. §8.1 gained navigation chrome (path as
rendered back-stack, gesture-first back/forward, bookmark menu whose
drag order IS the Mod+1–n binding). New §8.4–8.6: charms + click
grammar (Q3 resolved), tethered/pinned note panels with the
escalating indicator rule, toasts + the ⚠ ongoing-state perch.
Cursor zones replaced drawn selection handles (§6.9). Tag surfaces
(panel, lens, three doors) landed in §4.8 with the domain unchanged —
the design cycle's frontmatter-tags idea was argued down and the
rejection recorded. EPIC-006 rewritten as shell-and-local-scope;
EPIC-013 (global views) cut.

**Rev 0.18 — the library direction.** Q14 resolved into §14.4
(self-contained deferred scope): library entries are unplaced nodes;
a library is internally a project; projects source, never reference
(read-only source opening, ingest by hash-copy); tags cross borders
by decision; the placement picker is the compressed gallery; export
size preflight (report once per project, no hard limiter); first
open teaches by a clearable public-domain example. EPIC-014 stubbed.

**Rev 0.19 → 0.20 — the tag hierarchy round trip, mirror, export.**
Hierarchy was accepted as a single-parent organizing tree (0.19) and
dropped by the owner within the same cycle (0.20); both the decision
and the reversal are recorded in §4.8/Q8 so the road not taken is
documented. Kept from 0.19: the inbox mirror (drops anywhere also
import into the library, one-way, hash-recognized, never blocking)
and the escape-hatch export (notes as Obsidian-readable Markdown
with optional ![[...]]-linked uses sections, originals + tag
manifest, every canvas as a full-resolution render). Rev 0.20 also
folded the final memo: gallery/outline naming and rail order, source
panels from the project charm, seed explainer as an ordinary pinned
note, mirror moments with ignore-as-dismissal, export as a ☰ sheet,
and Q20 closed — the pin becomes a dock tool (◉, N) and the Create
Pin dialog retires when it ships.

Canonical design artifacts live beside the RFC as
RAG/Design-Artifacts-v1.0.zip — a living artifact, versioned from
1.0 and replaced in place as design evolves (owner's call). Working
letters and intermediate exports deliberately not committed.

## Session Commits

d2f26dc→b39a65b rev 0.17 in seven cluster commits; 88903f7 epic
restructure; rev 0.18 library + seeded example + EPIC-014 (three
commits); rev 0.19 hierarchy/mirror/export (three commits) + epic
alignment; rev 0.20 hierarchy drop, memo fold, Q20 close, epic
naming, archive/cleanup (five commits). All pushed.

## Issues Encountered

A rev 0.18 edit silently ate the "# 15" section heading (caught in
the rev 0.20 pass — pandoc converts fine without it, so the check
did not catch it; heading-count deserves a glance after large
insertions). The tag-hierarchy reversal cost a full sweep of nine
touchpoints (invariant 8, cardinality table, non-goals, Q8, §14.4
border rules, both epics) — worth remembering that "accepted
briefly then dropped" is two sweeps, which is exactly why the
discuss-then-batch protocol exists. Three judgment calls made while
folding reply 1 diverged from the design consult's words (text-first
link following, subject-node tag chips, charm corner) — flagging
them explicitly in letter 2 got all three confirmed cheaply;
silent-divergence flagging should stay standard practice.

## Tests Added

None — documentation session. All gates untouched; tree clean.

## Next Steps

EPIC-006 (shell-and-local-scope) activates next: cut IMPs from its
thirteen FRs. Suggested seams: chrome frame + cadence + tooltips;
navigation chrome (path/bookmarks); charms + click grammar + cursor
zones (this retires drawn handles — e2e that clicks them must
migrate); note-panel rehost (the CM6 controller ports unchanged —
container work only); toasts + perch (retire StatusStrip and
retarget recovery.spec in the same ticket); pin dock tool. Read
Design Spec v2 (in RAG/Design-Artifacts-v1.0.zip beside the RFC)
before cutting — it is the visual authority. EPIC-006 ships as v0.6.0 per the release ritual. Open
design turns queued for a future cycle: gallery keyboard model
(Q26), OS-drop importer dialogue (Q27).
