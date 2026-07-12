# Lead review — lifecycle and testing closure

**To:** Claude Fable 5, lead developer  
**From:** Codex audit review  
**Date:** 2026-07-09  
**Baseline reviewed:** `f05c34a5` (latest committed owner view at review time)

## Purpose and executive finding

This is a planning review, not a request to narrow the product Rafael asked
for.

The project is not thin on ideas, domain modelling, or engineering discipline.
Its RFC, persistence model, command model, recovery work, and design record
are unusually mature for a project at this point.

It is thin at the last mile: several features have all their individual pieces
but no complete user lifecycle. In practice this looks like a setting that
records a value but does not cause an action, a durable command without a
gesture, or a completed background ritual without the user-facing action that
begins and completes it.

The appropriate move is **not** to reduce Rafael's requested scope. His asks
are the product's authority. The needed distinction is:

> Rafael decides whether a feature belongs. The release train decides when it
> can join the live product without making his existing work unsafe, confusing,
> or untestable.

Until the closure work below is complete, avoid opening unrelated architectural
fronts (new platforms, connectors, a second renderer, broad Git ambitions).
Continue recording Rafael's asks; sequence them after the shared safety and
interaction seams they depend on.

## Current-state corrections to the initial audit

The earlier audit was on an older commit. On the current baseline:

- `AI-IMP-214` through `AI-IMP-216` have landed fixes for the title-strip
  reveal/navigation, Board-menu click-away, and label-zoom ceiling. They are
  not open audit findings.
- `AI-IMP-218` through `AI-IMP-223` now carry six audit findings: Git
  index locking, destructive GC, trash retention, gallery undo coordination,
  import streaming, and export staging isolation. They remain **planned**, not
  resolved.
- Recovery is substantively implemented:
  `packages/persistence/src/recovery.ts` runs integrity checks, repairs
  interrupted imports/orphans, and reports missing canonical blobs; the
  renderer has a status/toast path. The gap is acceptance and incident
  handling, not a missing recovery subsystem.

## The four thin areas

### 1. Lifecycle ownership is the primary closure risk

The RFC is clear about resource ownership: active/trash references protect
data; purge merely makes resources eligible; cleanup is mark-and-sweep; and
interrupted import debris is reconciled on recovery (RFC §9.7–§9.8 and
§11.2–§11.4). The current code has much of that vocabulary, but the end-to-end
owners are split or absent.

| Lifecycle | Current state | Missing closure | Required disposition |
|---|---|---|---|
| External Git snapshot lock | Snapshot engine works, but `snapshot.ts` removes any `index.lock`. | A live external Git process can still have an old lock. An age threshold reduces likelihood; it does not prove ownership or staleness. | `AI-IMP-218` must either identify app-owned lock state or explicitly accept and document the residual risk. Fresh locks must defer harmlessly. |
| Import | The utility pipeline stages, hashes, atomically moves, commits, and recovery reconciles interrupted imports. | The renderer buffers local files before that pipeline; failed/undone imports depend on future GC for disk reclamation. | Land `AI-IMP-222`; then prove failed import, cancelled/undone placement, and a normal import leave the right records and bytes. |
| Trash and retention | Trash/restore/purge handlers and a retention setting exist. | The 30/60/90-day setting does not yet run a retention pass. | Land `AI-IMP-220` through existing `PurgeRecord` semantics only. Decide whether project-open automatic purge needs an advance notice, a report, or both. |
| Permanent cleanup | `computeGcEligibleBlobs` correctly marks and guards candidates. | Nothing performs the destructive sweep or gives the user a dry-run/reclaimable count. | Land `AI-IMP-219` only after a ruling on holding state/grace period versus immediate deletion. The RFC is deliberately conservative here. |
| Session closure | Quit runs the full snapshot/checkpoint/close ritual. | The visibly named **End Session** control is still disabled in `MenuPopover.svelte`; no user can deliberately close and release the writer lock without quitting. | Cut a dedicated End Session ticket. It needs a defined post-session state, not merely an IPC call. |
| Export | Export snapshots its data into staging and has content validation. | Every export uses the same `.tmp-export` directory. | Land `AI-IMP-223` with per-request staging and an orphan cleanup policy. |

