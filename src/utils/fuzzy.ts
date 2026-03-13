/**
 * Simple fuzzy matching for command palette filtering.
 * Returns a score (higher = better match), or 0 if no match.
 */
export function fuzzyMatch(query: string, text: string): number {
  if (!query) return 1 // Empty query matches everything

  const queryLower = query.toLowerCase()
  const textLower = text.toLowerCase()

  // Exact substring match gets highest score
  if (textLower.includes(queryLower)) {
    // Bonus for matching at start
    if (textLower.startsWith(queryLower)) {
      return 100 + (query.length / text.length) * 50
    }
    return 50 + (query.length / text.length) * 25
  }

  // Fuzzy match: all query characters must appear in order
  let queryIdx = 0
  let score = 0
  let lastMatchIdx = -1

  for (let i = 0; i < textLower.length && queryIdx < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIdx]) {
      // Consecutive matches get bonus
      if (lastMatchIdx === i - 1) {
        score += 2
      } else {
        score += 1
      }
      lastMatchIdx = i
      queryIdx++
    }
  }

  // All query characters must be found
  if (queryIdx !== queryLower.length) {
    return 0
  }

  return score
}

/**
 * Filter and sort items by fuzzy match score.
 */
export function fuzzyFilter<T>(
  query: string,
  items: T[],
  getText: (item: T) => string | string[]
): T[] {
  if (!query) return items

  const scored = items
    .map((item) => {
      const texts = getText(item)
      const textsArray = Array.isArray(texts) ? texts : [texts]
      const score = Math.max(...textsArray.map((t) => fuzzyMatch(query, t)))
      return { item, score }
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)

  return scored.map(({ item }) => item)
}
