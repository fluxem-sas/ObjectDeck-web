/** Normalize a string for fuzzy matching: lowercase, strip accents and special chars. */
export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Returns a relevance score in [0, 1] for `query` against `target`.
 * 0 = no match, 1 = exact substring match.
 */
export function fuzzyScore(query: string, target: string): number {
  const q = normalizeText(query);
  const t = normalizeText(target);

  if (!q) return 1;
  if (!t) return 0;
  if (t.includes(q)) return 1;

  let queryIndex = 0;
  let streak = 0;
  let score = 0;

  for (let i = 0; i < t.length && queryIndex < q.length; i++) {
    if (t[i] === q[queryIndex]) {
      queryIndex++;
      streak++;
      score += 2 + Math.min(streak, 4);
    } else if (t[i] !== " ") {
      streak = 0;
      score -= 0.08;
    }
  }

  if (queryIndex < q.length) return 0;
  return Math.max(0, Math.min(0.98, score / (q.length * 6 + t.length * 0.08)));
}
