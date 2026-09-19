export type CustomerServiceFaqCandidate = {
  id: string;
  category: string;
  question: string;
  answer: string;
  score?: number;
};

export type CustomerServiceFaqRanked = CustomerServiceFaqCandidate & {
  rrfScore: number;
  lexicalRank: number | null;
  vectorRank: number | null;
  lexicalScore: number | null;
  vectorScore: number | null;
};

export type CustomerServiceRrfOptions = {
  rrfK: number;
  vectorWeight: number;
  lexicalWeight: number;
  limit: number;
};

function firstById(candidates: CustomerServiceFaqCandidate[]) {
  const ranks = new Map<string, number>();
  const scores = new Map<string, number | null>();
  candidates.forEach((candidate, index) => {
    if (!candidate?.id || ranks.has(candidate.id)) return;
    ranks.set(candidate.id, index + 1);
    scores.set(candidate.id, candidate.score ?? null);
  });
  return { ranks, scores };
}

/**
 * Reciprocal rank fusion over the lexical and semantic FAQ candidate lists.
 * Ranks are 1-indexed and fused with `weight / (k + rank)`, matching the
 * WeKnora retrieval behaviour this project is modelled on. Inputs are assumed
 * to be sorted by descending relevance already.
 */
export function fuseCustomerFaqCandidates(
  lexical: CustomerServiceFaqCandidate[],
  vector: CustomerServiceFaqCandidate[],
  options: CustomerServiceRrfOptions,
): CustomerServiceFaqRanked[] {
  const rrfK = Math.max(1, options.rrfK);
  const lexicalIndex = firstById(lexical);
  const vectorIndex = firstById(vector);
  const lexicalRanks = lexicalIndex.ranks;
  const vectorRanks = vectorIndex.ranks;
  const byId = new Map<string, CustomerServiceFaqCandidate>();
  for (const candidate of [...lexical, ...vector]) {
    if (!candidate?.id) continue;
    const existing = byId.get(candidate.id);
    // Prefer the record with a non-empty answer, then the lexical copy.
    if (!existing || (!existing.answer && candidate.answer)) byId.set(candidate.id, candidate);
  }

  const fused: CustomerServiceFaqRanked[] = [];
  for (const [id, candidate] of byId) {
    const lexicalRank = lexicalRanks.get(id) ?? null;
    const vectorRank = vectorRanks.get(id) ?? null;
    const rrfScore =
      (lexicalRank === null ? 0 : options.lexicalWeight / (rrfK + lexicalRank)) +
      (vectorRank === null ? 0 : options.vectorWeight / (rrfK + vectorRank));
    fused.push({
      ...candidate,
      rrfScore,
      lexicalRank,
      vectorRank,
      lexicalScore: lexicalRank === null ? null : lexicalIndex.scores.get(id) ?? null,
      vectorScore: vectorRank === null ? null : vectorIndex.scores.get(id) ?? null,
    });
  }

  fused.sort((left, right) =>
    right.rrfScore - left.rrfScore ||
    (left.vectorRank ?? Number.MAX_SAFE_INTEGER) - (right.vectorRank ?? Number.MAX_SAFE_INTEGER) ||
    (left.lexicalRank ?? Number.MAX_SAFE_INTEGER) - (right.lexicalRank ?? Number.MAX_SAFE_INTEGER) ||
    left.question.localeCompare(right.question)
  );
  return fused.slice(0, Math.max(1, options.limit));
}
