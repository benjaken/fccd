import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc, from: vi.fn() },
}));

import { markFactoryOrderPrinted } from "../src/lib/factory-board";

describe("markFactoryOrderPrinted", () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ error: null });
  });

  it("sends the printed line snapshot keyed by line_id", async () => {
    await markFactoryOrderPrinted("order-1", [
      {
        id: "line-a",
        labelNames: ["檸檬茶"],
        quantity: 2,
        itemOrder: 1,
        remarks: ["少甜"],
        productId: "prod-1",
        packageId: null,
        productNameSnapshot: "檸檬茶",
        contentSnapshot: "檸檬茶",
        newQuantityText: null,
        remarks1: "少甜",
        remarks2: null,
        labelRemarks: ["少甜"],
        isAddon: false,
      },
    ]);

    expect(rpc).toHaveBeenCalledWith("mark_factory_order_printed", {
      p_order_id: "order-1",
      p_lines: [
        {
          line_id: "line-a",
          label_names: ["檸檬茶"],
          quantity: 2,
          item_order: 1,
          remarks: ["少甜"],
          product_id: "prod-1",
          package_id: null,
          product_name_snapshot: "檸檬茶",
          content_snapshot: "檸檬茶",
          new_quantity_text: null,
          remarks_1: "少甜",
          remarks_2: null,
          label_remarks: ["少甜"],
          is_addon: false,
        },
      ],
    });
  });

  it("throws when the rpc reports an error", async () => {
    rpc.mockResolvedValue({ error: new Error("factory_order_print_stale") });
    await expect(markFactoryOrderPrinted("order-1", [])).rejects.toThrow(
      "factory_order_print_stale",
    );
  });
});
