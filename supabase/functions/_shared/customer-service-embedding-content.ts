/** The revision/CAS check is the freshness authority; the hash is only a checksum. */
export function buildFaqEmbeddingText(input: {
  question: string; aliases?: string[]; answer?: string; includeAnswer?: boolean;
}): string {
  const aliases = [...new Set((input.aliases ?? []).map((s) => s.trim()).filter(Boolean))].sort();
  return [input.question.trim(), ...aliases,
    ...(input.includeAnswer && input.answer?.trim() ? [input.answer.trim()] : [])]
    .filter(Boolean).join("\n").slice(0, 6_000);
}
/** Deterministic 32-bit FNV-1a; never use as an authorization or version token. */
export function faqEmbeddingContentHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 0x01000193); }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
