import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PersonalLunchboxPage } from "@/components/customer-portal/PersonalLunchboxPage";
import type { LunchboxCatalog } from "@/lib/customer-lunchbox";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), submit: vi.fn(), run: vi.fn(), addresses: [{ id: "address", label: "公司", address: "香港", is_default: true }] }));
vi.mock("@/components/customer-portal/CustomerPersonalWorkspace", () => ({ usePersonalWorkspace: () => ({ data: { addresses: mocks.addresses }, busy: false, run: mocks.run }) }));
vi.mock("@/lib/customer-lunchbox", () => ({ fetchLunchboxCatalog: mocks.fetch, submitLunchbox: mocks.submit }));
const catalog: LunchboxCatalog = { menus: [{ id: "menu", name: "活動餐", brand: "FCCD", delivery_date: "2026-12-01", delivery_time: "12:00", cutoff_at: "2026-11-29T12:00:00Z", shipping_fee: 20, items: [
  { product_id: "chicken", name: "日式照燒雞飯盒", unit_price: 50, available_quantity: 2, description: "照燒雞扒・時蔬・白飯", image_url: "/chicken.png" },
  { product_id: "sold", name: "素食飯盒", unit_price: 45, available_quantity: 0 },
] }], orders: [] };
function mount() { return render(<MemoryRouter><PersonalLunchboxPage /></MemoryRouter>); }
beforeEach(() => { vi.clearAllMocks(); mocks.fetch.mockResolvedValue(structuredClone(catalog)); mocks.submit.mockResolvedValue("order"); mocks.run.mockImplementation(async action => { await action(); return true; }); mocks.addresses = [{ id: "address", label: "公司", address: "香港", is_default: true }]; });
describe("event lunchbox ordering", () => {
  it("shows the lunchbox layout skeleton while the catalog is pending", () => {
    mocks.fetch.mockReturnValue(new Promise(() => {}));
    const { container } = mount();
    expect(container.querySelector('[data-skeleton="lunchbox"]')).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("目前沒有可訂購的活動飯盒")).not.toBeInTheDocument();
  });
  it("keeps a photo skeleton in meal details until the image has loaded", async () => {
    mount(); await screen.findByRole("heading", { name: "日式照燒雞飯盒" });
    fireEvent.click(screen.getByRole("button", { name: /日式照燒雞飯盒 照燒雞扒/ }));
    const photo = screen.getByRole("img", { name: "日式照燒雞飯盒" });
    expect(photo.parentElement).toHaveAttribute("aria-busy", "true");
    fireEvent.load(photo);
    expect(photo.parentElement).toHaveAttribute("aria-busy", "false");
    expect(photo.parentElement?.querySelector(".lunchbox-image-skeleton")).not.toBeInTheDocument();
  });
  it("shows an honest empty state without contact copy", async () => {
    mocks.fetch.mockResolvedValue({ menus: [], orders: [] }); mount();
    expect(await screen.findByRole("heading", { name: "目前沒有可訂購的活動飯盒" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看訂單紀錄" })).toHaveAttribute("href", "/customer/personal/orders");
    expect(screen.queryByText(/聯絡/)).not.toBeInTheDocument();
  });
  it("distinguishes a load error from an empty catalog and allows retry", async () => {
    mocks.fetch.mockRejectedValueOnce(new Error("offline")); mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("未能載入");
    expect(screen.queryByText("目前沒有可訂購的活動飯盒")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重試" }));
    expect(await screen.findByRole("heading", { name: "日式照燒雞飯盒" })).toBeInTheDocument();
  });
  it("caps quantity at stock and submits the selected items after address confirmation", async () => {
    mount(); await screen.findByRole("heading", { name: "日式照燒雞飯盒" });
    expect(screen.getByRole("button", { name: "下一步" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "增加素食飯盒數量" })).toBeDisabled();
    const plus = screen.getByRole("button", { name: "增加日式照燒雞飯盒數量" }); fireEvent.click(plus); fireEvent.click(plus);
    expect(plus).toBeDisabled(); expect(screen.getByText("已選 2 份")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByText("HK$120")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "提交預備訂單" }));
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith(expect.any(String), "menu", "address", [{ product_id: "chicken", quantity: 2 }]));
  });
  it("opens details and applies the chosen quantity without invented nutrition", async () => {
    mount(); await screen.findByRole("heading", { name: "日式照燒雞飯盒" });
    fireEvent.click(screen.getByRole("button", { name: /日式照燒雞飯盒 照燒雞扒/ }));
    expect(screen.getByRole("heading", { name: "選擇數量" })).toBeInTheDocument();
    expect(screen.queryByText(/kcal/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "增加日式照燒雞飯盒數量" }));
    fireEvent.click(screen.getByRole("button", { name: "加入訂單 HK$100" }));
    expect(screen.getByText("已選 2 份")).toBeInTheDocument();
  });
  it("requires an address before submission", async () => {
    mocks.addresses = []; mount(); await screen.findByRole("heading", { name: "日式照燒雞飯盒" });
    fireEvent.click(screen.getByRole("button", { name: "增加日式照燒雞飯盒數量" })); fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByRole("button", { name: "提交預備訂單" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "新增地址" })).toHaveAttribute("href", "/customer/personal/addresses");
  });
  it("retains the cart and request id when a submission must be retried", async () => {
    mocks.submit.mockRejectedValueOnce(new Error("offline"));
    mocks.run.mockImplementation(async action => { try { await action(); return true; } catch { return false; } });
    mount(); await screen.findByRole("heading", { name: "日式照燒雞飯盒" });
    fireEvent.click(screen.getByRole("button", { name: "增加日式照燒雞飯盒數量" })); fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    fireEvent.click(screen.getByRole("button", { name: "提交預備訂單" }));
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("status")).toHaveTextContent("未能確認提交結果");
    expect(screen.getByRole("button", { name: "返回飯盒列表" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "送貨地址" })).toBeDisabled();
    expect(screen.getByText("日式照燒雞飯盒 × 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "提交預備訂單" }));
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(2));
    expect(mocks.submit.mock.calls[0][0]).toBe(mocks.submit.mock.calls[1][0]);
  });
});
