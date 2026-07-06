---
node_id: AI-IMP-106
tags:
  - IMP-LIST
  - Implementation
  - hardening
  - notes
kanban_status: completed
depends_on:
parent_epic: [[AI-EPIC-016-context-click-menus]]
confidence_score: 0.8
date_created: 2026-07-06
date_completed: 2026-07-06
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

- [x] Broken links render distinctly (greyed per the §9
      degradation family) and activate per §7.1; e2e.
- [x] EW_SCHEMA_AHEAD typed refusal + unit; message reaches the
      user through the existing failure surface.
- [x] Repairs toast once per open when repairs occurred; e2e via
      the recovery spec idiom.
- [x] Full gates.

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

Agent + lead split. The agent (worktree, merged 5ab8c0f) delivered
the EW_SCHEMA_AHEAD guard, the repairs-toast consumer, and
verified item 1 was already shipped on the epic-018 base — with a
DEVIATION: broken links render red + wavy underline
(--ew-link-broken), not the ticket's greyed sketch; grey is
reserved for bound-trashed (recoverable). Deliberate, tested,
"visibly dead" satisfied — re-tone is design-session material if
wanted. The recovery-summary transport and the failure surfacing
were out of the agent's fence; the lead completed them: protocol
ServiceStatusEvent gained `recovery`, main forwards it on both ok
broadcasts and now broadcasts cold-boot init failures (previously
console-only). LEAD FIND while the new e2e failed honestly: the
renderer gates App mount on initSettings, so EVERY cold-boot
service event fired into a room with no listener — the whole
status surface was boot-deaf, not just repairs. Fix is
pull-then-subscribe: main retains the latest event,
attachServiceStatus catches up via project:service-current;
same-surface toast replacement keeps a live+catch-up pair to one
toast. Also noted in review: the schema-ahead SELECT makes an
existing-but-empty db file fail loud instead of being silently
re-initialized by migrate() — an improvement, but the error is a
raw SQLite sentence; acceptable for a corrupt-db edge.
