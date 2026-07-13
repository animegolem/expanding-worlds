export interface FuzzyCandidate {
  id: string
  /** Titles and filenames: the identity-bearing name space. */
  names: readonly string[]
  /** Tag names are a separate axis because #terms may only match here. */
  tags: readonly string[]
}

export interface FuzzyMatch<T extends FuzzyCandidate> {
  candidate: T
  score: number
}

export interface ParsedSearchTerm {
  value: string
  tagOnly: boolean
}

export function parseSearchTerms(query: string): ParsedSearchTerm[] {
  return query
    .trim()
    .split(/\s+/)
    .map((raw) => ({ tagOnly: raw.startsWith('#'), value: raw.replace(/^#+/, '').toLowerCase() }))
    .filter((term) => term.value.length > 0)
}

/**
 * A compact fzf-shaped subsequence score. Contiguous characters and an
 * early start win; a missing character fails. Exact ranking is deliberately
 * modest—the contract is forgiving subsequence matching, not fzf parity.
 */
export function subsequenceScore(needle: string, haystack: string): number | null {
  const wanted = needle.toLowerCase()
  const source = haystack.toLowerCase()
  if (wanted.length === 0) return 0
  let from = 0
  let first = -1
  let previous = -2
  let gaps = 0
  let contiguous = 0
  for (const char of wanted) {
    const index = source.indexOf(char, from)
    if (index < 0) return null
    if (first < 0) first = index
    if (index === previous + 1) contiguous += 1
    else if (previous >= 0) gaps += index - previous - 1
    previous = index
    from = index + 1
  }
  return first * 4 + gaps * 2 + source.length - contiguous * 3
}

function bestScore(term: string, fields: readonly string[]): number | null {
  let best: number | null = null
  for (const field of fields) {
    const score = subsequenceScore(term, field)
    if (score !== null && (best === null || score < best)) best = score
  }
  return best
}

/** AND-combine every term. Plain terms may match names OR tags; # terms
 * constrain the tag axis. Different terms may match different tag names. */
export function fuzzyMatch<T extends FuzzyCandidate>(
  candidates: readonly T[],
  query: string,
): FuzzyMatch<T>[] {
  const terms = parseSearchTerms(query)
  if (terms.length === 0) return candidates.map((candidate) => ({ candidate, score: 0 }))
  const matches: FuzzyMatch<T>[] = []
  for (const candidate of candidates) {
    let total = 0
    let matched = true
    for (const term of terms) {
      const fields = term.tagOnly ? candidate.tags : [...candidate.names, ...candidate.tags]
      const score = bestScore(term.value, fields)
      if (score === null) {
        matched = false
        break
      }
      total += score
    }
    if (matched) matches.push({ candidate, score: total })
  }
  return matches.sort((a, b) => a.score - b.score || a.candidate.id.localeCompare(b.candidate.id))
}
