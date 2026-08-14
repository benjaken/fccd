import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PreparedMeatInventoryCalcPage } from "@/components/PreparedMeatInventoryCalcPage";
import i18n from "@/i18n";
import {
  currentHongKongYear,
  type PreparedMeatItemOption,
  type PreparedMeatMovementRow,
} from "@/lib/prepared-meat-inventory";

const currentYear = currentHongKongYear();

const items: PreparedMeatItemOption[] = [
  {
    id: "item-1",
    sku: "PM001",
    name: "五香牛腩",
    sortOrder: 1,
    isActive: true,
  },
  {
    id: "item-2",
    sku: "PM002",
    name: "滷水豬手",
    sortOrder: 2,
    isActive: true,
  },
];

const movementsByItem: Record<string, PreparedMeatMovementRow[]> = {
  "item-1": [
    {
      id: "move-out-june",
      movementAt: "2026-06-15T04:00:00.000Z",
      productName: "五香牛腩",
      shopId: "shop-ylp",
      shopName: "桂花小幸 YLP",
      inboundPackages: null,
      outboundPackages: 2,
      balancePackages: 8,
      remarks: "june out",
      kind: "outbound",
    },
    {
      id: "move-in-june",
      movementAt: "2026-06-10T04:00:00.000Z",
      productName: "五香牛腩",
      shopId: null,
      shopName: null,
      inboundPackages: 4,
      outboundPackages: null,
      balancePackages: 10,
      remarks: "june in",
      kind: "inbound",
    },
    {
      id: "move-out-may",
      movementAt: "2026-05-20T04:00:00.000Z",
      productName: "五香牛腩",
      shopId: "shop-tst",
      shopName: "尖沙咀店",
      inboundPackages: null,
      outboundPackages: 1,
      balancePackages: 6,
      remarks: "may out",
      kind: "outbound",
    },
  ],
  "item-2": [
    {
      id: "move-2",
      movementAt: "2026-06-01T04:00:00.000Z",
      productName: "滷水豬手",
      shopId: "shop-ylp",
      shopName: "桂花小幸 YLP",
      inboundPackages: null,
      outboundPackages: 3,
      balancePackages: 12,
      remarks: null,
      kind: "outbound",
    },
  ],
};

describe("Prepared meat inventory calculation page", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("shows left item tabs and defaults to the first item ledger", async () => {
    const loadItems = vi.fn().mockResolvedValue(items);
    const loadMovements = vi
      .fn()
      .mockImplementation(async (itemId: string, productName: string) => {
        expect(productName).toBeTruthy();
        return movementsByItem[itemId] ?? [];
      });

    render(
      <MemoryRouter>
        <PreparedMeatInventoryCalcPage
          loadItems={loadItems}
          loadMovements={loadMovements}
        />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "製成品存貨計算" }),
    ).toBeInTheDocument();
    expect(screen.getByText("凍貨")).toHaveClass("eyebrow");

    const sidebar = screen.getByRole("complementary", { name: "製成品選項" });
    expect(within(sidebar).getByRole("button", { name: "五香牛腩" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(within(sidebar).getByRole("button", { name: "滷水豬手" })).toBeInTheDocument();

    await waitFor(() => {
      expect(loadMovements).toHaveBeenCalledWith(
        "item-1",
        "五香牛腩",
        currentYear,
      );
    });

    expect(await screen.findByText("桂花小幸 YLP")).toBeInTheDocument();
    expect(screen.getByText("尖沙咀店")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "年份" })).toHaveValue(
      String(currentYear),
    );
  });

  it("switches the right-side ledger when selecting another item", async () => {
    const user = userEvent.setup();
    const loadItems = vi.fn().mockResolvedValue(items);
    const loadMovements = vi
      .fn()
      .mockImplementation(async (itemId: string) => movementsByItem[itemId] ?? []);

    render(
      <MemoryRouter>
        <PreparedMeatInventoryCalcPage
          loadItems={loadItems}
          loadMovements={loadMovements}
        />
      </MemoryRouter>,
    );

    await screen.findByText("桂花小幸 YLP");
    await user.click(screen.getByRole("button", { name: "滷水豬手" }));

    await waitFor(() => {
      expect(loadMovements).toHaveBeenCalledWith(
        "item-2",
        "滷水豬手",
        currentYear,
      );
    });

    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "滷水豬手" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.queryByText("尖沙咀店")).not.toBeInTheDocument();
  });

  it("filters the ledger by month and shop", async () => {
    const user = userEvent.setup();
    const loadItems = vi.fn().mockResolvedValue(items);
    const loadMovements = vi
      .fn()
      .mockImplementation(async (itemId: string) =>
        structuredClone(movementsByItem[itemId] ?? []),
      );

    render(
      <MemoryRouter>
        <PreparedMeatInventoryCalcPage
          loadItems={loadItems}
          loadMovements={loadMovements}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText("june out")).toBeInTheDocument();
    expect(screen.getByText("may out")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "篩選月份" }));
    const monthBox = await screen.findByRole("listbox", { name: "篩選月份" });
    expect(within(monthBox).getByRole("option", { name: "全部月份" })).toBeInTheDocument();
    await user.click(within(monthBox).getByRole("option", { name: "Jun-26" }));

    expect(await screen.findByText("june out")).toBeInTheDocument();
    expect(screen.getByText("june in")).toBeInTheDocument();
    expect(screen.queryByText("may out")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "篩選月份" })).toHaveTextContent(
      "Jun-26",
    );

    await user.click(screen.getByRole("button", { name: "篩選店鋪" }));
    const shopBox = await screen.findByRole("listbox", { name: "篩選店鋪" });
    expect(within(shopBox).getByRole("option", { name: "全部店鋪" })).toBeInTheDocument();
    await user.click(within(shopBox).getByRole("option", { name: "桂花小幸 YLP" }));

    expect(await screen.findByText("june out")).toBeInTheDocument();
    expect(screen.queryByText("june in")).not.toBeInTheDocument();
    expect(screen.queryByText("may out")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "篩選店鋪" })).toHaveTextContent(
      "桂花小幸 YLP",
    );
  });

  it("uses different icon-only edit buttons for inbound and outbound rows", async () => {
    const loadItems = vi.fn().mockResolvedValue(items);
    const loadMovements = vi
      .fn()
      .mockImplementation(async (itemId: string) => movementsByItem[itemId] ?? []);

    render(
      <MemoryRouter>
        <PreparedMeatInventoryCalcPage
          loadItems={loadItems}
          loadMovements={loadMovements}
        />
      </MemoryRouter>,
    );

    const inboundEdit = await screen.findByRole("button", { name: "入貨編輯" });
    const outboundEdits = screen.getAllByRole("button", { name: "出貨編輯" });

    expect(inboundEdit).toBeInTheDocument();
    expect(inboundEdit).toHaveClass("prepared-meat-calc-edit-inbound");
    expect(inboundEdit.textContent).toBe("");
    expect(outboundEdits.length).toBeGreaterThan(0);
    expect(outboundEdits[0]).toHaveClass("prepared-meat-calc-edit-outbound");
    expect(outboundEdits[0]?.textContent).toBe("");
    expect(inboundEdit.querySelector("svg")).not.toBeNull();
    expect(outboundEdits[0]?.querySelector("svg")).not.toBeNull();
    expect(inboundEdit.querySelector("svg")?.innerHTML).not.toBe(
      outboundEdits[0]?.querySelector("svg")?.innerHTML,
    );
  });
});
