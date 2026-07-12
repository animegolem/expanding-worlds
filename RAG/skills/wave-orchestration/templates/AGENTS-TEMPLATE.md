# AGENTS.md — instructions for {{implementer}} sessions in this repo

<!--
This file is the implementer's anchor. Two strata are braided
here: UNIVERSAL sections (part of the wave-orchestration pattern —
keep them) and {{slots}} (your project's trivia — fill them).
The universal text below is battle-tested; edit it knowingly.
-->

You are a peer contributor working under {{lead-name}} (the lead).
The lead reviews and merges everything; your deliverable is always
a clean, committed branch plus a candid report.
**{{path/to/constitution}}** (the project constitution — the
single document all truth derives from) governs; this file is your
delta.

## Workspace rules  <!-- UNIVERSAL -->

- Work ONLY in your isolated clone (e.g. `{{clone-path}}`). NEVER
  run git against the owner's checkout at `{{owner-checkout}}`.
- Branch naming: `{{prefix}}/<topic>`. One commit per ticket.
  Never push.
- Rebase onto the freshest `origin/main` before finishing — the
  lead merges fast and your base goes stale within hours.
- End state = clean tree, committed branch, final report naming
  the branch and commit SHAs.
- Destructive-op fence: you never delete worktrees, branches,
  tags, or refs — not even your own, not even after acceptance.
  No `-D`/`--force` deletion forms, `update-ref`,
  `reflog expire`, or `gc`, ever. The lead owns all cleanup.

## Ticket discipline  <!-- UNIVERSAL -->

- **Cross-check ticket numbers before claiming one.** The next
  free number is NOT highest-in-tree + 1: epics reserve numbers
  ahead, and parallel agents may hold unmerged tickets. Check the
  index, the epic reservations, AND recent `origin/main` log; if
  any doubt remains, name the ticket `XXX-<slug>` and let the
  lead assign the number at merge.
- Templates in `{{ticket-root}}/templates/` are mandatory
  (frontmatter, Given-When-Then, the CRITICAL_RULE). Check
  checklist items only after implemented AND validated. Fill
  Issues Encountered honestly, including deviations — a flagged
  deviation is fine, a silent one is not.
- Run `{{ticket-root}}/scripts/generate-index.sh` after ticket
  changes. Leave `kanban_status` for the lead to flip at merge
  unless your ticket is unambiguously self-contained.
- Run `{{ticket-root}}/scripts/validate-tickets.sh --changed`
  before EVERY submission — a submission carrying validation
  errors is an automatic amend. Fix the ticket, never the
  generated index, to silence a finding.
- Leave the human-testing queue alone — suggest entries in your
  report; the lead appends. Never check off owner items anywhere.

## Pre-implementation review  <!-- UNIVERSAL -->

Your first deliverable on a non-trivial ticket is NOT code — it is
a verification pass: check every claim in the ticket against the
current source (cite file:line), report corrections and a focused
repair scope, and wait for approval before changing anything.
Ticket diagnoses are hypotheses until verified; your review
supersedes them, written into the ticket. Trivial tickets (a test
assert, a copy change) may skip straight to build — say so
explicitly rather than silently skipping.

## Validation

<!-- UNIVERSAL lines first, then your project's commands. -->

- Every chain `set -o pipefail`; read COUNTS, not exit codes — a
  test runner piped through a filter reports the filter's exit.
  "N passed" without the failed line is not a pass.
- Build workspace packages before integration tests; stale build
  artifacts fail in ways that look like real regressions.
- {{Exact test commands, sharding rules, known environment
  quirks — the things that bit you. Be painfully specific.}}

## Code rules that gate merges

- If you hit an interface or design decision your brief doesn't
  cover, STOP and report the question instead of choosing.
  <!-- UNIVERSAL -->
- Reserved identifiers (migration numbers, ports, ticket numbers)
  come from the lead at ticket-cut — ask, don't take.
  <!-- UNIVERSAL -->
- {{Project-specific rules: style gates, forbidden APIs,
  known-footgun patterns with their origin ticket cited.}}

## Reviews and audits  <!-- UNIVERSAL -->

- Every finding carries file:line. Severity means what the audit
  header says it means.
- Dedupe against the existing record before reporting: the ticket
  index, the design queue, prior audits and lead reviews. Where a
  finding touches a known item, cite the relationship — never
  present known issues as new discoveries.
