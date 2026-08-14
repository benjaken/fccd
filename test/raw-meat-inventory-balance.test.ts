import { describe, expect, it } from "vitest";

// Lightweight pure-logic check mirroring src/lib/raw-meat-inventory.ts
function withRunningBalance(
  rows: Array<{
    id: string;
    inbound: number;
    outbound: number;
    at: string;
  }>,
) {
  const chronological = [...rows].sort((a, b) =>
    a.at === b.at ? a.id.localeCompare(b.id) : a.at < b.at ? -1 : 1,
  );
  let balance = 0;
  const computed = chronological.map((row) => {
    balance += row.inbound - row.outbound;
    return { id: row.id, balance };
  });
  return computed.reverse();
}

describe("raw meat running balance", () => {
  it("tracks stock after each movement and lists newest first", () => {
    const result = withRunningBalance([
      { id: "b", inbound: 2, outbound: 0, at: "2026-05-31" },
      { id: "a", inbound: 3, outbound: 0, at: "2026-05-01" },
      { id: "c", inbound: 0, outbound: 1, at: "2026-06-01" },
    ]);

    expect(result.map((row) => row.id)).toEqual(["c", "b", "a"]);
    expect(result.map((row) => row.balance)).toEqual([4, 5, 3]);
  });
});