**Lead decision needed before implementation:** GC is irrevocable, so define
what Rafael experiences when “Clean up now” finds reclaimable bytes. A dry-run
count and a logged manifest are good; whether bytes first move to a holding
area or are deleted immediately is a product/durability ruling, not an agent
implementation choice.

**Rafael acceptance:** he can import a real group of reference files, trash
and restore an item, choose an honest retention setting, end a session without
quitting the application, reopen safely, and understand what cleanup did. He
should never have to infer whether an asset is gone, merely hidden, still
recoverable, or blocked by a background operation.

### 2. Release-level behavioral testing needs a short, ordered spine

The test estate is substantial, and `RAG/HUMAN-TESTING.md` is a good record
of human-feel questions. It currently has **47 awaiting-validation entries**.
That is an excellent backlog but not a usable testing plan for the recipient of
a gift. It mixes release-critical trust questions, visual taste dials, and
specialized technical probes.

Keep the full queue, but make it feed three ordered Rafael sessions instead of
asking him to execute an issue tracker:

1. **Make a little world.** Import his own references; place, move, label,
   frame, create/attach a note, reopen it, and find the item through search
   and gallery. Observe where he hesitates or expects an obvious action.
2. **Come back to the world.** Organize, tag, use undo/redo, trash/restore,
   quit or End Session, reopen, and confirm that the work is where he expects.
   This is the first trust test, not an administrative test.
3. **Live with it.** Use a real project across more than one session, including
   a larger image batch and an actual backup/restore trial. Collect wants and
   friction in his own language before translating them into tickets.

Developers—not Rafael—should run synthetic interruption, corrupt-file,
concurrent-export, and large-memory tests. Rafael should evaluate the result:
whether it is calm, legible, and trustworthy when normal life interrupts him.

Every human-testing item should be classified as one of:

- **Release gate:** loss, recovery, major confusion, or a core-loop failure.
- **Rafael preference:** a real feel/design decision that needs his hands.
- **Observation:** useful feedback, but not blocking this testing wave.

This makes the queue actionable without discarding any accumulated knowledge.

### 3. Failure and recovery need a user contract, not more invisible machinery

The technical foundation is good: recovery runs before commands are accepted,
cleans reconcilable import debris, preserves missing canonical-asset records,
and can surface repairs/errors. The plan is thin because it has not yet been
written as a small, testable promise to a non-technical artist.

| Event | Promise to Rafael | Developer proof |
|---|---|---|
| Import interrupted or app killed | No half-made item appears; reopening says what was recovered if it repaired anything. | Kill-at-stage tests plus a real utility-process restart path. |
| Canonical original missing | The item remains represented; opening it gives a durable, understandable integrity condition, never a blank/broken-looking render. | Seed a missing blob and verify condition, relevant view behavior, and no destructive “repair.” |
| Project already open/locked | The app says the project is busy or offers read-only/fallback behavior; it never races a second writer. | Lock contention tests with a real second process. |
| Snapshot/export/cleanup fails | Rafael's work remains open and intact; the failure is visible and retryable, and no action silently claims success. | Inject failure at each external boundary and prove cleanup/next attempt. |

The missing work is mostly acceptance coverage and copy/action design. Do not
build a new recovery architecture unless a scenario exposes a genuine hole.

### 4. “Completed” needs an integration state beyond merged code

The RAG process is strong: tickets carry scope, Given/When/Then acceptance,
gates, and a human-testing handoff. The gap is that the system has no compact
way to say that a *feature family* is fully integrated. A lifecycle can have
all of its individual tickets “done” while one visible control is disabled or
one alternate surface bypasses undo.

Use this four-state status in lead review and epic-close notes:

| State | Evidence required |
|---|---|
| **Implemented** | Code, focused tests, and ticket acceptance pass. |
| **Integrated** | All intended entry points use the same command/lifecycle path; no visible setting or control lies about availability. |
| **Rafael-validated** | The relevant short session was run and the result recorded as pass, preference, or a new ticket. |
| **Deferred honestly** | It is out of the testing promise and either hidden or clearly marked as unavailable; no partial behavior is presented as complete. |

Apply this first to import, gallery actions, trash/retention/GC,
snapshots/End Session, and notes. The goal is not bureaucracy; it catches the
“90% complete” seams that unit tests and individual tickets naturally miss.

## Other near-complete seams to close or classify

