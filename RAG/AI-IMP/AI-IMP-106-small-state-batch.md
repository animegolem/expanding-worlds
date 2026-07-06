---
node_id: AI-IMP-106
tags:
  - IMP-LIST
  - Implementation
  - hardening
  - notes
kanban_status: planned
depends_on:
parent_epic: [[AI-EPIC-016-context-click-menus]]
confidence_score: 0.8
date_created: 2026-07-06
date_completed:
---

# AI-IMP-106-small-state-batch

## Summary of Issue #1

Doc-review small states with clear precedent, batched: (1) BROKEN
links have no editor appearance — §7.2 defines unresolved styling;
broken (§7.1: purged target) needs its own distinct rendering +
the §7.1 activation offering; (2) SCHEMA-AHEAD primary open (db
written by a newer build) dies with a raw error — needs the typed
EW_SCHEMA_AHEAD refusal at open + a clear main-side message
surface (the init-failed path exists; the message must say "made
by a newer version"); (3) RECOVERY REPAIRS are silent — successful
§11.4 repairs (rebuilt derivatives, reconciled imports) surface
ONE summary toast ("Recovered: N repairs") via the existing
recovery report, never the perch (that is for ongoing conditions).

### Out of Scope

- Unresolved/bound link behavior (shipped).
- Migration behavior itself; retention; anything needing design.

### Design/Approach

(1) wiki-link-plugin.ts already classes links — add the broken
class + a distinct token style via theme tokens (STRIKE or dashed
— pick the convention §9 degradation uses elsewhere: greyed like
the bookmark In-Trash rows) + activation per §7.1's stated
offering. (2) persistence open: if project schema_version >
LATEST, throw coded EW_SCHEMA_AHEAD ("this project was written by
a newer version of Expanding Worlds"); init-failure path already
displays messages. (3) Workspace/service-status listener reads the
recovery summary it ALREADY receives and toasts when repairs
array is non-empty.

### Files to Touch

apps/desktop/src/renderer/note/wiki-link-plugin.ts (+e2e in
notes.spec or new); packages/persistence/src/project.ts or
migrate.ts (+unit); the renderer init/recovery listener +
Toasts wiring; theme.css only if a token is genuinely missing.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Broken links render distinctly (greyed per the §9
      degradation family) and activate per §7.1; e2e.
- [ ] EW_SCHEMA_AHEAD typed refusal + unit; message reaches the
      user through the existing failure surface.
- [ ] Repairs toast once per open when repairs occurred; e2e via
      the recovery spec idiom.
- [ ] Full gates.

### Acceptance Criteria

**GIVEN** a note linking a purged target, a project from a newer
build, and an open that performed repairs
**THEN** the link reads visibly dead, the open refuses with a
human sentence, and the repair toast names the count.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
