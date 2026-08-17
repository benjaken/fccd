import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { KitchenSettingsPage } from "@/components/KitchenSettingsPage";
import i18n from "@/i18n";
import {
  filterCookTypes,
  formatWorkloadScore,
  parseWorkloadScore,
  type CookTypeRow,
} from "@/lib/cook-types";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { app_metadata: { role: "Super Admin" } },
    profile: { role: "Super Admin" },
  }),
}));

const rows: CookTypeRow[] = [
  { id: "ct-1", name: "炒爐", workloadScore: 5 },
  { id: "ct-2", name: "蒸爐", workloadScore: 4 },
  { id: "ct-3", name: "炸爐", workloadScore: 4 },
  { id: "ct-4", name: "焗爐", workloadScore: 4 },
  { id: "ct-5", name: "雪櫃", workloadScore: 1 },
  { id: "ct-6", name: "直出", workloadScore: 1 },
];

describe("cook type helpers", () => {
  it("parses workload scores from 1 to 5", () => {
    expect(parseWorkloadScore("1")).toBe(1);
    expect(parseWorkloadScore("5")).toBe(5);
    expect(parseWorkloadScore("0")).toBeNull();
    expect(parseWorkloadScore("6")).toBeNull();
    expect(parseWorkloadScore("")).toBeNull();
    expect(parseWorkloadScore("3.5")).toBeNull();
  });

  it("formats whole-number workload scores without decimals", () => {
    expect(formatWorkloadScore(5)).toBe("5");
    expect(formatWorkloadScore(4)).toBe("4");
    expect(formatWorkloadScore(null)).toBe("");
  });

  it("filters cook types by name or score", () => {
    expect(filterCookTypes(rows, "炒").map((row) => row.id)).toEqual(["ct-1"]);
    expect(filterCookTypes(rows, "5").map((row) => row.id)).toEqual(["ct-1"]);
    expect(filterCookTypes(rows, "1").map((row) => row.id)).toEqual([
      "ct-5",
      "ct-6",
    ]);
  });
});

describe("Kitchen settings page", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("lists stove categories and creates a new row", async () => {
    const user = userEvent.setup();
    const loadCookTypes = vi.fn().mockResolvedValue(structuredClone(rows));
    const createType = vi.fn().mockResolvedValue({
      id: "ct-7",
      name: "鐵板",
      workloadScore: 3,
    });

    render(
      <MemoryRouter>
        <KitchenSettingsPage
          loadCookTypes={loadCookTypes}
          createType={createType}
        />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "爐位類別設定" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "爐位類別" })).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Workload 分數 (1-5分)" }),
    ).toBeInTheDocument();
    expect(screen.getByText("炒爐")).toBeInTheDocument();
    expect(screen.getByText("直出")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "添加" }));
    const dialog = await screen.findByRole("dialog", { name: "新增爐位類別" });
    await user.type(within(dialog).getByLabelText("爐位類別"), "鐵板");
    await user.selectOptions(
      within(dialog).getByLabelText("Workload 分數"),
      "3",
    );
    await user.click(within(dialog).getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(createType).toHaveBeenCalledWith({
        name: "鐵板",
        workloadScore: 3,
      });
    });

    expect(await screen.findByText("鐵板")).toBeInTheDocument();
  });

  it("requires a name and workload score before creating", async () => {
    const user = userEvent.setup();
    const loadCookTypes = vi.fn().mockResolvedValue(structuredClone(rows));
    const createType = vi.fn();

    render(
      <MemoryRouter>
        <KitchenSettingsPage
          loadCookTypes={loadCookTypes}
          createType={createType}
        />
      </MemoryRouter>,
    );

    await screen.findByText("炒爐");
    await user.click(screen.getByRole("button", { name: "添加" }));
    const dialog = await screen.findByRole("dialog", { name: "新增爐位類別" });
    await user.click(within(dialog).getByRole("button", { name: "保存" }));

    expect(await within(dialog).findByText("請輸入爐位類別")).toBeInTheDocument();
    expect(
      within(dialog).getByText("請選擇 1 至 5 的 Workload 分數"),
    ).toBeInTheDocument();
    expect(createType).not.toHaveBeenCalled();
  });

  it("deletes a stove category after confirmation", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const loadCookTypes = vi.fn().mockResolvedValue(structuredClone(rows));
    const deleteType = vi.fn().mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <KitchenSettingsPage
          loadCookTypes={loadCookTypes}
          deleteType={deleteType}
        />
      </MemoryRouter>,
    );

    await screen.findByText("炒爐");
    const deleteButtons = screen.getAllByRole("button", { name: "刪除" });
    expect(deleteButtons).toHaveLength(6);
    await user.click(deleteButtons[0]!);

    await waitFor(() => {
      expect(deleteType).toHaveBeenCalledWith("ct-1");
    });
    expect(screen.queryByText("炒爐")).not.toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it("hides delete without action permission", async () => {
    const loadCookTypes = vi.fn().mockResolvedValue(structuredClone(rows));

    render(
      <MemoryRouter>
        <KitchenSettingsPage
          loadCookTypes={loadCookTypes}
          canDelete={false}
        />
      </MemoryRouter>,
    );

    await screen.findByText("炒爐");
    expect(screen.queryByRole("button", { name: "刪除" })).not.toBeInTheDocument();
  });
});
