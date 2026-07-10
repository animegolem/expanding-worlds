# expanding-worlds

Art-first recursive reference-board / world-building desktop app.
**RAG/RFC-0001-Core-Note-Node-and-Canvas-Model.md is the single
normative spec** — domain semantics, invariants, and every accepted
decision live there, not in conversation history. Read it (or at
minimum its §5 invariants and §20 decision summary) before touching
domain behavior.

## Work tracking

- Tickets live in `RAG/AI-EPIC/` and `RAG/AI-IMP/`; templates in
  `RAG/templates/` are mandatory (frontmatter, LOC caps,
  Given-When-Then acceptance, the CRITICAL_RULE before checking off
  items).
- Run `./RAG/scripts/generate-index.sh` after any ticket change;
  `RAG/INDEX.md` is the kanban and is never edited by hand.
- Check checklist items only after the change is implemented AND
  validated. Fill Issues Encountered honestly, including deviations.
- End every implementation session with an `RAG/AI-LOG/` entry (the
  handoff to the next session), using its template.
- Owner-assigned deliverables are ordinary AI-IMP tickets with
  `assignee: owner` in frontmatter ("M-tickets") — design pushes,
  curation, anything only the owner can do. Same kanban, same
  close discipline.
- `RAG/DESIGN-QUEUE.md` lists decisions needing a design
  conversation before their work proceeds; prune like the flush
  list — resolved items move into the RFC.
- `RAG/HUMAN-TESTING.md` is the owner-validation queue: append an
  entry (ticket + what to try) whenever landed work needs a human
  feel pass; the owner flushes it intermittently. Never check items
  off for them.
- Deferred features must carry self-contained scope in the RFC —
  enough for a future contributor (possibly a weaker model) to execute
  without this conversation.

## Delegation model (validated in EPIC-001)

Planning and design discussion happen at the top conversation level —
never delegated. Implementation may be decomposed:

- The lead directly builds interface-defining and decision tickets
  (whoever owns the interface owns the comparison/integration).
- Symmetric, well-fenced tickets fan out to parallel agents in git
  worktrees. Each agent brief must be self-contained: ticket path,
  normative semantics, exact validation commands, an explicit list of
  files it must NOT touch, and required report contents (including
  candid friction notes when the work feeds a decision).
- Agents commit on their worktree branch; the lead reviews the full
  diff (boundary discipline first, then load-bearing logic), resolves
  merges, re-runs all validation on master, and only then closes
  tickets. The lead maintains final review over everything merged.
- Give parallel agents non-overlapping resources (e.g. `SPIKE_PORT`)
  and never `git add -A` while agent worktrees exist under
  `.claude/worktrees/` (gitignored, but stay alert).
- The lead reserves migration numbers at ticket-cut time; a brief
  that may touch schema carries its number explicitly (parallel
  agents collided on 0004 once — EPIC-022 meta-analysis).
- **Pre-implementation doc review (standard as of 2026-07-10):**
  before code is written against a non-trivial ticket, someone —
  the builder's first act, or a dedicated reviewer — verifies the
  ticket's claims against the CURRENT source and record, and
  reports corrections + a repair scope for approval BEFORE
  implementing. Ticket diagnoses are hypotheses until verified;
  the review supersedes them with cited causes in the ticket
  itself. Origin: AI-IMP-249's review corrected two lead
  hypotheses (with citations) and found a leak the ticket missed —
  before a line changed. Cheap where it's wasted, decisive where
  it isn't.
- Benchmark review check: verify the measurement environment before
  trusting numbers (headless Chromium runs WebGL on SwiftShader —
  this nearly inverted the renderer decision). The desktop perf suite
  refuses software GL for the same reason.
- Validation chains always `set -o pipefail`: piping a test runner
  through grep/tail otherwise reports the FILTER's exit, not the
  suite's — one unpiped chain reported exit 0 over 43 failed
  persistence suites and a second masked 4 real e2e failures behind
  a green call (EPIC-027 merge, AI-IMP-256). Read counts, not exit
  codes; "N passed" without the failed line is not a pass.
- Playwright: never hand `waitForFunction` an async closure — a
  Promise is truthy, so the wait passes vacuously (produced a
  false-green in EPIC-004). Use `expect.poll` with `win.evaluate`.
- Never read `items()`/camera synchronously after `navigateTo` or a
  commit — the scene applies asynchronously. Await the host's
  `waitForItems(ids)` / `whenSceneApplied()` (AI-IMP-113); do not
  hand-roll a try-now/onSceneApplied/timeout wrapper — every
  hand-rolled copy has regressed as a "flake".
- Run `pnpm -r build` before desktop e2e after touching packages/*
  (vitest and the utility bundle resolve workspace deps through dist).
- Fresh worktrees get a husk `electron/dist` (macOS+pnpm exits 0
  without extracting); the playwright globalSetup auto-runs
  `scripts/repair-electron.sh` (AI-IMP-111) — run it by hand if
  launching electron outside e2e.
- Dev mode serves `@ew/*` live (excluded from vite's prebundle,
  AI-IMP-036): after `pnpm -r build`, a plain window reload refreshes
  a running `pnpm dev` session — no server restart. `predev` clears
  stale port-5173 listeners automatically.

## Conventions

- One commit per ticket or reviewed merge; commit messages explain the
  decision, not just the change.
- RFC edits keep §5 invariants, §17 slice, §18 acceptance criteria,
  §19 open questions, and §20 decision summary consistent, and bump
  the revision in the header table.
- The RFC must stay pandoc-convertible
  (`pandoc RAG/RFC-0001-....md -o check.docx` as a sanity check).
- `spike/` is throwaway benchmark code — findings transfer via
  `RAG/spike-reports/`, code does not.
- Domains expected to grow (appearance kinds, lifecycle states)
  are validated in command handlers, NEVER as SQLite `CHECK IN`
  constraints — SQLite cannot ALTER a CHECK, so every added value
  becomes a full FK-aware table rebuild (migration 0006 blocker;
  EPIC-022 meta-analysis).
- Releases (AI-EPIC-011, revised at v0.7.0): SEQUENTIAL minor bump
  per epic close — epics do not finish in numeric order (a
  late-closing EPIC-007 must not want v0.7.0 after v0.14.0 exists),
  so the epic↔version mapping lives in the tag annotation, the
  GitHub release title, and a "shipped in vX.Y.0" line in the epic
  doc, never in the number. Patch for hotfixes. On epic close: bump
  `apps/desktop/package.json` minor, tag `vX.Y.0`, push the tag —
  the release workflow builds unsigned DMG/NSIS/AppImage and
  attaches them to the GitHub Release. `CHANGELOG.md` (standard as
  of v0.20.0): closing tickets append under `[Unreleased]`; the
  release commit renames that section to the version with two
  voices — "For testers" (plain language, what the tester will
  notice; becomes the GitHub Release body, above the standing
  macOS xattr install note) and "Under the hood" (the closed
  tickets, one clause each). Perf e2e is a local hardware
  gate only (CI runners have no GPU; the suite refuses software GL).
- E2E runs use invisible windows (`EW_TEST_HIDDEN_WINDOWS=1`, set by
  playwright.config) — never run the suite with visible windows on
  the owner's machine; set the flag to 0 only to deliberately watch
  a run.
