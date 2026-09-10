import { readFileSync } from "node:fs";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MaterialInventoryPage } from "@/components/MaterialInventoryPage";
import i18n from "@/i18n";
import {
  correctMaterialCurrentStock,
  fetchMaterialInventory,
  fetchMaterialInventoryLedger,
} from "@/lib/material-inventory";

vi.mock("@/auth/use-page-access", () => ({
  useCurrentPageAccess: () => ({ canAccess: () => true, canManage: () => true }),
}));
vi.mock("@/lib/material-inventory", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/material-inventory")>();
  return {
    ...actual,
    fetchMaterialInventory: vi.fn(),
    fetchMaterialInventoryLedger: vi.fn(),
    correctMaterialCurrentStock: vi.fn(),
  };
});

const migration = readFileSync(
  "supabase/migrations/20260908150000_material_inventory_ledger.sql",
  "utf8",
);
const deliveryMigration = readFileSync(
  "supabase/migrations/20260908160000_delivery_scoped_material_consumption.sql",
  "utf8",
);
const awaitingDriverMigration = readFileSync(
  "supabase/migrations/20260908170000_consume_materials_when_awaiting_driver.sql",
  "utf8",
);
const aggregateLedgerMigration = readFileSync(
  "supabase/migrations/20260910014636_aggregate_ledger_order_consumptions.sql",
  "utf8",
);

describe("material inventory ledger", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("zh-HK");
    vi.mocked(fetchMaterialInventory).mockResolvedValue([{
      ingredientId: "ingredient-1", sku: "AM001", name: "白米", ingredientType: "一般食材",
      unit: "包", currentQuantity: 12, minimumStock: 5, lastActivityAt: "2026-09-08T02:00:00Z",
    }]);
    vi.mocked(fetchMaterialInventoryLedger).mockResolvedValue([{
      id: "movement-1", type: "consumption", occurredAt: "2026-09-08T02:00:00Z",
      quantity: -2, balanceAfter: 12, reference: "B#1001", note: "order_bom",
      isReversal: false,
    }]);
    vi.mocked(correctMaterialCurrentStock).mockResolvedValue("correction-1");
  });

  it("deducts only the current delivery's BOM when it reaches awaiting driver", () => {
    expect(awaitingDriverMigration).toContain("'待接單'");
    expect(awaitingDriverMigration).toContain("after insert or update of delivery_status");
    expect(deliveryMigration).toContain("line.delivery_id = p_delivery_id");
    expect(deliveryMigration).toContain("line.delivery_at = v_delivery_at");
    expect(deliveryMigration).toContain("v_active_delivery_count = 1");
    expect(migration).toContain("unique (order_line_id, ingredient_id)");
    expect(deliveryMigration).toContain("on conflict (order_line_id, ingredient_id) do nothing");
    expect(deliveryMigration).toContain("order_bom_requirements");
    expect(deliveryMigration).toContain("product_ingredients");
    expect(deliveryMigration).toContain("order_package_choice_snapshots");
  });

  it("uses the unified balance for stock display and shortage planning", () => {
    expect(migration).toContain("material_inventory_current_balance");
    expect(migration).toContain("v_baseline + v_movement_delta - v_consumption");
    expect(migration).toContain("create or replace function public.inventory_item_balance");
    expect(migration).toContain("material_inventory_summary");
    expect(migration).toContain("material_inventory_ledger");
    expect(migration).toContain("correct_material_current_stock");
    expect(migration).toContain("correction_reason");
  });

  it("aggregates same-order line consumptions in the ledger", () => {
    expect(aggregateLedgerMigration).toContain("group by");
    expect(aggregateLedgerMigration).toContain("-sum(consumption.quantity)");
    expect(aggregateLedgerMigration).toContain("orders.order_number");
    expect(aggregateLedgerMigration).toContain("consumption.consumed_at");
    expect(aggregateLedgerMigration).toContain("consumption.calculation_source");
  });

  it("shows ingredient and packaging tabs, ledger detail, and stock correction", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><MaterialInventoryPage /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "食材包裝庫存" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "食材", selected: true })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "包裝" }));
    await waitFor(() => expect(fetchMaterialInventory).toHaveBeenCalledWith("packing", ""));

    await user.click(await screen.findByRole("button", { name: /查看流水/ }));
    expect(await screen.findByText("B#1001")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "修正庫存" }));
    expect(screen.getByRole("dialog", { name: "修正現有庫存" })).toBeInTheDocument();
    await user.clear(screen.getByRole("spinbutton", { name: "實際數量" }));
    await user.type(screen.getByRole("spinbutton", { name: "實際數量" }), "18");
    await user.type(screen.getByRole("textbox", { name: "修正原因" }), "重新盤點");
    await user.click(screen.getByRole("button", { name: "保存修正" }));
    await waitFor(() => expect(correctMaterialCurrentStock).toHaveBeenCalledWith({
      kind: "packing", ingredientId: "ingredient-1", quantity: 18, reason: "重新盤點",
    }));
  });

  it("filters inventory rows by stock status", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchMaterialInventory).mockResolvedValue([
      {
        ingredientId: "ingredient-1", sku: "AM001", name: "白米", ingredientType: "一般食材",
        unit: "包", currentQuantity: 12, minimumStock: 5, lastActivityAt: "2026-09-08T02:00:00Z",
      },
      {
        ingredientId: "ingredient-2", sku: "AM002", name: "糯米", ingredientType: "一般食材",
        unit: "包", currentQuantity: 2, minimumStock: 5, lastActivityAt: "2026-09-08T03:00:00Z",
      },
      {
        ingredientId: "ingredient-3", sku: "AM003", name: "紅米", ingredientType: "一般食材",
        unit: "包", currentQuantity: null, minimumStock: 5, lastActivityAt: null,
      },
    ]);

    render(<MemoryRouter><MaterialInventoryPage /></MemoryRouter>);

    expect(await screen.findByText("白米")).toBeInTheDocument();
    expect(screen.getByText("糯米")).toBeInTheDocument();
    expect(screen.getByText("紅米")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("庫存狀態"), "low");
    expect(screen.queryByText("白米")).not.toBeInTheDocument();
    expect(screen.getByText("糯米")).toBeInTheDocument();
    expect(screen.queryByText("紅米")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("庫存狀態"), "missing");
    expect(screen.queryByText("糯米")).not.toBeInTheDocument();
    expect(screen.getByText("紅米")).toBeInTheDocument();
  });
});
