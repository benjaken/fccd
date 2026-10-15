import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrganizationVipPage } from "@/components/customer-portal/OrganizationVipPage";
import "@/lib/customer-portal-i18n";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(), submit: vi.fn(), run: vi.fn(), setPage: vi.fn(), refresh: vi.fn(),
  addresses: [{ id: "address", label: "公司", address: "香港", is_default: true }],
  role: "member" as "member" | "admin",
  showPrices: true,
}));
vi.mock("@/lib/customer-lunchbox", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/customer-lunchbox")>(),
  fetchVipCatalog: mocks.fetch,
  submitVipCycle: mocks.submit,
}));
vi.mock("react-router-dom", async importOriginal => ({
  ...await importOriginal<typeof import("react-router-dom")>(),
  useOutletContext: () => ({ busy: false, run: mocks.run, setPage: mocks.setPage, refresh: mocks.refresh, data: { addresses: mocks.addresses, role: mocks.role, show_prices: mocks.showPrices } }),
}));

const cycles = [
  { id: "cycle", name: "十二月週期", cutoff_at: "2026-11-29T12:00:00Z", menus: [
    { id: "day1", name: "午餐", brand: "FCCD", delivery_date: "2026-12-01", delivery_time: "12:00", cutoff_at: "2026-11-29T12:00:00Z", shipping_fee: 0, items: [
      { product_id: "chicken", name: "日式照燒雞飯盒", unit_price: 50, available_quantity: 2, description: "照燒雞扒・時蔬", image_url: "/chicken.png" },
    ] },
    { id: "day2", name: "午餐", brand: "FCCD", delivery_date: "2026-12-02", delivery_time: "12:00", cutoff_at: "2026-11-29T12:00:00Z", shipping_fee: 0, items: [
      { product_id: "beef", name: "和風牛肉飯盒", unit_price: 60, available_quantity: 5 },
    ] },
  ] },
];

const mount = () => render(<MemoryRouter><OrganizationVipPage /></MemoryRouter>);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.role = "member";
  mocks.showPrices = true;
  mocks.addresses = [{ id: "address", label: "公司", address: "香港", is_default: true }];
  mocks.fetch.mockResolvedValue(structuredClone(cycles));
  mocks.submit.mockResolvedValue(["order"]);
  mocks.run.mockImplementation(async (action: () => Promise<void>) => { await action(); return true; });
});

describe("organization VIP lunch ordering", () => {
  it("renders each day as lunchbox cards with round quantity steppers", async () => {
    const { container } = mount();
    expect(await screen.findByRole("heading", { name: "日式照燒雞飯盒" })).toBeInTheDocument();
    expect(screen.getByText("2026-12-01 · 12:00")).toBeInTheDocument();
    expect(screen.getByText("2026-12-02 · 12:00")).toBeInTheDocument();
    expect(container.querySelectorAll(".lunchbox-card")).toHaveLength(2);
    expect(container.querySelector(".lunchbox-cart")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "增加2026-12-01 日式照燒雞飯盒數量" })).toBeInTheDocument();
    expect(screen.getByText("截單時間")).toBeInTheDocument();
    expect(screen.getByText(/2026年11月29日/)).toBeInTheDocument();
    expect(container.querySelector(".lunchbox-notice-art")).toHaveAttribute("src", "/assets/customer-personal/lunchbox-empty.png");
    expect(container.querySelector(".lunchbox-cart-badge")).toHaveTextContent("0");
  });

  it("caps the quantity and submits every selected day with the address", async () => {
    mount();
    await screen.findByRole("heading", { name: "日式照燒雞飯盒" });
    expect(screen.getByRole("button", { name: "下一步" })).toBeDisabled();
    const plus = screen.getByRole("button", { name: "增加2026-12-01 日式照燒雞飯盒數量" });
    fireEvent.click(plus); fireEvent.click(plus);
    expect(plus).toBeDisabled();
    expect(screen.getByText("已選 2 份")).toBeInTheDocument();
    expect(screen.getByText("HK$100")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "增加2026-12-02 和風牛肉飯盒數量" }));
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByRole("button", { name: "一次提交 2 日" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "一次提交 2 日" }));
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith(expect.any(String), "cycle", "address", [
      { menu_id: "day1", items: [{ product_id: "chicken", quantity: 2 }] },
      { menu_id: "day2", items: [{ product_id: "beef", quantity: 1 }] },
    ]));
  });

  it("opens an item detail and applies the chosen quantity", async () => {
    mount();
    await screen.findByRole("heading", { name: "日式照燒雞飯盒" });
    fireEvent.click(screen.getByRole("button", { name: /日式照燒雞飯盒 照燒雞扒/ }));
    expect(screen.getByRole("heading", { name: "選擇數量" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "增加日式照燒雞飯盒數量" }));
    fireEvent.click(screen.getByRole("button", { name: "加入訂單 HK$100" }));
    expect(screen.getByText("已選 2 份")).toBeInTheDocument();
  });

  it("shows an empty state when no cycle is open", async () => {
    mocks.fetch.mockResolvedValue([]);
    mount();
    expect(await screen.findByRole("heading", { name: "目前沒有開放中的 VIP 訂飯週期。" })).toBeInTheDocument();
  });

  it("distinguishes a load failure and retries", async () => {
    mocks.fetch.mockRejectedValueOnce(new Error("offline"));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("暫時未能載入 VIP 訂飯");
    mocks.fetch.mockResolvedValue(structuredClone(cycles));
    fireEvent.click(screen.getByRole("button", { name: "重試" }));
    expect(await screen.findByRole("heading", { name: "日式照燒雞飯盒" })).toBeInTheDocument();
  });

  it("hides amounts from members when prices are disabled", async () => {
    mocks.showPrices = false;
    mount();
    await screen.findByRole("heading", { name: "日式照燒雞飯盒" });
    expect(screen.queryByText("HK$50")).not.toBeInTheDocument();
  });
});
