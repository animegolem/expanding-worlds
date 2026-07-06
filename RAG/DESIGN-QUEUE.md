# Design queue

Decisions that need a finalized design conversation (owner + lead,
sometimes the first tester) before implementation proceeds.
Compiled 2026-07-06 at the strategy review; keep it pruned like the
flush list — resolved items move into the RFC and leave.

## Blocking planned work

- **Trash browser shape** (AI-IMP-102, EPIC-007): door placement
  (☰ vs takeover), grouping, restore-navigates-or-not. Owner wants
  explicit review before any build.
- **Context-menu grammar** (AI-EPIC-016): the per-kind verb
  inventory and ordering; PureRef reference captured in the stub —
  adopt selectively. (The §8.8 ladder IMP can proceed without
  this; the menus themselves cannot.)
- **Library door placement** (project switching): library is
  functionally a project but the owner leans AGAINST listing it in
  the world-switch menu (initial-read clarity). Lead's proposed
  middle path: ONE ⧉ menu, TWO sections — "Your library" pinned
  and visually distinct, worlds listed below; library opens
  gallery-first. Decide before switching ships.

## Blocking epic activation

- **Frames design turn** (AI-EPIC-017): rev 0.38 shaped it; the
  epic still wants a sit-down on membership edge cases and the
  group-machinery subsumption question before cutting IMPs.
- **Rich-text activation** (AI-EPIC-018): TipTap prototype
  go/no-go; embed syntax pick (`![[...]]` vs `![](ew-asset://)`).
- **EPIC-008 backup shape**: owner direction is a local git store
  snapshotting the db at checkpoint/sleep moments (a poor-man's
  event log) + an Advanced connect/upload-remote setting — needs a
  design pass on cadence, retention, and repo layout before
  cutting.

## Standing feel decisions (owner's hands, see HUMAN-TESTING.md)

- Zoom τ freeze after the PureRef dial-in (AI-IMP-098).
- Grid: major "breathes" at promotion vs minor sprint (AI-IMP-099).
- Seed artist set: the first tester curates the real example
  (owner supplies the export); placeholder set is provisional.

## Tabled

- Panel chrome vs board-card visual identity (owner, rev 0.31
  discussion): "design team pass" territory with the UI tie-down.
- URL-as-default-tag vs a first-class source field (rev 0.35
  wrinkle): decide when text drops activate.
- Text-drop special cases (code blocks, essay-length paste → note)
  (rev 0.36).
