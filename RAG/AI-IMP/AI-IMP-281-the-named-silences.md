---
node_id: AI-IMP-281
tags:
  - IMP-LIST
  - Implementation
  - renderer
  - main-process
  - lifecycle-push
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.85
date_created: 2026-07-11
---

# AI-IMP-281-the-named-silences

## Summary of Issue #1

GR-3 (ratified, lifecycles-1.1 → "GR-3 The Silence Budget"; now
RFC rev 0.70 §8.6 — THE NORMATIVE SPEC): every outcome gets exactly
one voice, and the shipped silent-failure family gets its assigned
voices. The nine named silences, closed by classification:
(1) tag assign discards its error (TagAddField.svelte ~:54) →
class-4 inline sentence under the field; (2) attach-restore no-ops
(AttachNotePicker.svelte ~:136) → class-5 error toast; (3)
bookmark-restore no-ops (BookmarkMenu.svelte ~:87-89) → class-5
error toast; (4) drop ask auto-answer → class-3 decision toast
("3 images landed separate"), fired ONLY when the ask decided
(pairs with AI-IMP-280's printed default); (5) image dropped onto
a note silently lands on the board (NotePanel ~:949-953) →
class-3 decision toast ("notes don't hold images yet — it landed
on the board"); (6) pull-pin trashing a LAST placement silently
trashes the sticky → class-2 toast naming the off-screen effect
(undo capture for it is the trust wave's domain, not here); (7)
quit's 15s timeout proceeds on a partial backup silently
(main/index.ts quit ritual) → nothing at quit; a perch condition
at NEXT OPEN ("last session closed before its backup finished") —
rev 0.70 §11.4; (8) persistent mirror failure → escalates from
the ratified per-session collapse to a perch condition; (9) seed
failure → unexplained empty gallery → class-5 first-run error
toast. Line numbers drift; round 1 verifies.

### Out of Scope

- Undo grouping/capture changes (trust wave AI-IMP-221/231/270).
- GR-1 sentences (AI-IMP-279) — the tag-assign inline sentence is
  the one class-4 item here; coordinate if both land in one wave.
- The retention/GC perch reports (AI-IMP-219/220 carry their own
  voices per rev 0.70).

### Design/Approach

Pure voice-assignment sweep against the GR-3 table — copy the
row, not the reasoning. Class-3 toasts state fact, never apology,
and never fire on an explicit pick. The quit-timeout condition
needs a tiny persistence seam: main records the timeout fact
(app-tier, beside the snapshot state it already tracks), and the
next open registers the condition through the existing
status.ts channel, clearing once acknowledged/dismissed. Mirror
escalation: count per-session collapsed failures; crossing a
threshold registers the condition instead of the (kept) one-time
notice.

### Files to Touch

- `apps/desktop/src/renderer/tags/TagAddField.svelte`
- `apps/desktop/src/renderer/note/AttachNotePicker.svelte`
- `apps/desktop/src/renderer/chrome/BookmarkMenu.svelte`
- `apps/desktop/src/renderer/chrome/drop-behavior.ts`
- `apps/desktop/src/renderer/note/NotePanel.svelte` (drop-redirect
  toast only)
- pull-pin path (round 1 locates the last-placement branch)
- `apps/desktop/src/main/index.ts` (timeout fact) + first-run seed
  path + mirror-failure counter
- Unit/e2e: one pin per row of the table (the table IS the test
  plan).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Rows 1–3: inline sentence + two error toasts, copy per the
      table; no toast doubles an inline sentence.
- [ ] Rows 4–5: decision toasts fire only on app-decided
      outcomes; explicit picks stay silent (pinned).
- [ ] Row 6: last-placement pull-pin speaks class 2 naming the
      trash home.
- [ ] Row 7: timeout fact persisted at quit; perch condition at
      next open; clears correctly.
- [ ] Rows 8–9: mirror escalation threshold + seed-failure toast.
- [ ] Every changed outcome arguable from the table (comment cites
      its class); full `CI=true pnpm check` green (pipefail,
      counts read); CHANGELOG [Unreleased]; HUMAN-TESTING entry.

### Acceptance Criteria

**GIVEN** any row of the GR-3 named-silences table
**WHEN** its outcome occurs
**THEN** exactly the assigned voice speaks — once, in the table's
copy register — and no outcome anywhere resolves as
`if (error) return`

**GIVEN** a quit whose snapshot timed out
**WHEN** the app next opens
**THEN** the ⚠ perch carries "last session closed before its
backup finished" until dismissed.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
