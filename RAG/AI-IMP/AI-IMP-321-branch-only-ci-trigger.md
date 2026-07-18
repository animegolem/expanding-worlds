---
node_id: AI-IMP-321
tags:
  - IMP-LIST
  - Implementation
  - ci
  - process-lab
kanban_status: planned
depends_on:
parent_epic:
confidence_score: 0.9
date_created: 2026-07-18
date_completed:
---

# AI-IMP-321-branch-only-ci-trigger

## Summary of Issue #1

`ci.yml` triggers on bare `on: push`, which matches TAG pushes as well
as branch pushes. Our release ritual pushes main and then a tag on the
SAME sha, so every release burns a duplicate full CI run on identical
bytes — and worse, it muddies the witness: the 2026-07-18 specimen had
red main run 29627549388 beside a green tag oracle on the same commit,
forcing triage of a contradiction that was pure trigger noise. The
enabling fact was confirmed at ratification (ci-pipeline-clarity r2):
in this shop's flow, tags are only ever cut on a sha already pushed to
main — wave-close pushes main first, the tag follows the same commit —
so a branch-only trigger loses zero coverage. Done means: the generic
CI workflow runs on branch pushes only; the release workflow keeps its
tag trigger untouched; the next release produces exactly one CI run
per sha.

### Out of Scope

Any change to `release.yml` (its tag trigger is correct and stays);
shard count, reporters, or timing artifacts (AI-IMP-320); path filters
(the AI-IMP-268 doc-skip behavior must be preserved bit-for-bit).

### Design/Approach

Add `branches: ['**']` under `on.push` in ci.yml. GitHub semantics: a
`branches` filter on push excludes tag refs entirely, and it composes
with the existing `paths-ignore` (both must match). `pull_request` is
untouched. The concurrency group already keys on `github.ref`, so
nothing else changes. Comment the trigger block with the why (duplicate
tag runs + the muddied-witness specimen) so a future reader does not
"simplify" it away.

### Files to Touch

`.github/workflows/ci.yml`: `on.push.branches: ['**']` + comment.
`RAG/PROCESS-LAB.md` (PH-007 row): note trial 3 landed.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Round-1 review: confirm no other workflow depends on the generic
      CI running for tag refs (release.yml builds independently; branch
      protection/status checks key on branch runs only).
- [ ] `branches: ['**']` added under `on.push`; `paths-ignore` and
      `pull_request` byte-identical; trigger comment states the why.
- [ ] Evidence at next release: the tag push triggers release.yml ONLY
      — quote the sha's run list showing one CI run (branch) and zero
      duplicate CI runs (tag).
- [ ] PH-007 row updated: trial 3 landed, specimen cited.

### Acceptance Criteria

**Scenario:** The next epic-close or patch release.
**GIVEN** main pushed at sha S, then tag vX.Y.Z pushed at the same S.
**WHEN** both pushes land.
**THEN** the generic CI workflow runs once, for the branch push,
**AND** the tag push triggers only the release workflow,
**AND** no red/green contradiction on identical bytes is possible from
trigger duplication.

**Scenario:** Ordinary branch work.
**WHEN** a code push lands on any branch.
**THEN** CI triggers exactly as before, including the doc-only skip
from paths-ignore.

### Issues Encountered

<!--
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
