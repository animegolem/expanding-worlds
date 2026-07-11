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

- **Home, board identity, and the launcher question** (alph + owner,
  2026-07-10, ACTIVE DEBATE — parked mid-conversation; blocks the
  display half of AI-IMP-259 and any board-naming work). One
  cluster, four faces: (1) should Home be a board at all? alph's
  PureRef instinct: home is a launcher — drop zone + recents —
  that "becomes a board when you interact and you name it when you
  save." Owner's counter-shape, alph-endorsed as fair: don't SHOW
  Home; each canvas on Home is the root of its own tree ("this
  town with these places and these people"). Lead position
  (2026-07-10): the tree model is load-bearing for recursion and
  should not unwind — this is a PRESENTATION question; launcher
  affordances can be Home's empty state while spatial Home remains
  once content exists. (2) The no-slug display rule: no surface
  ever shows a raw id (`2xajxshy` sightings in outline + path);
  root renders as ⌂/Home; untitled boards need a display fallback —
  owner floated "numbered until a name is set in the node's note."
  (3) Where board names LIVE (the node's note title?) and the
  naming gesture on save. (4) alph's scaling worry: "a few dozen
  boards... maybe we need more of a grid view" — Home's density
  story. Also note alph's layer-mapping: his "home common to all
  worlds" is our PROJECT PICKER, not the root canvas — the recents
  strip may belong at the app tier, not in-project. Resolve
  together; pieces land in RFC §4/§8 and unblock 259's display
  half. UPDATE (same day, after alph clicked a board ring and
  understood it): "home can stay the way it is... I'd like this as
  a way to view the different starting worlds" — SPATIAL HOME IS
  ENDORSED by the tester; the launcher question narrows to Home's
  empty-state affordances and the naming/display rules. The
  blocking bug he hit instead is label legibility (AI-IMP-262).
  DIRECTION SET (owner, same day, later in the session): the
  launcher UI is THE PROJECT PICKER, not Home and not in-project
  at all — it lists projects as covers with recents, and its
  creation gesture is dropping an image: that MAKES A NEW PROJECT
  seeded by the image (PureRef's "becomes real when you interact,
  name when you save" mapped to project birth). Home stays an
  ordinary spatial board inside each world; NO drop-on-Home board
  rule (explicitly rejected). Grid worry resolved as select →
  group → arrange with the existing frame grammar (alph: clusters
  by personal/school/work/diary). Domain model untouched — this is
  app-tier chrome. Remaining for the build conversation: cover
  source (auto Home thumbnail vs chosen image), where the dropped
  seed image lands (placed on Home vs inbox), naming moment (at
  drop vs deferred), plus the still-open naming/display rules and
  Home empty state.
  **OWNER RULINGS (2026-07-10 late):** cover source — the DROPPED
  IMAGE IS THE COVER (a board is always associated with a cover
  image), plus optionally a pin-like choose/upload-cover button;
  naming — NOT forced: the picker displays COVERS, a name only
  when one is set ("it could just be covers unless you add a
  name"); Home empty state — HOME STAYS A PURE BOARD (no picker
  affordances echoed inside it). Still open: where the dropped
  seed image LANDS in the new project (placed on Home vs inbox),
  and the no-slug display rules (now dovetailing with the
  control-panel outline's "unnamed #1–6" rendering).
  SEED RULED (owner, same night): the image does NOT land in the
  project at all — no placement anywhere; it lives as the COVER,
  surfaced where covers surface (the picker, and the revamped
  outline showing the cover when hovering Home). Only the
  no-slug display rules remain from this cluster.

- **Reading a note on the board — the open-verb as a camera verb**
  (owner, 2026-07-09, HIGH — direction RATIFIED same day: "I think
  you're right"; the detailed ruling below still needs its answers
  before build). The bound book is
  world content: shared edge locked to the image, 300-world-unit
  free axis, everything scaled at camera zoom, legibility guarded
  only by the 48/8px page-chrome ladder — so at board zoom the
  open note is an unreadable strip BY DESIGN, and none of the
  patch options survive contact (hold-at-floor breaks the ring
  seam; px minimums make text overflow a world frame; open-in-
  held-panel abandons the book). The owner's emerging answer:
  **opening a note IS a zoom** — "when I hit note, it should be
  zooming in to fill my viewport; this whole viewport should
  basically be the note." Lead analysis at capture: this is
  coherent and already in the app's grammar — flyTo/CameraFlight
  is the shipped primitive, the book stays pure world content (no
  broken seams, no held scales), and readability is guaranteed by
  the CAMERA, not the panel (world-scaled text at reading zoom ≈
  scale 1, which is exactly the case that already works). Every
  infinite canvas has unreadable text at distance; the camera IS
  the reading mechanism — we'd be automating the lean-in as the
  open gesture. Questions the ruling must answer: does close fly
  BACK (store the pre-open framing)? what's the big editor's
  remaining role (essay-length? keyboard-first?)? tiny images at
  reading zoom (the bound seam drags the image huge — fine as
  context, or cap?); does 200's held floor stay for pinned/free
  panels (lead: yes — this ruling is about the BOUND book);
  interaction with the Parking Lot item "OS zoom controls resize
  note text independently" (a second, text-only zoom axis — decide
  whether it folds in or dies here). Related: the pin-wizard vs
  note-creation unification pass (Parking Lot) and AI-IMP-211's
  palette, whose "create opens the note" lands wherever this
  ruling puts reading.
  **Alph's counter-frame (2026-07-09, Discord):** notes as
  CAPTIONS — a truncated caption under the image ("showing up as
  captions w/ a cutoff") that expands/opens as a floating window;
  he questions the tethered side panel outright ("idk if there's
  an elegant solution to having the note pop up on the side
  especially if it's meant to disappear"). Lead read at capture:
  strong and on-genre (the soul statement is tumblr × pinterest,
  and captions are that genre's native text presentation), and it
  does NOT compete with the camera verb — it reframes the AMBIENT
  tier. Three-tier shape emerging: caption (glance — world
  content, persistent, rides the 216 fade ladder), reading (the
  deliberate act — owner's zoom-to-fill OR alph's floating window;
  the conversation picks the default), big editor (long writing).
  Watch-outs: caption noise on dense boards (needs the fade +
  maybe per-placement/board toggle — labelVisible is the
  precedent); the cutoff rule (lines vs chars); a caption REPLACES
  the label for noted placements (never stack); overlap with the
  existing card appearance — decide whether the caption IS the
  card matured. **Owner's concrete working spec for the zoom
  experiment (2026-07-09):** open → viewport zooms so the note
  fills most of the open space beside the image, centered; detach
  → zoom-out viewport move; close → restores the original zoom.
  Alph is wireframing his version; semi-functional mockups to be
  worked up with the design session.
  **DECODED (2026-07-09, second Discord pass — owner: "I get it
  now, it's not as far out as we were thinking"):** alph's ask is
  not about where text goes — it's that image + caption must be
  ONE CONNECTED OBJECT, a CARD. His references: the Pinterest tile
  (image with its left-aligned title inside one tile boundary) and
  a polaroid-style mat (image matted on a card whose bottom band
  carries the caption). His words: "can the note be encased in a
  card/border around the image? … beyond being centered under them
  there's little visual connection — one of the more subtle blocks
  I've felt"; on today's rendering: the title is "disconnected
  text, not a card … hierarchically not clear"; acceptance in his
  own words: "as long as it feels connected." Owner's sketch
  direction: maybe the outer edge of a book cover on either side,
  like a border. Lead note: this is plausibly the existing §4.6
  CARD APPEARANCE matured (note-body preview cards) and pure Two
  Materials territory — the mat IS paper the art sits on. The
  refined lifecycle: card-with-caption (glance, one object) →
  expand to reading (the zoom experiment / floating window) → 
  collapses back to the card. OWNER IS DRAFTING the authoritative
  Note Lifecycle Document to work from; this capture is its input.
  **THE DEEPER CUT (2026-07-10, third Discord pass — the caption's
  domain identity):** alph's real hangup is IDENTITY-FORCING, not
  rendering: "creating a note means registering a full blown
  concept/idea… I couldn't write 'I like the blue' 'I like the
  purple' 'I like the red' without attaching a new note to every
  single image and giving it a title… hardly an idea worth
  registering"; "eventually the outline is full of 'nice contrast
  here' 'reference this logo'… that kind of clutter would really
  bother me"; "exhausted at the thought of having to title every
  single one of my thoughts." He named the fix himself: caption
  vs note as a real distinction, promotion later ("maybe you can
  turn it into a note later and give it a title then"). LEAD
  PROPOSAL (2026-07-10, relayed to owner): the CAPTION as
  subordinate text ON A PLACEMENT — created by a verb on the
  image, renders under/with it (the 07-09 card mat), moves and
  deletes with it; NO title, NO node, NO note, NO outline row;
  FTS-indexed scoped to the image (search finds "borrow for
  scars"; the tree never shows it — answers his archiveability
  worry and the owner's auditable-data principle at once); a
  Promote-to-note verb completes the escalation ladder (phantom →
  note; caption → note), title asked at promotion. REFUSED at
  proposal: the node-gets-title/note-is-body restructure (alph's
  alternate framing "make the image itself the title" — core-model
  surgery that solves where titles LIVE when the pain is that a
  thought is FORCED to have one) and sentences-in-the-title-bar
  (kills outline/graph for him, he sees it). Overlaps to settle
  in the session: caption vs the §4.6 card appearance (likely the
  SAME object — the card's bottom band IS the caption), caption
  vs title label (a caption REPLACES the label, never stack —
  already captured above), one-per-placement vs many, and the
  schema home (placement property vs anchored decoration). Needs
  an RFC section before build; migration number reserved at cut.
  OUTLINE FACT-CHECK (2026-07-10, lead, against getOutlineTree /
  queries-structure.ts:656): the outline surfaces ONLY canvases,
  placed nodes (placement JOIN node), unplaced nodes, and loose
  notes — DECORATIONS NEVER APPEAR, and they are absent from
  search too. So the TEXT TOOL already has the no-registration
  property alph wants (the owner's in-thread "the outline is
  tracking everything so the text tool would just also be there"
  was wrong); what paint lacks is BELONGING — attachment to the
  image, search visibility, promotion. The caption is the text
  tool growing a spine, not a new register. Named tension for the
  session: a searchable caption is the app's first searchable-
  but-not-outlined text — deliberate, but §11/§14 must say it out
  loud (a search hit on a caption points at the IMAGE, implying
  no tree location).
  **CAPTION RESOLVED (2026-07-10, owner ratified the seven-point
  proposal with two amendments — RFC rev 0.68 §4.5, tickets
  AI-IMP-266/267, migration 0009 reserved):** per-placement;
  replaces the label; menu verb + caption charm; promotion via a
  title-or-body ROUTING DIALOGUE with save-this-choice persisting
  an app setting (owner amendment); FTS deferred with scope; the
  MAT/CARD visual maturation deliberately held until alph reacts
  to the mechanics ("ship the feature, see if he even likes it
  before visual design work"). The mat question stays QUEUED here
  as part of the card/lifecycle rendering conversation above; the
  identity/register half leaves the queue.

- **Text-tool promotion + the outline as a data control panel
  (alph + owner, 2026-07-10 late — two asks, one loop).** (a)
  alph: let TEXT-TOOL paint promote to a note, and let notes be
  "their own asset on the board." Lead read at capture: the first
  half completes the register ladder laterally — paint → note
  joins caption → note, and AI-IMP-267's promotion machinery
  (routing dialogue, remembered choice, conflict variant) is
  built to be reused; the second half largely EXISTS as the §4.6
  card appearance (a note as board content) — the ask may be a
  discoverability/maturity gap, not a missing feature; verify
  with him before building anything. (b) The owner's OCD-LOOP
  framing, alph-endorsed ("that sounds awesome"): design for the
  compulsion to clean up — surface incompleteness (untagged,
  unnamed, uncommented) as visible, satisfying-to-clear state,
  because that loop IS how people come to manage their stuff as
  data. Concrete sketch from the Discord thread: the OUTLINE
  revamped as a control panel of the open board — per-row
  tagged/untagged state, a sidebar rendering the row's asset,
  direct add-comment/note from the row (placeholders replaced),
  unnamed things shown as "unnamed #1–6" (ties directly into the
  no-slug display rules in the Home/launcher cluster). Wants a
  design pass with the note-lifecycle work; the tagged-state
  column also depends on the traveling-tags ruling landing first.
  TEXT-TOOL RULING (owner, same night): promotion is GO — "build
  it out of the assets we have now"; a special text-asset class
  is a possible LATER shape, not this build.

- **The touch/pencil design pass (owner directive, 2026-07-10
  late — the frame for the NEXT design pass).** "All of our
  assets are a little bit provisional… redesign the major
  surfaces with the mind of: how does this app work if you have
  to use your big grubby fingers or a pencil to control it?"
  Assessment at capture: "I don't think we're terrible there,"
  but every surface conversation from here (note lifecycle,
  control-panel outline, launcher picker, right-rail membership)
  should carry the touch/pencil question as a standing column —
  this is the iPad/V2 shape (tabled entry below) reaching
  forward into desktop surface design. Feeds the owner's
  in-progress design-session documents.

- **Library activity log / notification inbox (owner,
  2026-07-10, born from the tags sync ruling).** Bidirectional
  settle-moment sync needs announced changes; announcements need
  a HOME: a notification-log surface, probably part of the
  library — "visibility into the overall activity" (tags updated
  from the library on open, tag manifests applied on library
  open, sync verb results, later: snapshot/projection events).
  Shape TBD with the tags epic; the principle is ruled — inbound
  changes are never silent, and the log is where they account
  for themselves.

- **The canonical projection (CONVERGED 2026-07-10, both Fables +
  owner; awaiting formal §11/§16 ratification at the strategy
  review):** a deterministic text serialization of the domain
  becomes the canonical diff/sync/longevity artifact — the
  DUAL-ARTIFACT ruling: projection as canonical text, SQLite as
  runtime engine and restore fast-path. Git snapshots commit the
  PROJECTION instead of the binary db (kills repo bloat, makes
  history diffable, unlocks git-as-sync); the .ewproj ships BOTH
  (VACUUM INTO + hash manifest undisturbed — the safety-critical
  restore path pays no serialization tax). Design-Fable's three
  conditions, ratified INTO the ruling, not as follow-ups:
  (1) **Verified projection** — the dual-artifact failure mode is
  silent disagreement; CI proves the round trip (db → projection →
  rebuilt db → projection) byte-identical, and export REFUSES to
  produce an archive whose db and projection disagree. (Lead note:
  this is the 229 verify-before-rename idiom generalized — the
  archive already refuses on hash mismatch; the projection joins
  the same manifest discipline.)
  (2) **Determinism is a specification** — pin: canonical float
  formatting (SQLite REAL → JSON is the classic divergence),
  Unicode normalization for note text, newline policy,
  null-vs-absent policy, ordering WITHIN collections (UUIDv7
  makes ID-order stable AND meaningful). Representation lean:
  ONE RECORD PER FILE (sharded dirs by UUID, the blob-store
  sharding pattern) over JSONL — in git, merge granularity equals
  file granularity, so desktop-edits-A / iPad-edits-B never
  textually conflict; that is most of the V2 sync battle. (Lead
  note: notes/ already IS per-record files — the projection
  extends the app's own precedent.)
  (3) **Named open question, deferred EXPLICITLY:** text-mergeable
  ≠ semantically mergeable. Same-field concurrent edits need a
  domain merge policy someday (LWW-per-field / custom merge
  driver / app-level three-way on pull) — deferred as a decision,
  never resolved by accident by whatever git does; the design
  side's trust grammar (GR-4) has jurisdiction over how a sync
  merge accounts for itself to the user.
  Far end-state, named but not taken: SQLite as fully DERIVED
  (rebuildable like thumbnails) — that flips AUTHORITY (projection
  = source of truth; conflict resolution, migration, and the Rust
  port then live in projection space). The elegant endpoint; a
  deliberate future §11/§16 bet. Convergence note: longevity,
  git-sync, and the Rust seam analysis (the on-disk layout as
  load-bearing contract) independently demanded this artifact —
  the projection schema is the treaty between platforms.

- **Lifecycle closure decisions** (Terra lifecycle review,
  2026-07-09 — RAG/LEAD-REVIEW-2026-07-09-lifecycle-and-testing-
  closure.md): six rulings gate the 218–224 wave. (1) index.lock:
  age-gate + documented residual risk — LEAD-RULED accepted, 218
  carries it; owner may overrule. (2) "Clean up now" semantics:
  holding period vs immediate delete, dry-run/report shape (OWNER,
  blocks 219). (3) Retention purge at project open: silent vs
  announced (OWNER, blocks 220). (4) End Session post-state:
  project chooser vs closed shell vs app exit (OWNER, blocks 224).
  (5) Gallery verb undo dispositions: 221's verify-first table,
  owner ratifies. (6) Which three tester sessions gate the release
  + classifying the 47 HUMAN-TESTING entries into gate /
  preference / observation (owner+lead pass). Also adopted from
  the review: the four-state integration status (Implemented /
  Integrated / Tester-validated / Deferred honestly) for epic
  closes and lead reviews.

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

- **Pin wizard vs note creation — one surface?** (owner Parking
  Lot, 2026-07-09): pin placement and node-note creation grew
  "completely unique UIs that should probably have a design and
  unification pass." AI-IMP-211 rebuilds the note picker as a
  reusable palette (verbs injected) precisely so this conversation
  can rule "the pin wizard becomes the same surface" cheaply if it
  wants to. Also from the same flush, tied to the reading ruling:
  "OS zoom controls within a note should resize text independently
  of the board" — a second text-only zoom axis; decide whether the
  camera-verb ruling makes it unnecessary.

- **Traveling tags — the library boundary (PROPOSED 2026-07-10,
  owner tentatively accepts, alph confirm pending).** alph tagged
  library-imported images in his project and was surprised the
  library copies stayed untagged — two intents under one noun:
  CONTENT tags (what the image is; should follow the asset) vs
  WORLD tags (what it means here; project-scoped is correct).
  Rejected: "just global" (separate SQLite per project + cross-
  project completion pollution) and dual swim lanes (every tag
  surface doubles; filing question on every keystroke). PROPOSED:
  travel is a PROPERTY carried by an EPIC-026 category — tags in a
  travels-with-content category cross at content-crossing moments
  (ingest carries them in, mirror carries them out, created-if-
  missing), world tags stay home; one noun, one input, the
  category chip is the visible lane. Backflow (alph's exact flow —
  tagging AFTER import) is never ambient: (a) a deliberate
  "push tags to library" verb on the mirror relationship, and (b)
  OWNER ADDITION: proper-close as the automatic settle moment —
  close ENQUEUES a tag manifest into the library's existing
  EPIC-015 INBOX (plain filesystem, no lock contention with an
  open library window, idempotent, crash-safe), applied on the
  library's next open; the verb shares the same path. Doctrine:
  proper close is when a project settles its debts (checkpoint,
  snapshot, projection for the iPad handoff, traveling tags).
  Placement-determinant tags PARKED as a named question — third
  scope, all consumers assume node binding, frames/boards already
  carry instance meaning; revisit only with a driving case from
  the field. **ALPH TENTATIVELY ABOARD (2026-07-10 Discord): "i'm
  okay trying claudes shape + a wizard and seeing how that feels"
  — build-and-feel accepted over further debate. His wizard
  addition: tag CREATION should offer the namespaced categories
  with per-category REQUIRED fields ("artist and source are
  required but date saved is not") — see the tag-categories entry
  for the required-ness revision this implies.**
  **REOPENED BY THE OWNER (2026-07-10 evening, post-caption):
  the CAPTION changed the math.** World/board tags were doing two
  jobs — annotation ("something extra about this entity here")
  and query structure — and the shipped placement caption absorbs
  the annotation job outright, more elegantly. The owner's
  candidate ruling: drop category-carried travel and "bite the
  bullet" toward ONE tag universe — no two sources of truth, sync
  at proper close, one intro warning ("save your project or your
  tags won't update"). LEAD REFINEMENT at capture: taken
  literally "all tags backport" has a scoping hole (most world
  tags sit on boards/dots/native notes the library has no copy
  of) — the coherent rule is **MIRROR-EDGE SYNC**: tags sync
  wherever a mirror relationship exists; elsewhere there is
  nothing to sync to and no user-facing lane concept at all. The
  user never files a tag; EPIC-026 categories return to pure
  structure (travel stops being a category property). Agenda for
  the alph conversation: (1) pollution vs provenance — project-
  structural tags reaching the library; mitigate completion noise
  by RANKING (this-project usage first), not lanes; (2) rename/
  delete divergence must be RULED, not implied — last-settle-wins
  + the deliberate push verb, same merge-policy family the
  projection ruling deferred; (3) the opt-out — can alph name a
  tag he'd want kept OUT of the library? If yes: a rare
  per-tag/category "local only" exception flag; if no: ship
  without one. Close-time inbox mechanics from the original
  proposal carry over unchanged.
  **OWNER RULINGS (2026-07-10 late, five of six settled):**
  (1) Sync is BIDIRECTIONAL at settle moments — close pushes out,
  open pulls in, inbound changes ANNOUNCED never silent; plus a
  NOTIFICATION/ACTIVITY LOG surface, probably part of the library
  ("visibility into the overall activity") — new design item.
  (2) Rename: last-settle-wins, announced at the losing end.
  DELETE remains THE open chad — "that's a hard one": no shape is
  clean on either end. Owner's candidate: a SCOPE DIALOGUE at
  delete time ("delete from the library, or from this project?")
  — the choice is cheap in the moment and not atomic to anything
  else. Softener noted: tags have no trash today; giving tag
  deletion trash semantics would make nothing authoritative on
  first delete. UNRESOLVED — decide at epic cut or on alph
  contact. (3) Provenance ACCEPTED as DATA: tag rows carry origin
  (which project pushed them), and surfaces may FILTER by
  provenance — completion noise handled by ranking + filter, not
  lanes. (4) NO OPT-OUT — "be opinionated, get a buildout, let
  him react to something in his hands." (5) Categories travel
  with their tags — forced by the model, ruled anyway; wizard
  required-field configs converge toward the library's over time.
  (6) Settle moments: OPEN + CLOSE, plus the deliberate sync verb
  as a full QUIESCE — drop every db connection, run the sync,
  resume the app (the owner's "active git sync" shape). Remaining
  before epic cut: the delete dialogue final shape + alph's
  in-hand reaction to the whole model.

- **Tag categories — the missing primitive (RATIFIED 2026-07-09,
  owner + alph, Discord; awaiting epic cut + RFC fold-in):** typed
  tag categories as the ONLY level of tag nesting — the booru
  namespace pattern (`creator: Matthieu Bonhomme`,
  `source: instagram.com/…`), which alph speaks natively (his
  Allusion history: nested only for lack of better, happy flat).
  The model: a category is a TYPE on the tag row, not a tree — no
  parent pointers, no folder UI; categories are USER-DEFINED per
  project ("the general design structures you can draw meaning out
  of, but not telling you what meaning to put in it" — the owner's
  photographer example: shoot location / camera / lens / date).
  Rulings locked: (1) NOT mandatory — alph: "optional to fill in";
  first-classness (structured import fields, namespace prefix,
  facet priority) is the point; required-ness at most a future
  per-category setting, default off. REVISED 2026-07-10 (alph, at
  the traveling-tags wizard talk): the per-category required
  setting is WANTED AT BIRTH, not future — a tag-creation wizard
  where "artist and source are required but date saved is not";
  still per-category and user-defined, still default-off for new
  categories, but the setting ships with the epic. (2) Filename rewriting works
  at EGRESS, never in the store — the content-addressed blob store
  is untouched; a derived display filename
  (`creator tags date-retrieved.ext`) is computed from fields and
  applied on export/drag-out/reveal/vault-mirror ("filename on
  export is what matters" — owner). Date-retrieved = the filename
  uniquifier; content hash stays the true dedupe (recognition
  chip). (3) Alph's canonical categories: creator + source — and
  `source` ALREADY EXISTS as a field (rev 0.53); it needs the
  entry surface and category presentation, not a schema birth.
  Also noted from alph: original filenames carry data (his VLC
  screencaps' names hold the timestamp) — the import surface may
  offer filename-derived prefills someday; capture only.
  Convergences: supplies 204's provenance fields, gives the
  gallery facets/views teeth (creator:X as a filter), EPIC-014
  input. Schema note for the epic: category validated in COMMAND
  HANDLERS, never SQLite CHECK IN (user-defined domain). Epic cut
  + RFC rev pending the owner's build-slot call (vs EPIC-025
  palette picker).

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

- **iPad companion / V2 shape** (owner, 2026-07-08; UNTABLED
  2026-07-09 evening — strategy review "within the next day or
  so"; goal is NOT shipping but "basic interaction patterns
  start to form and the shell working and constructed"; pricing
  intent restated and hardened: free desktop, $5 iOS — "it's a
  better story on my resume if it's a product." Decision inputs
  in hand: 217 WebKit engine numbers, 240 Tauri shell + 10 seams
  + asset-protocol acquittal, 241 texture-tiering ACQUIT (~140MB
  resident regardless of board size — the iPad memory question is
  closed), 243 Rust persistence seam analysis in flight. Owner
  device passes on iPhone/iPad remain the last physical
  validation.): the coherent V2 sketch — desktop app paired
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
