import { describe, expect, it, vi } from "vitest";
import { analyzeLearningBatches } from "../supabase/functions/_shared/customer-service-learning-batches";
import type { LearningMessage } from "../supabase/functions/_shared/customer-service-learning";

function message(index: number, role: LearningMessage["role"] = "customer", phone = "phone"): LearningMessage {
  return { id: String(index), phone, role, text: `message-${index}`,
    createdAt: new Date(Date.UTC(2026, 8, 15, 0, 0, index)).toISOString() };
}

describe("learning analysis batching", () => {
  it("preserves assistant context, consecutive human replies and unpaired human conversations", async () => {
    const messages = [message(0), message(1, "assistant"), message(2, "human"),
      message(3, "human"), message(4, "human", "human-only")];
    const analyze = vi.fn(async (_turns: number[], rows: LearningMessage[]) => rows.map((row) => row.id));
    const result = await analyzeLearningBatches([], messages, analyze);
    expect(result.analyses.flat()).toEqual(["0", "1", "2", "3", "4"]);
    expect(analyze.mock.calls[0][1]).toEqual(messages);
    expect(result.errors).toEqual([]);
  });

  it("covers all turns and messages with bounded same-phone chunks and eight-message overlap", async () => {
    const turns = Array.from({ length: 121 }, (_, index) => index);
    const messages = Array.from({ length: 75 }, (_, index) => message(index));
    const analyze = vi.fn(async (_turns: number[], _messages: LearningMessage[]) => "ok");
    await analyzeLearningBatches(turns, messages, analyze);
    const calls = analyze.mock.calls;
    expect(calls.flatMap(([rows]) => rows)).toEqual(turns);
    expect(calls.map(([rows]) => rows.length)).toEqual([50, 50, 21]);
    expect(calls.map(([, rows]) => rows.length)).toEqual([40, 40, 11]);
    expect(calls[1][1].slice(0, 8)).toEqual(calls[0][1].slice(-8));
    expect(new Set(calls.flatMap(([, rows]) => rows.map((row) => row.id))).size).toBe(75);
  });

  it("retains successful batches when other responses are null or throw without leaking diagnostics", async () => {
    let call = 0;
    const analyze = async () => {
      call += 1;
      if (call === 2) return null;
      if (call === 3) throw new Error("secret-token-transcript");
      return `success-${call}`;
    };
    const result = await analyzeLearningBatches(Array.from({ length: 151 }, (_, i) => i), [], analyze);
    expect(result).toEqual({ analyses: ["success-1", "success-4"],
      errors: ["learning_batch_empty_response", "learning_batch_analysis_failed"] });
  });

  it("makes no requests for an empty day", async () => {
    const analyze = vi.fn(async () => "unused");
    expect(await analyzeLearningBatches([], [], analyze)).toEqual({ analyses: [], errors: [] });
    expect(analyze).not.toHaveBeenCalled();
  });
});
