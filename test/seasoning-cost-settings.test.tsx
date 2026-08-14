import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SeasoningCostSettingsPage } from "@/components/SeasoningCostSettingsPage";
import i18n from "@/i18n";
import {
  filterSeasoningCosts,
  SEASONING_COST_PAGE_SIZE,
  type SeasoningCostRow,
} from "@/lib/seasoning-cost";

const rows: SeasoningCostRow[] = [
  {
    id: "s-1",
    name: "幼鹽",
    description: "和2023年相同",
    calculationExpression: "2.5/600",
    costPerGram: 0.004167,
    lastUpdatedAt: "2023-11-15T08:27:07.325Z",
    sortOrder: 1,
  },
  {
    id: "s-2",
    name: "片糖",
    description: null,
    calculationExpression: "8.3/600",
    costPerGram: 0.013833,
    lastUpdatedAt: "2025-07-10T04:10:00.596Z",
    sortOrder: 2,
  },
];

describe("filterSeasoningCosts", () => {
  it("matches name, formula, remark, and cost", () => {
    expect(filterSeasoningCosts(rows, "片糖").map((row) => row.id)).toEqual([
      "s-2",
    ]);
    expect(filterSeasoningCosts(rows, "2.5/600").map((row) => row.id)).toEqual([
      "s-1",
    ]);
    expect(filterSeasoningCosts(rows, "2023").map((row) => row.id)).toEqual([
      "s-1",
    ]);
  });
});

