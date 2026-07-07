# Design team letter #1 — running response to the lead

From the design pass, to the lead developer. Started 2026-07-06,
against Design-letter-3 and RFC rev 0.54. This letter accumulates
across the design pass; items marked **→ RFC** are proposed
amendments, items marked **open** are still being wireframed.
(Lives in the design project; copy into `RAG/design/` when flushed.)

## Amendment candidates

1. **Editor typeface exception (→ RFC, contradicts DS "no webfonts").**
   The note editor wants a KERNED monospace (Berkeley Mono feel —
   spacing plays inside the mono grid so it reads almost
   proportional). Round-2 candidates: Iosevka (the standing
   comparison), Iosevka Aile (quasi-proportional sibling), heavy
   Hack, Fira Code, JetBrains Mono, Geist Mono, Martian Mono —
   Note Editor Wireframes 2b–2h. This breaks the "system UI stack
   only" rule for exactly one surface: note text. Chrome stays
   system. Needs a ratified carve-out + a bundled-font decision
   (all candidates OFL/MIT).

2. **Outliner presentation over Markdown (extends EPIC-018).**
   Markdown stays the carrier; the PRESENTATION is an org-mode-style
   outliner: headings fence the content below them, fold with a
   gutter affordance and a `[...]` marker, and heading levels are
   colored (theme tokens), loud by default. Markdown supports
   heading levels 1–6; org-style folding maps to that nesting.
   The outline takeover (§14.1) already reflects this structure —
   heading structure inside notes and board structure outside read
   as one grammar.

3. **Frame sort control surface (EPIC-017 detail).** Ratified: a
   frame defaults to sort-on. Open: where the control lives —
   frame charm bar vs. a visual fact on the frame itself (title-row
   chip), and how nesting avoids clutter — probably zoom-gated
   visibility (the §8.2 screen-size rule, applied to frame
   furniture). "No sort" = members float: they keep their manual
   positions, still move with the frame. Wireframes 1j–1l.

4. **Void does not apply on glass (→ RFC §6.7/rev 0.50 footnote).**
   The stage/void ("fog of war") derives from the effective
   background color; on the glass theme the board IS the desktop —
   there is no meaningful void tone over transparency, and glass
   exists so you can draw on your own canvas. Either void is
   simply off on glass, or it becomes a settings toggle when the
   settings-menu document is designed. Default position: off on
   glass, no toggle until asked for.

5. **First-run guide enters the storyboard (EPIC-019).** Storyboard
   gains a new §19 — the ~7-page first-open walkthrough: basic
   instructions, then "what do you plan to do?" with optional
   user-kind pick proposing example workflows (painter reference
   boards / comic·pitch bible / timeline story mapping), dismissing
   into the seeded example. Current §19 (seed) renumbers to §20.
   Future: workflow picks could seed real example content like the
   library example — out of scope now, recorded here so it
   doesn't vanish.

## Hero images — UI Vision v2 (replaces the v1 five-state doc)

- Seven canonical states. 01 at rest (+ object-icon nodes, pin
  tool in dock, teardrop path pin) · 02 open (note is PAPER in
  Maple with tag chips, corner controls, metadata card; charm bar
  gains the appearance swatch) · 03 find (ported) · 04 see
  (updated: takeover mode switcher was missing, phantom dot added,
  esc line) · 05 collect (redrawn to the canonical control set:
  scope toggle, search track pills, buckets, inbox/low-quality,
  size slider, centered import strip + everything-scope action
  bar) · 06 NEW the lit stage and the void (rev 0.50) · 07 NEW the
  library beside your world (source panel, tag border, drag-out
  copy, recognition chip). Theme/grid/flat tweaks preserved from
  v1.

- **Rail alignment (owner, at v2 review):** the charm rail does
  not share the top track with the traffic-lights/path row — it
  starts below it, top-aligned with where content panels begin
  (the 03 find panel line). A vertically-centered rail was
  considered and left open. Applied across all seven states.
