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
- [ ] **Light-theme legibility over art** (EPIC-013, carried):
  chrome and scrim chips readable over bright and busy boards in
  the light theme.
- [ ] **Gallery "earlier this year" buckets** (AI-IMP-078, carried):
  older items bucket as named months trailing 12, then year
  buckets — does the rhythm read right with a real library?
- [ ] **Gallery cell sizing and feel** (AI-IMP-077, carried): grid
  density, thumbnail crop behavior, and scroll feel with real art
  at volume.
