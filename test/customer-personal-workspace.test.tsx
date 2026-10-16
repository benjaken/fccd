import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerPersonalWorkspace } from "@/components/customer-portal/CustomerPersonalWorkspace";
import { supabase } from "@/lib/supabase";
import type { PersonalSnapshot } from "@/lib/customer-personal";
import { fetchCustomerSelfServiceOrder } from "@/lib/customer-self-service";
vi.mock("@/lib/customer-self-service", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/customer-self-service")>(), fetchCustomerSelfServiceOrder: vi.fn(), fetchCustomerSelfServiceAddonOptions: mocks.addon }));
const mocks = vi.hoisted(() => ({ session: vi.fn(), snapshot: vi.fn(), profile: vi.fn(), address: vi.fn(), remove: vi.fn(), upload: vi.fn(), reorder: vi.fn(), reorderQuote: vi.fn(), logout: vi.fn(), points: vi.fn(), addon: vi.fn() }));
vi.mock("@/lib/customer-reward-catalog", () => ({ listRewardCatalog: async () => [], redeemPersonalCatalog: async () => ({ id: "reward", balance: 0 }) }));
vi.mock("@/lib/customer-otp-session", () => ({ fetchPersonalOtpSession: mocks.session, logoutPersonalOtpSession: mocks.logout }));
vi.mock("@/lib/customer-personal", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/customer-personal")>(), fetchPersonalSnapshot: mocks.snapshot, savePersonalProfile: mocks.profile, savePersonalAddress: mocks.address, deletePersonalAddress: mocks.remove, uploadPersonalEvidence: mocks.upload, fetchPersonalReorder: mocks.reorder, reorderPersonalQuote: mocks.reorderQuote, fetchPersonalPoints: mocks.points }));
const orders = [
  { id: "late", orderNumber: "FCC-2", orderDate: "2098-01-01", deliveryDate: "2099-02-01", grandTotal: 300, currency: "HKD" },
  { id: "next", orderNumber: "FCC-1", orderDate: "2098-01-01", deliveryDate: "2099-01-01", grandTotal: 200, currency: "HKD" },
];
const data: PersonalSnapshot = {
  profile: { name: "Customer", phone: "91234567", email: "person@example.com", notify_email: true, notify_whatsapp: false },
  stores: [{ id: "brand", name: "Brand menu", domain: "brand.myshopify.com" }], addresses: [], evidence: [],
  order_states: { next: { paid: false, delivery_status: "已確認", store_domain: "brand.myshopify.com" }, late: { paid: true, delivery_status: "已確認" } },
};
function mount(path = "/customer/personal") { return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/customer/*" element={<CustomerPersonalWorkspace canSwitch={false} loggingOut={false} onLogout={mocks.logout} />} /></Routes></MemoryRouter>); }
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchCustomerSelfServiceOrder).mockRejectedValue(new Error("unavailable"));
  mocks.addon.mockRejectedValue(new Error("unavailable"));
  mocks.session.mockResolvedValue({ token: "personal", expiresAt: "2099-01-01", maskedEmail: "p***@example.com", maskedPhone: "", orders });
  mocks.snapshot.mockResolvedValue(structuredClone(data));
  for (const fn of [mocks.profile, mocks.address, mocks.remove, mocks.upload]) fn.mockResolvedValue(undefined);
  mocks.reorder.mockResolvedValue({ domain: "brand.myshopify.com", items: [{ variant: "123", quantity: 2 }] });
  mocks.reorderQuote.mockRejectedValue(new Error("not_portal_quote"));
  mocks.points.mockResolvedValue({ balance: 0, pending: 0, ledger: [] });
  vi.mocked(supabase.rpc).mockImplementation(async (fn: string) => {
    if (fn === "customer_portal_list_guides") return { data: [
      { slug: "payment", title: "付款安排", body: "<p>轉數快識別碼 102938271</p>" },
      { slug: "about", title: "關於我們", body: "我們做到會。" },
      { slug: "clients", title: "客戶清單", body: "" },
      { slug: "cases", title: "真實案例", body: "" },
      { slug: "company-meals", title: "公司訂飯", body: "" },
      { slug: "promise", title: "服務承諾", body: "" },
    ], error: null };
    return { data: null, error: null };
  });
});
describe("personal customer pages", () => {
  it("shows feedback empty state and returns to order history from a direct URL", async () => {
    mount("/customer/personal/feedback/next");
    expect(await screen.findByRole("heading", { name: "暫未能填寫訂單意見" })).toBeInTheDocument();
    const back = screen.getByRole("link", { name: "返回訂單列表" });
    expect(back).toHaveAttribute("href", "/customer/personal/orders");
    fireEvent.click(back);
    expect(await screen.findByRole("heading", { name: "訂單紀錄" })).toBeInTheDocument();
  });
  it("keeps logout outside the scrolling menu and restores page scrolling on logout", async () => {
    const { container } = mount();
    await screen.findByRole("heading", { name: "下一張訂單狀態" });
    fireEvent.click(screen.getByRole("button", { name: "開啟選單" }));
    const scroll = container.querySelector(".customer-portal-drawer-scroll")!;
    expect(within(scroll as HTMLElement).getByRole("link", { name: "服務承諾" })).toBeVisible();
    const logout = screen.getByRole("button", { name: "登出" });
    expect(scroll.contains(logout)).toBe(false);
    expect(logout.closest("footer")?.parentElement).toHaveClass("customer-portal-drawer");
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(logout);
    expect(mocks.logout).toHaveBeenCalledOnce();
    expect(document.body.style.overflow).not.toBe("hidden");
    expect(container.querySelector(".driver-drawer-layer")).toHaveAttribute("aria-hidden", "true");
  });
  it.each([
    ["/customer/personal", "home"], ["/customer/personal/menus", "menus"],
    ["/customer/personal/lunchbox", "lunchbox"], ["/customer/personal/orders", "orders"],
    ["/customer/personal/points", "points"], ["/customer/personal/addresses", "addresses"],
    ["/customer/personal/profile", "profile"], ["/customer/personal/payments?order=next", "payments"],
    ["/customer/personal/next", "order-detail"], ["/customer/personal/feedback/next", "feedback"],
    ["/customer/personal?addonCheckout=cancel", "order-detail"],
    ...["payment", "about", "clients", "cases", "company-meals", "promise"].map(slug => [`/customer/personal/guides/${slug}`, "guide"]),
  ])("shows the matching page skeleton while entering %s", (path, variant) => {
    mocks.session.mockReturnValue(new Promise(() => {}));
    const { container } = mount(path);
    const skeleton = container.querySelector(`[data-skeleton="${variant}"]`);
    expect(skeleton).toHaveAttribute("aria-busy", "true");
    expect(skeleton).toHaveAttribute("role", "status");
    expect(skeleton?.querySelectorAll("button,input,select,textarea,a")).toHaveLength(0);
  });
  it("shows the complete coin artwork alongside the balance and reward link", async () => {
    const { container } = mount();
    expect(await screen.findByText("0 分")).toBeInTheDocument();
    const card = container.querySelector(".personal-points-card")!;
    expect(card.querySelector("img")).toHaveAttribute("src", "/assets/customer-personal/points-coins-v2.png");
    expect(card.querySelector("a")).toHaveAttribute("href", "/customer/personal/points");
  });
  it("keeps shortcuts and brand logos while omitting bottom navigation and recent order images", async () => {
    mocks.snapshot.mockResolvedValue({ ...structuredClone(data), stores: [
      { id: "catering", name: "Catering", domain: "foodchannels-catering.myshopify.com" },
      ...Array.from({ length: 7 }, (_, index) => ({ id: `brand-${index}`, name: `Brand ${index}`, domain: `brand-${index}.myshopify.com` })),
    ] });
    const { container } = mount();
    await screen.findByRole("heading", { name: "下一張訂單狀態" });
    for (const path of ["menus", "lunchbox", "payments", "orders"]) {
      expect(container.querySelector(`.personal-quick a[href="/customer/personal/${path}"]`)).toBeInTheDocument();
    }
    expect(container.querySelector(".personal-home-logo img")).toHaveAttribute("src", "/assets/fc-catering-logo.svg");
    expect(container.querySelector(".personal-hero-bowl")).toHaveAttribute("src", "/assets/customer-personal/hero-bowl-clean.png");
    expect(container.querySelector(".personal-hero-art")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".personal-hero-rays")).toBeInTheDocument();
    expect(container.querySelector(".personal-points-card>img")).toHaveAttribute("src", "/assets/customer-personal/points-coins-v2.png");
    expect(container.querySelector(".personal-next-card>img")).toHaveAttribute("src", "/assets/customer-personal/delivery-bag-truck.png");
    expect(container.querySelector(".personal-bottom-nav")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".personal-recent-row")).toHaveLength(2);
    expect(container.querySelector(".personal-recent-row img")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "FCC-1" })[0]).toHaveAttribute("href", "/customer/personal/next");
    fireEvent.click(container.querySelector('.personal-quick a[href="/customer/personal/orders"]')!);
    await screen.findByRole("heading", { name: "訂單紀錄" });
    expect(container.querySelector(".personal-bottom-nav")).not.toBeInTheDocument();
  });
  it("shows tomorrow's delivery status and actual time window with an order link", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T16:30:00Z"));
    try {
      mocks.session.mockResolvedValue({ token: "personal", orders: [{ ...orders[0], id: "next", orderNumber: "B-1568", deliveryDate: "2026-10-17" }] });
      vi.mocked(fetchCustomerSelfServiceOrder).mockResolvedValue({ id: "next", deliveryTime: "12:30 - 13:30", deliveryStatus: "待配送" } as Awaited<ReturnType<typeof fetchCustomerSelfServiceOrder>>);
      const { container } = mount();
      expect(await screen.findByText("預計送達時間：12:30 - 13:30")).toBeInTheDocument();
      expect(screen.getByText(/明日送達/)).toBeInTheDocument();
      expect(container.querySelector(".personal-delivery-summary")).toHaveTextContent("B-1568 · 明日送達");
      expect(container.querySelector(".personal-delivery-status")).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "查看訂單" })).toHaveAttribute("href", "/customer/personal/next");
      expect(fetchCustomerSelfServiceOrder).toHaveBeenCalledWith("personal", "next");
    } finally { vi.useRealTimers(); }
  });
  it("keeps the empty delivery card and clean box illustration when no delivery exists", async () => {
    mocks.session.mockResolvedValue({ token: "personal", orders: [] });
    const { container } = mount();
    expect(await screen.findByText("暫時沒有即將送貨的訂單。")).toBeInTheDocument();
    expect(container.querySelector(".personal-next-card>img")).toHaveAttribute("src", "/assets/empty-box.svg");
    expect(fetchCustomerSelfServiceOrder).not.toHaveBeenCalled();
  });
  it("keeps delivery information usable when its time cannot be loaded", async () => {
    mount();
    expect(await screen.findByText("預計送達時間：待確認")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看訂單" })).toHaveAttribute("href", "/customer/personal/next");
    expect(screen.queryByText(/12:30/)).not.toBeInTheDocument();
  });
  it("shows the earliest upcoming order and honest reward availability", async () => {
    mount(); await screen.findByRole("heading", { name: "下一張訂單狀態" });
    expect(screen.getAllByRole("link", { name: "FCC-1" })[0]).toHaveAttribute("href", "/customer/personal/next");
    expect(screen.getAllByRole("link", { name: "FCC-2" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("待付款").length).toBeGreaterThan(0); expect(await screen.findByText("0 分")).toBeInTheDocument();
  });
  it("navigates with the existing drawer without showing team controls or phone matching", async () => {
    mount(); await screen.findByRole("heading", { name: "下一張訂單狀態" }); fireEvent.click(screen.getByRole("button", { name: "開啟選單" }));
    for (const name of ["首頁", "到會網站", "活動飯盒", "訂單紀錄", "積分換禮品", "送貨地址", "付款送貨", "我的資料", "關於我們", "客戶清單", "真實案例", "公司訂飯", "服務承諾"]) expect(screen.getAllByRole("link", { name }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "團隊管理" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "VIP 訂飯" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "配對訂單" })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("link", { name: "我的資料" })[0]); await screen.findByRole("heading", { name: "個人資料" });
    expect(screen.getByRole("button", { name: "編輯資料" })).toBeInTheDocument();
    expect(screen.queryByLabelText("密碼")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("姓名")).not.toBeInTheDocument();
  });
  it("shows a published guide from the sidebar", async () => {
    mount(); await screen.findByRole("heading", { name: "下一張訂單狀態" });
    fireEvent.click(screen.getByRole("button", { name: "開啟選單" }));
    fireEvent.click(screen.getByRole("link", { name: "關於我們" }));
    expect(await screen.findByRole("heading", { name: "關於我們" })).toBeInTheDocument();
    expect(screen.getByText("我們做到會。")).toBeInTheDocument();
  });
  it("opens payment arrangement as HTML in the portal", async () => {
    mount(); await screen.findByRole("heading", { name: "下一張訂單狀態" });
    fireEvent.click(screen.getByRole("button", { name: "開啟選單" }));
    const link = screen.getAllByRole("link", { name: "付款送貨" })[0];
    expect(link).toHaveAttribute("href", "/customer/personal/guides/payment");
    fireEvent.click(link);
    expect(await screen.findByRole("heading", { name: "付款安排" })).toBeInTheDocument();
    expect(screen.getByText("轉數快識別碼 102938271")).toBeInTheDocument();
  });
  it("opens configured brand menus on Shopify", async () => {
    mocks.snapshot.mockResolvedValue({ ...structuredClone(data), stores: [
      { id: "catering", name: "Catering", domain: "foodchannels-catering.myshopify.com" },
      { id: "brand", name: "Brand menu", domain: "brand.myshopify.com" },
    ] });
    mount("/customer/personal/menus");
    const catering = await screen.findByRole("link", { name: /Catering/ });
    expect(catering).toHaveAttribute("href", "https://foodchannels-catering.myshopify.com");
    expect(catering.querySelector("img")).toHaveAttribute("src", "/assets/fc-catering-logo.svg");
    expect(screen.getByRole("link", { name: /Brand menu/ })).toHaveAttribute("href", "https://brand.myshopify.com");
    expect(screen.getByRole("heading", { name: "最新餐牌" })).toBeInTheDocument();
    expect(screen.getByText("選擇品牌，查看最新餐牌及訂購。")).toBeInTheDocument();
  });
  it("reopens orders on the corresponding brand website without rebuilding a cart", async () => {
    mount("/customer/personal/orders");
    expect(await screen.findByRole("heading", { name: "訂單紀錄" })).toBeInTheDocument();
    expect(screen.getByText("查看訂單狀態、付款與重訂記錄。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下載收據" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下載發票" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "上傳單據" })).toHaveAttribute("href", "/customer/personal/payments?order=next");
    expect(screen.getAllByRole("link", { name: "訂單意見" })).toHaveLength(1);
    expect(screen.queryByRole("link", { name: "前往品牌官網" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "訂單 FCC-1 的更多操作" }));
    const menu = await screen.findByRole("dialog", { name: "訂單更多操作" });
    expect(within(menu).queryByRole("link", { name: "訂單意見" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "訂單意見" })).toHaveAttribute("href", "/customer/personal/feedback/next");
    expect(screen.getByRole("link", { name: "前往品牌官網" })).toHaveAttribute("href", "https://brand.myshopify.com");
    expect(mocks.reorder).not.toHaveBeenCalled();
    expect(mocks.reorderQuote).not.toHaveBeenCalled();
  });
  it("routes lunchbox orders to event lunchbox ordering", async () => {
    mocks.snapshot.mockResolvedValue({ ...structuredClone(data), stores: [{ id: "lunch", name: "HK Lunchbox", domain: "lunch-brand.myshopify.com" }], order_states: { next: { paid: false, delivery_status: "已確認", store_domain: "lunch-brand.myshopify.com" } } });
    mount("/customer/personal/orders");
    fireEvent.click(await screen.findByRole("button", { name: "訂單 FCC-1 的更多操作" }));
    expect(await screen.findByRole("link", { name: "前往訂餐" })).toHaveAttribute("href", "/customer/personal/lunchbox");
    expect(screen.queryByRole("link", { name: "前往品牌官網" })).not.toBeInTheDocument();
  });
  it("disables the brand website action and explains when no website is configured", async () => {
    mount("/customer/personal/orders");
    await screen.findByRole("heading", { name: "訂單紀錄" });
    fireEvent.click(screen.getByRole("button", { name: "訂單 FCC-2 的更多操作" }));
    expect(screen.getByRole("button", { name: "前往品牌官網" })).toBeDisabled();
    expect(screen.getByText("暫時未能開啟餐牌，請稍後再試。")).toBeInTheDocument();
  });
  it("closes order actions with Escape and after choosing an action", async () => {
    mount("/customer/personal/orders");
    const trigger = await screen.findByRole("button", { name: "訂單 FCC-2 的更多操作" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    const menu = await screen.findByRole("dialog", { name: "訂單更多操作" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(menu, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "訂單更多操作" })).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    fireEvent.click(trigger);
    fireEvent.click(within(await screen.findByRole("dialog", { name: "訂單更多操作" })).getByRole("link", { name: "訂單意見" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "訂單更多操作" })).not.toBeInTheDocument());
  });
  it("offers add-on from the order list when the order can be added to", async () => {
    mocks.addon.mockResolvedValue({ canAddOn: true, reason: null, cutoffAt: null, hasAddOn: false, items: [] });
    mount("/customer/personal/orders");
    await screen.findByRole("heading", { name: "訂單紀錄" });
    fireEvent.click(await screen.findByRole("button", { name: "訂單 FCC-1 的更多操作" }));
    const dialog = await screen.findByRole("dialog", { name: "訂單更多操作" });
    expect(within(dialog).getByRole("link", { name: "加單" })).toHaveAttribute("href", "/customer/personal/next?addon=1");
  });
  it("supports empty order history and direct route loading", async () => {
    mocks.session.mockResolvedValue({ token: "personal", orders: [], maskedEmail: "", maskedPhone: "" }); mount("/customer/personal/orders");
    expect(await screen.findByText("目前沒有已綁定的訂單。")).toBeInTheDocument(); expect(screen.getByRole("link", { name: "立即訂購" })).toBeInTheDocument();
  });
  it("saves contact details and independent notification preferences without a password", async () => {
    mount("/customer/personal/profile");
    fireEvent.click(await screen.findByRole("switch", { name: "接收 WhatsApp 通知" }));
    await waitFor(() => expect(mocks.profile).toHaveBeenCalledWith(expect.objectContaining({ notify_whatsapp: true, notify_email: true })));
    fireEvent.click(screen.getByRole("button", { name: "編輯資料" }));
    expect(screen.getByLabelText("登入電郵")).toHaveAttribute("readonly");
    fireEvent.change(screen.getByLabelText("姓名"), { target: { value: "New name" } });
    fireEvent.click(screen.getByRole("button", { name: "確定" }));
    await waitFor(() => expect(mocks.profile).toHaveBeenCalledWith(expect.objectContaining({ name: "New name" })));
    expect(await screen.findByRole("status")).toHaveTextContent("已儲存。"); expect(screen.queryByLabelText("姓名")).not.toBeInTheDocument();
  });
  it("adds and edits addresses from a side panel, and makes Shopify sync status explicit", async () => {
    mount("/customer/personal/addresses"); await screen.findByText("尚未儲存送貨地址。"); expect(screen.queryByText(/Shopify 同步結果/)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "新增送貨地址" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "新增地址" }));
    expect(screen.getByRole("heading", { name: "新增送貨地址" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "公司" }));
    for (const [label, value] of [[/聯絡人姓名/, "Person"], [/聯絡電話/, "91234567"], [/詳細送貨地址/, "Hong Kong"]]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.click(screen.getByLabelText(/設為預設地址/)); fireEvent.click(screen.getByRole("button", { name: "儲存地址" }));
    await waitFor(() => expect(mocks.address).toHaveBeenCalledWith({ label: "[company]", recipient: "Person", phone: "91234567", address: "Hong Kong", is_default: true }, null));
    expect(screen.queryByRole("heading", { name: "新增送貨地址" })).not.toBeInTheDocument();
  });
  it("exposes direct default and delete actions for a saved non-default address", async () => {
    const row = { id: "office", label: "[company] 辦公室", recipient: "李先生", phone: "98765432", address: "觀塘開源道 72 號", is_default: false };
    mocks.snapshot.mockResolvedValue({ ...structuredClone(data), addresses: [row] });
    mount("/customer/personal/addresses");
    expect(await screen.findByText("李先生")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "更多地址操作" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "刪除", exact: true })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "設為預設", exact: true })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "設為預設" }));
    await waitFor(() => expect(mocks.address).toHaveBeenCalledWith({ ...row, is_default: true }, "office"));
    await waitFor(() => expect(screen.getByRole("button", { name: "刪除", exact: true })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "刪除", exact: true }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("office"));
  });
  it("opens a saved address in the edit side panel", async () => {
    mocks.snapshot.mockResolvedValue({ ...structuredClone(data), addresses: [{ id: "a1", label: "[company] 興裕", recipient: "陳小明", phone: "91234567", address: "觀塘", is_default: true }] });
    mount("/customer/personal/addresses");
    expect(await screen.findByText("預設地址")).toBeInTheDocument();
    expect(screen.getByText("預設")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "更多地址操作" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "設為預設", exact: true })).toBeDisabled();
    expect(screen.getByRole("button", { name: "刪除", exact: true })).toBeEnabled();
    expect(screen.getByText("觀塘")).toBeInTheDocument();
    expect(screen.getByText("陳小明")).toBeInTheDocument();
    expect(screen.getByText("91234567")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "管理送貨地址" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "我的地址" })).toBeInTheDocument();
    expect(screen.getByText("預設地址")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "編輯" }));
    expect(screen.getByRole("heading", { name: "編輯送貨地址" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "家用" }));
    fireEvent.click(screen.getByRole("button", { name: "儲存地址" }));
    await waitFor(() => expect(mocks.address).toHaveBeenCalledWith(expect.objectContaining({ label: "[home]", is_default: true }), "a1"));
  });
  it("validates evidence files and submits only an unpaid linked order", async () => {
    mount("/customer/personal/payments"); await screen.findByLabelText("選擇訂單"); expect(screen.queryByRole("option", { name: "FCC-2" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("選擇訂單"), { target: { value: "next" } }); fireEvent.change(screen.getByLabelText("付款金額（HKD）"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("FPS／入數紙"), { target: { files: [new File(["bad"], "file.txt", { type: "text/plain" })] } });
    fireEvent.submit(screen.getByLabelText("FPS／入數紙").closest("form")!); expect(await screen.findByRole("alert")).toHaveTextContent("請選擇不超過 10MB"); expect(mocks.upload).not.toHaveBeenCalled();
    const file = new File(["proof"], "proof.pdf", { type: "application/pdf" }); fireEvent.change(screen.getByLabelText("FPS／入數紙"), { target: { files: [file] } });
    fireEvent.submit(screen.getByLabelText("FPS／入數紙").closest("form")!); await waitFor(() => expect(mocks.upload).toHaveBeenCalledWith("next", file, 100));
    expect(await screen.findByText("付款單據已提交，等待財務核實。")).toBeVisible();
  });
  it("keeps entered profile data when saving fails", async () => {
    mocks.profile.mockRejectedValue(new Error("network")); mount("/customer/personal/profile");
    fireEvent.click(await screen.findByRole("button", { name: "編輯資料" }));
    fireEvent.change(screen.getByLabelText("姓名"), { target: { value: "Keep me" } }); fireEvent.click(screen.getByRole("button", { name: "確定" }));
    const form = screen.getByLabelText("姓名").closest("form")!;
    expect(await within(form).findByRole("alert")).toHaveTextContent("操作未完成"); expect(screen.getByLabelText("姓名")).toHaveValue("Keep me");
  });
  it("offers retry after a failed session and preserves navigation", async () => {
    mocks.session.mockRejectedValueOnce(new Error("offline")); mount(); await screen.findByRole("heading", { name: "未能載入客戶資料" });
    fireEvent.click(screen.getByRole("button", { name: "重試" })); await screen.findByRole("heading", { name: "下一張訂單狀態" });
  });
  it("does not expose an organization balance or an enabled redemption action", async () => {
    mount("/customer/personal/points"); expect(await screen.findByRole("heading", { name: "獎勵積分" })).toBeInTheDocument();
    expect(await screen.findByText("0 分")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "兌換積分" })).not.toBeInTheDocument();
  });
});