- **Binder rings go canonical:** the tethered note in 02 renders
  as the BOUND PAGE — rings on the edge facing its node (Icon
  Document 6a) — since v2 is "what the app actually looks like."
  The shrink-test caveat stands for build.
- **Floating things cast shadows:** anything torn off or riding a
  drag (mid-tear note, drag ghosts, place cursor) renders a small
  drop shadow while floating — the §8.5 depth cue applied to the
  moment of motion, not just the pinned state.
- **The open-note gesture, shaped (owner, at v2 review):** the
  bound page affixes directly to its image's side and its VERTICAL
  HEIGHT EXACTLY MATCHES the image it is bound to — like a book:
  image is the cover, note is the facing page, rings on the seam;
  width is the free variable, height is not. DOUBLE-CLICKING
  the note tears it off and centers it on the viewport (the big
  editor moment), and overflow scrolls INSIDE the note, never the
  board. Owner labels it "the most aesthetic strategy, try it" —
  feasibility to confirm at build. Musing riding it: a very quick,
  inline BOOK-COVER-OPENS beat when a note first opens (one-shot,
  world-content animation budget per the motion corollary).
- **Rail position is good enough:** top-aligned below the path
  track ships in v2; nudging it later is a trivial code change,
  not a design blocker.

## Context-menu grammar (Menus Document t1 — letter #1, EPIC-016 core; positions taken)

- Grammar: verbs only, never "file"; frequency-first within meaning
  groups; destructive LAST behind a divider, alone; shortcuts print
  in mono; submenus only for families (Appearance · Tags · Align ·
  Sort); every verb = one undoable command; PureRef adopted for
  verb breadth, not nesting depth.
- Inventories drawn (1a–1e): item (crop/flips/appearance/note/tags/
  hide-label/lock — Replace image… · Swap for… — place-on-another-
  board · open-as-board · set-as-backdrop · z-order — Delete) ·
  board (paste/select-all/fit — backdrop family incl. Replace
  backdrop… with its fits-the-prior-extent semantics — color
  row: swatches + OS picker — note-for-this-board) · decoration
  (edit style — z-order/lock/hide — Delete; never item verbs) ·
  multi-select (count header — align/distribute/flips — gather
  into a frame · tags · lock all — "Delete N items") · frame
  (sort segmented + sort-now + fill-from-library — rename/note/
  tags/lock — "Delete frame — contents stay").
- Copy calls inside: "backdrop" over "background" in board verbs
  (shorter, warmer); "Gather into a frame" as the grouping verb;
  frame deletion states its destroy-nothing fact in the verb
  itself. Impact confirm (1f) unchanged from rev 0.49.

## First-run guide, full content (First-Run Document t1 — EPIC-019)

- Seven pages drawn with final-candidate copy: 1 what-this-is ·
  2 your-pictures-are-safe (LOAD-BEARING, never cut) · 3 cursor
  zones + tooltips-teach · 4 notes + [[links]] · 5 boards-in-boards
  · 6 tags/search/gallery/trash-keeps-whole · 7 the optional
  "what do you plan to make?" pick. Arc rules (1h): one idea per
  page, ≤3 sentences, no feature names or "node"; skip everywhere,
  never shown again (settings can replay); "start" lands inside
  the seeded example — the guide teaches claims, the example
  proves them.

## Trash browser + ☰ tone (Menus Document t2 — letters #4/#5)

