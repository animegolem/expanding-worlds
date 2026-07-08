# Design queue

Decisions that need a finalized design conversation (owner + lead,
sometimes the first tester) before implementation proceeds.
Sibling doc: `RAG/design/DESIGN-GAPS.md` is the kit-coverage
checklist (controls shipped but never drawn) worked by the design
session; conversation items live here, drawing items live there.
Compiled 2026-07-06 at the strategy review; keep it pruned like the
flush list — resolved items move into the RFC and leave. The
2026-07-07 design pass (rev 0.55) resolved the context-menu
grammar, panel/card identity (the note lifecycle), broken-link
style, tooltip shapes, gallery controls, and the settings shape —
all moved into the RFC.

## Blocking planned work

- **Gallery preview + inspector** (alph's first field report,
  2026-07-08 — blocks AI-IMP-204): he double-clicked a gallery tile
  expecting it to expand; nothing happened. His reference model is
  Allusion: single click opens a side panel with a larger preview +
  data + tags, double click shows the whole image. The conversation
  must capture **the reflow** (owner's named concern: what the grid
  does when the panel opens, and what the panel looks like), our
  metadata set (asset facts vs node facts), whether inspector tags
  are editable, the double-click full-view presentation, and the
  interaction with 188's click-away deselect. Candidate first
  design conversation to include alph directly. Follow-on input
  (alph, same day): "idk where these images even came from feels
  fairly opaque" — the inspector's metadata set should answer
  provenance first (source URL/import origin/when), not just
  dimensions.

- **Right-rail membership** (alph's stacking screenshot + owner
  diagnosis, 2026-07-08 — blocks AI-IMP-207 half 2): the rail's
  surfaces are different kinds of thing (full-screen lens, overlay,
  anchored menu, card, OS window) and currently stack. Exclusivity
  is RULED (one open surface, 207 builds it); the conversation
  decides membership — owner's hypothesis: "probably only toggles
  that fully change the lens should be on that right-hand side,"
  and the menu-openers need to be rethought as something else. 207
  drafts the classification table as the conversation's input.

(macOS move/resize chord RESOLVED 2026-07-07: owner ruled GO on
both move AND resize — "I do want the resize… we have so many key
shortcuts anyways, we can handle it." Binding is the lead's
proposal, adjudicated in the feel pass; tracked as AI-IMP-174.)

(Frame sort-control location RESOLVED 2026-07-07: the owner ruled
CHARM BAR — "it has to be in the charm bar"; the drawn title-row
chip retires. AI-IMP-138 revised and unblocked in full. A tabled
note below carries the follow-on question.
Input-grammar unification RESOLVED 2026-07-07 by kit 1.2's "One
voice" ruling — two input variants as grammar, ONE 5px button,
uniform focus ring; AI-IMP-153 sweeps it in.
Pointer-down micro-beats RESOLVED 2026-07-07: the audit landed as
The Two Materials + kit 1.1's beat ledger, ratified at rev 0.56
§8.2. TipTap RESOLVED 2026-07-07: GO on spike evidence, rev 0.56
§7.1 — EPIC-018 active.)

## Standing feel decisions (owner's hands, see HUMAN-TESTING.md)

- Zoom τ freeze after the PureRef dial-in (AI-IMP-098).
- Grid: major "breathes" at promotion vs minor sprint (AI-IMP-099).
- Seed artist set: the first tester curates the real example
  (owner supplies the export); placeholder set is provisional.
- Void tone: rev 0.55 adopts the designed ~22%-oklab mix as the
  default; the feel pass on real art adjudicates.

## Tabled

- **Foreign-Markdown canonicalization is lossy** (AI-IMP-150 finding,
  2026-07-07): constructs outside the frozen dialect degrade SILENTLY
  on first open. Rev 0.66's URL-cluster growth (links, images,
  autolinks, highlight — AI-IMP-170) shrinks the loss to
  tables/footnotes/task-lists. The residue decision belongs to the
  vault-mirror return path's activation; the one rule proposed for
  ratification there: foreign Markdown is never silently destroyed —
  preserve-verbatim or convert-loudly, never quiet.

- Text-drop special cases (code blocks, essay-length paste → note)
  (rev 0.36).
- **Tag REMOVE has no gesture** (AI-IMP-182 finding, 2026-07-08):
  `UnassignTagFromNode` exists with a verified inverse but is
  issued NOWHERE in the renderer — there is no per-node "remove
  this tag" affordance (171's missing-doorknob sibling). Decide
  where removal lives (chip ✕ on the node's tag chips? tag panel
  row action?) — then it's a small ticket, and its capture wrap is
  one line (the 182 pattern). Also from 182: the gallery bulk bar
  and mirror recognition chip carry their own uncaptured tag-add
  copies — same one-wrap shape when ruled.
