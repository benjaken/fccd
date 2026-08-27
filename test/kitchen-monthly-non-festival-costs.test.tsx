import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";

const api = vi.hoisted(() => ({
  createCost: vi.fn(),
}));

vi.mock("@/lib/kitchen-monthly-costs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/kitchen-monthly-costs")>()),
  fetchKitchenMonthlyCostTypes: vi.fn(async () => [
    { id: "google", legacyId: "google-legacy", name: "Google" },
    { id: "facebook", legacyId: "facebook-legacy", name: "Facebook" },
    { id: "rent", legacyId: "rent-legacy", name: "Rent" },
  ]),
  fetchKitchenMonthlyCostChannels: vi.fn(async () => [
    { id: "catering", legacyId: "catering-legacy", name: "Catering", sortOrder: 1 },
    { id: "lunch-box", legacyId: "lunch-box-legacy", name: "HK Lunch Box", sortOrder: 2 },
  ]),
  fetchKitchenMonthlyNonFestivalCosts: vi.fn(async () => ({ items: [], total: 0 })),
  createKitchenMonthlyNonFestivalCost: api.createCost,
  updateKitchenMonthlyNonFestivalCosts: vi.fn(),
  deleteKitchenMonthlyCost: vi.fn(),
}));

import { KitchenMonthlyNonFestivalCosts } from "@/components/KitchenMonthlyNonFestivalCosts";

describe("monthly non-festival operating costs", () => {
  it("requires and saves brands for Google costs", async () => {
    await i18n.changeLanguage("zh-HK");
    api.createCost.mockReset().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <KitchenMonthlyNonFestivalCosts canEdit />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: /新增輸入資料/ }));
    const dialog = screen.getByRole("dialog");
    await user.selectOptions(within(dialog).getByLabelText("類型"), "google");
    expect(within(dialog).getByText("品牌（必須選擇）")).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText("金額（港幣）"), "500");
    await user.click(within(dialog).getByRole("button", { name: "確定" }));
    expect(within(dialog).getByText("Google 或 Facebook 費用必須選擇品牌")).toBeInTheDocument();
    expect(api.createCost).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("combobox", { name: "品牌（必須選擇）" }));
    await user.click(screen.getByRole("option", { name: "Catering" }));
    await user.click(within(dialog).getByRole("button", { name: "確定" }));

    await waitFor(() => expect(api.createCost).toHaveBeenCalledWith(expect.objectContaining({
      costType: expect.objectContaining({ name: "Google" }),
      channels: [expect.objectContaining({ id: "catering" })],
      amount: 500,
    })));
  });

  it("does not require a brand for other cost types", async () => {
    await i18n.changeLanguage("zh-HK");
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <KitchenMonthlyNonFestivalCosts canEdit />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: /新增輸入資料/ }));
    const dialog = screen.getByRole("dialog");
    await user.selectOptions(within(dialog).getByLabelText("類型"), "rent");
    expect(within(dialog).queryByText("品牌（必須選擇）")).not.toBeInTheDocument();
  });
});
