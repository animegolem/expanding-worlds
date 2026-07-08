---
node_id: 2026-07-08-LOG-AI-alph-arrives-and-the-wave-ships-v0160
tags:
  - AI-log
  - development-summary
  - testing-iteration
  - agent-wave
  - ci-hardening
closed_tickets: [AI-IMP-188, AI-IMP-191, AI-IMP-192, AI-IMP-193, AI-IMP-196, AI-IMP-199, AI-IMP-200, AI-IMP-203, AI-IMP-205, AI-IMP-206, AI-IMP-209]
created_date: 2026-07-08
related_files:
  - apps/desktop/src/renderer/canvas/charms-ui.ts
  - apps/desktop/src/renderer/canvas/host.ts
  - apps/desktop/src/renderer/note/panels.ts
  - apps/desktop/src/renderer/note/NotePanel.svelte
  - apps/desktop/src/renderer/views/GalleryView.svelte
  - apps/desktop/src/renderer/chrome/TitleStrip.svelte
  - apps/desktop/src/renderer/dev/feel-dial.ts
  - apps/desktop/src/main/index.ts
  - RAG/RFC-0001-Core-Note-Node-and-Canvas-Model.md
  - RAG/design/DESIGN-GAPS.md
confidence_score: 0.95
---

# 2026-07-08-LOG-AI-alph-arrives-and-the-wave-ships-v0160

## Work Completed

Alph's first day as a live tester, worked end to end in the shared
workspace. His Discord stream (relayed by the owner) produced
tickets 203-208: guide previous button, gallery preview/inspector
(design-first, DESIGN-QUEUE), mouse navigation scheme, live feel
dial, rail-surface exclusivity (207, half design conversation), and
the Make-canvas mockup gap (208, owner M-ticket — validation showed
the recursive core loop fully built on three surfaces; the drift is
the design system never drew the charm, and the charm click is
nearly silent). Wrote RAG/design/DESIGN-GAPS.md — a letter to the
design session with the full shipped-but-never-drawn checklist —
at the owner's request.

Staged a six-agent wave (3 Opus, 3 Sonnet) over ten tickets in four
collision fences: note panels (199/193/200), gallery (196/188),
input (205/206), plus 192, 203, 191 solo. All ten merged after
full-diff review, union gate 226/226 e2e + 1331 units + lint.
Codex reviewed head 362a907f clean (no findings). CI then failed —
four wave tests assumed mac-speed frames; one was a REAL product
defect (192's floor-arming lived only in the rAF). Fixed as
AI-IMP-209 directly on main; CI green on 1248e979; tagged v0.16.0.
RFC bumped to 0.67 (open question 18 resolved by alph's mouse
report — the navigation scheme setting).

## Session Commits

- 0cda9d33/81efdf65/189d6b8f/0115c96b — tickets 203-208 captured
  from alph's stream; 207 rail exclusivity; 208 M-ticket.
- d487d1b4 — DESIGN-GAPS.md letter; DESIGN-QUEUE sibling pointer.
- 8761ae3e/006aa4cd — merge+close 203 (guide previous button).
- 6ad6c01e/343b6125 — merge+close 205/206; RFC rev 0.67.
- (merge)/5c033e0a — merge+close 196 (acceptFirstMouse) + 188.
- (merge)/c8339d3f — merge+close 192 (edge-triggered floor clamp).
- (merge)/1ac4cdc1 — merge+close 199/193/200 (panel family; wedge
  decomposed into flash + invisible-fade; hold-at-floor).
- (merge)/362a907f — merge+close 191 (title strip; Codex head).
- 1248e979 — AI-IMP-209 CI hardening (event-driven floor check,
  spec polls/samplers/MutationObserver).
- 579bcb1d + tag v0.16.0 — version bump, annotated tag, release
  workflow building.

## Issues Encountered

- Three agents parked on auto-backgrounded validation despite brief
  warnings; root cause: apps/desktop's `test` script chains the
  full playwright suite, and two-glob halves now exceed the ~10-min
  cap at 226 tests. Standard is now FOUR+ shards (~≤8 min each);
  memory updated. Candidate hygiene ticket: split `test` into
  `test:unit`/`test:e2e` so the ticket-template gate line stops
  being a footgun.
- Shared-workspace hazards found and institutionalized: push
  failed because the owner's tree is branch `owner-view` tracking
  origin/main while the old lead-docs worktree held `main` —
  worktree removed, `push.default upstream` set, two stranded
  commits pushed. Resume-of-cleaned-agents now defaults to the
  OWNER'S tree (lead-docs is gone) — worktree-exists check is
  mandatory before any resume (memory updated).
- CI red after local+Codex green: mac-local timing is not evidence
  of frame robustness. The 209 lesson: e2e must await observable
  conditions, never assume a frame budget. One product race found
  only by the slow runner.
- 196's fix (`acceptFirstMouse`) is machine-unverifiable (hidden
  harness always has focus) — owner's hands are the gate, flagged
  in HUMAN-TESTING with the blast-radius question.
- The 199 "wedge" honestly decomposed: not a store wedge — 193's
  unpositioned paint + 116's fade-to-invisible squatting the
  tethered slot (200's cure). Agent corrected the ticket's theory.
- chrome/feel.ts has dead exports (old fade helpers) — cleanup
  debt, noted by both the agent and Codex.

## Tests Added

- e2e: navigation-scheme (3), feel-dial (1), frame-library-load
  full path (the coverage whose absence shipped 129 broken),
  gallery-selection ground-click, charms floor-clamp ×2, panels
  wedge-spam/burst/no-flash ×3+, shell strip-fade + no-pill,
  first-run previous/dots/arrows. Suite: 213 → 226.
- Units: charms-ui floor predicate (6); desktop vitest 329 → 335.
- AI-IMP-209 hardened the four CI-fragile tests deterministic
  (polls, run-until-visible samplers, mount-instant observer).

## Next Steps

- v0.16.0 release workflow was in_progress at session end — verify
  assets landed and hand the owner/alph the download link (macOS
  install needs the xattr line from README).
- Owner checks pending: macOS Reduce Motion for 202 (desk physics);
  196 first-click on real hardware; title strip's two calls (Board
  at top-right? hairline border?); the new HUMAN-TESTING entries
  (panel family + feel-dial tuning session with alph).
- Build queue next: 207 half 1 (rail exclusivity, ruled), 201
  (wheel-over-panel, rule table gains a scheme column), 195 (image
  crispness), 187, 174, 185/186 verify-first, 197/198 after their
  design conversations. Design side: DESIGN-GAPS.md checklist;
  204 gallery-inspector conversation (candidate to include alph).
- New Codex pretrain expected 2026-07-09 — re-benchmark (one
  review + one small build) before re-tiering.
- Reserved: end-of-weekend Fable solo audit before the extension
  lapses (~2026-07-11/12).
