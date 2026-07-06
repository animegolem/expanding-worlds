---
node_id: AI-EPIC-019
tags:
  - EPIC
  - AI
  - docs
  - onboarding
date_created: 2026-07-06
date_completed:
kanban_status: backlog
AI_IMP_spawned:
---

# AI-EPIC-019-public-face

> Thin epic, stubbed 2026-07-06 at the owner's request. Not urgent.

## Problem Statement/Feature Scope

The user base is deliberately NON-TECHNICAL (artists), but the
repo's front door is a developer README. Three surfaces:

- **README rework**: the introduction targets non-technical people
  — what the app is, what it looks like, how to get it (the
  release artifacts) — with one clearly marked technical section
  that LINKS OUT to a GitHub Wiki rather than burying artists in
  build instructions.
- **GitHub Wiki**: the technical coverage (build, architecture
  pointers into RAG/, contribution shape) moves there.
- **GitHub Pages site**: an attractive entry to the application
  separate from the repo link — a landing page (screenshots, the
  pitch, download buttons pointing at the latest release), served
  from the repo via Pages. Verify the standard repo-Pages
  workflow at activation (docs/ dir or gh-pages branch + Actions).

## Proposed Solution(s)

To be shaped at activation. Likely one IMP per surface; the Pages
site wants real screenshots, so it lands best after the UI-polish
pass gives it something pretty to show.

## Path(s) Not Taken

No docs site generator/framework unless the single page outgrows
hand-rolled HTML; no marketing domain — repo Pages is the scope.

## Success Metrics

To be firmed; candidate: a non-technical person landing on either
the README or the page can find the download for their OS without
reading a single build instruction.

## Requirements

### Functional Requirements

- [ ] To be cut at activation.

### Non-Functional Requirements

- The README's technical section stays one screenful, links out.

## Implementation Breakdown

IMPs to be cut when this epic activates.
