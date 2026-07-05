---
node_id: AI-IMP-052
tags:
  - IMP-LIST
  - Implementation
  - infrastructure
  - release
kanban_status: completed
depends_on: [AI-IMP-051]
parent_epic: [[AI-EPIC-011-release-engineering]]
confidence_score: 0.8
date_created: 2026-07-05
date_completed: 2026-07-05
---

# AI-IMP-052-release-workflow-and-v050

## Summary of Issue #1

With CI and packaging in place, closing an epic should produce a
downloadable point release. Add a tag-triggered workflow that builds
the three unsigned artifacts on their native runners and attaches
them to a GitHub Release, document the ritual, and cut v0.5.0. Done
when the v0.5.0 release page carries a DMG, an NSIS exe, and an
AppImage, and CLAUDE.md records the versioning scheme.

### Out of Scope

Release notes automation (hand-written body per release). Signing,
auto-update, download counts.

### Design/Approach

`.github/workflows/release.yml` on `push: tags: v*`: a three-OS
matrix (macos-14 arm64 / windows-latest / ubuntu-latest) runs
install → `pnpm -r build` → `electron-builder` for its platform,
then a job uploads all artifacts to the release via gh (softprops
action or `gh release upload`; prefer gh CLI — fewer third-party
actions). Unsigned macOS builds need
CSC_IDENTITY_AUTO_DISCOVERY=false so the runner doesn't hunt for a
certificate. Versioning ritual for CLAUDE.md: minor = epic number
(EPIC-006 → 0.6.0), patch for hotfixes; on epic close bump
apps/desktop version, tag vX.Y.Z, push the tag; the release body
links the epic ticket. The release includes a first-launch note for
each platform (right-click → Open on macOS, SmartScreen "run
anyway" on Windows, chmod +x on the AppImage).

### Files to Touch

`.github/workflows/release.yml`: new workflow.
`CLAUDE.md`: release ritual under Conventions.
Remote: tag v0.5.0; verify assets; iterate if a matrix leg fails.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] release.yml matrix builds DMG / NSIS / AppImage on tag push
      and attaches all three to one GitHub Release.
- [x] CLAUDE.md documents minor-equals-epic versioning and the
      close-epic → bump → tag ritual.
- [x] v0.5.0 tagged; release live with all three assets and a body
      covering install notes per platform (unsigned-build caveats).
- [x] Gates green; RAG index regenerated.

### Acceptance Criteria

**GIVEN** the tag v0.5.0 pushed to origin
**WHEN** the release workflow completes
**THEN** the GitHub Release v0.5.0 exists with .dmg, .exe, and
.AppImage assets downloadable without authentication (public repo)
**AND** the release body explains unsigned-build first-launch steps.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
One matrix iteration: the Linux leg failed because electron-builder
derives executableName from the package name ("@ewdesktop" —
illegal in paths); an explicit `executableName: expanding-worlds`
fixed it and the tag was recreated (safe — no release existed yet;
NEVER move a tag that has a published release). macOS and Windows
built clean on the first try. The v0.5.0 release carries
Expanding.Worlds-0.5.0-arm64.dmg, Expanding.Worlds.Setup.0.5.0.exe,
and Expanding.Worlds-0.5.0.AppImage, publicly downloadable (the
repo is public). Only the mac artifact has been smoke-run
(AI-IMP-051); the Windows and Linux artifacts are built-but-untested
until someone runs them — worth a note when handing links out.
