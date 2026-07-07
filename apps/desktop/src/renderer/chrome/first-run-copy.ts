/**
 * First-run walkthrough copy (AI-IMP-145, EPIC-019 public face).
 *
 * The RATIFIED verbatim set (First-Run Document t1, rev 0.55) — the
 * single source of truth for the seven pages. A vitest asserts these
 * strings character-for-character (first-run-copy.test.ts), so any
 * content drift is a test failure, not a silent reword. The arc rule
 * is one idea per page, ≤3 sentences, no feature names, no "node";
 * page 2 is LOAD-BEARING (the trust moment) and may never be cut.
 *
 * The picks on page 7 are optional and store the fact only (§14.4);
 * their consumer — filtering which workflow ideas the seeded example
 * surfaces — is future work.
 */

export interface FirstRunPick {
  /** Stable app-tier value stored under `firstRunPick`. */
  readonly id: string
  readonly label: string
}

export interface FirstRunPage {
  readonly title: string
  readonly body: string
  /** Page 7 only: the optional "what do you plan to make?" picks. */
  readonly picks?: readonly FirstRunPick[]
  /** Page 7 only: the footnote under the picks. */
  readonly footnote?: string
}

export const FIRST_RUN_PAGES: readonly FirstRunPage[] = [
  {
    title: 'A board for your pictures',
    body: "Drop art on it. Arrange it the way you already do. That's the whole app — until, without any extra ceremony, it quietly becomes a world you can search, map, and read.",
  },
  {
    title: 'Your pictures are safe',
    body: 'Everything you drop here is COPIED. Your own folders and originals are never touched, moved, or changed — and one picture can live in many places at once without existing twice.',
  },
  {
    title: 'No knobs on your art',
    body: 'Inside moves it. Edges stretch it. Corners scale it; just outside a corner turns it. The cursor shows you — and every button in the app names itself and its key when you hover.',
  },
  {
    title: 'Any picture can carry words',
    body: "Its note opens beside it like a page in a book. Write [[a name]] and it's linked — that's the whole wiki. Nothing saves until you actually type something.",
  },
  {
    title: 'Pictures open into boards',
    body: 'Give any picture a board of its own — a map opens into its region, a character into their story. Boards nest as deep as the world goes, and the path at the top is always the way back.',
  },
  {
    title: 'Nothing gets lost',
    body: "Tag things as you arrange them. Search finds every word you've written and every picture you've named. The gallery holds your whole collection — and deleting only ever moves things to a trash that keeps them whole.",
  },
  {
    title: 'What do you plan to make?',
    body: '',
    picks: [
      { id: 'reference-boards', label: 'reference boards for painting' },
      { id: 'comic-bible', label: 'a comic or a pitch bible' },
      { id: 'timeline', label: 'mapping a story on a timeline' },
    ],
    footnote: "optional — it only picks which workflow ideas you'll see once",
  },
]
