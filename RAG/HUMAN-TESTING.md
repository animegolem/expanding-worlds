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
