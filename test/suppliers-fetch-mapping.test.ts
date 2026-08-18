import { describe, expect, it, vi } from "vitest";

const fromMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({
  supabase: { from: fromMock },
}));

import { fetchSuppliers } from "@/lib/suppliers";

function queryResult(data: unknown, error: unknown = null) {
  const q: Record<string, unknown> = {};
  const chain = ["select", "is", "not", "eq", "order", "limit", "single"];
  for (const m of chain) q[m] = vi.fn().mockReturnValue(q);
  q.then = (resolve: (value: unknown) => unknown) =>
    resolve({ data, error });
  return q;
}

describe("fetchSuppliers raw meat mapping", () => {
  it("maps a to-one raw_meat_items embed object into the item list", async () => {
    fromMock
      .mockReturnValueOnce(
        queryResult([
          {
            id: "a0da9dcf-af50-4e0b-b271-9c08323c99ee",
            company_name: "A-Mart 浩運食品 (AM)",
            contact_person: null,
            phone_number: null,
            delivery_schedule: null,
            payment_schedule: null,
            comment: null,
            is_active: true,
            bubble_created_at: null,
            created_at: "2026-01-01T00:00:00Z",
          },
        ]),
      ) // suppliers
      .mockReturnValueOnce(
        queryResult([
          { id: "i1", name: "雞串", supplier_id: "a0da9dcf-af50-4e0b-b271-9c08323c99ee" },
        ]),
      ) // ingredients
      .mockReturnValueOnce(
        queryResult([
          {
            supplier_id: "a0da9dcf-af50-4e0b-b271-9c08323c99ee",
            raw_meat_items: {
              id: "514fa4f7-3c55-431f-90f6-ccc2b0727509",
              name: "羊腩(生)",
            },
          },
        ]),
      ) // raw_meat_item_suppliers with to-one embed object
      .mockReturnValueOnce(queryResult([])); // restaurant_ingredients

    const rows = await fetchSuppliers({});
    expect(rows).toHaveLength(1);
    expect(rows[0].rawMeatItems).toEqual([
      { id: "514fa4f7-3c55-431f-90f6-ccc2b0727509", name: "羊腩(生)" },
    ]);
    expect(rows[0].cateringIngredients).toEqual([
      { id: "i1", name: "雞串" },
    ]);
  });
});
