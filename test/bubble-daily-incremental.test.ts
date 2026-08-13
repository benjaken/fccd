import { describe, expect, it } from "vitest";
import {
  canAdvanceCheckpoint,
  canonicalJson,
  partitionConflicts,
  sha256Hex,
} from "../supabase/functions/bubble-daily-incremental/helpers.ts";

describe("bubble daily incremental helpers", () => {
  it("canonicalizes object keys recursively and hashes deterministically", async () => {
    const first = { b: 2, a: 1, nested: { z: true, a: null } };
    const second = { nested: { a: null, z: true }, a: 1, b: 2 };

    expect(canonicalJson(first)).toBe(
      '{"a":1,"b":2,"nested":{"a":null,"z":true}}',
    );
    expect(canonicalJson(second)).toBe(canonicalJson(first));
    expect(await sha256Hex('{"a":1,"b":2}')).toBe(
      "43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777",
    );
    expect(await sha256Hex(canonicalJson(first))).toBe(
      await sha256Hex(canonicalJson(second)),
    );
  });

  it("partitions existing legacy IDs without changing record order", () => {
    const records = [
      { _id: "new-1" },
      { _id: "existing-1" },
      { _id: "new-2" },
      { _id: "existing-2" },
    ];

    const result = partitionConflicts(
      records,
      new Set(["existing-1", "existing-2"]),
    );

    expect(result.fresh.map((record) => record._id)).toEqual([
      "new-1",
      "new-2",
    ]);
    expect(result.conflicts.map((record) => record._id)).toEqual([
      "existing-1",
      "existing-2",
    ]);
  });

  it("advances a checkpoint only after complete successful work", () => {
    expect(canAdvanceCheckpoint(true, false, false)).toBe(true);
    expect(canAdvanceCheckpoint(false, false, false)).toBe(false);
    expect(canAdvanceCheckpoint(true, true, false)).toBe(false);
    expect(canAdvanceCheckpoint(true, false, true)).toBe(false);
  });
});
