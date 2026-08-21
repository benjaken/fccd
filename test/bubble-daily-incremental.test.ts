import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  canAdvanceCheckpoint,
  canonicalJson,
  partitionConflicts,
  sha256Hex,
} from "../supabase/functions/bubble-daily-incremental/helpers.ts";
import { phoneText, coreMappings } from "../supabase/functions/bubble-daily-incremental/mappings.ts";

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

  it("keeps numeric Bubble contact numbers as text", () => {
    expect(phoneText(90154004)).toBe("90154004");
    expect(phoneText(" 91234567 ")).toBe("91234567");
    expect(phoneText(null)).toBeNull();
    expect(phoneText("")).toBeNull();
  });

  it("keeps Bubble delivery time windows as text", () => {
    expect(phoneText("18:00 - 19:00")).toBe("18:00 - 19:00");
    expect(phoneText(" 12:00 - 12:30 ")).toBe("12:00 - 12:30");
  });

  it("maps Bubble Delivery_DS_Shipping Method onto orders", () => {
    const mapping = coreMappings.find((item) => item.sourceType === "a_order");
    expect(mapping).toBeTruthy();
    const row = mapping!.map({
      _id: "order-1",
      "Delivery_DS_Shipping Method": "1678870660114x185437087924224000",
    });
    expect(row.shipping_method_legacy_id).toBe(
      "1678870660114x185437087924224000",
    );
    expect(
      mapping!.relations?.some((item) => item.idField === "shipping_method_id"),
    ).toBe(true);
  });

  it("maps Bubble fulfill and take timestamps onto deliveries", () => {
    const mapping = coreMappings.find(
      (item) => item.sourceType === "b_deliveryschedule",
    );
    expect(mapping).toBeTruthy();
    const row = mapping!.map({
      _id: "delivery-1",
      "fulfill_date&time(trigger A_order)": "2026-08-01T12:37:00.000Z",
      "take_date&time": "2026-08-01T12:15:54.000Z",
      "OS driver delivery status": "已送達",
    });
    expect(row.fulfilled_at).toBe("2026-08-01T12:37:00.000Z");
    expect(row.taken_at).toBe("2026-08-01T12:15:54.000Z");
    expect(row.delivery_status).toBe("已送達");
  });

  it("fills only missing motorcade UUID links on existing deliveries", () => {
    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        "supabase/functions/bubble-daily-incremental/index.ts",
      ),
      "utf8",
    );

    expect(source).toContain('relation.idField === "motorcade_id"');
    expect(source).toContain("motorcade_id: row.motorcade_id");
    expect(source).toContain('.is("motorcade_id", null)');
  });
});
