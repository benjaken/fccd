import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SpiceUsagePage } from "@/components/SpiceUsagePage";
import i18n from "@/i18n";
import type { SeasoningOption, SeasoningUsageRow } from "@/lib/spice-usage";

const seasonings: SeasoningOption[] = [
  { id: "s-1", name: "幼鹽", sortOrder: 1 },
  { id: "s-2", name: "片糖", sortOrder: 2 },
];

const usagesBySeasoning: Record<string, SeasoningUsageRow[]> = {
  "s-1": [
    {
      id: "u-1",
      preparedMeatItemId: "p-1",
      preparedMeatName: "醃雞扒",
      preparedSortOrder: 9,
      quantityGrams: 80,
      totalCost: 0.3333,
    },
    {
      id: "u-2",
      preparedMeatItemId: "p-2",
      preparedMeatName: "扁食肉餡 (500克)",
      preparedSortOrder: 17,
      quantityGrams: 15,
      totalCost: 0.0625,
    },
  ],
  "s-2": [
    {
      id: "u-3",
      preparedMeatItemId: "p-3",
      preparedMeatName: "粽子 (10隻)",
      preparedSortOrder: 18,
      quantityGrams: 50,
      totalCost: 1.25,
    },
  ],
};

describe("Spice usage page", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("lists seasonings on the left and defaults to the first spice usages", async () => {
    const loadSeasonings = vi.fn().mockResolvedValue(seasonings);
    const loadUsages = vi
      .fn()
      .mockImplementation(async (seasoningId: string) =>
        structuredClone(usagesBySeasoning[seasoningId] ?? []),
      );

    render(
      <MemoryRouter>
        <SpiceUsagePage
          loadSeasonings={loadSeasonings}
          loadUsages={loadUsages}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "香料用量" })).toBeInTheDocument();
    const sidebar = screen.getByRole("complementary", { name: "香料選項" });
    expect(within(sidebar).getByRole("button", { name: "幼鹽" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(within(sidebar).getByRole("button", { name: "片糖" })).toBeInTheDocument();

    expect(await screen.findByRole("heading", { name: "幼鹽" })).toBeInTheDocument();
    expect(await screen.findByText("醃雞扒")).toBeInTheDocument();
    expect(screen.getByText("80g")).toBeInTheDocument();
    expect(screen.getByText("$0.33")).toBeInTheDocument();
    expect(screen.getByText("扁食肉餡 (500克)")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "刪除" })).toHaveLength(2);

    await waitFor(() => {
      expect(loadUsages).toHaveBeenCalledWith("s-1");
    });
  });

  it("switches usage rows when another seasoning is selected", async () => {
    const user = userEvent.setup();
    const loadSeasonings = vi.fn().mockResolvedValue(seasonings);
    const loadUsages = vi
      .fn()
      .mockImplementation(async (seasoningId: string) =>
        structuredClone(usagesBySeasoning[seasoningId] ?? []),
      );

    render(
      <MemoryRouter>
        <SpiceUsagePage
          loadSeasonings={loadSeasonings}
          loadUsages={loadUsages}
        />
      </MemoryRouter>,
    );

    await screen.findByText("醃雞扒");
    await user.click(screen.getByRole("button", { name: "片糖" }));

    await waitFor(() => {
      expect(loadUsages).toHaveBeenCalledWith("s-2");
    });

    expect(await screen.findByRole("heading", { name: "片糖" })).toBeInTheDocument();
    expect(await screen.findByText("粽子 (10隻)")).toBeInTheDocument();
    expect(screen.getAllByText("50g").length).toBeGreaterThan(0);
    expect(screen.queryByText("醃雞扒")).not.toBeInTheDocument();
  });

  it("shows a skeleton while switching seasonings", async () => {
    const user = userEvent.setup();
    let resolveSecond: ((rows: SeasoningUsageRow[]) => void) | null = null;
    const loadSeasonings = vi.fn().mockResolvedValue(seasonings);
    const loadUsages = vi.fn().mockImplementation(async (seasoningId: string) => {
      if (seasoningId === "s-1") {
        return structuredClone(usagesBySeasoning[seasoningId] ?? []);
      }
      return new Promise<SeasoningUsageRow[]>((resolve) => {
        resolveSecond = resolve;
      });
    });

    render(
      <MemoryRouter>
        <SpiceUsagePage
          loadSeasonings={loadSeasonings}
          loadUsages={loadUsages}
        />
      </MemoryRouter>,
    );

    await screen.findByText("醃雞扒");
    await user.click(screen.getByRole("button", { name: "片糖" }));

    expect(screen.getByRole("status")).toHaveTextContent("正在載入用量…");
    expect(document.querySelector(".spice-usage-main")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(document.querySelector(".table-skeleton-row")).toBeTruthy();
    expect(screen.queryByText("醃雞扒")).not.toBeInTheDocument();
    expect(screen.queryByText("粽子 (10隻)")).not.toBeInTheDocument();

    resolveSecond?.(structuredClone(usagesBySeasoning["s-2"] ?? []));

    expect(await screen.findByText("粽子 (10隻)")).toBeInTheDocument();
    expect(document.querySelector(".table-skeleton-row")).toBeNull();
  });

  it("filters recipes from the search bar", async () => {
    const user = userEvent.setup();
    const loadSeasonings = vi.fn().mockResolvedValue(seasonings);
    const loadUsages = vi
      .fn()
      .mockImplementation(async (seasoningId: string) =>
        structuredClone(usagesBySeasoning[seasoningId] ?? []),
      );

    render(
      <MemoryRouter>
        <SpiceUsagePage
          loadSeasonings={loadSeasonings}
          loadUsages={loadUsages}
        />
      </MemoryRouter>,
    );

    await screen.findByText("醃雞扒");
    await user.type(screen.getByPlaceholderText("搜尋配方名稱"), "扁食");
    await user.click(screen.getByRole("button", { name: "搜尋" }));

    expect(screen.getByText("扁食肉餡 (500克)")).toBeInTheDocument();
    expect(screen.queryByText("醃雞扒")).not.toBeInTheDocument();
  });

  it("deletes an applied usage after confirmation", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const loadSeasonings = vi.fn().mockResolvedValue(seasonings);
    const loadUsages = vi
      .fn()
      .mockImplementation(async (seasoningId: string) =>
        structuredClone(usagesBySeasoning[seasoningId] ?? []),
      );
    const deleteUsage = vi.fn().mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <SpiceUsagePage
          loadSeasonings={loadSeasonings}
          loadUsages={loadUsages}
          deleteUsage={deleteUsage}
        />
      </MemoryRouter>,
    );

    await screen.findByText("醃雞扒");
    await user.click(screen.getAllByRole("button", { name: "刪除" })[0]!);

    await waitFor(() => {
      expect(deleteUsage).toHaveBeenCalledWith("u-1");
    });
    expect(screen.queryByText("醃雞扒")).not.toBeInTheDocument();
    expect(screen.getByText("扁食肉餡 (500克)")).toBeInTheDocument();
    confirmSpy.mockRestore();
  });
});
