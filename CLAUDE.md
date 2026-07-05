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
- Benchmark review check: verify the measurement environment before
  trusting numbers (headless Chromium runs WebGL on SwiftShader —
  this nearly inverted the renderer decision). The desktop perf suite
  refuses software GL for the same reason.
- Playwright: never hand `waitForFunction` an async closure — a
  Promise is truthy, so the wait passes vacuously (produced a
  false-green in EPIC-004). Use `expect.poll` with `win.evaluate`.
- Run `pnpm -r build` before desktop e2e after touching packages/*
  (vitest and the utility bundle resolve workspace deps through dist).
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