- **Trash rows are ARCHIVE tone, not danger:** neutral row color,
  kind glyph · title · relative when · factual impact ("holds 12
  placements · 3 items go loose on restore" · "4 links point here —
  they hold until purge") · restore in accent as the loud verb.
  Only Empty trash… wears danger, bordered, bottom-right. Empty
  state: "nothing here — deleted things wait here, whole, until
  you say otherwise." Restore toast offers ⌖ fly-there.
- **☰:** ratified geometry unchanged; disabled rows stay visible,
  dimmed, and use the disabled-with-reason tooltip shape.
- **Help/About:** plain type where a mark would go (no logo, on
  purpose), version + RFC rev in mono, two-line product sentence
  incl. the copies-not-touches line, one link (all keyboard
  shortcuts ▸), repo pointer in micro mono.

## Broken-link tone (Note Editor Wireframes t5/t6 — letter #6)

- Gut-check confirmed: wavy IS spell-check vocabulary; retired.
  Candidates: **strikethrough** (t6/6a, owner-requested — strongest
  "gone"; risk: reads as a deliberate prose edit) vs dashed (5b,
  "severed line"). Both drawn; owner leaning strikethrough.
- **Ratified alongside: every link state gets the hover tooltip**
  (t6/6b) — the one chip, 500ms: bound "Yorren · ⌖ 2 places ·
  ⌘click opens" · unresolved "not a note yet · mentioned 3 times" ·
  trashed "in trash · opens with restore" · broken "deleted for
  good · click for options". States never rely on color alone.
  Hover offers unchanged (new-note-from-text · relink-to-active).
- **→ RFC option to register (owner):** if broken-link flavors
  ever split, strikethrough = purged-for-good, dashed = other
  severed states. Phase 1 has only one broken state, so this is a
  registered future distinction, not a build item.

## Polish beats (Icon Document t9 — closing the slate)

- **Rip timing:** ~300ms ease-out confirmed against 150 (paper
  never registers) and 450 (ceremony). Sound-free.
- **Centered-note close:** esc / click-off tucks the page BACK
  into its book — the tear reversed, ~200ms; no Done button, the
  board behind is the exit. The panel pin control is the one exit
  that keeps it out (taped, screen-fixed).
- **Spiral shrink test PASSES:** rings hold to ~40% rendered size,
  degrade to a dotted then solid bound-edge stroke, and below the
  legibility floor the page fades whole (charm rule). The 6a
  binding is therefore safe to ship with the world-scaling panel.
- **Light theme:** paper leans on --ew-paper-border-strong for
  separation; tape/torn edge hold; shadows lighten via theme
  tokens; object pin reads on both. No changes needed.

## The shrink ladder (Icon Document t10 — owner-prompted generalization of the shrink test)

- One grammar for zoom: **world content shrinks honestly · chrome
  holds size · furniture exists only above a shared threshold.**
  Classes assigned per element (10a): images/text/ink/labels/stage
  = pure world (never clamped, per §4.5/§4.9); object icons and
  the bound page DEGRADE (dot at ~8px; rings→stroke→whole-page
  fade); hint charms + frame title/sort chip are FURNITURE (exist
  or don't); selection/guides/lens and all panels are CHROME
  (screen-constant). The frame region keeps a ≥1px stroke so
  membership never vanishes.
- **→ RFC/build:** exactly two shared constants —
  EW_FURNITURE_MIN_PX ~8 and EW_PAGE_FLOOR_PX ~48 — and a guard:
  any rendered-size conditional not referencing them fails review.
  One zoom gesture reveals all furniture together, the way one
  clock fades all chrome together.

## The note lifecycle, three states (Icon Document t11 + Note Lifecycle Document — owner, closing session; supersedes earlier two-state entries)

- **Opening side is chosen by the image's shape (owner ask, Note
  Lifecycle Document t2):** portrait/square → the page opens
  BESIDE the image on the side with more free viewport; wide
  (≳1.4:1) → it opens BELOW, top-bound like a calendar. The
  height-match rule generalizes to the SHARED edge (image height
  when side-bound, image width when bottom-bound). The torn edge
  follows the binding — top-torn vs side-torn pages read
  differently, the scar records where it was bound. Chosen at
  open, stable for the panel's life (never flips mid-zoom); the
  clamp helper handles screen edges. Lift assessed SMALL: pure
  presentation, decision fn = aspect + existing §8.8 free-region
  math, nothing persisted; 3 binding-orientation chrome variants;
  manual side-flip verb deferred.

- **1 · the open book** — bound beside its image, same height,
  rings on the seam, **FLAT (no shadow)** — it is world content and
  scales with the world.
- **2 · the sticky** — torn out (~300ms) and taped to the GLASS:
  tape + torn edge, viewport-fixed, resizable, SHADOW. The working
  set that travels with you.
- **3 · the landmark** — push-pinned INTO the board: the §8.5
  place-on-board materialization (card appearance) wearing the red
  object push pin AND keeping the torn edge (the one scar that
  stays); flat again, world content, always visible at its spot;
  scales honestly (shrink-ladder world class).
- **→ RFC §8.5 amendment:** the depth cue is reallocated —
  shadow = VIEWPORT-FLOATING only (was "screen-space panels").
  Hardware tells the state: rings · tape · push pin. The red
  object pin now appears exactly three ways, all ON paper.
- **RESOLVED (owner): the lifecycle is freely reversible — → RFC
  §8.5 amendment, superseding the one-way materialization rule.**
  Pull the pin: landmark → sticky. Dismiss the landmark: the page
  returns to its book. Untape: sticky → bound. One undoable
  command per transition. The doctrine's point stated by the
  owner: the skeuomorphic hardware exists to make state changes
  obvious in a playful way — a freely manipulable lifecycle IS
  the design.

## Settings surface (Settings Document t1 — positions taken)

- The sheet keeps §11.5's physics (translucent inset, live-apply,
  commit-on-click, Esc, one glance, no save). New tenants placed:
  **Backups & export** (vault mirror · snapshots · restore list ·
  trash retention), **Keyboard** (registry printed, filter field,
  view-only), **Connectors** (the store lives IN settings; one
  list), **Advanced** (AI master toggle only).
