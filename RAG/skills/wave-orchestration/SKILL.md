---
name: wave-orchestration
description: Run a two-model development shop — a long-context orchestrator (plan, design, integration, review authority) assigning ticket waves to a primary implementation model that manages its own subagents and returns pre-reviewed, pre-ordered atomic commits. Use when structuring AI-led software delivery so the orchestrator reviews boundaries and counts instead of every line.
---

# Wave orchestration — the two-model shop

Distilled from the expanding-worlds project (2026-07, Claude Fable 5
orchestrating + Codex implementing), where the pattern shipped four
tagged releases in 24 hours with every merge review-gated. Nothing
here is provider-specific: "the orchestrator" is any long-context
model that holds the project record; "the implementer" is any
strong coding model that can manage its own subagents (in our
instance, a single Codex reading AGENTS.md conventions). Swap
names freely; keep the seams.

## The division of labor

**The orchestrator** owns everything that requires the long
context: the project constitution, design conversations and
rulings, the ticket system, epic planning, assignment briefs,
review verdicts, merges, releases, and ALL destructive git
operations. It never delegates planning or design discussion —
whoever owns the interface owns the comparison and integration.

**The implementer** owns a sitting: it takes an assigned ticket
RANGE, distributes work across its own subagent ecosystem however
it likes, self-reviews, and submits one branch of atomic
commits — one commit per ticket, in dependency order. The
orchestrator never sees the subagents; it sees a pre-reviewed,
pre-ordered series with a submission report.

