import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CalculationSettingsPage } from "@/components/CalculationSettingsPage";
import i18n from "@/i18n";
import {
  coercePercentInput,
  filterCalculationSettings,
  parsePercentInput,
  type CalculationSettingRow,
} from "@/lib/calculation-settings";

const rows: CalculationSettingRow[] = [
  {
    id: "c-1",
    isApplied: false,
    markupRate: 0.05,
    variationRate: 0.1,
    createdAt: "2026-08-14T04:00:00.000Z",
  },
  {
    id: "c-2",
    isApplied: true,
    markupRate: 0.15,
    variationRate: 0.05,
    createdAt: "2023-10-13T04:24:43.667Z",
  },
];

describe("Calculation percent input", () => {
  it("keeps values between 0 and 100 with two decimal places", () => {
    expect(coercePercentInput("12.34")).toBe("12.34");
    expect(coercePercentInput("12.345")).toBe("12.34");
    expect(coercePercentInput("101")).toBe("100");
    expect(coercePercentInput("-3")).toBe("3");
    expect(parsePercentInput("")).toBeNull();
    expect(parsePercentInput("100.01")).toBeNull();
    expect(parsePercentInput("8.2")).toBe(8.2);
  });
});

describe("filterCalculationSettings", () => {
  it("matches formatted percent values", () => {
    const formatPercent = (rate: number | null) =>
      rate === null ? "" : `${(rate * 100).toFixed(2)}%`;
    const formatDate = (value: string | null) => value ?? "";

    expect(
      filterCalculationSettings(rows, "15", formatPercent, formatDate).map(
        (row) => row.id,
      ),
    ).toEqual(["c-2"]);
  });
});

describe("Calculation settings page", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("lists settings and creates a new inactive row", async () => {
    const user = userEvent.setup();
    const loadSettings = vi.fn().mockResolvedValue(structuredClone(rows));
    const createSetting = vi.fn().mockResolvedValue({
      id: "c-3",
      isApplied: false,
      markupRate: 0.08,
      variationRate: 0.12,
      createdAt: "2026-08-14T05:00:00.000Z",
    });

    render(
      <MemoryRouter>
        <CalculationSettingsPage
          loadSettings={loadSettings}
          createSetting={createSetting}
        />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "計算設定" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("管理收成差異與 Mark-up；同一時間只會啟用一組設定。"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("10.00%")).toBeInTheDocument();
    expect(screen.getByText("15.00%")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "新建" }));
    const dialog = await screen.findByRole("dialog", { name: "新增計算設定" });
    await user.type(within(dialog).getByLabelText("收成差異 %"), "12");
    await user.type(within(dialog).getByLabelText("Mark-up %"), "8");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(createSetting).toHaveBeenCalledWith({
        variationPercent: 12,
        markupPercent: 8,
      });
    });

    expect(await screen.findByText("12.00%")).toBeInTheDocument();
  });

  it("filters settings from the search bar", async () => {
    const user = userEvent.setup();
    const loadSettings = vi.fn().mockResolvedValue(structuredClone(rows));

    render(
      <MemoryRouter>
        <CalculationSettingsPage loadSettings={loadSettings} />
      </MemoryRouter>,
    );

    await screen.findByText("10.00%");
    await user.type(screen.getByPlaceholderText("搜尋日期或百分比"), "15");
    await user.click(screen.getByRole("button", { name: "搜尋" }));

    expect(screen.getByText("15.00%")).toBeInTheDocument();
    expect(screen.queryByText("10.00%")).not.toBeInTheDocument();
  });

  it("limits create inputs to 0-100 with two decimals", async () => {
    const user = userEvent.setup();
    const loadSettings = vi.fn().mockResolvedValue(structuredClone(rows));

    render(
      <MemoryRouter>
        <CalculationSettingsPage loadSettings={loadSettings} />
      </MemoryRouter>,
    );

    await screen.findByText("10.00%");
    await user.click(screen.getByRole("button", { name: "新建" }));
    const dialog = await screen.findByRole("dialog", { name: "新增計算設定" });
    const variation = within(dialog).getByLabelText("收成差異 %");
    await user.type(variation, "12.345");
    expect(variation).toHaveValue("12.34");
    await user.clear(variation);
    await user.type(variation, "101");
    expect(variation).toHaveValue("100");
  });

  it("deletes a setting when more than one remains", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const loadSettings = vi.fn().mockResolvedValue(structuredClone(rows));
    const deleteSetting = vi.fn().mockResolvedValue([rows[1]]);

    render(
      <MemoryRouter>
        <CalculationSettingsPage
          loadSettings={loadSettings}
          deleteSetting={deleteSetting}
        />
      </MemoryRouter>,
    );

    await screen.findByText("10.00%");
    const deleteButtons = screen.getAllByRole("button", { name: "刪除" });
    expect(deleteButtons).toHaveLength(2);
    await user.click(deleteButtons[0]!);

    await waitFor(() => {
      expect(deleteSetting).toHaveBeenCalledWith("c-1");
    });
    expect(screen.queryByText("10.00%")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "最後一組計算設定不可刪除" }),
    ).toBeDisabled();
    confirmSpy.mockRestore();
  });

  it("does not delete the last remaining setting", async () => {
    const user = userEvent.setup();
    const deleteSetting = vi.fn();
    const loadSettings = vi.fn().mockResolvedValue([structuredClone(rows[1]!)]);

    render(
      <MemoryRouter>
        <CalculationSettingsPage
          loadSettings={loadSettings}
          deleteSetting={deleteSetting}
        />
      </MemoryRouter>,
    );

    await screen.findByText("15.00%");
    const deleteButton = screen.getByRole("button", {
      name: "最後一組計算設定不可刪除",
    });
    expect(deleteButton).toBeDisabled();
    await user.click(deleteButton);
    expect(deleteSetting).not.toHaveBeenCalled();
  });

  it("activates one setting and deactivates the previous active one", async () => {
    const user = userEvent.setup();
    const loadSettings = vi.fn().mockResolvedValue(structuredClone(rows));
    const saveApplied = vi.fn().mockResolvedValue([
      { ...rows[0], isApplied: true },
      { ...rows[1], isApplied: false },
    ]);

    render(
      <MemoryRouter>
        <CalculationSettingsPage
          loadSettings={loadSettings}
          saveApplied={saveApplied}
        />
      </MemoryRouter>,
    );

    await screen.findByText("10.00%");
    const switches = screen.getAllByRole("switch");
    expect(switches[0]).toHaveAttribute("aria-checked", "false");
    expect(switches[1]).toHaveAttribute("aria-checked", "true");

    await user.click(switches[0]!);

    await waitFor(() => {
      expect(saveApplied).toHaveBeenCalledWith("c-1", true);
    });

    expect(screen.getAllByRole("switch")[0]).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getAllByRole("switch")[1]).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("blocks turning off the last active setting", async () => {
    const user = userEvent.setup();
    const loadSettings = vi.fn().mockResolvedValue(structuredClone(rows));
    const saveApplied = vi.fn();

    render(
      <MemoryRouter>
        <CalculationSettingsPage
          loadSettings={loadSettings}
          saveApplied={saveApplied}
        />
      </MemoryRouter>,
    );

    await screen.findByText("15.00%");
    await user.click(screen.getAllByRole("switch")[1]!);

    expect(
      await screen.findByText("至少需要保留一組啟用中的計算設定"),
    ).toBeInTheDocument();
    expect(saveApplied).not.toHaveBeenCalled();
  });
});
