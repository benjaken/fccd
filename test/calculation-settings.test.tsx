import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CalculationSettingsPage } from "@/components/CalculationSettingsPage";
import i18n from "@/i18n";
import type { CalculationSettingRow } from "@/lib/calculation-settings";

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