- **Storage: git is NATIVE, everything else is a connector**
  (owner call, revising the earlier position). Session snapshots +
  git remote push are built-in (§11.4 already owns them); cloud
  folders and any other endpoint are connector-store citizens with
  a `storage` kind. The backups section links to the store
  (filtered to storage); attaching lights the relevant rows in
  place.
- **Advanced is ONE toggle** (owner call): switching it on reveals
  nested rows — "enable connector store," and under it "AI
  connectors in the store." The two-deliberate-acts rule for AI is
  preserved (advanced → AI toggle → per-connector toggle).
  → RFC §11.5 wording update.
- **Fold handles on settings section headings** — the outliner
  grammar (1f/Maple editor) extends to the settings sheet; every
  section folds.
- **Tier badging:** rows whose data travels with the project wear
  a small "this world" chip — the two-tier rule made visible
  instead of documented.
- **Void on glass:** off, disabled row explained by the
  disabled-with-reason tooltip shape ("the desktop is the stage on
  glass"); no toggle until requested.

## Satellite documents planned (the storyboard updates FROM these)

- **Style Guide v2** — DONE (Style Guide v2.dc.html): the whole
  visual system with TECH callout blocks — shipped feel constants
  cited from chrome.css/typography.css; proposed additions: void
  color-mix derivation (~78% + dimmed grid), tape/torn-paper
  tokens, six object-icon gradient pairs, note heading colors,
  --ew-font-editor (bundled Maple), --ew-drag-shadow, beat
  constants (tear ~300 · bloom ~240 · stage-edge ~180 · cover
  ~200), named z-ladder export + guard, icon texture-atlas note,
  bound-page geometry (0 9px 9px 0, rings straddle the seam).

- **Icon document** — DONE through t6 (doctrine ratified above).
- **Settings menu document** — DONE t1 (positions above; awaiting
  ratification).
- **Gallery controls audit** — DONE (Gallery Document t1). Full
  ratified inventory drawn and annotated: mode switcher · scope
  toggle · sort/kind/tag facets (tag list orderable by name/count)
  · untagged/unplaced/inbox · bucket headers as jump controls ·
  cursor-vs-selection keyboard model · import strip · text posts ·
  everything-scope action bar (pull only) · clear-example ·
  mirror-off notice. New DESIGN-QUEUE items surfaced: thumbnail
  size control, in-gallery filter field, multi-tag headroom,
  curation-mode placement, the Space-preview surface.
- **Gallery round 2 ratifications (owner):** thumbnail-size slider
  at the facet row's end (grid zoom = view state, ⌘−/⌘+; REQUIRED,
  every reference tool has one). Space preview = the macOS Quick
  Look reflex, ratified enthusiastically — image → full-size look,
  note → paper card, board → zoom-to-fit render with ⏎ dive,
  arrows walk without closing. Curation = a fourth cleanup facet
  ("low quality") with per-row reasons — the Replace-image
  worklist. In-gallery filter field confirmed: thins the current
  faceted pool (titles · original names · tags), never navigates;
  it is also the multi-tag ARRIVAL DOOR — when §4.8's deferral
  lifts, typing #tag in the field adds a facet chip, no new
  surface. **Refined (owner): when it arrives, tag search is
  booru-shaped — ONE field, space-separated tags, AND-only** (two
  tags = matches carrying both; no OR grammar, no second query
  language). Plain text in the same field stays title/filename
  substring. Stays deferred in the docs; this is the recorded
  shape. Transcode/size-limit rules are import-connector
  settings, not gallery chrome. Import strip stacks centered above
  the action bar on one axis.
