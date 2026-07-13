import { describe, expect, it } from 'vitest'
import { fuzzyMatch, parseSearchTerms, subsequenceScore } from './fzf-match'

const candidate = {
  id: 'chief',
  names: ['Goblin commander'],
  tags: ['chieftain', 'life-debt'],
}

describe('fzf-shaped name-space matching', () => {
  it('matches subsequences, rewards adjacency, and rejects missing characters', () => {
    expect(subsequenceScore('gob', 'Goblin')).not.toBeNull()
    expect(subsequenceScore('gob', 'G x o x b')).toBeGreaterThan(subsequenceScore('gob', 'Goblin')!)
    expect(subsequenceScore('xyz', 'Goblin')).toBeNull()
  })

  it('ANDs plain terms across separate tag names (the kit letter example)', () => {
    expect(fuzzyMatch([candidate], 'chi lif').map((match) => match.candidate.id)).toEqual(['chief'])
    expect(fuzzyMatch([candidate], 'chi debt').map((match) => match.candidate.id)).toEqual(['chief'])
    expect(fuzzyMatch([candidate], 'chi moon')).toEqual([])
  })

  it('limits # terms to tags while plain terms also see names', () => {
    expect(fuzzyMatch([candidate], '#chi')).toHaveLength(1)
    expect(fuzzyMatch([candidate], '#gob')).toEqual([])
    expect(fuzzyMatch([candidate], 'gob')).toHaveLength(1)
    expect(parseSearchTerms(' #chi  lif ')).toEqual([
      { tagOnly: true, value: 'chi' },
      { tagOnly: false, value: 'lif' },
    ])
  })
})
