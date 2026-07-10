# Human testing queue

Things only the owner's hands can validate — feel, legibility,
taste. Claude appends an entry when work lands that needs a human
pass (with the shipping ticket and what to try); the owner flushes
intermittently: mark entries [x]/[FAIL] with notes, and Claude
absorbs them — findings become tickets, and flushed entries move to
the **Reviewed** section at the bottom. History lives in the
tickets.

## Awaiting validation

- [ ] **Settings survive crashes** (AI-IMP-237, 2026-07-09, Sol
  P3): kill -9 the app mid-settings-change a few times, relaunch —
  settings are never silently reset; if a corrupt file ever
  appears, the reset toast should read clearly, not alarm.

- [ ] **Snapshots vs your git tools** (AI-IMP-223/218, 2026-07-09,
  Sol P2 + Terra P1): export twice in quick succession — both
  archives import cleanly, nothing left inside the project dir;
  open a pre-existing project, let a snapshot fire, confirm its
  .gitignore now carries "(managed v2)" with your own lines
  intact; hold a git GUI open on the backup repo during a snapshot
  — it defers politely ("present and fresh") and commits later.

- [ ] **A board from nothing** (AI-IMP-239, 2026-07-09 — the
  build's headline; alph first pass): right-click empty board →
  "New board…", name it, Enter — you land inside (path bar shows
  it); back on the origin board the board-object carries the name
  and dive chip; ONE Mod+Z from the origin board removes it all.
  Known limit, deliberate: Mod+Z from INSIDE the new board
  declines with the cross-board toast instead of deleting the
  floor under you.

- [ ] **Gallery scope flips** (AI-IMP-236, 2026-07-09, Sol P3):
  rapidly flip everything ⇄ this world (especially right after
  designating a library) — the everything side always loads, never
  wedges on "Opening the library…" or an empty grid; a source
  panel opened after still works.

- [ ] **Hostile imports refuse politely** (AI-IMP-234, 2026-07-09,
  Sol P2): import a real large .ewproj — clean; import an
  obviously junk/truncated one — understandable refusal, no
  half-project left on disk.

- [ ] **Tauri shell — quiet-machine rerun** (AI-IMP-240,
  2026-07-09): all timing rows were taken under ~10-agent load
  (loadavg 69-114!) and are marked LOAD-SUPPRESSED. When the
  machine is quiet: `cd spike/tauri-shell && npm install &&
  (cd ../.. && pnpm -r build) && EW_SPIKE_IMAGES=100 pnpm tauri
  dev` (auto-runs, writes results/sweep-100.json), repeat at 500.
  Note WKWebView caps rAF at 60Hz — p50 ~17ms is the display
  link, not a regression. The load-immune number already stands:
  4.39GB resident  images.

- [ ] **Connectors stay honest** (AI-IMP-235, 2026-07-09, Sol
  P2): draw a connector anchored to two images, delete/undo and
  move the anchored images — anchors track exactly; nothing about
  drawing should feel changed (the fix refuses a state the UI
  could never legitimately create).

- [ ] **One writer, always** (AI-IMP-226, 2026-07-09, Sol P1 —
  the wave headline): force-quit mid-session, relaunch immediately
  — reopens promptly (dead-pid reclaim). Then stall the app with a
  huge import and try opening the same project from a second
  instance — it must REFUSE, never open a second writer.

- [ ] **Export trust + atomicity** (AI-IMP-229, 2026-07-09, Sol
  P1): export to an external folder (succeeds, counts look right);
  try a destination INSIDE the project folder (clear refusal);
  cancel the dialog (note: a 0% progress bar now flashes during
  the dialog — feel call whether that bothers you); overwrite an
  existing .ewproj (old file only replaced on success).

- [ ] **A failed open heals** (AI-IMP-227, 2026-07-09, Sol P1):
  if a project ever refuses to open (corrupt cache, disk hiccup),
  fix the cause and reopen — it must open normally, never "locked
  by pid …" with no way back short of killing the app.

- [ ] **Committed means committed** (AI-IMP-228, 2026-07-09, Sol
  P1 — developer-flavored but worth one pass): make an edit, then
  force-quit/restart just after — the edit must survive AND never
  have shown an error at commit time. The old bug: a notification
  hiccup could report a saved change as failed.

- [ ] **Title band, round two** (AI-IMP-214/215, 2026-07-09, your
  Parking Lot): hover anywhere in the top ~46px — the smoky strip
  smokes in from the whole band now, not a 1px edge. Check: ⌂
  vertically centered on the traffic lights (optical call, headless
  can't judge it); ‹ › arrows legibly light in BOTH themes; open
  the Board menu and click empty board — it closes, and the
  dismissing click must NOT deselect or disturb anything (clicking
  a toast or the dock leaves the menu standing).

- [ ] **WebKit spike — the three device passes** (AI-IMP-217,
  2026-07-09; the V2 go/no-go data): `cd spike/webkit-renderer &&
  npm install && npm run dev`, then run the 30s sweep at 100 and
  500 images in (1) desktop Safari on this Mac, (2) the iPhone 17,
  (3) the 2020 iPad Pro — devices open the printed `Network:` URL
  on the same Wi-Fi; keep Safari foregrounded. Paste each JSON back.
  Context already in the report (RAG/spike-reports/
  webkit-renderer.md): Chromium on this Mac pins 120Hz at 100
  images; the risk is MEMORY (4.7GB resident textures at 500 vs
  the iPad's 6GB) — on the iPad, watch for a tab reload (memory
  kill) more than judder.

- [ ] **Note charm toggles** (AI-IMP-210, 2026-07-09, your ask):
  click the note charm — open; same click — closed; again — open.
  The ¶ hint chip in the node's corner toggles identically.

- [ ] **The creation palette** (AI-IMP-211, 2026-07-09, your
  ruling): note charm on a note-less node → centered palette over a
  dimmed board. Type a brand-new title, hit Enter — created,
  attached, open, no mouse. Arrow to an existing note + Enter
  attaches it; Escape cancels. ONE DEVIATION TO GUT-CHECK: you said
  "dumps it under the cursor" — the builder opens it TETHERED
  BESIDE THE NODE instead (argument: the palette always acts on a
  node already on screen, so beside-the-node IS under-the-cursor
  without new machinery). If that lands wrong in the hand, say so
  and the literal cursor-drop becomes a small follow-up.

- [ ] **Label fade at distance** (AI-IMP-216, 2026-07-09, your
  "Beyrl" screenshot): zoom a titled placement out past board zoom —
  the title should fade away with the shrinking art (gone by the
  8px floor, full by 48px) and return on zoom-in. The fade band is
  a feel call: too early? too late?

- [ ] **Selection-aware fit** (AI-IMP-212, 2026-07-09): select one
  of several far-apart items, hit ⤢ or ⇧1 — frames just that item;
  clear selection, same verb frames everything. Does it feel right
  next to the explicit "Zoom selection" button?

- [ ] **The chip puts itself down** (AI-IMP-213, 2026-07-09, alph
  first pass — his find): drop a duplicate so "Already in your
  library" appears, keep working WITHOUT going idle — it should
  clear itself within ~8s; also try while a crop editor is open.
  Never marooned mid-screen again.

- [ ] **Title strip fidelity** (AI-IMP-191, 2026-07-08, your
  screenshots): hover the top edge — the smoky band should breathe
  in over ~a fifth of a second (not pop); the board name is bare
  text clear of the traffic lights (no pill); dragging the empty
  band still moves the window. TWO CALLS FOR YOU: (1) the Board
  button moved to the strip's top-right (the bare path now owns the
  corner) — right home for it? (2) the prototype carries a hairline
  border under the strip; the builder omitted it (a hairline reads
  as "a bar," which decision-01 rejects) — agree, or want the line?

- [ ] **The note panel family — your two worst FAILs** (AI-IMP-199
  + 193 + 200, 2026-07-08): the "wedge" decomposed into two braided
  bugs — the corner flash (193) plus panels FADING INVISIBLE at
  board zoom while still holding the note slot (the 116 fade; cured
  by 200's hold-at-floor). Try, in order: (1) place a pin — the
  note must appear once, already beside the pin, never blinking in
  the upper-left; (2) spam a note charm open/close 10× fast, tear
  to big editor and Escape rapidly — the note must always reopen;
  (3) at your normal board zoom, open a tethered note — it should
  READ AS OPEN (held at half card size, never a stamp), and pinning
  it should jump ~2× now, not 4–6×; (4) big editor over dark and
  light art — does the paper shadow finally read? Feel dials if
  wrong: MIN_PANEL_SCREEN_SCALE (0.5), overview fade (0.1).

- [ ] **Charm bar below the floor** (AI-IMP-192, 2026-07-08, your
  proposal): select an image, zoom way out until it's a speck — the
  charm bar should vanish WITH the selection (zooming back in
  leaves nothing selected; reselect deliberately). Two feels to
  judge: dismissal vs mere hiding, and does the 8px floor fire at
  the moment you'd expect? Note: selections BORN tiny (search
  fly-to onto a small asset) deliberately survive.

- [ ] **Library picker first click — THE 129 FAIL** (AI-IMP-196,
  2026-07-08): the fix is macOS-level and machine-unverifiable, so
  this one needs your hands. Click another app first (window
  unfocused), then: selected frame → Add from library → click a
  tile as your VERY FIRST click back into the window. It should
  select and place into the frame — not feel dead, not dismiss.
  Side effect to gut-check: a first click into an unfocused window
  now ACTS everywhere (the PureRef behavior) — could a stray
  activation click ever move a placement you didn't mean to touch?

- [ ] **Gallery ground click** (AI-IMP-188, 2026-07-08): select a
  few tiles (action bar up), click empty space between thumbnails —
  selection clears, bar dismisses, Quick Look closes. Date/group
  headers and tiles behave as before.

- [ ] **Mouse navigation scheme** (AI-IMP-205, 2026-07-08, alph's
  ask — he gets first pass): Settings → Navigation → Mouse, then on
  a real mouse: scroll wheel zooms toward the cursor; holding the
  middle button + drag pans (no autoscroll puck should appear);
  flip back to Trackpad and two-finger scroll pans again. Pinch and
  ⌘/Ctrl+wheel zoom in both modes. Known tuning point: zoom-per-
  notch on a discrete Windows wheel may feel different from
  trackpad — that's what the feel dial is for.

- [ ] **The feel dial** (AI-IMP-206, 2026-07-08 — this one IS the
  tuning tool): press ⌥⇧⌘F (macOS) / Ctrl+Shift+Alt+F (Windows) to
  open it. Drag Zoom-ease (τ) and feel the very next zoom change —
  alph's "weight" complaint is this slider. When it feels right,
  "Copy values" puts JSON on the clipboard — paste it in Discord
  and the numbers become the shipped defaults. "Reset" returns to
  code values.

- [ ] **Guide previous button** (AI-IMP-203, 2026-07-08, alph's
  ask): replay the guide from Settings — page forward a few cards,
  click ‹ previous and tap ArrowLeft/ArrowRight. Does the disabled
  previous on card 1 read as "start of deck" rather than "broken
  button"? (Alph should get this one — his find.)

- [ ] **Menus, everything + About + trash tone** (AI-IMP-137,
  2026-07-07): right-click a drawn shape (style verbs only), a
  multi-selection (count header · align family · GATHER INTO A
  FRAME — try it, one Mod+Z undoes the whole gather), and a frame
  (sort rows · "Delete frame — contents stay"). ☰ → Help/About:
  the plain-type card (version + RFC rev live, copies-never-touches
  line) — does no-logo read as intended? Trash…: archive tone —
  neutral rows, Restore in accent, only "Empty trash…" wearing
  danger, the new empty-state line.

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
  NOTE: your 2026-07-08 too-small finding is AI-IMP-200 — retest
  after it lands.

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
  maximize must feel normal. (Your 2026-07-08 finding — gradient
  not rendering, pill box, spacing — is AI-IMP-191; retest after.)
- **AI-IMP-167 cascade**: open any menu — rows fade in top-to-bottom
  inside ~190ms. Too slow? Too showy? It's the one grammar
  everywhere.
- **AI-IMP-168 gallery**: the size slider (does the range feel
  right?); Space on a work = Quick Look, arrows walk neighbors, Esc
  back. The caption shows title + dimensions (no filename — model
  debt, flagged). (Click-away deselect is AI-IMP-188.)
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
- **AI-IMP-134 bound page (the open book)**: open a note on a placed
  portrait image — the page should bind flush to the image's freer
  side at exactly the image's height, binder rings straddling the
  seam, flat like world paper (no shadow). Open one on a wide
  (≥1.4:1) image — it should bind BELOW like a calendar at image
  width. Zoom out: rings degrade to a stroke, then the whole page
  fades. Feel questions: does the book read instantly as a book?
  Ring weight right? Does the calendar bind feel natural on wide art?
- **AI-IMP-138 frame furniture**: title a frame (its note title) —
  the name should sit ON the top edge in mono, exactly where item
  labels never go, and vanish as you zoom out while the frame's
  outline stays a hairline forever. Select the frame: the charm bar
  grows a "▦ grid / ◇ float" toggle + sort-now. Feel questions: is
  the on-edge position instantly readable as "this is the frame's
  name"? Chip legible on nested frames?
- **AI-IMP-170 URL cluster**: paste a note from Obsidian carrying a
  link, a bare <url>, an image, and ==highlight== — everything
  should survive byte-exact. Images render as small non-fetching
  chips (domain-named, nothing loads). Feel questions: does the
  image chip read as "there's an image here" or does it look like a
  broken link? Highlight tint sit right in both themes?
- **AI-IMP-171 tag rename**: open a tag's panel — a pencil sits by
  the name. Click it, type a new name, Enter: every chip, the
  completion vocabulary, and the panel should follow. Try renaming
  onto a name that already exists — it should refuse with a toast
  and keep your edit alive. Escape once cancels the edit only;
  again closes the panel. Feel: does the pencil read instantly, and
  does refuse-and-stay feel better than refuse-and-close?

## AI-IMP-180 — frame-membership survives delete + undo (2026-07-08)

Capture a few items inside a frame. Then:
- Delete ONE member (select it, Delete), and Mod+Z: the item should
  come back AND be grouped in the frame again — not floating loose.
- Delete the FRAME itself (select the frame's wash, Delete), and
  Mod+Z: the frame returns AND every item it held should be its
  member again, exactly as before.
- For nesting: put a frame inside a frame with its own items, delete
  the inner frame, Mod+Z — it should rejoin the outer frame AND
  regain its own contents.
Feel question: does the grouping snap back invisibly, or is there
any flicker where things look ungrouped for a moment?

## Fix waves (2026-07-08)

- **Fix wave A (176/178/179/180) — mostly invisible, worth abuse**:
  double-click crumbs and spam trackpad-back — the camera should
  always land right and ⌂ should never die. Drop two image batches
  back to back before answering the "how should they land?" ask —
  both batches should ask in turn, nothing lost. Delete a frame (or
  a framed item), undo — grouping should come back whole. Exports
  during idle are now corruption-proof (nothing to feel; just trust
  it).
- **Fix wave B (181/183) — the keyboard behaves now**: hold Cmd+Z —
  exactly one undo per press, no phantom re-dos. Decline a redo
  cross-board — the toast says "redo," not "undo." Then the Escape
  tour: with a selection alive, Escape-close every surface (bookmark
  menu, board menu, project popover, location chooser, a title
  rename mid-edit) — your selection should survive every one of
  them. Open the big editor and hit Mod+P — nothing should fire
  underneath it. One Escape = one layer, everywhere.
- **Fix wave C (177/184) — nothing stale, nothing late**: give a
  board a backdrop, hop to a bare board, right-click — no backdrop
  verbs should appear (they used to, and Reset would copy the OLD
  board's image over). Toggle a selected frame's sort from the Dock
  — the charm chip should flip live. Right-click a frame and
  immediately click away — the menu should NOT pop up late.
- **Fix wave D (175/182) — hover everything, undo everything**:
  hover every little control — each should offer the same chip
  (six settings swatches, the gallery/search/tag ✕s, window
  buttons); dock reorder + zoom-fit + gallery trash now print their
  shortcuts. Eyeball asks: do "Flat canvas color 1–6" want real
  names? Does the tag-lens wording read right? Then the big one:
  Mod+Z now covers appearance flips, note renames, tag
  create/assign/rename, detach, bookmark edits — spend a session
  trusting it; any verb that FEELS wrong under undo gets trimmed
  (one line each, say the word). Trashing still recovers via Trash
  only, by design.

---

## Reviewed (owner pass, 2026-07-08 — on v0.15.0)

**Setup items — resolved by choice:** the Codex watcher /
auto-review / CI-diagnose secret trio is moot: **reviews are
triggered manually** now, deliberately.

**Passes:**
- AI-IMP-153 one voice — PASS. Minor cleanup noted; parked for a
  design-team flagging pass "when it's time-appropriate to
  actually proceed."
- AI-IMP-130 designed void — PASS.
- AI-IMP-098 zoom feel — PASS as shipped (defaults freeze).
- AI-IMP-087 label clearance — PASS.
- AI-IMP-031 rotate cursor glyph + band width — PASS.
- AI-IMP-082 resize snapping — PASS.
- AI-IMP-083 pinned-panel resize — PASS; big editor opens/returns
  correctly (see shadow failure below).

**Failures → tickets (the finding lives in the ticket now):**
- AI-IMP-129 "Add from library": picker opens then self-dismisses;
  nothing selectable, step 1 impassable → **AI-IMP-196**.
- AI-IMP-127 frames: no drop-target brightening (screen dims,
  frame doesn't light); partial-overlap multi-drop captures one
  item unsorted (cursor intent ignored); frame move/resize never
  reflows members → **AI-IMP-197**.
- AI-IMP-128 arrange/normalize: verbs undiscoverable ("I don't see
  any of these options"); right-click align does different things
  at different times, align-center collapses spreads into overlap
  → **AI-IMP-198**.
- AI-IMP-086 note open: panel opens-and-instantly-closes once, then
  that node's note is permanently unopenable → **AI-IMP-199**.
- AI-IMP-083 panel default size: tethered notes render far too
  small ("almost unperceivable as even open"), notebook effect not
  selling, undock jumps size 4–6×; big-editor shadows don't read
  → **AI-IMP-200**.
- Notes swallow wheel: canvas scroll blocked whenever the cursor is
  over a note → **AI-IMP-201**.
- AI-IMP-151 desk physics: only the pin beat visible — none of the
  movement beats (lift/settle/seat/strain) play → **AI-IMP-202**.

**Same pass, screenshot stream → tickets:** gallery click-away →
188 · dock/beta controls + text style bars → 189 · shape
hold-picker + Miro gap review → 190 · title strip
(pill/spacing/gradient) → 191 · charm-bar zoom clamp → 192 · note
spawn flash → 193 · note paper shape → 194 · image softness
(mipmap/DPR diagnosis) → 195.