- **The search track (owner interaction, Gallery Document 3a):**
  one control, five states — rest ⌕ icon → click opens a bar →
  committing a term crystallizes it into a pill (tag pills carry
  tag color; ✕ per pill) → the track's trailing ✕ clears all →
  clearing the last pill (or esc while empty) collapses back to
  the icon. Double-click on the track melts pills back into
  editable text; ⏎ re-crystallizes. Pills AND together,
  booru-style. The grid thins live in every state.
- **Storyboard absorption pass** — DONE: §19 first-run walkthrough
  inserted (seed → §20); §4 switcher shows the object icon set +
  doctrine line; §6 notes carry Maple, the identical corner
  controls, tape + torn edge, tear-out language, resize-threshold
  escalation; §10 frames carry the sort chip / float state /
  label-position tell; §14 gallery caption absorbs the audit
  (slider, Space peek, booru AND search, low-quality facet,
  centered import strip). Intro cites the satellite documents.

## Decisions taken at the wireframe (2026-07-06, round 2)

- **Edit surface (wireframe 2a):** corner controls (⌖ places · pin ·
  ⤢ expand) are IDENTICAL on tethered and pinned panels — 1a is the
  default story. A pinned panel additionally resizes, with the 1b
  threshold escalation into the big editor; a tethered panel never
  resizes. ⤢ is the taught door; the resize gesture is the expert
  path to the same place.
- **Editor type, DECIDED: Maple Mono** (wireframes 4a/4c) — kerned
  rounded mono, semi-condensed, true cursive italics, OFL. Geist
  and Martian fell to the no-true-italic check (4b). The → RFC
  carve-out (item 1) now names Maple Mono as the bundled editor
  face; chrome stays system stacks.
- **Rich text controls: 1d** — no standing chrome; a floating bar on
  selection, typed Markdown styles live. Pairs with the 1f outliner
  presentation (approved direction).
- **Frame label as the odd case:** a frame's label sits ON the frame
  (title row on the border) precisely where an item's label never
  sits (below, centered) — the placement difference is itself the
  frame indicator. Sort state rides that title row as a chip
  (1j direction), zoom-gated for nesting; "float" is the visible
  off-state (1l) and fresh frames default to a sort.

## Aesthetic doctrine — RATIFIED at the icon document (t4/4a, extended at t6)

- **Owner's formulation, ratified: "the canvas has little easy
  animations and feels like an object with physics; the UI is a
  terminal."**