Why this shape: review economics. The orchestrator cannot read
every line every subagent writes and still hold the design. The
implementer's self-review compresses the surface; the orchestrator
reviews BOUNDARIES first (files touched vs the brief's fences),
then load-bearing logic, then reproduces the validation counts
itself. Trust the report's claims only after the counts reproduce.

## The constitution: one document all truth derives from

Every long-lived decision lives in ONE stably-sectioned document.
Call it the constitution, the normative spec, the record — the
name is free, but there must be exactly one. (The instance calls
it RFC-0001 for historical reasons and keeps the misnomer because
hundreds of citations point at it; pointer stability applies to
the document's own name.) The properties that make it work:

- **Alive by design.** A header table (STATUS / REVISION / LAST
  UPDATED); every edit bumps the revision. Never final, always
  current. The instance sits at rev 0.69 across 477 commits.
- **Stably addressed.** Numbered § sections are an API. Tickets
  cite §N.M instead of paraphrasing — ticket prose can rot, the
  pointer survives, and round-1 review verifies claims against
  the cited section rather than against anyone's memory.
- **A decision log in normative clothing.** Rulings fold in with
  inline rev markers; REVERSALS stay in the text ("accepted rev
  0.19, dropped rev 0.20"); a decision-summary section flattens
  current state; an open-questions section makes "undecided" a
  recorded state instead of an absence.
- **An amendment covenant.** A few constitutional sections
  (invariants, current slice, acceptance criteria, open
  questions, decision summary) are kept mutually consistent on
  every edit, and the revision bumps. That covenant IS the
  amendment procedure.
- **Supreme over conversation.** Decisions live in the document,
  NOT in chat history. Chats die; the constitution is the
  orchestrator's actual long context. It is also why the
  implementer never attends design conversations — a ruling only
  counts once it is constitution text.

`templates/SPEC-TEMPLATE.md` is the skeleton;
`references/EXAMPLE-CONSTITUTION.md` shows the instance's header,
decision summary, and a preserved reversal.

## The substrate: tickets as projections

The constitution is long-term memory; tickets are WORKING memory —
disposable projections of the constitution into work orders,
re-derivable from the source. That is why ticket errors are cheap
(round 1 checks them against the cited sections) and why "the
brief outranks stale ticket text" is safe.

Both models work from the same file-based record (no external
tracker):

- `templates/AI-EPIC.md` — feature epics (problem, solution
  paths, success metrics, spawned ticket list).
- `templates/AI-IMP.md` — implementation tickets: summary with
  citations, out-of-scope, design/approach, files-to-touch,
  a checklist gated by a CRITICAL_RULE (never check an item
  without validated implementation), Given-When-Then acceptance,
  and an honest Issues Encountered section filled at close.
- `templates/AI-LOG.md` — session handoff logs: work completed,
  commits, issues, tests added, next steps. The next session's
  first read.
- `scripts/generate-index.sh` — regenerates the kanban INDEX from
  ticket frontmatter after any ticket change; the index is never
  hand-edited. Also maintains a Size Watch with review-currency
  annotations (see `scripts/approve-loc-review.sh`: after a
  deliberate cohesion review of a large file, record it; the index
  then reports the review current or stale by exact content blob.
  LOC is not a defect — a split needs independently owned behavior
  with a stable extraction seam).
- `scripts/validate-tickets.sh` — the LOUD gate for what the
  index script's normalizer silently patches: frontmatter-first,
  legal statuses, id↔filename agreement, completed ⇒ dated,
  CRITICAL_RULE intact, no unfilled placeholders. Sub-agents run
  it with `--changed` before every submission; a submission
  carrying validation errors is an automatic amend. (First run on
  the instance's 327-file corpus found 27 real defects the silent
  normalizer had accumulated.)

Two companion queues keep humans in the loop: a DESIGN-QUEUE
(decisions needing a design conversation before their work
proceeds) and a HUMAN-TESTING queue (landed work needing a human
feel pass; the orchestrator appends, only humans check off). The
ruling flow runs: DESIGN-QUEUE (intake) → design conversation →
ruling folds into the constitution with a rev bump → tickets cite
the section → briefs carry a normative supplement for anything
ruled after the tickets were cut.

## The wave lifecycle

1. **Cut the range.** The orchestrator cuts or refreshes the
   tickets, orders the range by dependency, and reserves EVERY
   monotonically allocated identifier AT CUT TIME — ticket
   numbers, migration/schema numbers, ports. Parallel agents have
   collided on both migration numbers and ticket numbers; the
   next free number is never max-in-tree + 1, because epics
   reserve ahead and parallel agents hold unmerged work. When an
   implementer is in doubt, it submits as `XXX-<slug>` and the
   orchestrator assigns the number at merge.
2. **Write the assignment brief** (`templates/BRIEF-TEMPLATE.md`
   is the skeleton; `references/EXAMPLE-ASSIGNMENT.md` is a real
   one). A brief is SELF-CONTAINED: ticket paths, build order, a
   normative supplement for anything ruled after the tickets were
   written (the brief outranks stale ticket text), explicit
   fences (files it must NOT touch — including whatever the
   orchestrator is building in parallel), exact validation
   commands, and required report contents including candid
   friction notes.
3. **Round 1 is a pre-implementation review — no code.** Ticket
   diagnoses are hypotheses until verified. The implementer checks
   every claim against current source and reports corrections with
   citations plus a repair scope. This is the highest-value step
   in the pattern: in our instance every single round-1 review
   corrected real ticket errors before a line was written. One
   escape hatch, used sparingly: trivial tickets (a test assert,
   a copy change) may skip straight to build — the implementer
   SAYS SO explicitly rather than silently skipping.
4. **The verdict.** The orchestrator answers with rulings
   (`templates/VERDICT-TEMPLATE.md`;
   `references/EXAMPLE-VERDICT.md` is a real accepted one): what
   to code against where ticket text and review differ. Never
   edit tickets mid-round while the implementer is actively
   working — rulings travel in the verdict; tickets sync after
   the round settles.
5. **Round 2: implementation.** Atomic commit per ticket on the
   sitting's branch, full validation at the tip, a rebase onto
   the freshest main before finishing (a fast-merging lead makes
   bases stale within hours), one submission.
6. **Orchestrator review.** Boundary discipline first, then logic,
   then REPRODUCE the counts (run the full gate yourself; if CI
   has platform legs, push a throwaway `ci/<id>` branch as the
   oracle). Merge, close tickets, tag if a release rides it,
   deliver the verdict. The orchestrator alone cleans up branches
   and worktrees.

## The channel

`templates/PROTOCOL-TEMPLATE.md` is the portable protocol;
`references/CHANNEL-PROTOCOL.md` is the instance's live one. The
shape: a local gitignored directory with `inbox/` (implementer
submissions, hash-watched so the orchestrator is nudged on change)
and `outbox/` (orchestrator verdicts: accepted / amend / declined,
with numbered amendments and round matching). Key properties worth
keeping in any port:

- Submissions and verdicts are FILES with frontmatter (id, branch,
  commit, round) — auditable, replayable, no chat-history
  dependency.
- Rounds match explicitly; an old-round verdict means "review
  pending, keep polling."
- The implementer works in an ISOLATED CLONE (we began with shared
  `.git` worktrees and upgraded at a sitting boundary; clones mean
  the orchestrator fetches from the clone path to merge, and no
  implementer git op can reach shared history).

## Standing fences (learned, not theoretical)

- **Destructive-op fence:** the implementer NEVER deletes
  worktrees, branches, tags, or refs — not even its own after
  acceptance. No force-deletes, `update-ref`, `reflog expire`, or
  `gc`, ever. The orchestrator owns all cleanup.
- **Stop-and-report:** if the implementer hits an interface or
  design decision its brief does not cover, it STOPS and reports
  the question instead of choosing. The design queue exists so
  nothing is decided under way.
- **Honest cleanliness claims:** a submission states leftover
  worktree material; "worktree clean" is a trust-bearing claim the
  orchestrator verifies.
- **Validation discipline:** every chain `set -o pipefail`; read
  COUNTS, not exit codes (a test runner piped through a filter
  reports the filter's exit — this masked 43 failed suites once);
  build workspace packages before integration tests (stale dist
  artifacts fail in ways that look like real regressions).
- **Dedupe against the record:** audits and reviews check
  findings against existing tickets, ruled decisions, and prior
  audits, and cite the relationship — known issues are never
  presented as fresh discoveries.
- **Non-overlapping resources** for anything parallel (ports,
  reserved identifiers, fenced file sets).
- **Sitting economics** (provider-window quirk, generalize as
  needed): an active task survives the rate window, a stopped
  agent never resumes — so assign extended batches, have the
  implementer hold an active poll-loop while awaiting verdicts,
  and treat verdict latency as the orchestrator's top-priority
  interrupt.

## The humans

The owner rules design (the orchestrator drafts options and
records rulings in the design queue), flushes the human-testing
queue, and initiates implementer sittings. Owner deliverables are
ordinary tickets with `assignee: owner` in frontmatter — design
pushes, curation, anything only the owner can do; same kanban,
same close discipline, nothing owner-shaped lives off the books.
Design conversations happen owner ↔ orchestrator at the top level;
the implementer receives only settled rulings. Field reports from
testers route: report → orchestrator conviction against
code/constitution → ruling conversation if needed → ticket → wave.

## Porting checklist

- Write the constitution first (`templates/SPEC-TEMPLATE.md`), or
  promote an existing spec: add the header table, revision
  discipline, and amendment covenant, then let new tickets cite
  sections. One document, stably sectioned, supreme over chat.
- Fill `templates/AGENTS-TEMPLATE.md` for your implementer and
  `templates/PROTOCOL-TEMPLATE.md` for the channel; rename the
  channel directory and branch prefix to taste.
- Plant `templates/` and `scripts/` INSIDE your project's ticket
  tree (the scripts resolve paths relative to their own location
  and expect to live at `<ticket-root>/scripts/`); adopt the
  AI-EPIC / AI-IMP / AI-LOG templates as-is, keeping the
  CRITICAL_RULE and Issues Encountered honesty.
- Wire a hash-watch (hook, cron, or manual) on the inbox so the
  orchestrator is nudged; the implementer polls the outbox on its
  own schedule.
- Keep round 1 review-only even when it feels slow. It is the
  step that makes the rest cheap.