- **Frame charm-bar crowding** (owner note, 2026-07-07, at the
  sort-control ruling): putting frame controls in the charm bar
  "opens us up to think more eventually" — is there a conversation
  about whether deep-nested/many-frame charm clutter matters, and
  does anything else migrate into the frame's bar? No work waits
  on this; revisit when frames see real use.
(Undo capture breadth RESOLVED 2026-07-08, owner ruling on the
lead's reframe: EVERY deliberate verb joins Mod+Z — appearance,
renames, tag edits, detach, bookmark edits, "free size rotating,
all of those should definitely be covered" — EXCEPT node-trash,
which keeps the Trash as its recovery home. Explicitly a
feel-tested ruling: trimming a verb back out is one line each if
the week's testing says so. Lands with the AI-IMP-173 fix wave.)

- **iPad companion / V2 shape** (owner, 2026-07-08, tabled until
  after testing week): the coherent V2 sketch — desktop app paired
  with an iPad app (Tauri v2 shell + system WebKit hosting the SAME
  renderer packages; PencilKit for pencil ink, plausibly as a new
  decoration kind), with GIT AS THE SYNC REPOSITORY between the two
  (the FR-7 snapshot engine already plants this flag). Key lead
  observations recorded at capture: the desktop does NOT need
  converting off Electron for this — the sync format is the
  contract between apps, not the runtime; the hard design work is
  sync SEMANTICS (mergeable state representation), git is just
  transport; the Electron main/node:sqlite half is cleanly seamed
  behind packages/protocol, so a Rust persistence port is a fenced
  job. Refinements (owner, 2026-07-08 follow-on): pricing shape
  ADOPTED as intent — SELL the iOS app (~$5), desktop stays free
  direct-download ("I do think I would like to do that"); perf
  floor = the owner's 2020 iPad Pro ("if the 2020 iPad can ride
  it, we're fine") — spike on that exact device; and the owner
  suspects desktop converges onto the Rust/Tauri backend
  EVENTUALLY anyway once it exists (lead agrees: after the iPad
  port the Electron shell is the odd one out — the ruling is
  "not a prerequisite," not "never"). Context shift recorded: the
  project is now ALSO a resume piece / product story for the
  owner, which raises the weight of EPIC-019 (public face),
  signing/notarization, and store presence.
- **Undo capture breadth — superseded original entry** (from the 2026-07-06 Codex review;
  AI-IMP-114 shipped a deliberate eight-command "gesture-shaped"
  set, narrower than §10.2's all-durable-commands reading): decide
  the target set — do renames, tag edits, appearance switches,
  bookmark edits, and trash/restore join board Mod+Z? All command
  inverses already exist; this is a product-feel call, not
  plumbing. Sharpened by the 2026-07-07 Codex review of PR #9:
  **Delete-frame** commits `TrashNode`, which Mod+Z cannot reach —
  §8.4 says every menu verb is one undoable command, but §9.6/§9.7
  route NODE recovery through Trash restore, and capturing
  `TrashNode` would create dual recovery paths. Decide which
  section bends (a reflexive Mod+Z after Delete-frame today
  silently undoes the PREVIOUS action instead — that surprise is
  the cost of waiting). The decoration-verb slice is already
  fenced as AI-IMP-154 and does NOT wait on this.
- **Dot-palette regularization** to `oklch(.76 .09 h)` (design
  pass, explicitly unratified): make the call with real art on the
  board — style-kit turn territory.
- **Charm rail vertical position**: top-aligned below the path
  track shipped in UI Vision v2; vertical centering considered and
  left open. Trivial code change whenever decided.
- **Manual note side-flip verb** ("open on the other side"):
  deferred until asked for (Note Lifecycle Document).
- **Object shapes** (owner musing, Icon Document t7): extruded
  box/pyramid/cylinder decorations for lightly skeuomorphic maps —
  awaits the decorations epic turn.
- **Book-cover-opens beat** (~200ms, musing): a one-shot world
  beat when a note first opens; feasibility at build.
- **Painterly icon commission / pixel-glyph theme variant**: the
  geometric SVG set ships; commissioned art is the upgrade path.
- **Menus loose ends** (Menus Document): where reverse-image "find
  info" slots when its connector attaches; whether the End Session
  row prints what it does; the Empty-trash confirm shape.

(URL-as-tag vs source field RESOLVED 2026-07-06, rev 0.53: source
field + domain tag-offer chip.)