- **Motion corollary (→ RFC §8.2 motion rule amendment):** the
  "fades and single pulses only" rule now applies to CHROME.
  WORLD content is allowed small physical beats — the pin
  tear-off (t6/6b, ~300ms, one-shot), the first-placement bloom,
  eased stage growth, camera chase. Still never: bounces, loops,
  anything ambient. One beat per user act.
- **Tether/pin story:** 6b tear as the pin moment with 6c restraint
  at rest (flat dashed tail while tethered; torn edge + tape are
  the pinned state's permanent marks). Full 6a spiral binding
  parked until it proves it survives world-scale shrink.

- **"Chrome is a terminal; the world is a desk."** Chrome stays
  flat mono (unicode glyphs, flat chips, mono shortcuts) exactly
  per the shipped DS. World content carries gentle materiality:
  node icons are small OBJECTS (top-light gradient, soft bevel,
  restrained gloss — Icon Document 2b family), notes are taped-on
  paper, and the red glossy pin lives ON the paper (panel pin
  control) — not in the chrome. Chrome pin instances (path-tail
  bookmark, dock ◉ tool) remain flat teardrop/glyph per 2c.
  → RFC: a one-line aesthetic doctrine note under §8.2; the
  object-icon set + taped-note treatment become DS additions.
- The six object glyphs ship as geometric SVG first; a commissioned
  painterly pass is the future upgrade path. Pixel-glyph set (2a)
  parked as a possible theme variant, not default.

## Tooltip grammar (Icon Document t5 — positions taken, for ratification)

- One chip app-wide: name in UI type + shortcut in mono kbd chip,
  scrim ground, ~500ms delay, grows from its control.
- Five legal shapes ONLY: name+shortcut · name-only ·
  disabled-with-reason · state-with-exit ("Lens on · esc") ·
  "coming soon" naming for deferred controls.
- Never legal: prose beyond one line, interactive content, images,
  any second style, tooltip-on-tooltip. Menus print shortcuts in
  rows, so menu rows carry no tooltips. The perch's tooltip names
  and counts; its detail is an anchored panel, never a tooltip.
- Placement: clamp-and-flip inside the free region (§8.8 helper),
  never covering the control it names, never off-window.

## Aesthetic musing on the table (not yet a decision)

- **Object shapes** (owner idea, sketched Icon Document t7): the
  shape tool's press-and-hold flyout gains an OBJECT row under the
  flat row — extruded box, pyramid, cylinder — dimensional
  decorations you draw and write on (text-in-shape rides the
  face), for building lightly skeuomorphic maps. Same decoration
  record and semantics (scale/rotate/fill/stroke); the render
  style is the only new fact. Fits the doctrine: shapes are world
  content, so they may be objects. → RFC §6.8/§4.9 note when the
  decorations epic turns.

- **The 2006 hybrid** (owner musing): two currents — a quiet
  terminal understatement (tmux/vim/emacs) and an early-Mac
  skeuomorphic warmth. Design-team position (Icon Document t2):
  the terminal current already exists in the DNA (unicode glyphs,
  mono shortcuts, engagement fade) and costs nothing to make
  deliberate; full skeuomorphism fights tool-neutrality and is
  where a commissioned artist becomes necessary. Compromise
  doctrine sketched as 2c: **"chrome is a terminal; the world is a
  desk"** — flat mono chrome, gentle materiality reserved for
  world content (icons-as-objects, pin, paper notes). Geometric
  SVG icon work reads as design, not generated art; the
  commission line is painterly work (illustrated icon sets, seed
  art). AI-generated art stays banned from anything shipped —
  audience-fatal.

## Standing understanding

- The storyboard's job today is workflow-thinking and gap-finding;
  its eventual job is an onboarding tool. Satellite documents make
  decisions; the storyboard absorbs them.
- Wiki-link coloring (bound blue / unresolved purple / broken red)
  read well; the thin text-formatted look is the direction. Bigger
  elements get flashier; text stays focused.
</content>
