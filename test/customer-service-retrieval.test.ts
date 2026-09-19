import { describe, expect, it } from "vitest";

import { fuseCustomerFaqCandidates } from "../supabase/functions/_shared/customer-service-retrieval.ts";

const lexical = [
  { id: "a", category: "x", question: "A", answer: "a", score: 10 },
  { id: "b", category: "x", question: "B", answer: "b", score: 8 },
  { id: "c", category: "x", question: "C", answer: "c", score: 6 },
];
const vector = [
  { id: "b", category: "x", question: "B", answer: "b", score: 0.91 },
  { id: "a", category: "x", question: "A", answer: "a", score: 0.88 },
  { id: "d", category: "x", question: "D", answer: "d", score: 0.8 },
];
const options = { rrfK: 60, vectorWeight: 0.7, lexicalWeight: 0.3, limit: 10 };

describe("customer-service reciprocal rank fusion", () => {
  it("fuses both rankings with weighted reciprocal rank", () => {
    const fused = fuseCustomerFaqCandidates(lexical, vector, options);
    expect(fused.map((item) => item.id)).toEqual(["b", "a", "d", "c"]);
    expect(fused[0].lexicalRank).toBe(2);
    expect(fused[0].vectorRank).toBe(1);
    expect(fused[0].lexicalScore).toBe(8);
    expect(fused[0].vectorScore).toBe(0.91);
    expect(fused[0].rrfScore).toBeCloseTo(0.3 / 62 + 0.7 / 61, 10);
    expect(fused[0].rrfScore).toBeGreaterThan(fused[1].rrfScore);
  });

  it("returns vector-only candidates when lexical is empty", () => {
    const fused = fuseCustomerFaqCandidates([], vector, options);
    expect(fused.map((item) => item.id)).toEqual(["b", "a", "d"]);
    expect(fused.every((item) => item.lexicalRank === null)).toBe(true);
    expect(fused[0].vectorScore).toBe(0.91);
  });

  it("returns lexical-only candidates when vector is empty", () => {
    const fused = fuseCustomerFaqCandidates(lexical, [], options);
    expect(fused.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(fused.every((item) => item.vectorRank === null)).toBe(true);
  });

  it("respects the final limit and deduplicates repeated ids", () => {
    const fused = fuseCustomerFaqCandidates(
      [...lexical, { ...lexical[0] }],
      vector,
      { ...options, limit: 2 },
    );
    expect(fused.map((item) => item.id)).toEqual(["b", "a"]);
    expect(new Set(fused.map((item) => item.id)).size).toBe(fused.length);
  });

  it("keeps lexical order when the vector weight is zero", () => {
    const fused = fuseCustomerFaqCandidates(lexical, vector, {
      ...options,
      vectorWeight: 0,
      lexicalWeight: 1,
    });
    expect(fused.map((item) => item.id)).toEqual(["a", "b", "c", "d"]);
  });
});
