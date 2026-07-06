# Human testing queue

Things only the owner's hands can validate — feel, legibility,
taste. Claude appends an entry when work lands that needs a human
pass (with the shipping ticket and what to try); the owner flushes
intermittently: delete lines that pass, and anything that fails
becomes a finding for the next batch. This file is a queue, not a
record — history lives in the tickets.

## Owner actions (setup only you can do)

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
- [ ] **Light-theme legibility over art** (EPIC-013, carried):
  chrome and scrim chips readable over bright and busy boards in
  the light theme.
- [ ] **Gallery "earlier this year" buckets** (AI-IMP-078, carried):
  older items bucket as named months trailing 12, then year
  buckets — does the rhythm read right with a real library?
- [ ] **Gallery cell sizing and feel** (AI-IMP-077, carried): grid
  density, thumbnail crop behavior, and scroll feel with real art
  at volume.
