/**
 * Fuzzy matching utilities, ported from the pi TUI (`packages/tui/src/fuzzy.ts`
 * in the pi agent repo) so the command menu narrows the way pi users expect:
 * subsequence matching with consecutive-run rewards, word-boundary rewards,
 * and gap/position penalties. Lower score = better match.
 * @module dsh-tui/fuzzy
 */

/** The outcome of one fuzzy comparison. */
export interface FuzzyMatch {
  matches: boolean
  score: number
}

/** Match `query` against `text` as an in-order (not necessarily contiguous) subsequence. */
export function fuzzyMatch(query: string, text: string): FuzzyMatch {
  const queryLower = query.toLowerCase()
  const textLower = text.toLowerCase()

  const matchQuery = (normalizedQuery: string): FuzzyMatch => {
    if (normalizedQuery.length === 0) return { matches: true, score: 0 }
    if (normalizedQuery.length > textLower.length) return { matches: false, score: 0 }

    let queryIndex = 0
    let score = 0
    let lastMatchIndex = -1
    let consecutiveMatches = 0

    for (let i = 0; i < textLower.length && queryIndex < normalizedQuery.length; i++) {
      if (textLower[i] !== normalizedQuery[queryIndex]) continue
      const isWordBoundary = i === 0 || /[\s\-_./:]/u.test(textLower[i - 1] ?? '')

      if (lastMatchIndex === i - 1) {
        // Reward consecutive matches.
        consecutiveMatches += 1
        score -= consecutiveMatches * 5
      } else {
        consecutiveMatches = 0
        // Penalize gaps.
        if (lastMatchIndex >= 0) score += (i - lastMatchIndex - 1) * 2
      }

      // Reward word-boundary matches.
      if (isWordBoundary) score -= 10
      // Slight penalty for later matches.
      score += i * 0.1

      lastMatchIndex = i
      queryIndex += 1
    }

    if (queryIndex < normalizedQuery.length) return { matches: false, score: 0 }
    if (normalizedQuery === textLower) score -= 100
    return { matches: true, score }
  }

  const primaryMatch = matchQuery(queryLower)
  if (primaryMatch.matches) return primaryMatch

  // pi convenience: let `ab12` also match `12ab` text (and vice versa), ranked below.
  const alphaNumericMatch = queryLower.match(/^(?<letters>[a-z]+)(?<digits>[0-9]+)$/u)
  const numericAlphaMatch = queryLower.match(/^(?<digits>[0-9]+)(?<letters>[a-z]+)$/u)
  const swappedQuery = alphaNumericMatch
    ? `${alphaNumericMatch.groups?.digits ?? ''}${alphaNumericMatch.groups?.letters ?? ''}`
    : numericAlphaMatch
      ? `${numericAlphaMatch.groups?.letters ?? ''}${numericAlphaMatch.groups?.digits ?? ''}`
      : ''

  if (swappedQuery === '') return primaryMatch
  const swappedMatch = matchQuery(swappedQuery)
  if (!swappedMatch.matches) return primaryMatch
  return { matches: true, score: swappedMatch.score + 5 }
}

/**
 * Filter and sort items by fuzzy match quality (best matches first). An empty
 * query returns every item in order. Supports whitespace/slash-separated
 * tokens: ALL tokens must match.
 */
export function fuzzyFilter<T>(items: T[], query: string, getText: (item: T) => string): T[] {
  const tokens = query.trim().split(/[\s/]+/u).filter(token => token.length > 0)
  if (tokens.length === 0) return items

  const results: Array<{ item: T; totalScore: number }> = []
  for (const item of items) {
    const text = getText(item)
    let totalScore = 0
    let allMatch = true
    for (const token of tokens) {
      const match = fuzzyMatch(token, text)
      if (!match.matches) {
        allMatch = false
        break
      }
      totalScore += match.score
    }
    if (allMatch) results.push({ item, totalScore })
  }

  results.sort((a, b) => a.totalScore - b.totalScore)
  return results.map(result => result.item)
}
