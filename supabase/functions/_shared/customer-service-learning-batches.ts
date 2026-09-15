import type { LearningMessage } from "./customer-service-learning.ts";

/** Keep each conversation together; overlapping chunks retain local context. */
export async function analyzeLearningBatches<TTurn, TAnalysis>(
  turns: TTurn[],
  messages: LearningMessage[],
  analyze: (turns: TTurn[], messages: LearningMessage[]) => Promise<TAnalysis | null>,
): Promise<{ analyses: TAnalysis[]; errors: string[] }> {
  const conversations = new Map<string, LearningMessage[]>();
  for (const message of [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const conversation = conversations.get(message.phone) ?? [];
    conversation.push(message);
    conversations.set(message.phone, conversation);
  }
  const messageBatches: LearningMessage[][] = [];
  for (const conversation of conversations.values()) {
    for (let start = 0; start < conversation.length; start += 32) {
      const chunk = conversation.slice(start, start + 40);
      const previous = messageBatches.at(-1);
      if (previous && previous.length + chunk.length <= 40) previous.push(...chunk);
      else messageBatches.push(chunk);
      if (start + 40 >= conversation.length) break;
    }
  }
  const analyses: TAnalysis[] = [];
  const errors: string[] = [];
  const count = Math.max(Math.ceil(turns.length / 50), messageBatches.length);
  for (let index = 0; index < count; index += 1) {
    try {
      const result = await analyze(turns.slice(index * 50, (index + 1) * 50), messageBatches[index] ?? []);
      if (result === null) errors.push("learning_batch_empty_response");
      else analyses.push(result);
    } catch {
      // Provider exceptions can contain request URLs, credentials or transcripts.
      errors.push("learning_batch_analysis_failed");
    }
  }
  return { analyses, errors };
}