describe("Seasoning cost settings page", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("renders the list without top tabs and sorts by updated date", async () => {
    const user = userEvent.setup();
    const loadSeasonings = vi.fn().mockResolvedValue(structuredClone(rows));

    render(
      <MemoryRouter>
        <SeasoningCostSettingsPage loadSeasonings={loadSeasonings} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "香料成本設定" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新建" })).toBeInTheDocument();
    expect(screen.getByText("幼鹽")).toBeInTheDocument();
    expect(screen.getByText("2.5/600")).toBeInTheDocument();

    const bodyRows = screen.getAllByRole("row").slice(1);
    expect(within(bodyRows[0]!).getByText("幼鹽")).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "按排序編號排序" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "按上次更新日期排序" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "按排序編號排序" }));
    const reverseOrderRows = screen.getAllByRole("row").slice(1);
    expect(within(reverseOrderRows[0]!).getByText("片糖")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "按上次更新日期排序" }));

    const sortedRows = screen.getAllByRole("row").slice(1);
    expect(within(sortedRows[0]!).getByText("片糖")).toBeInTheDocument();
  });

  it("opens the create side panel and auto-calculates cost per gram", async () => {
    const user = userEvent.setup();
    const loadSeasonings = vi.fn().mockResolvedValue(structuredClone(rows));
    const createSeasoning = vi.fn().mockResolvedValue({
      id: "s-3",
      name: "胡椒粉",
      description: null,
      calculationExpression: "10/500",
      costPerGram: 0.02,
      lastUpdatedAt: "2026-08-14T03:00:00.000Z",
      sortOrder: 3,
    });

    render(
      <MemoryRouter>
        <SeasoningCostSettingsPage
          loadSeasonings={loadSeasonings}
          createSeasoning={createSeasoning}
        />
      </MemoryRouter>,
    );

    await screen.findByText("幼鹽");
    await user.click(screen.getByRole("button", { name: "新建" }));

    const dialog = await screen.findByRole("dialog", { name: "新增香料成本" });
    await user.type(
      within(dialog).getByPlaceholderText("例如：幼鹽"),
      "胡椒粉",
    );
    await user.type(
      within(dialog).getByPlaceholderText("例如：2.5/600"),
      "10/500",
    );

    expect(within(dialog).getByDisplayValue("0.02")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(createSeasoning).toHaveBeenCalledWith({
        name: "胡椒粉",
        calculationExpression: "10/500",
        description: "",
      });
    });

    expect(await screen.findByText("胡椒粉")).toBeInTheDocument();
  });

  it("opens the edit panel and updates calculation and remark", async () => {
    const user = userEvent.setup();
    const loadSeasonings = vi.fn().mockResolvedValue(structuredClone(rows));
    const updateSeasoning = vi.fn().mockResolvedValue({
      ...rows[0],
      calculationExpression: "3/600",
      costPerGram: 0.005,
      description: "更新備註",
      lastUpdatedAt: "2026-08-14T03:10:00.000Z",
    });

    render(
      <MemoryRouter>
        <SeasoningCostSettingsPage
          loadSeasonings={loadSeasonings}
          updateSeasoning={updateSeasoning}
        />
      </MemoryRouter>,
    );

    await screen.findByText("幼鹽");
    expect(
      screen.queryByRole("button", { name: "修改計算" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "修改備註" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "編輯" })[0]!);

    const dialog = await screen.findByRole("dialog", { name: "編輯香料成本" });
    const nameInput = within(dialog).getByPlaceholderText("例如：幼鹽");
    const calcInput = within(dialog).getByPlaceholderText("例如：2.5/600");
    const remarkInput = within(dialog).getByPlaceholderText("輸入備註");
    expect(nameInput).toHaveValue("幼鹽");
    expect(calcInput).toHaveValue("2.5/600");
    expect(remarkInput).toHaveValue("和2023年相同");

    await user.clear(calcInput);
    await user.type(calcInput, "3/600");
    expect(within(dialog).getByDisplayValue("0.005")).toBeInTheDocument();
    await user.clear(remarkInput);
    await user.type(remarkInput, "更新備註");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(updateSeasoning).toHaveBeenCalledWith("s-1", {
        name: "幼鹽",
        calculationExpression: "3/600",
        description: "更新備註",
      });
    });

    expect(await screen.findByText("0.005")).toBeInTheDocument();
    expect(screen.getByText("更新備註")).toBeInTheDocument();
    expect(screen.queryByText("2.5/600")).not.toBeInTheDocument();
  });

  it("filters the table from the search bar", async () => {
    const user = userEvent.setup();
    const loadSeasonings = vi.fn().mockResolvedValue(structuredClone(rows));

    render(
      <MemoryRouter>
        <SeasoningCostSettingsPage loadSeasonings={loadSeasonings} />
      </MemoryRouter>,
    );

    await screen.findByText("幼鹽");
    await user.type(screen.getByPlaceholderText("搜尋香料名稱、計算、備註或每g成本"), "片糖");
    await user.click(screen.getByRole("button", { name: "搜尋" }));

    expect(screen.getByText("片糖")).toBeInTheDocument();
    expect(screen.queryByText("幼鹽")).not.toBeInTheDocument();
  });

  it("deletes a seasoning after confirmation", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const loadSeasonings = vi.fn().mockResolvedValue(structuredClone(rows));
    const deleteSeasoning = vi.fn().mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <SeasoningCostSettingsPage
          loadSeasonings={loadSeasonings}
          deleteSeasoning={deleteSeasoning}
        />
      </MemoryRouter>,
    );

    await screen.findByText("幼鹽");
    await user.click(screen.getAllByRole("button", { name: "刪除" })[0]!);

    await waitFor(() => {
      expect(deleteSeasoning).toHaveBeenCalledWith("s-1");
    });
    expect(screen.queryByText("幼鹽")).not.toBeInTheDocument();
    expect(screen.getByText("片糖")).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it("paginates the list into pages of 15", async () => {
    const user = userEvent.setup();
    const manyRows = Array.from({ length: 16 }, (_, index) => ({
      id: `s-${index + 1}`,
      name: `香料 ${index + 1}`,
      description: null,
      calculationExpression: "1/1",
      costPerGram: 1,
      lastUpdatedAt: "2026-08-14T00:00:00.000Z",
      sortOrder: index + 1,
    }));
    const loadSeasonings = vi.fn().mockResolvedValue(manyRows);

    render(
      <MemoryRouter>
        <SeasoningCostSettingsPage loadSeasonings={loadSeasonings} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("香料 1")).toBeInTheDocument();
    expect(screen.getByText("香料 15")).toBeInTheDocument();
    expect(screen.queryByText("香料 16")).not.toBeInTheDocument();
    expect(
      screen.getByText(`顯示 1–${SEASONING_COST_PAGE_SIZE}，共 16 項`),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "下一頁" }));

    expect(await screen.findByText("香料 16")).toBeInTheDocument();
    expect(screen.queryByText("香料 1")).not.toBeInTheDocument();
    expect(screen.getByText("顯示 16–16，共 16 項")).toBeInTheDocument();
  });
});
