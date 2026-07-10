# AGENTS.md — instructions for Codex sessions in this repo

You are a peer contributor working under Fable (the lead). The lead
reviews and merges everything; your deliverable is always a clean,
committed branch plus a candid report. CLAUDE.md and
**RAG/RFC-0001-Core-Note-Node-and-Canvas-Model.md** (the single
normative spec) govern; this file is your delta.

## Workspace rules

- Work ONLY in your isolated worktree/clone (e.g.
  `/private/tmp/expanding-worlds-audit`). NEVER run git against the
  owner's checkout at `/Users/golem/git/expanding-worlds`.
- Branch naming: `codex/<topic>`. One commit per ticket. Never push.
- Rebase onto the freshest `origin/main` before finishing — the lead
  merges fast and your base goes stale within hours.
- End state = clean tree, committed branch, final report naming the
  branch and commit SHAs.

## Ticket discipline

- **Cross-check ticket numbers before claiming one.** The next free
  number is NOT `highest-in-RAG/AI-IMP + 1`: epics reserve numbers
  ahead (grep `number reserved` across `RAG/AI-EPIC/`), and parallel
  agents may hold unmerged tickets. Check `RAG/INDEX.md`, the epic
  reservations, AND recent `origin/main` log; if any doubt remains,
  name the ticket `AI-IMP-XXX-<slug>` and let the lead assign the
  number at merge.
- Templates in `RAG/templates/` are mandatory (frontmatter,
  Given-When-Then, the CRITICAL_RULE). Check checklist items only
  after implemented AND validated. Fill Issues Encountered honestly,
  including deviations — a flagged deviation is fine, a silent one
  is not.
- Run `./RAG/scripts/generate-index.sh` after ticket changes.
  Leave `kanban_status` for the lead to flip at merge unless your
  ticket is unambiguously self-contained.
- Leave HUMAN-TESTING.md alone — suggest entries in your report; the
  lead appends. Never check off owner items anywhere.

## Validation (bitten repeatedly — follow exactly)

- NEVER `pnpm -r test`: apps/desktop's `test` script chains the FULL
  playwright suite (~12 min). Use `pnpm --filter='./packages/*' test`
  then, from apps/desktop, `npx vitest run`.
- `pnpm -r build` before any desktop test (workspace deps resolve
  through dist).
- E2e in FOUR+ shards, each ≤~8 min; playwright CLI args are
  REGEXES, not globs: `"e2e/[a-d][^/]*\.spec\.ts"` etc. — verify via
  `npx playwright test --list` that shards cover every spec exactly
  once. Hidden windows come from playwright.config
  (EW_TEST_HIDDEN_WINDOWS=1); never run visible on this machine.
- Known environment quirks: `decorations.spec.ts` font-enumeration
  fails deterministically in some worktree envs (pre-existing — note,
  don't chase); `CI=true` needed for pnpm's no-TTY guard; `spike/` is
  npm-managed, outside the pnpm workspace.

## Code rules that gate merges

- No raw hex outside `theme.css`; never `<datalist>`.
- Never hand playwright `waitForFunction` an async closure (a Promise
  is truthy → vacuous pass); use `expect.poll` + `win.evaluate`.
- Never read `items()`/camera synchronously after `navigateTo` or a
  commit — await `waitForItems(ids)`/`whenSceneApplied()`; never
  hand-roll a wrapper around them.
- Growing domains validate in command handlers, NEVER SQLite
  `CHECK IN`. Migration numbers are reserved by the lead at
  ticket-cut — ask, don't take.
- Compound flows are fail-stop: inspect every CommandResult.
- If you hit an interface or design decision your brief doesn't
  cover, STOP and report the question instead of choosing.

## Reviews and audits

- Every finding carries file:line. Severity means what the audit
  header says it means; "block release" language refers to 1.0 —
  test builds ship at cadence regardless.
- Dedupe against the existing record before reporting:
  `RAG/INDEX.md` (tickets), `RAG/DESIGN-QUEUE.md` (ruled/queued
  decisions), `RAG/design/DESIGN-GAPS.md` + `LIFECYCLE-INVENTORY.md`
  (known design holes), `RAG/CODE-AUDIT-*.md` / `LEAD-REVIEW-*.md`
  (prior audits). Where a finding touches a known item, cite the
  relationship — never present known issues as new discoveries.