| Item | Why it reads as 90% complete | Recommendation |
|---|---|---|
| Gallery action bar and undo | Durable gallery verbs work but bypass the canvas gateway, so tag/place actions can be uncaptured and strand redo. | `AI-IMP-221` is a core trust ticket. Record a per-verb capture/exemption table; any exemption must still invalidate stale redo. |
| Tag removal | `UnassignTagFromNode` and its inverse exist and are tested; no renderer affordance emits it. | Decide the gesture once in the design queue, then make the one-line command/undo wrap. This is a high-value small closure if Rafael uses tags. |
| Local-file import streaming | The downstream pipeline is designed to stream; the renderer entry seam defeats that for local files. | Treat `AI-IMP-222` as a capacity promise for an artist's real source library, not an optimization. Measure a representative large drop before and after. |
| Session snapshots | Snapshot, restore, push, and settings machinery exist, but the main ritual is reachable only through quit. Some ticket wording and human-test instructions still speak as if End Session is live. | Resolve the control before doing more backup polish; keep docs/tests truthful in the meantime. |
| Gallery inspector and provenance | Gallery is functional, but Rafael reasonably expects an image click to reveal a preview and where it came from. | Keep `AI-IMP-204` behind a focused Rafael/owner design conversation; it is a user-value gap, not a persistence blocker. |
| Reading a bound note | The book/panel system exists, but “open” has not yet been fully decided as a camera-flight reading verb. | Finish the close-back, big-editor, tiny-image, and independent-text-zoom ruling before a patchwork of size fixes accumulates. |
| Right rail and beta controls | Individual controls work, but the rail lacks a settled membership model and older controls coexist with the newer grammar. | Finish `AI-IMP-207` and the design-gap sweep before adding more rail residents. |
| Make-canvas and arrange/normalize | The verbs exist, but their home and post-action feedback are underdesigned. | Keep the commands; let the design session decide their visible completion beat before calling them discoverable. |

The following visible items are **not** 90% features and should not quietly
enter the testing promise: Replace image, Swap for, Place on another board,
and menu-callable Paste. `menus/inventory.ts` correctly labels them as coming
soon because their command-level work is absent. They need a future vertical
slice, not a finish-up pass.

## Recommended closure sequence

1. **Protect existing work.** Resolve `AI-IMP-218`, cut End Session as its own
   end-to-end ticket, and decide the GC deletion contract before starting
   destructive implementation. Keep automatic retention and GC coordinated:
   retention creates eligibility; GC reclaims only after all §9.8 guards.
2. **Make core mutations coherent.** Land `AI-IMP-221` and `AI-IMP-222`;
   then validate gallery actions and a realistic file drop in Rafael's first
   two sessions. Land `AI-IMP-223` as the contained correctness follow-up.
3. **Close the return loop.** Implement retention/GC, enable End Session, then
   run the “come back to the world” session on an actual project. Do not mark
   the lifecycle epic closed before that session is recorded.
4. **Resolve the three high-value design conversations.** Note-as-camera,
   gallery inspector/provenance, and rail membership. These are the right next
   experience investments because they affect how Rafael reads, finds, and
   operates his world—not because they complete a generic feature list.
5. **Use the evidence to sequence Rafael's new asks.** Palette picker is a
   valid product request; bring it forward when its surface can be integrated
   with the agreed creation and rail grammar. Continue to defer broad
   connector/graph/platform work unless real testing shows it blocks him.

## Lead decisions to make in the next review

1. Is an age-gated deletion of a Git lock acceptable, or must snapshot code
   only ever remove a lock it can prove it owns?
2. What are the exact user-visible semantics for “Clean up now,” including
   holding period, dry run, report, and retry/failure behavior?
3. Does retention purge silently at project open, or must it announce the
   items/bytes it permanently removed?
4. What does the application show after End Session: project chooser, closed
   project shell, or app exit? Which work is deliberately excluded from that
   first surface (for example, future vault pull-back)?
5. Which gallery verbs must be structurally undoable, and which are explicitly
   exempt while still clearing redo?
6. Which three Rafael sessions are the testing-wave release gates, and which
   existing human-testing entries are preference/observation rather than gates?

## Completion check for this review

This review is complete when its decisions have been converted into scoped
tickets/RFC rulings, and when the lifecycle and testing-wave epics use the
four-state integration status above. It does **not** claim that the listed
implementation work is complete today.
