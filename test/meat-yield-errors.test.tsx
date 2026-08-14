import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MeatYieldErrorsPage } from "@/components/MeatYieldErrorsPage";
import i18n from "@/i18n";
import {
  YIELD_ERRORS_PAGE_SIZE,
  type MeatYieldErrorListItem,
  type MeatYieldErrorListResult,
} from "@/lib/meat-yield-errors";

const rows: MeatYieldErrorListItem[] = [
  {
    id: "ye-1",
    productionAt: "2026-08-14T02:00:00.000Z",
    rawMeatName: "豬肉碎(扁食用) (生)",
    preparedMeatName: "扁食肉餡 (500克)",
    rawInputKg: 13.91,
    expectedPacks: 31,
    actualPacks: 80,
    deviationPacks: 49,
    deviationRatio: 49 / 31,
    direction: "over",
    remarks: "輸入 80",
  },
  {
    id: "ye-2",
    productionAt: "2026-08-13T02:00:00.000Z",
    rawMeatName: "豬肉碎(扁食用) (生)",
    preparedMeatName: "扁食肉餡 (500克)",
    rawInputKg: 13.91,
    expectedPacks: 31,
    actualPacks: 8,
    deviationPacks: -23,
    deviationRatio: -23 / 31,
    direction: "under",
    remarks: null,
  },
];

function result(
  items: MeatYieldErrorListItem[],
  total = items.length,
): MeatYieldErrorListResult {
  return { items, total };
}

describe("Meat yield errors page", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("uses the operational list page size of 15", () => {
    expect(YIELD_ERRORS_PAGE_SIZE).toBe(15);
  });

  it("lists yield errors with over and under labels", async () => {
    const loadYieldErrors = vi.fn().mockResolvedValue(result(rows));

    render(
      <MemoryRouter>
        <MeatYieldErrorsPage loadYieldErrors={loadYieldErrors} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "收成錯誤統計" }),
    ).toBeInTheDocument();
    expect(screen.getByText("計算規則")).toBeInTheDocument();
    expect(
      screen.getByText(
        "預算收成 = 向上取整（該熟貨過往入貨包數 ÷ 過往生肉出貨 kg × 今次生肉出貨 kg）",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "實際入貨包數與預算收成相差超過 15% 才列入此表。",
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText("輸入 80")).toBeInTheDocument();
    expect(screen.getAllByText("豬肉碎(扁食用) (生)")).toHaveLength(2);
    expect(screen.getAllByText("扁食肉餡 (500克)")).toHaveLength(2);
    const table = screen.getByRole("table");
    expect(within(table).getByText("超出")).toBeInTheDocument();
    expect(within(table).getByText("不足")).toBeInTheDocument();
    expect(loadYieldErrors).toHaveBeenCalledWith({
      page: 1,
      search: "",
      direction: "",
    });
  });

  it("submits a server-side search and resets to the first page", async () => {
    const user = userEvent.setup();
    const loadYieldErrors = vi.fn().mockResolvedValue(result(rows));

    render(
      <MemoryRouter>
        <MeatYieldErrorsPage loadYieldErrors={loadYieldErrors} />
      </MemoryRouter>,
    );

    await waitFor(() => expect(loadYieldErrors).toHaveBeenCalledTimes(1));
    await user.type(
      screen.getByPlaceholderText("搜尋生肉、熟貨或備註"),
      "扁食",
    );
    await user.click(screen.getByRole("button", { name: "搜尋" }));

    await waitFor(() =>
      expect(loadYieldErrors).toHaveBeenLastCalledWith({
        page: 1,
        search: "扁食",
        direction: "",
      }),
    );
  });

  it("filters by under/over direction", async () => {
    const user = userEvent.setup();
    const loadYieldErrors = vi
      .fn()
      .mockResolvedValueOnce(result(rows))
      .mockResolvedValueOnce(result([rows[1]]));

    render(
      <MemoryRouter>
        <MeatYieldErrorsPage loadYieldErrors={loadYieldErrors} />
      </MemoryRouter>,
    );

    await within(await screen.findByRole("table")).findByText("超出");
    await user.selectOptions(screen.getByLabelText("偏差方向"), "under");

    await waitFor(() =>
      expect(loadYieldErrors).toHaveBeenLastCalledWith({
        page: 1,
        search: "",
        direction: "under",
      }),
    );
  });

  it("paginates yield errors in groups of fifteen", async () => {
    const user = userEvent.setup();
    const loadYieldErrors = vi.fn().mockResolvedValue(result(rows, 31));

    render(
      <MemoryRouter>
        <MeatYieldErrorsPage loadYieldErrors={loadYieldErrors} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("spinbutton", { name: "跳至頁碼" }),
    ).toHaveValue(1);
    expect(
      await screen.findByText("顯示 1–15，共 31 筆"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "下一頁" }));

    await waitFor(() =>
      expect(loadYieldErrors).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
      ),
    );
  });

  it("shows an empty state when there are no rows", async () => {
    const loadYieldErrors = vi.fn().mockResolvedValue(result([]));

    render(
      <MemoryRouter>
        <MeatYieldErrorsPage loadYieldErrors={loadYieldErrors} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("目前沒有收成錯誤")).toBeInTheDocument();
    expect(screen.getByText("調整搜尋或篩選條件後再試。")).toBeInTheDocument();
    expect(document.querySelector(".operational-list-state svg")).not.toBeNull();
  });

  it("keeps the empty-state title and description on separate lines", () => {
    const stylesheet = readFileSync(
      path.resolve(process.cwd(), "src/index.css"),
      "utf8",
    );
    expect(stylesheet).toMatch(
      /\.operational-list-state\s*,\s*\n\.quotes-state/,
    );
    expect(stylesheet).toMatch(
      /\.operational-list-state > div[\s\S]*?display:\s*grid/,
    );
  });

  it("shows an error state and retries", async () => {
    const user = userEvent.setup();
    const loadYieldErrors = vi
      .fn()
      .mockRejectedValueOnce(new Error("load failed"))
      .mockResolvedValueOnce(result(rows));

    render(
      <MemoryRouter>
        <MeatYieldErrorsPage loadYieldErrors={loadYieldErrors} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("暫時無法載入收成錯誤統計")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重新載入" }));

    expect(
      await within(await screen.findByRole("table")).findByText("超出"),
    ).toBeInTheDocument();
    expect(loadYieldErrors).toHaveBeenCalledTimes(2);
  });
});
