import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SeasoningCostSettingsPage } from "@/components/SeasoningCostSettingsPage";
import i18n from "@/i18n";
import type { SeasoningCostRow } from "@/lib/seasoning-cost";

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
    expect(screen.getByRole("button", { name: "新增香料成本" })).toBeInTheDocument();
    expect(screen.getByText("幼鹽")).toBeInTheDocument();
    expect(screen.getByText("2.5/600")).toBeInTheDocument();

    const bodyRows = screen.getAllByRole("row").slice(1);
    expect(within(bodyRows[0]!).getByText("幼鹽")).toBeInTheDocument();

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
    await user.click(screen.getByRole("button", { name: "新增香料成本" }));

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
      });
    });

    expect(await screen.findByText("胡椒粉")).toBeInTheDocument();
  });

  it("lets users edit calculation and remark inline", async () => {
    const user = userEvent.setup();
    const loadSeasonings = vi.fn().mockResolvedValue(structuredClone(rows));
    const saveCalculation = vi.fn().mockResolvedValue({
      ...rows[0],
      calculationExpression: "3/600",
      costPerGram: 0.005,
      lastUpdatedAt: "2026-08-14T03:10:00.000Z",
    });
    const saveRemark = vi.fn().mockResolvedValue("更新備註");

    render(
      <MemoryRouter>
        <SeasoningCostSettingsPage
          loadSeasonings={loadSeasonings}
          saveCalculation={saveCalculation}
          saveRemark={saveRemark}
        />
      </MemoryRouter>,
    );

    await screen.findByText("幼鹽");

    await user.click(screen.getAllByRole("button", { name: "修改計算" })[0]!);
    const calcInput = screen.getByRole("textbox", { name: "修改計算" });
    await user.clear(calcInput);
    await user.type(calcInput, "3/600");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(saveCalculation).toHaveBeenCalledWith("s-1", "3/600");
    });

    await user.click(screen.getAllByRole("button", { name: "修改備註" })[0]!);
    const remarkInput = screen.getByRole("textbox", { name: "修改備註" });
    await user.clear(remarkInput);
    await user.type(remarkInput, "更新備註");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(saveRemark).toHaveBeenCalledWith("s-1", "更新備註");
    });
  });
});
