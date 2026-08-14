import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MeatYieldErrorsPage } from "@/components/MeatYieldErrorsPage";
import i18n from "@/i18n";
import type { MeatYieldErrorRow } from "@/lib/meat-yield-errors";

const rows: MeatYieldErrorRow[] = [
  {
    id: "err-1",
    productionAt: "2026-06-29T16:00:00.000Z",
    rawMeatName: "金錢牛展",
    preparedMeatName: "熟滷水牛展頭",
    rawInputKg: 142.019,
    expectedPacks: 5,
    actualPacks: 1,
    deviationPacks: -4,
    deviationRatio: -0.8,
    deviationDirection: "under",
  },
  {
    id: "err-2",
    productionAt: "2026-05-28T16:00:00.000Z",
    rawMeatName: "金錢牛肚",
    preparedMeatName: "熟滷水牛肚條",
    rawInputKg: 120.032,
    expectedPacks: 45,
    actualPacks: 38,
    deviationPacks: -7,
    deviationRatio: -0.155556,
    deviationDirection: "under",
  },
];

describe("Meat yield errors page", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("lists yield errors and searches by product name", async () => {
    const user = userEvent.setup();
    const loadErrors = vi.fn().mockImplementation(async ({ search }: { search?: string }) => {
      if (search === "牛肚") {
        return { items: [rows[1]!], total: 1 };
      }
      return { items: rows, total: 2 };
    });

    render(
      <MemoryRouter>
        <MeatYieldErrorsPage loadErrors={loadErrors} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "收成錯誤統計" })).toBeInTheDocument();
    expect(screen.getByText("熟滷水牛展頭")).toBeInTheDocument();
    expect(screen.getAllByText("不足").length).toBeGreaterThan(0);

    await user.type(screen.getByPlaceholderText("搜尋生肉或製成品"), "牛肚");
    await user.click(screen.getByRole("button", { name: "搜尋" }));
    await waitFor(() => {
      expect(loadErrors).toHaveBeenCalledWith({ page: 1, search: "牛肚" });
    });
    expect(await screen.findByText("熟滷水牛肚條")).toBeInTheDocument();
  });
});
