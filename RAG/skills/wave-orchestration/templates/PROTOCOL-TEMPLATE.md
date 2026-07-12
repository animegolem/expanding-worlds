# {{channel-dir}}/ channel protocol — {{implementer}} ⇄ {{lead}}

Local, gitignored hand-off channel. Never commit anything in
`{{channel-dir}}/`.

**The two clocks.** The implementer's poll (every
{{poll-interval}}) is the only timer in the system. The lead has
no daemon: a hash-watch on the inbox injects any content change
into the lead's next active turn — edge-triggered files, not a
schedule. Identical content = same hash = no notice, so never add
per-run timestamps or "nothing to report" churn.

Three surfaces:

| Path | Writer | Reader | Purpose |
|---|---|---|---|
| `triage-report.md` | {{implementer}} | {{lead}} (hash-watch) | Ambient CI/PR triage findings |
| `inbox/<id>.md` | {{implementer}} | {{lead}} (hash-watch) | Work submissions for review |
| `outbox/<id>.md` | {{lead}} | {{implementer}} (poll) | Verdicts: accept / amend / decline |

## Work submissions ({{implementer}} → inbox)

When doing implementation work: work in your isolated clone,
commit on a branch named `{{prefix}}/<id>`, do NOT push, and
submit by writing `inbox/<id>.md`:

```markdown
---
submission: <kebab-case-id>
branch: {{prefix}}/<id>
commit: <sha of the branch tip to review>
round: 1
---

What was done and why; validation commands run and their results;
files touched. Candid friction notes welcome.
```

Rules: `<id>` is stable across rounds (same file, same branch).
Bump `round` on each resubmission. Keep the body under
~{{4000}} chars. Do not touch the ticket tree beyond tickets you
were explicitly assigned; never edit the generated index or the
human-testing queue.

## Verdicts ({{lead}} → outbox)

The lead reviews the branch diff (fetching from the clone path)
and answers with `outbox/<id>.md`, overwritten wholesale each
round — see `VERDICT-TEMPLATE.md` for the shape.

Semantics on the implementer's side:

- **accepted** — the lead has merged to main. Do NOT clean up:
  the destructive-op fence applies even now — the lead owns
  worktree/clone-branch removal. You may delete the inbox and
  outbox files for the id and stop tracking it.
- **amend** — apply the numbered amendments, resubmit (same id,
  round+1). Do not start unrelated work in the same submission.
- **declined** — stop work on that branch; do not resubmit the
  same approach. Notes say whether to try differently.
- **No outbox file yet** — review pending; keep polling, do
  nothing.

Match rounds: only act on an outbox file whose `round` equals your
latest inbox `round`; an older round means the lead hasn't seen
your resubmission yet.

## Before reporting test failures: BUILD FIRST

{{Your project's stale-artifact trap. Example from the instance:
dist/ is gitignored and workspace packages resolve through it — a
fresh checkout ALWAYS fails with missing-export errors that look
like real regressions. Run {{build command}} before any test run;
only report failures that survive a clean build.}}

## Triage report

`triage-report.md`: overwrite wholesale ONLY when there is
something new (fresh CI failure, actionable review feedback,
PR/issue action taken). Under ~{{6000}} chars; link to runs/PRs
instead of inlining logs.

## Destructive-op fence

- The implementer NEVER deletes worktrees, branches, tags, or
  refs — not even its own, not even after an accepted verdict.
  The LEAD owns all cleanup.
- No git command targets anything outside the sitting's own clone
  directory. No `-D`, `--force` deletion forms, `update-ref`,
  `reflog expire`, or `gc` anywhere, ever.
- Rationale: the fence was written when sittings used shared-.git
  worktrees, where one destructive op could reach shared history.
  Isolated clones have since replaced worktrees; the fence applies
  regardless — it costs nothing and covers the next regression.

## Sitting economics

<!-- Provider-window quirk; generalize or delete as your
implementer's rate limits dictate. -->

{{If your provider kills stopped agents but lets active tasks roll
over a rate window: assign EXTENDED batches (ticket ranges / whole
epics); the implementer never ends its turn to wait — while a
verdict is pending it holds an active poll-loop, using the wait
for read-only prep on the NEXT ticket in range (census, test
fixtures, nothing that presumes the ruling); the lead treats
verdict latency as the top-priority interrupt; plan reviews so the
batch is fully verdict-covered before the window's natural end.}}
