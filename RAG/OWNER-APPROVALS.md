# Owner approvals — the durable authority ledger

Owner-proposed (2026-07-23): approvals are DURABLE STATE, not
fuzzy memory. One entry per approval; an entry stays LIVE until
its work completes, the owner revokes it, or its scope materially
changes — in which case the revision is logged as a NEW entry
marked as an escalation, and only that delta needs a fresh sign.

Rules of operation:

- **The LEAD is the approval registrar and chaser.** The lead
  records entries, chases Codex to validate what a stall is
  actually waiting on, and chases the owner directly when (and
  only when) an entry here genuinely doesn't cover the need.
- Work covered by a LIVE entry is NEVER re-asked. Any request to
  the owner that merely re-confirms a live entry is a process bug
  (standing-authority-no-bounce, ratified 2026-07-23).
- RESERVED entries record what is explicitly NOT yet approved, so
  the un-approved is as unambiguous as the approved.
- Escalations reference their parent entry. History keeps
  completed/superseded entries for audit.

## Live approvals

| # | scope | granted | boundary / notes |
|---|---|---|---|
| A1 | EPIC-031 notes epic: census, tickets AI-IMP-312..315, amend rounds through close + release | 2026-07-16 ("notes epic for sure"), reaffirmed through 2026-07-23 | owner-gated design residuals excluded (tiny-image cap, big editor role, below-calendar seam) — those are A-RES1, not blockers on the wave |
| A2 | Comms/notification stack: carrier, receiver lab, fault matrix, canary, protocol/ledger process amendments | 2026-07-17 ("whatever yall think will solve the problem"), executor task provisioned 2026-07-23 | live-machine actions excluded — see A-RES2 |
| A3 | Graph view (EPIC-021) charter after notes census | 2026-07-16 ("graph we roll") | charter/design work; implementation tickets cut under normal review |
| A4 | Palette picker (EPIC-025 continuation) | 2026-07-16 ("pallet picke we go") | foundation done; kit page owed by owner sitting before UI work |
| A5 | CI trials AI-IMP-320/321 (six-shard trial, timing artifact, branch-only trigger) | 2026-07-18 (ci-pipeline-clarity settle, owner-authorized lane) | briefed to Codex after notes wave; retention-gated per tickets |
| A6 | Release mechanics: epic-close minor tags, patch tags, release bodies | durable since v0.7.0 era; reaffirmed 2026-07-17 | no per-tag approval ever needed |
| A8 | Review-metrics trial: gate-time targeting report (churn×complexity hotspots, platform-risk touches, CCN delta) appended to wave evidence | 2026-07-23 ("approved on both... reasonable trial balloon") | TWO-WAVE retention trial — delete without ceremony if the lead never acts on it; explicitly NOT a gate; CC thresholds rejected |
| A7 | Peer consultation lane + Codex delegation at will | 2026-07-13 ("yall can consult at will") | advisory-only; binding decisions still land in RFC/tickets/protocol |

## Reserved (explicitly NOT approved yet)

| # | scope | waiting on |
|---|---|---|
| A-RES1 | Notes-epic design residuals: tiny-image reading cap, big-editor role, below-calendar seam, kit specimen redraws | owner design sitting (design queue carries the details) |
| A-RES2 | Live-machine comms actions: v1 launchd watcher teardown + real-task shadow install of the receiver | ONE owner decision when Codex packages the canary evidence; rollback = pause worker, resume heartbeat |
| A-RES3 | Dock promise-ledger cosign (rev 4) → Computer Use pilot + __ewGeometry seam ticket | owner work session |
| A-RES4 | Shortcuts batch (⌘O/⌘G + tooltip chips) and board-orphan pair (§9.2 notice + board thumbnails) | owner go + chord-family choice; proposals delivered 2026-07-18 |

## History

(Completed/superseded entries move here with completion evidence.)
