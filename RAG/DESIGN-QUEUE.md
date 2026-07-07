# Design queue

Decisions that need a finalized design conversation (owner + lead,
sometimes the first tester) before implementation proceeds.
Compiled 2026-07-06 at the strategy review; keep it pruned like the
flush list — resolved items move into the RFC and leave.

## Blocking planned work

- **Context-menu grammar** (AI-EPIC-016): the per-kind verb
  inventory and ordering; PureRef reference captured in the stub —
  adopt selectively. (The §8.8 ladder IMP can proceed without
  this; the menus themselves cannot.)
- **Library door placement** — RATIFIED 2026-07-06 (owner): ONE
  ⧉ menu, TWO sections — "Your library" pinned and visually
  distinct above a divider, worlds below; library opens
  gallery-first. Still gets bashed at the design pass (watch for
  too-subtle section styling), but this is the working shape for
  the switching ticket.

## Blocking epic activation

- **Frames design turn** (AI-EPIC-017) — RATIFIED 2026-07-06 (rev
  0.54): frames subsume group machinery entirely; nesting with
  single-parent innermost membership; geometry immunity both ways
  (only item drags edit membership). Epic unblocked; visual pass
  (letter item 14) still applies to the look.
- **Rich-text activation** (AI-EPIC-018): TipTap prototype
  go/no-go. (Embed syntax RATIFIED 2026-07-06, rev 0.53:
  Obsidian-style `![[...]]`.)
- **EPIC-008 backup shape** — RATIFIED 2026-07-06 (owner, RFC rev
  0.52 §11.4): end-session + quit + in-place idle checkpoint;
  snapshots always carry db + assets + readable notes tree;
  keep-all retention with Settings size readout; minimal in-app
  restore-to-copy; remote push Advanced, off by default.
  AI-IMP-120/121/122 cut.

## Standing feel decisions (owner's hands, see HUMAN-TESTING.md)

- Zoom τ freeze after the PureRef dial-in (AI-IMP-098).
- Grid: major "breathes" at promotion vs minor sprint (AI-IMP-099).
- Seed artist set: the first tester curates the real example
  (owner supplies the export); placeholder set is provisional.

## Tabled

- Panel chrome vs board-card visual identity (owner, rev 0.31
  discussion): "design team pass" territory with the UI tie-down.
- Text-drop special cases (code blocks, essay-length paste → note)
  (rev 0.36).
- **Undo capture breadth** (from the 2026-07-06 Codex review;
  AI-IMP-114 shipped a deliberate eight-command "gesture-shaped"
  set, narrower than §10.2's all-durable-commands reading): decide
  the target set — do renames, tag edits, appearance switches,
  bookmark edits, and trash/restore join board Mod+Z? All command
  inverses already exist; this is a product-feel call, not
  plumbing.

(URL-as-tag vs source field RESOLVED 2026-07-06, rev 0.53: source
field + domain tag-offer chip.)
