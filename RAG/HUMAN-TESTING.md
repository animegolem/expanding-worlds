# Human testing queue

Things only the owner's hands can validate — feel, legibility,
taste. Claude appends an entry when work lands that needs a human
pass (with the shipping ticket and what to try); the owner flushes
intermittently: delete lines that pass, and anything that fails
becomes a finding for the next batch. This file is a queue, not a
record — history lives in the tickets.

## Owner actions (setup only you can do)

- [ ] **Codex watcher not writing** (2026-07-07, you're on it): PRs
  #5–#7 sat unreviewed and the drop-box hash never moved — suspect
  the automation watches a COPIED folder, not the real repo. Real
  paths: `.codex/triage-report.md` + `inbox/`; contract in
  `.codex/PROTOCOL.md`.

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

- [ ] **Menus, everything + About + trash tone** (AI-IMP-137,
  2026-07-07): right-click a drawn shape (style verbs only), a
  multi-selection (count header · align family · GATHER INTO A
  FRAME — try it, one Mod+Z undoes the whole gather), and a frame
  (sort rows · "Delete frame — contents stay"). ☰ → Help/About:
  the plain-type card (version + RFC rev live, copies-never-touches
  line) — does no-logo read as intended? Trash…: archive tone —
  neutral rows, Restore in accent, only "Empty trash…" wearing
  danger, the new empty-state line.

- [ ] **One voice** (AI-IMP-153, 2026-07-07): every chrome button is
  now ONE 5px geometry and every field rings 2px accent on focus
  (browser default retired). Tab through settings, restore dialog,
  gallery bars: does the uniform ring read as calm confidence or
  too loud over art? The pill/standard input split is grammar now —
  spot-check it never feels arbitrary.

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
- [ ] **TipTap note editor** (AI-IMP-146/147, 2026-07-07): the note
  editor engine changed under the hood. Type a while — does the feel
  match or beat the old editor (cursor, selection, IME, scroll)?
  Wiki links: bound/unresolved render live as you type, broken shows
  red strikethrough, Mod+Click still follows. Type `[[` and a few
  letters — does the suggestion popup feel right (arrow keys, Enter,
  click)? Open your OLDEST notes: they may normalize once (bullets
  `*`→`-`, `__bold__`→`**bold**`) — the text must read identically;
  anything that LOOKS different is a bug. Mod+Z inside the editor
  must stay text-only, never the board.
- [ ] **Chrome cosmetic sweep** (AI-IMP-141, 2026-07-07): select
  things in BOTH themes — the selection outline/marquee now follows
  the accent token (light theme finally gets its own blue; dark
  should look unchanged). The charm bar took the design-kit surface
  (menu ground, soft shadow, borderless buttons) — does it read as
  one family with the context menus? The ¶/⊡ hint charms are now
  little drawn shapes (document / framed box) — legible at a glance
  on busy art? Path bar crumbs separate with ▸ now. Gut check the
  whole pass against the kit HTML.
- [ ] **Maple Mono in the editor** (AI-IMP-131, 2026-07-07): open
  some notes and WRITE — body text, *italics* (Maple's true
  cursive is the reason it won), **bold**, and h1/h2/h3 headings
  (now sized AND colored). Does the mono face read as "your
  writing desk" or as "a code editor"? Check the panel, the big
  editor, a card-appearance placement (its title/excerpt bake in
  the same face), and a gallery text post. Chrome must look
  UNCHANGED everywhere — menus, dock, settings all stay system
  fonts; if any chrome went mono, that's a bug.
- [ ] **The desk comes alive** (AI-IMP-151, 2026-07-07): the §8.2
  physics ledger is playing. Drag things — grab should LIFT (+1%,
  shadow), release should SETTLE with one soft landing, never a
  bounce. Snap onto a guide: the last pixel should SEAT magnetically
  instead of teleporting. Lock something and grab it: a ~2px STRAIN
  under the refusal cursor — does it read as "held down," not
  "broken"? Delete: the item LIFTS AWAY (up + fade) — nothing ever
  crumples. Drag over a frame: members MAKE ROOM. Two gut calls:
  (1) alive or busy? (2) five constants are provisional (press/
  strain timing, away rise, make-room distance) — flag anything
  that feels off; resize/rotate/marquee/draw/pan must stay
  beat-free.

## AI-IMP-145 — the first-run walkthrough (2026-07-07)

Blow away (or rename) the app-config dir to fake a first open, then:
- Read all seven pages slowly. Does the arc teach without preaching?
  Page 2 (your pictures are COPIED) is the trust moment — does it land?
- `skip` from page 3 → relaunch → the guide must never reappear.
- Settings › Behavior › Replay the guide → it shows again.
- `start ›` after picking a workflow: you land in the gallery at
  everything scope with the seeded artist boards visible. DESIGN NOTE:
  "inside the seeded example" became "gallery at everything scope"
  because the example lives in the library slot — is that landing
  strong enough, or should start walk one more step into an example
  board? Also: page-7 skip bails to the empty board (uniform skip);
  the storyboard hinted it might land in the example instead — feel
  call flagged by the builder.

## AI-IMP-148 — heading folding (2026-07-07)

In a long structured note (h1/h2/h3 nesting):
- Click a chevron: does the fold read as outline grammar, or as
  content vanishing? Chevron weight and placement (it sits just
  inside the content edge, not a true gutter — WebGL overlay forced
  the compromise) are the open feel calls.
- Fold an h2, type elsewhere, close and reopen — folds reset per
  open by design. Does that feel right or should they stick?
- Click into a folded [...] region: it should unfold under the caret.

## AI-IMP-140 — image radius + shadow (2026-07-07)

On a dense board of real art:
- Do the 3px corners and soft shadow read as designed over many
  images, or does the board look busy/heavy?
- Crop previews and any export path must show the untreated pixels.
- Watch pan/zoom feel at 100+ images — perf held in gates (9.2ms
  p95) but your hands are the final gate.

## AI-IMP-157 — project export (2026-07-07)

Settings › Backups & export › Export project:
- Export your real project both ways (Everything / Skip trash); does
  the estimate footer read honestly against the produced file size?
- Unzip the .ewproj with the Finder — manifest.json + project.sqlite
  + notes/ + assets/ should be legible, ordinary files (the "never a
  lock" promise).
- The size acknowledge line only appears past ~2 GB — if your
  project is bigger, confirm it shows once and never again.

## AI-IMP-158 — project import / the roundtrip (2026-07-07)

The artist's promise, round trip:
- Export your real project, then import the .ewproj back — the copy
  lands beside your project as <name>-imported-<date>. Open it via
  the button: does everything look EXACTLY like the original (boards,
  notes, links, tags, trash)?
- Feed it garbage: rename a .zip of anything to .ewproj and import —
  the refusal should be calm and total (no half-project left).
- The import row's copy ("nothing merges... refused whole") — does it
  read as reassuring or alarming?

## AI-IMP-154 — decoration verbs join Mod+Z (2026-07-07)

- Lock a drawn arrow via right-click, Mod+Z — does one undo free it?
- Mixed selection (pins + a shape) → Lock all → one Mod+Z frees
  everything at once. Does that read as one gesture?
- Select only drawn shapes → the Gather row should be disabled with
  "frames hold items, not decorations" — fair, or annoying?
- Drag a stroke-width slider in the Dock, then Mod+Z: the slider
  drag must NOT undo (your last board action should).

## AI-IMP-149 — the format bar (2026-07-07)

- Select text in a note: the bubble should appear beside the
  selection, never clipped at editor edges. Bold/italic/code from
  it, then check the raw Markdown carries **…**/*…*/`…`.
- The link verb wraps the selection as [[Title]] — does that feel
  right, or did you expect a URL prompt?
- Inline code chips + true-italic em on the paper: legible at
  panel size? Mod+B / Mod+I are listed under "In a note" in
  Settings › Keyboard.

## AI-IMP-164 — delete undo re-binds connectors (2026-07-07)

Draw an arrow between two images, delete one image, Mod+Z: the
image AND its arrow connection should both come back exactly.
Redo should release the arrow again (it stays, free-floating,
where the image was).

## AI-IMP-159 — the crop editor (2026-07-07)

Charm bar › Crop on a placed image:
- Handle feel: corners scale the rect, edges stretch it, thirds
  guides while dragging. Too fiddly? Too loose?
- Commit, then re-enter: the FULL image should return with your
  rect ready to adjust; Reset restores everything.
- Non-proportional crops stretch to the placement's frame (v1
  semantics — displayed aspect changes). Does that surprise you?
- Mod+Z after a crop restores the full display; the file on disk
  never changes.

## AI-IMP-163 — owner-trashed boards stop leaking (2026-07-07)

Trash a node that OWNS a board full of content, then check the
board's ghosts are really gone: search (notes/tags/canvas text),
tag panel locations, note Uses lists, the gallery, outline counts.
Restore the node — everything returns. Before this fix those
surfaces showed content the scene refused to open.

## AI-IMP-135 — the note lifecycle transitions (2026-07-07)

The full walk, on a placed image's note:
- Tear the bound page off (panel-tear): does the 300ms tear read
  as paper leaving a binder? The sticky wears tape + a torn scar.
- Untape (the reverse): 200ms provisional — too fast/slow?
- Place the sticky on the board, then pull its pin: one Mod+Z per
  persisted step. Is pull-pin discoverable enough?
- Double-click the bound page's CHROME (not text) → the centered
  tear into the big editor; esc tucks it home. Discoverable, or
  does it need a charm?
- Rotate an image with its book open: the book drops to the
  tethered card until you square it. Fair behavior or jarring?

## Wave 6 batch (2026-07-07): dialect freeze · charm bar · frameless · cascade · gallery

- **AI-IMP-161**: select a titled image — the charm bar should sit
  BELOW the title now, at any zoom; hide the label and the bar hugs
  the image like before.
- **AI-IMP-165 frameless**: no OS frame anywhere; traffic lights
  in-board; drag the window by the top strip. The smoky gradient is
  subtle on an empty board — judge it over real art. Fullscreen and
  maximize must feel normal.
- **AI-IMP-167 cascade**: open any menu — rows fade in top-to-bottom
  inside ~190ms. Too slow? Too showy? It's the one grammar
  everywhere.
- **AI-IMP-168 gallery**: the size slider (does the range feel
  right?); Space on a work = Quick Look, arrows walk neighbors, Esc
  back. The caption shows title + dimensions (no filename — model
  debt, flagged).
- **AI-IMP-150**: nothing to feel — the dialect is frozen under
  guard. Typing/saving must feel identical.
- **z-ladder port** (rode the batch): panels now sit above the charm
  layer, menus/popovers above panels, chrome above all. If any
  overlay ever hides behind another, that's a bug — report the pair.

## Sign-off batch (2026-07-07 late): the signature pin · the decline toast

- **AI-IMP-166 signature pin**: the path-tail bookmark control is now
  THE pin (the one colored thing in the chrome). Click it — the beat
  should read as one gesture (~0.7s: wiggle, hop, press, settle),
  never looping, reseating exactly where it sat; then the menu sweeps
  in with the usual cascade, rows wearing little globes. Close is a
  plain fade — no reverse ceremony. Questions for the feel pass: is
  the beat's length right on repeat visits (it plays EVERY open —
  charming or tiring by the tenth time)? Does the pin read at
  cap-height beside the board name, or does it want a nudge?
- **AI-IMP-172 decline toast**: make a move on one board, hop to
  another, hit Mod+Z — the toast should NAME the board ("That change
  was made on “X” — open that board to undo it"). It said "another
  board" before, always; now the name should make the walk obvious.
