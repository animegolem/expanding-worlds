import { describe, expect, it } from 'vitest'
import { FIRST_RUN_PAGES } from './first-run-copy'

/**
 * Verbatim guard (AI-IMP-145): the ratified First-Run copy is the
 * source of truth. These assertions pin every title and body string
 * character-for-character, so a reworded page fails CI rather than
 * quietly shipping — content is a design decision, not a code detail.
 */
describe('first-run copy', () => {
  it('carries exactly seven pages', () => {
    expect(FIRST_RUN_PAGES).toHaveLength(7)
  })

  it('page 1 — a board for your pictures', () => {
    expect(FIRST_RUN_PAGES[0]!.title).toBe('A board for your pictures')
    expect(FIRST_RUN_PAGES[0]!.body).toBe(
      "Drop art on it. Arrange it the way you already do. That's the whole app — until, without any extra ceremony, it quietly becomes a world you can search, map, and read.",
    )
  })

  it('page 2 — your pictures are safe (load-bearing)', () => {
    expect(FIRST_RUN_PAGES[1]!.title).toBe('Your pictures are safe')
    expect(FIRST_RUN_PAGES[1]!.body).toBe(
      'Everything you drop here is COPIED. Your own folders and originals are never touched, moved, or changed — and one picture can live in many places at once without existing twice.',
    )
  })

  it('page 3 — no knobs on your art', () => {
    expect(FIRST_RUN_PAGES[2]!.title).toBe('No knobs on your art')
    expect(FIRST_RUN_PAGES[2]!.body).toBe(
      'Inside moves it. Edges stretch it. Corners scale it; just outside a corner turns it. The cursor shows you — and every button in the app names itself and its key when you hover.',
    )
  })

  it('page 4 — any picture can carry words', () => {
    expect(FIRST_RUN_PAGES[3]!.title).toBe('Any picture can carry words')
    expect(FIRST_RUN_PAGES[3]!.body).toBe(
      "Its note opens beside it like a page in a book. Write [[a name]] and it's linked — that's the whole wiki. Nothing saves until you actually type something.",
    )
  })

  it('page 5 — pictures open into boards', () => {
    expect(FIRST_RUN_PAGES[4]!.title).toBe('Pictures open into boards')
    expect(FIRST_RUN_PAGES[4]!.body).toBe(
      'Give any picture a board of its own — a map opens into its region, a character into their story. Boards nest as deep as the world goes, and the path at the top is always the way back.',
    )
  })

  it('page 6 — nothing gets lost', () => {
    expect(FIRST_RUN_PAGES[5]!.title).toBe('Nothing gets lost')
    expect(FIRST_RUN_PAGES[5]!.body).toBe(
      "Tag things as you arrange them. Search finds every word you've written and every picture you've named. The gallery holds your whole collection — and deleting only ever moves things to a trash that keeps them whole.",
    )
  })

  it('page 7 — what do you plan to make?, with its three picks and footnote', () => {
    const page = FIRST_RUN_PAGES[6]!
    expect(page.title).toBe('What do you plan to make?')
    expect(page.picks?.map((pick) => pick.label)).toEqual([
      'reference boards for painting',
      'a comic or a pitch bible',
      'mapping a story on a timeline',
    ])
    expect(page.footnote).toBe(
      "optional — it only picks which workflow ideas you'll see once",
    )
  })
})
