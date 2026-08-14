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
    expect(await screen.findByLabelText("1. 醃雞扒")).toBeInTheDocument();
    expect(screen.getByText("醃雞扒")).toBeInTheDocument();
    expect(screen.getByText("80g")).toBeInTheDocument();
    expect(screen.getByText("$0.33")).toBeInTheDocument();
    expect(screen.getByText("扁食肉餡 (500克)")).toBeInTheDocument();

    await waitFor(() => {
      expect(loadUsages).toHaveBeenCalledWith("s-1");
    });
  });

  it("switches usage cards when another seasoning is selected", async () => {
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
    expect(await screen.findByLabelText("1. 粽子 (10隻)")).toBeInTheDocument();
    expect(screen.getAllByText("50g").length).toBeGreaterThan(0);
    expect(screen.queryByText("醃雞扒")).not.toBeInTheDocument();
  });
});
