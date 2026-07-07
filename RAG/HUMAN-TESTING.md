# Human testing queue

Things only the owner's hands can validate — feel, legibility,
taste. Claude appends an entry when work lands that needs a human
pass (with the shipping ticket and what to try); the owner flushes
intermittently: delete lines that pass, and anything that fails
becomes a finding for the next batch. This file is a queue, not a
record — history lives in the tickets.

## Owner actions (setup only you can do)

- [ ] **LOW PRIORITY — Codex GitHub auto-review stopped firing**
  (2026-07-06): PR #4 got no auto-review and `!codex review` didn't
  respond either (PR #1/#3 worked). Local Codex via the plugin
  covers epic reviews meanwhile — look at the integration whenever,
  no hurry.

- [ ] **CI → Codex auto-diagnose secret** (2026-07-06): the
  workflow needs an OpenAI **API key** in the repo (your ChatGPT
  subscription does not cover Actions usage — this bills the API):
  1. platform.openai.com → API keys → create one scoped for this.
  2. `gh secret set OPENAI_API_KEY` in the repo (paste when
     prompted), or GitHub → Settings → Secrets and variables →
     Actions → new repository secret `OPENAI_API_KEY`.
  3. Tell Claude it's set — the workflow file gets written then
     (`workflow_run` on CI failure → codex-action diagnoses →
     response lands back on the failing commit; no PR needed).

## Awaiting validation

- [ ] **The object icons** (AI-IMP-132, 2026-07-07): give six nodes
  the six icon appearances (switcher popover now previews the real
  objects) — THE question: over real art on a busy board, do they
  read as designed objects on the desk, or as clip-art? Gloss level
  (.42, normalized) is the dial the designer flagged. Zoom out past
  ~8px: each degrades to its color dot — does the swap read as the
  same thing getting small? Check both themes.

- [ ] **Context menus** (AI-IMP-136, 2026-07-07): right-click an
  image and empty board — the ratified §8.4 menus are live. Feel
  calls: (1) verb ORDER within groups (frequency-first — is crop/
  flips/appearance the right lead?); (2) "backdrop" wording in
  situ (Replace backdrop… · backdrop color row); (3) coming-soon
  rows (Replace image…, Swap for…, Paste) render disabled with
  reasons — promise or clutter? (4) NEW: lock, hide-label, and
  backdrop paints are now one Mod+Z each (the grammar demanded
  it) — undo a backdrop color and gut-check it.

- [ ] **The designed void** (AI-IMP-130, 2026-07-07): the void
  around the lit stage moved from the dark engineering placeholder
  to the design value — notably SUBTLER (~22% toward black, oklab).
  Look at a content board in dark AND light themes plus a flat
  canvas color: does the lit/unlit boundary still read, or is it
  too quiet now? On GLASS the void is gone entirely (the desktop is
  the stage) — flip to glass and confirm that feels right, not
  broken. Constant stays tunable if the subtle mix loses the plot.

- [ ] **Metadata card v2** (AI-IMP-139, 2026-07-07): open a note on
  a multi-board node — the card now reads as SYSTEM (mono seam,
  "kept fresh by the app — edits here don't stick"). Gut checks:
  (1) does it read as the app's furniture vs your prose at a
  glance? (2) placements are a foldable outline (top level open,
  deeper folded) with ⌖ fly chips — scannable on your biggest
  board tree? KNOWN LIMIT: with several sibling top-level boards
  the fold can group a deep row under the wrong parent (read model
  has depth, not parentage) — if you hit it in practice, say so
  and the read-model field gets a ticket.

- [ ] **The drop moment** (AI-IMP-129, 2026-07-07): THE Pinterest
  test — drag 5+ images from Finder at once. The ask should read
  instantly ("N images dropped — how should they land?" · Keep
  separate · Sort · Group · Group & sort · remember tick). Pick
  Group & sort: one frame, tiled inside, ONE Mod+Z back to
  pre-drop. Tick remember and drop again — no modal. Feel calls:
  (1) modal wording right? (2) is the unanswered-ask fade to
  keep-separate (~4s) surprising or forgiving? (3) drop 3 images
  INTO a frame — they should self-arrange (sort-on-drop, Dock
  toggle turns it off); single drags never reshuffle — right line?
  (4) UNTESTED BY MACHINE: "Add from library" on a selected frame
  (gallery takeover → pick → lands captured+arranged) — this path
  has no automated e2e, so give it a real pass.

- [ ] **Snapshot remote push** (AI-IMP-122, 2026-07-07): Settings →
  snapshots → "Commit + push" reveals the remote URL field + Test
  connection. Two checks: (1) does the opt-in read as deliberate —
  nothing network-shaped should feel ambient; (2) point it at a slow
  or dead remote and End Session — closing must stay INSTANT (the
  push is background; a ⚠ perch carries the unpushed count and the
  next snapshot retries). The failure toast should fire once, not
  nag on every retry.

- [ ] **Restore from backup** (AI-IMP-121, 2026-07-07): with
  snapshots on and some history, ☰ → Restore from backup… — the one
  question: does the confirm read as SAFE-COPY, never rollback? (It
  promises "a new project folder next to your current one… nothing
  is rolled back, moved, or overwritten.") Pick an old snapshot,
  create the copy, Open Restored Project — the app relaunches into
  the copy; your original must be exactly as you left it. Also
  eyeball the ☰ row placement (after Trash…, before End Session).

- [ ] **Frames** (AI-IMP-127, 2026-07-07): the Dock has a frame tool —
  draw a region (Shift = square), drop images inside, drag the frame:
  everything travels together, one Mod+Z per gesture. Feel calls:
  (1) while dragging an item over a frame, the frame focuses and the
  rest of the board dims — right affordance, right strength? (2) the
  region chrome is placeholder (letter item 14) — is it furniture
  under your art or does it shout? (3) shrink a frame smaller than a
  member: the member stays put and stays IN (geometry never edits
  membership) — does that read as correct or as a bug? KNOWN EDGE:
  with a frame selected, its charm bar can overlay nearby members and
  eat a drag that starts on one — Escape first. Flag how much that
  bites; the fix is a charm-surface ticket.

- [ ] **Arrange + normalize** (AI-IMP-128, 2026-07-06): select a
  messy handful of mixed-size images — the Dock's selection segment
  now carries arrange (default reading order · name · import order ·
  area) and normalize (height · width · size · area). Two feel
  calls: (1) normalize matches everything to the selection MEDIAN —
  on a real pinboard does that read as "tidied" or does it pick the
  wrong reference? (2) arrange packs into a roughly-square block
  anchored where the selection already sits — right, or should it
  feel more like PureRef's? One Mod+Z must return the whole
  invocation. Eight small Dock buttons is a stopgap until the
  EPIC-016 menus — flag if they're too cryptic to find.

- [ ] **Session snapshots** (AI-IMP-120, 2026-07-06): Settings →
  turn snapshots to "git commit" on a real project, work a while,
  then quit — does closing feel instant, or does the snapshot make
  it drag? (Quit is time-bounded at 15s worst-case for a huge first
  commit; normal checkpoints should be sub-second.) Leave it idle
  ~10 min mid-session: the checkpoint should be imperceptible — no
  hitch while you're staring at the board. Check the Settings
  disk-size readout reads sane against the project's actual size,
  and (if you're curious) `git log` in the project dir should read
  as "Snapshot: idle checkpoint — 12 notes, 87 assets — <time>".

- [ ] **Note metadata block** (AI-IMP-119, 2026-07-06): open a note
  whose node lives on several boards — the Placements card below the
  editor should read scannably (tree indentation, counts) and each
  entry should fly to the right board. Toggle the card off and on.
  Import an image with a source URL and check its Provenance line.
  Then rename the note and open its .md in Obsidian: the block
  should read as plain markdown (rule + headings + lists) while the
  in-app editor keeps showing prose only.

- [ ] **Tethered panel world-scale** (AI-IMP-116, 2026-07-06): open
  a note tethered beside its node, then zoom out — the card should
  shrink in step with the board and stay glued to its node (no more
  full-size card looming over a tiny image). Keep zooming — it
  should fade away cleanly rather than becoming unreadable confetti.
  Pin a panel and zoom around: the pinned sticky note stays
  screen-fixed. Feel calls wanted: (1) zooming IN, the tethered card
  caps at its default size rather than ballooning past it
  (`PANEL_TETHER_MAX_SCALE` flips it if you want true both-ways
  scaling); (2) is the fade floor at the right zoom — text still
  legible just before it fades (`PANEL_LEGIBILITY_FLOOR` 0.4)?

- [ ] **Content-defined stage** (AI-IMP-118, 2026-07-06): on a board
  with no background image — an empty board should read as all-void
  (dimmed grid, no lit rectangle); placing the first item should
  BLOOM a lit stage (eased, not popped). Drag an item far past an
  edge and release: the lit edge glides outward. Drag it back in:
  the stage must NOT shrink. Zoom-to-fit (nothing selected) frames
  the lit area; reopening the board snaps the extent snug. Feel
  calls: bloom/growth speed (`STAGE_EASE_TAU_MS`), padding
  (`STAGE_CONTENT_PADDING`), and void darkness readability in BOTH
  themes + a flat-canvas swatch (`STAGE_VOID_MIX`) — all
  placeholders for the design pass (letter item 15).

- [ ] **Everything-scope pull → place cursor** (AI-IMP-115,
  2026-07-06): in the gallery, flip to *everything*, click a single
  image, hit **pull into this world** — the takeover should close and
  a ghost of the image should ride the cursor over the board; click
  lands it there, Escape stores it unplaced with a "stored in this
  world — unplaced" toast. Feel calls wanted: does the ghost (fixed
  120px, 70% opacity) read as "carrying it" or too small/detached?
  Does the ingest→ghost handoff feel instant, or is there a beat where
  nothing happens after the click? Pull the same image twice — the
  second time it should recognize your existing copy (no duplicate),
  which is invisible by design; just confirm nothing feels off.

- [ ] **Panel-aware flights** (AI-IMP-100, 2026-07-06): follow a
  wiki link to a placed image — the target should land beside the
  opened note, never under it (your Beyrl → The Gang case).

- [ ] **Modal coverage** (AI-IMP-101, 2026-07-06): open the big
  editor — the dock/rail/toasts now sit UNDER the backdrop (click
  where the dock is: it closes the editor instead). Also: the
  title-conflict dialog now centers over the whole canvas rather
  than inside its panel — intended, but eyeball it.

- [ ] **Grid crossfade** (AI-IMP-099, 2026-07-06): zoom continuously
  with the grid on, side-by-side with PureRef — subdivisions should
  fade in faint and stay subordinate, no popping. One deliberate
  choice to judge: the PRIMARY grid softens slightly right around
  promotion moments ("breathes"); if that reads wrong, the
  alternative (subdivision briefly brightens past its cap instead)
  is a 3-line swap — say which you prefer.

- [ ] **Zoom feel dial-in** (AI-IMP-098, 2026-07-06): pinch/Cmd+wheel
  now glides to its target (τ=70ms default). Side-by-side with
  PureRef in a dev session: `window.__ewDebug.zoomTuning({tau: 60})`
  etc. live-tunes {tau, wheelSpeed, pinchSpeed}; call with no args
  to read current. Report the numbers that feel right and they
  freeze as constants.

- [ ] **Label clearance** (AI-IMP-087, 2026-07-06): select a labeled
  item and zoom in/out — the title should never touch the selection
  ring. Note: at high zoom the label sits a constant ~6.5px under
  the item; if you'd rather it keep a "world feel" gap up close,
  say so — it's a one-line max(worldGap, clearance) change.
- [ ] **One-undo compounds** (AI-IMP-086, 2026-07-06): place a note
  on the board as a card, then undo once — card AND dot restore
  together. Attach-new-note paths behave identically to before.

- [ ] **Rotate cursor glyph** (AI-IMP-031, 2026-07-06): hover just
  outside any corner of a selected item — a circular-arrow cursor
  should appear and read as "rotate" over both dark and light art.
- [ ] **Rotate band width** (AI-IMP-031, 2026-07-06): the rotate
  zone is now ~18px of usable ring outside each corner — findable
  by feel without hunting?
- [ ] **Resize snapping** (AI-IMP-082, 2026-07-06): drag an edge or
  corner toward a neighbor — the dragged edge should snap with a
  guide line; Shift and Alt should bypass; engage/release
  thresholds feel right at different zooms?
- [ ] **Panel default size** (AI-IMP-083, 2026-07-06): open a few
  notes tethered — is 320×300 the right "glance and a quick line"
  size?
- [ ] **Pinned panel resize** (AI-IMP-083, 2026-07-06): pin a note,
  drag the corner grip — does the floating sticky note feel like a
  proper window? Min clamp is 240×150.
- [ ] **Big editor** (AI-IMP-083, 2026-07-06): expand a panel —
  centered editor over dimmed board; Done, click-off, and Escape
  all return. Right size (760px/70vh)? Note: the panel shadow in
  LIGHT theme got token-level validation only — worth a ten-second
  glance.
- [ ] **Card appearance** (AI-IMP-084, 2026-07-06): pin a note
  panel, click Place on board — a flat card (title + excerpt, no
  shadow) lands near the panel. Does the chrome read at board
  zoom levels? (Renderer text is "legible, not final" per ticket.)
- [ ] **Card mutual highlight** (AI-IMP-084, 2026-07-06): select a
  placed card while its note's panel is open — the panel should
  flash; nothing should glow when neither is active.
- [ ] **Escalation sequence feel** (rev 0.31, whole arc): tethered
  card → pin → resize → big editor → place on board — does the
  one-step-at-a-time ladder feel deliberate rather than bureaucratic?
- [ ] **Seed set curation** (AI-IMP-094, 2026-07-06): the example
  library ships GENERATED placeholder gradients under fictional
  artists — swap for a curated public-domain set when you and
  Raphaël pick one (drop replacements into
  apps/desktop/resources/seed/, update LICENSE.md).
- [ ] **Does the example teach?** (AI-IMP-094, 2026-07-06): create
  a fresh library — does the artists-root → artist-boards → tagged
  works arrangement read as "this is what the surface is for"?
  Clear-the-example from the gallery header when done.
- [ ] **Inbox mirror feel** (AI-IMP-092, 2026-07-06): designate a
  library, drop an image on a world — the first-drop ask should
  read right; with mirror on, the drop must feel instant (mirror is
  background); drop a duplicate — the tag-offer chip should fade on
  ignore with no debt.
- [ ] **Source panel** (AI-IMP-091, 2026-07-06): open a project as
  source from the new live ⧉ charm, browse the mini grid, set the
  tag border, drag a cell onto the board — does the pull feel like
  one motion?
- [ ] **The trash browser** (AI-IMP-102, 2026-07-06): trash a note,
  a node, and a board; ☰ → Trash… — all three should list with
  impact context; restore the node and click the toast's "Fly to
  it"; then Empty Trash and confirm the §9 summary reads right.
  First surface where deletes stop being one-way — gut-check the
  whole loop.
- [ ] **The ☰ menu** (AI-IMP-110, 2026-07-06): open it — the full
  ratified geography should read as one stable place (Undo · Redo
  greyed with their printed shortcuts, Trash…, End Session,
  Settings live, Help/About shows the real version). Does the
  disabled-but-visible undo row read as a promise or as broken?
- [ ] **Small states** (AI-IMP-106, 2026-07-06): type a wiki link
  to a note, trash the note, purge it — the link should go red
  with a wavy underline (grey means recoverable trash); clicking
  it should offer create/relink. Gut call wanted: does red/wavy
  read "dead" or "spelling error"? Flag for the design pass if
  the latter.
- [ ] **Image drop on an open note** (AI-IMP-097, 2026-07-06): drag
  an image from Finder onto a note panel and onto the big editor —
  it should land on the board beside the note (view center if the
  note isn't placed on this board) with the "images live on the
  board" toast; text drops/paste into the editor must behave
  exactly as before.
- [ ] **Undo/redo feel** (AI-IMP-114, 2026-07-06): move, flip, draw,
  delete, place-on-board, and materialize things, then Mod+Z / Shift+
  Mod+Z your way back and forth. Does one keypress map to one gesture
  you actually remember making (drags/resizes commit once, a batch
  delete comes back whole)? Type inside an open note between undos —
  Mod+Z there must be the EDITOR's text history, never the board's.
  The ☰ Undo/Redo rows should grey/ungrey as you go. Two gut calls:
  (1) undoing a change you made on ANOTHER board just toasts "made on
  «Board» — open that board to undo it" and does nothing — does that
  read as safe or as broken? (2) the stale-undo toast "That change can
  no longer be undone" — right words?
- [ ] **Light-theme legibility over art** (EPIC-013, carried):
  chrome and scrim chips readable over bright and busy boards in
  the light theme.
- [ ] **Gallery "earlier this year" buckets** (AI-IMP-078, carried):
  older items bucket as named months trailing 12, then year
  buckets — does the rhythm read right with a real library?
- [ ] **Gallery cell sizing and feel** (AI-IMP-077, carried): grid
  density, thumbnail crop behavior, and scroll feel with real art
  at volume.
