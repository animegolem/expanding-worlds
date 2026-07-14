---
node_id: 2026-07-13-LOG-AI-the-feel-pass-and-the-geometry-contract
tags:
  - AI-log
  - development-summary
  - design-process
  - observability
  - feel-pass
closed_tickets: []
created_date: 2026-07-13
related_files:
  - RAG/design/DESIGN-LETTER-geometry-and-promises.md
  - RAG/design/DESIGN-QUEUE.md
  - RAG/design/DESIGN-GAPS.md
  - .codex/outbox/ui-observability-pilot.md
  - RAG/AI-LOG/2026-07-13-LOG-AI-the-epic-in-a-weekend.md
confidence_score: 0.9
---

# 2026-07-13-LOG-AI-the-feel-pass-and-the-geometry-contract

## Work Completed

The session after the epic: v0.25.0 met the owner's hands and the
feel pass found the gap class every gate missed. No tickets closed —
this sitting produced DESIGN RECORD, and the next builder should
read it as the notes-epic's origin story.

- **The feel-pass findings, triaged into three lanes**: (1) straight
  bugs — takeover/lens click-through (visible board margin is LIVE
  under takeovers; click-away doesn't dismiss — GR-2 violation by
  any reading), bars rendering under notes + displacing the dock
  (no hypothesis yet, needs the dock pilot); (2)
  implementation-vs-intent — the reservation frame read literally
  produced a LEFT-SHUNTED app (takeovers span left-edge→rail; the
  intent was breathing room, not asymmetry; fix = optical centering,
  frame demoted to collision floor); the ColorPicker is a 44-line
  skeleton (every drawn part present, none of the drawn behavior —
  no thumb, no drag tracking; suspect Stepper/PickerList share the
  quality); (3) THE NOTES MISS — the flagship: AI-IMP-296 shipped
  only the bound-posture reading flight; the actual note experience
  (big editor polish, centered posture, panel notes) never got a
  carrier ticket — it fell through the seam between "kit drew it"
  and "wave shipped it". The zoom-verb ruling has sat in
  DESIGN-QUEUE since 07-09 with its questions unanswered; the lead
  never forced it to a ticket. Owner verdict: bones fine, feel not.
- **PROPORTION LAW written into DESIGN-QUEUE** (owner-approved
  wording, seeds the notes epic): the page's MEASURE is sovereign
  (~45–65 chars at its own type size, never derived from the
  image's aspect; shared edge binds position; height-matching
  subordinate); surfaces center OPTICALLY; no readable surface
  falls below minimum measure. The isolating evidence: squarish
  image → readable book (ok) vs tall portrait → needle of text at
  full image height (never acceptable). The design language had NO
  ratio vocabulary — only fixed tokens and edge-bindings — which is
  why the owner "kept failing to convey" it. Owner is revising the
  design kit against this now.
- **DESIGN-LETTER-geometry-and-promises.md** (the requirements
  letter, owner-directed): every kit page now answers eight things
  or marks N/A — parent ownership/anchoring · containment policy
  (remain/clip/scroll/grow/escape, never silent) · inset provenance
  · layer/portal rules · responsive floors · stress states · hit
  targets · proportion. §3 carries the owner's floating-window
  question verbatim (likes the floating window; the SHORT BAR +
  mostly negative space feels wrong; bar fills the surface or the
  surface hugs content; minimum honest size — redo sanctioned,
  rides the notes epic).
- **The four-layer UI-observability contract accepted**
  (Codex+owner proposal, `.codex` note "ui-observability-pilot"):
  kits (North Star) → operator-side UI promises (tester language,
  BIND ONLY on owner ratification, home
  `RAG/design/promises/<surface>.md`) → geometry evidence (dev-only
  seam) → Computer Use review (Codex drives the real app — INSTALLED
  AND VERIFIED on the owner's mac). Pilot = THE DOCK FAMILY (8–12
  promises; doubles as the live-defect diagnostic; doesn't wait on
  the kit revision). Findings classify six ways: implementation
  defect · missing kit ruling · missing promise · accepted
  exception · regression candidate · intentionally human.
- **Division of sight ruled** (owner q: "do you need computer
  use?"): Codex drives+iterates · the lead verifies EVIDENCE
  BUNDLES (promise-keyed screenshots at stress points, now a wave
  report requirement) and spot-checks by scripting states through
  the Playwright harness and reading captures (the lead is
  multimodal; one page.screenshot() would have caught the
  ColorPicker) · the owner judges motion/beats/hand-feel,
  permanently.
- **Peer conversation with Codex OPENED** (owner-sanctioned:
  "message back and forth… come to me if there are any good
  ideas"): `.codex/outbox/ui-observability-pilot.md` round 1 poses
  five questions — promise grammar (competing drafts invited) · AX
  tree truth vs lies (portals/transforms — defines the seam) · Pixi
  blindness (board content is ONE canvas to the AX tree; do world
  objects need screen-space handles or is dock chrome pure-DOM
  enough) · self-judgment drift (candidate guard: exceptions
  require a visible ledger edit + owner ratification, never
  report-only) · which brief conventions are load-bearing vs
  ceremony (asked directly for the first time). Watcher armed on
  `round: 2`.
- Small fixes: validate-tickets `--changed` now sees
  tracked-unstaged edits (content-wave finding, proven both
  directions); v0.25.0 release body published; bundle-size question
  answered (installers within ~25KB across tags — the epic
  rearranged, didn't diet).

## Issues Encountered

- The feel gap itself is the meta-issue: every gate measured
  contract-truth (counts, invariants, boundaries) and all held;
  NOTHING measured hand-feel, so the entire deficit arrived as one
  lump on the owner's hopeful morning after alph's Campus France
  interview. Named honestly: the ColorPicker passed review because
  review verified anatomy-presence against the preflight, and
  nothing in the gate can render. The observability contract is the
  answer; screenshots-at-review becomes standard.
- The notes miss is a LEAD process failure to own: kit debts marked
  "described, not built" need carrier tickets at ratification time,
  or they vanish. Queue rulings with open questions (the zoom verb,
  07-09) must be forced to tickets, not left to marinate.

## Tests Added

None this sitting (design-record session).

## Next Steps

- **Codex conversation** → converge the five questions → pilot
  brief: ledger scaffold at `RAG/design/promises/dock.md`, 8–12
  promises drafted for OWNER COSIGN, geometry-seam scope, evidence
  bundle format into the wave report template.
- **Owner** (in progress, afk): kit revision against the proportion
  law + the geometry-contract letter §2 + the floating-window
  ruling §3. Alph's feedback set still to be walked (three lanes
  ready). HUMAN-TESTING queue: five entries across v0.24.1/v0.25.0.
- **Lane-1 hotfix wave is cuttable NOW** (doesn't wait on design):
  takeover click-through/scrim, bars-under-notes diagnostic (pilot
  may own this), ColorPicker-to-drawn-behavior (+ Stepper/
  PickerList audit).
- **The notes epic** waits on the kit revision: proportion law +
  floating-window ruling + zoom-verb questions = its charter;
  panel-note experience is the flagship scope.
- Standing: second Codex session's RFC-vs-code audit still
  outstanding; AI-IMP-269 #2 (source-panel flake fix) and #3 (CI
  1s/step prize) cuttable; AI-IMP-204 gallery inspector design
  open.
