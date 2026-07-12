> Verbatim instance artifact from expanding-worlds (orchestrator: Claude,
> implementer: Codex, channel: .codex/). Names are instance-specific;
> the shape is the skill.
>
> Corrected snapshot (2026-07-11): the original "accepted" semantics
> predated the destructive-op fence and told Codex to delete its own
> worktree and branch; superseded here and in the live protocol.
> Clone isolation is now current practice (was "planned").

# .codex/ channel protocol — Codex watcher ⇄ Claude (lead dev)

> The two clocks: your 15-min tick is the only timer in the
> system; Claude's side is edge-triggered files (a hash-watch
> injects inbox changes into the next active turn), not a daemon.

Local, gitignored hand-off channel. Three surfaces:

| Path | Writer | Reader | Purpose |
|---|---|---|---|
| `triage-report.md` | Codex | Claude (hook) | Ambient CI/PR triage findings |
| `inbox/<id>.md` | Codex | Claude (hook) | Work submissions for review |
| `outbox/<id>.md` | Claude | Codex (poll) | Verdicts: accept / amend / decline |

Claude's hook hash-watches `triage-report.md` and every file in
`inbox/`; any content change is injected into Claude's next active
turn. Codex polls `outbox/` on its 15-minute schedule.

## Work submissions (Codex → inbox)

When Codex does implementation work: work in your isolated clone,
commit on a branch named `codex/<id>`, do NOT push, and submit by
writing `inbox/<id>.md`:

```markdown
---
submission: <kebab-case-id>
branch: codex/<id>
commit: <sha of the branch tip to review>
round: 1
---

What was done and why; validation commands run and their results;
files touched. Candid friction notes welcome.
```

Rules: `<id>` is stable across rounds (same file, same branch).
Bump `round` on each resubmission. Keep the body under ~4000 chars.
Do not touch `RAG/` beyond a ticket you were explicitly assigned;
never edit `RAG/INDEX.md` or `RAG/HUMAN-TESTING.md`.

## Verdicts (Claude → outbox)

Claude reviews the branch diff and answers with
`outbox/<id>.md`, overwritten wholesale each round:

```markdown
---
submission: <same id>
verdict: accepted | amend | declined
branch: codex/<id>
commit: <sha reviewed>
round: <matches the inbox round it answers>
reviewed: <YYYY-MM-DD>
---

## Notes
Rationale. If accepted: the merge commit on main. If declined: why,
and whether a different approach would be welcome.

## Amendments
(Only when verdict is `amend`.) Numbered, actionable instructions.
Fix them on the SAME branch, update `commit` and bump `round` in the
inbox file, and resubmit by rewriting it — the hash change notifies
Claude.
```

Semantics on Codex's side:

- **accepted** — Claude has merged to main. Do NOT clean up: the
  destructive-op fence applies even now — the lead owns worktree/
  branch removal. You may delete both the inbox and outbox files
  for the id and stop tracking it.
- **amend** — apply the numbered amendments, resubmit (same id,
  round+1). Do not start unrelated work in the same submission.
- **declined** — stop work on that branch; do not resubmit the same
  approach. Notes say whether to try differently.
- **No outbox file yet** — review pending; keep polling, do nothing.

Match rounds: only act on an outbox file whose `round` equals your
latest inbox `round`; an older round means Claude hasn't seen your
resubmission yet.

## Before reporting test failures: BUILD FIRST

`dist/` is gitignored and workspace packages resolve through it —
a fresh or stale checkout ALWAYS fails vitest with missing-export /
"duplicate handler for undefined" errors that look like real
regressions. Run `pnpm -r build` before any test run; only report
failures that survive a clean build. (Two review rounds in a row
reported this stale-dist artifact as a P0/P1 — both disproved.)

## Triage report (unchanged)

`triage-report.md`: overwrite wholesale ONLY when there is something
new (fresh CI failure, actionable review feedback, PR/issue action
taken). Identical content = same hash = no notice — never add
per-run timestamps or "nothing to report" churn. Under ~6000 chars;
link to runs/PRs instead of inlining logs. This whole directory is
gitignored; never commit anything in `.codex/`.

## Destructive-op fence (2026-07-11, lead ruling after the GPT-5.6
## system-card review — severity-3 destructive-cleanup findings)

- Codex NEVER deletes worktrees, branches, tags, or refs — not even
  its own, not even after an accepted verdict. The LEAD owns all
  cleanup (worktree remove, branch deletion, ci/* teardown).
- No git command targets anything outside the sitting's own worktree
  directory. No `-D`, `--force` deletion forms, `update-ref`,
  `reflog expire`, or `gc` anywhere, ever.
- Rationale: the fence was written when sittings shared the
  canonical repo's .git via worktrees, where a destructive op
  could reach shared history. Isolated clones have since replaced
  worktrees at a sitting boundary; the fence applies regardless.

## Sitting economics (2026-07-11, owner ruling on the 5h-limit quirk)

The provider's 5-hour window does NOT kill an ACTIVE task — an
unbroken task rolls onto the weekly quota and keeps running. But a
STOPPED agent never resumes. Therefore:

- Briefs assign EXTENDED BATCHES (ticket ranges / whole epics), not
  single tickets — the sitting should never run dry of authorized
  work while healthy.
- Codex never ends its turn to wait: while a verdict is pending,
  hold an ACTIVE loop (poll .codex/outbox; use the wait for
  read-only prep on the NEXT ticket in range — census, test
  fixtures, nothing that presumes the ruling).
- The lead treats verdict latency as the top priority interrupt:
  a submission answered fast keeps the sitting alive; one answered
  slow may kill it for the week.
- Plan reviews so the batch is fully VERDICT-COVERED before the
  window's natural end — front-load the round-1 review, one big
  submission round, no optional mid-sitting round-trips.
