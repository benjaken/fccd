import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";

const api = vi.hoisted(() => ({
  createCost: vi.fn(),
  fetchCosts: vi.fn(async () => ({ items: [], total: 0 })),
}));

vi.mock("@/lib/kitchen-monthly-costs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/kitchen-monthly-costs")>()),
  fetchKitchenMonthlyCostTypes: vi.fn(async () => [
    { id: "google", legacyId: "google-legacy", name: "Google", isBrand: true },
    { id: "facebook", legacyId: "facebook-legacy", name: "Facebook", isBrand: true },
    { id: "rent", legacyId: "rent-legacy", name: "Rent", isBrand: false },
  ]),
  fetchKitchenMonthlyCostChannels: vi.fn(async () => [
    { id: "catering", legacyId: "catering-legacy", name: "Catering", sortOrder: 1 },
    { id: "lunch-box", legacyId: "lunch-box-legacy", name: "HK Lunch Box", sortOrder: 2 },
  ]),
  fetchKitchenMonthlyNonFestivalCosts: api.fetchCosts,
  createKitchenMonthlyNonFestivalCost: api.createCost,
  updateKitchenMonthlyNonFestivalCosts: vi.fn(),
  deleteKitchenMonthlyCost: vi.fn(),
}));

import { KitchenMonthlyNonFestivalCosts } from "@/components/KitchenMonthlyNonFestivalCosts";

describe("monthly non-festival operating costs", () => {
  it("paginates the records after filtering by month", async () => {
    await i18n.changeLanguage("zh-HK");
    api.fetchCosts.mockReset().mockResolvedValue({
      items: Array.from({ length: 18 }, (_, index) => ({
        id: `cost-${index + 1}`,
        monthAt: "2026-08-01T00:00:00.000Z",
        amount: index + 1,
        remarks: "",
        costTypeName: `費用 ${index + 1}`,
        channelNames: [],
      })),
      total: 18,
    });
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/?month=2026-08"]}>
        <KitchenMonthlyNonFestivalCosts canEdit={false} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("費用 1")).toBeInTheDocument();
    expect(screen.getByText("費用 15")).toBeInTheDocument();
    expect(screen.queryByText("費用 16")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "下一頁" }));

    expect(await screen.findByText("費用 16")).toBeInTheDocument();
    expect(screen.getByText("費用 18")).toBeInTheDocument();
    expect(screen.queryByText("費用 1")).not.toBeInTheDocument();
    expect(screen.getByText("顯示 16–18，共 18 筆")).toBeInTheDocument();
  });

  it("requires and saves brands for Google costs", async () => {
    await i18n.changeLanguage("zh-HK");
    api.createCost.mockReset().mockResolvedValue(undefined);
    api.fetchCosts.mockReset().mockResolvedValue({ items: [], total: 0 });
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
    expect(within(dialog).getByText("此費用必須選擇品牌")).toBeInTheDocument();
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
    api.fetchCosts.mockReset().mockResolvedValue({ items: [], total: 0 });
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

  it("uses the shared date picker for the month filter", async () => {
    await i18n.changeLanguage("zh-HK");
    api.fetchCosts.mockReset().mockResolvedValue({ items: [], total: 0 });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <KitchenMonthlyNonFestivalCosts canEdit />
      </MemoryRouter>,
    );

    const filter = await screen.findByLabelText("篩選月份");
    expect(filter).toHaveAttribute("type", "button");
    await user.click(filter);
    expect(await screen.findByRole("grid")).toBeInTheDocument();
  });
});
