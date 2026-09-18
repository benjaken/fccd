/**
 * Builds the text that is embedded for a published FAQ and a stable hash used
 * to skip unchanged rows. Question-only by default so answer wording does not
 * leak into question matching; similar aliases are folded in when present.
 */
export function buildFaqEmbeddingText(
  input: {
    question: string;
    aliases?: string[];
    answer?: string;
    includeAnswer?: boolean;
  },
): string {
  const parts = [
    input.question.trim(),
    ...(input.aliases ?? []).map((alias) => alias.trim()).filter(Boolean),
    ...(input.includeAnswer && input.answer?.trim() ? [input.answer.trim()] : []),
  ].filter(Boolean);
  return parts.join("\n").slice(0, 6_000);
}

/** Deterministic 32-bit FNV-1a hash in hex; used only for change detection. */
export function faqEmbeddingContentHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
