---
node_id: 2026-07-09-LOG-AI-two-releases-and-the-trust-boundaries
tags:
  - AI-log
  - development-summary
  - testing-iteration
  - audits
  - releases
closed_tickets: [AI-IMP-210, AI-IMP-211, AI-IMP-212, AI-IMP-213, AI-IMP-214, AI-IMP-215, AI-IMP-216, AI-IMP-226, AI-IMP-227, AI-IMP-228, AI-IMP-229]
created_date: 2026-07-09
related_files:
  - packages/persistence/src/lock.ts
  - packages/persistence/src/service.ts
  - packages/persistence/src/dispatcher.ts
  - packages/persistence/src/export/project-export.ts
  - apps/desktop/src/main/index.ts
  - apps/desktop/src/renderer/note/CommandPalette.svelte
  - RAG/CODE-AUDIT-2026-07-09-CODEX-5-6.md
  - RAG/LEAD-REVIEW-2026-07-09-lifecycle-and-testing-closure.md
  - RAG/DESIGN-QUEUE.md
confidence_score: 0.95
---

# 2026-07-09-LOG-AI-two-releases-and-the-trust-boundaries

## Work Completed

Two releases in one day. v0.17.0 (the toggle-and-palette build):
seven-agent UX wave from owner+alph field reports — note charm
toggle (210), creation palette with Enter-creates (211),
selection-aware fit (212), self-dismissing recognition chip (213,
root cause: the chip's ONLY dismissal was the engagement clock,
which takeovers/fade-never/continuous-work all starve), 46px strip
trigger + visible nav arrows (214), board-menu click-away (215),
label fade at distance (216), and the WebKit spike (217 — Chromium
M1 baseline: 120Hz at 100 images; the V2 risk is MEMORY, 4.7GB
resident textures at 500 vs the iPad's 6GB; two-Pixi-instance
dedupe is mandatory for any Tauri port; owner device passes
pending). v0.18.0 (the trust-boundary build): Sol's (GPT 5.6,
first run, 45 min) control-flow audit produced 4 P1s — ALL
lead-verified against code — fixed same-day by a four-agent Opus
wave: single-writer lock via O_EXCL + mkdir-guarded reclaim with
an in-suite 16-process probe (226, which also caught a torn-read
clobber beyond the audit), construction-failure guard (227, found
handle.close() non-idempotent + every createProject throw leaking
the Db), commit-result isolation from subscriber failure (228),
export path authority fused into main + atomic archive
finalization (229). Terra's lifecycle review adopted (four-state
integration status; End Session ticketed as 224); audits ticketed
through 238; design captures: alph's notes-as-captions decoded
into THE CAPTION CARD (image + caption as one connected object —
owner drafting the Note Lifecycle Document), reading-as-camera-verb
ratified in principle.

## Session Commits

- 0cda9d33…0115c96b — alph field reports → tickets 203-208.
- d487d1b4 — DESIGN-GAPS.md letter to the design session.
- 8761ae3e…362a907f — seven UX-wave merges + closes (see 07-08 log
  for wave start); 1248e979 AI-IMP-209 CI hardening; 579bcb1d +
  tag v0.16.0 (prior evening, recorded there).
- 03ede71d/fa14f1d3 — owner v0.17 pass + Parking Lot → tickets
  210-216; camera-verb capture.
- (merges)/006aa4cd…a2dee5dc — 210-216 built, merged, closed.
- 30af9efa — WebKit spike merged (held open on device passes).
- ce9e0d4a — Terra lifecycle review triaged: 224/225 cut, six
  closure decisions queued, four-state status adopted.
- 45483c54 — caption card decoded into both design docs.
- 8434fbd8 — Sol audit → tickets 226-238; 223 absorbs CA-010.
- cb3aec3d + tag v0.17.0.
- (merges) c326e57b/77c5cf78/1d7418d6/ee988d34 — P1 quartet
  merged + closed; 2cf1cc96 + tag v0.18.0.

## Issues Encountered

- Reviewer-model calibration settled: Terra (Codex 5.6 workhorse)
  = dogged, accurate citations, needs P-level downgrading
  judgment; Sol (top tier) = probe-validated findings, all four
  P1s confirmed verbatim — the strongest single review this repo
  has had. "Release" framing ratified: release = 1.0; test builds
  never pause for audit gates (memory updated).
- The e2e suite twice reported one-short shard counts that
  resolved green on rerun (42/43, 49/50) — transient, but twice is
  a pattern; if it recurs, ticket it beside 238.
- cwd reset ate a shard invocation mid-gate (playwright: command
  not found) — the compound-command rule held everywhere else.
- An agent's report claimed it committed on "owner-view" — false
  alarm (prose error; worktree was correct), but the verify-first
  habit is what caught it.
- import-batch flake recurred in Sol's run with BEHAVIORAL output
  (one import actually failed) — upgraded to ticket 238.
- 227 flagged raw Db.close() as still non-idempotent (out of its
  fence) — db.ts cleanup debt, noted here for the next persistence
  ticket.

## Tests Added

E2e 213 → 236 (navigation-scheme, feel-dial, frame-library-load
full path, palette round-trips, charm toggle, floor clamps, strip
fidelity, export failure-path + channel-absence). Persistence 538
→ 554: the 16-process lock probe (both stale configs), five
construction-fault tests, throwing-subscriber regression, atomic-
finalization failure injection. Engine 380 → 387 (label ceiling).
Desktop vitest 329 → 335.

## Next Steps

- P2 wave from Sol (230-235, 238 + revised 223) — 232/234 are
  Sol-calibration candidates as a BUILDER. Terra decisions 2-6
  (GC semantics, retention announce, End Session post-state,
  gallery undo table, session gates) block 219/220/221/224.
- Owner queue: v0.18.0 for alph; WebKit device passes (iPad
  window closing); feel-dial tuning session; the caption-card /
  Note Lifecycle Document draft (his pen); PHASE-1-SIGNOFF.
- Watch: v0.17.0/v0.18.0 release workflows built assets? Verify
  next session. CI on the P1 merges pending at log time.
- Read first next session: RAG/CODE-AUDIT-2026-07-09-CODEX-5-6.md
  (CA-005..015 remain), LEAD-REVIEW (closure sequence),
  DESIGN-QUEUE (reading + caption card + six decisions).
