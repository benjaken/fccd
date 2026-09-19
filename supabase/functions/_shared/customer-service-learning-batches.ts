import type { LearningMessage } from "./customer-service-learning.ts";

const BATCH_CONCURRENCY = 4;

/** Bound how many provider calls run at once while keeping result order stable. */
async function runBounded(count: number, limit: number, worker: (index: number) => Promise<void>) {
  let next = 0;
  const run = async () => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= count) return;
      await worker(index);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, count)) }, run));
}

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
  const count = Math.max(Math.ceil(turns.length / 50), messageBatches.length);
  const batchAnalyses: (TAnalysis | undefined)[] = new Array(count);
  const batchErrors: (string | undefined)[] = new Array(count);
  await runBounded(count, BATCH_CONCURRENCY, async (index) => {
    try {
      const result = await analyze(turns.slice(index * 50, (index + 1) * 50), messageBatches[index] ?? []);
      if (result === null) batchErrors[index] = "learning_batch_empty_response";
      else batchAnalyses[index] = result;
    } catch {
      // Provider exceptions can contain request URLs, credentials or transcripts.
      batchErrors[index] = "learning_batch_analysis_failed";
    }
  });
  const analyses: TAnalysis[] = [];
  const errors: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const analysis = batchAnalyses[index];
    if (analysis !== undefined) analyses.push(analysis);
    const error = batchErrors[index];
    if (error) errors.push(error);
  }
  return { analyses, errors };
}
