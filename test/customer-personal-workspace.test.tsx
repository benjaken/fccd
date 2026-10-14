import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerPersonalWorkspace } from "@/components/customer-portal/CustomerPersonalWorkspace";
import { supabase } from "@/lib/supabase";
import type { PersonalSnapshot } from "@/lib/customer-personal";
const mocks = vi.hoisted(() => ({ session: vi.fn(), snapshot: vi.fn(), profile: vi.fn(), address: vi.fn(), remove: vi.fn(), upload: vi.fn(), reorder: vi.fn(), reorderQuote: vi.fn(), logout: vi.fn(), points: vi.fn() }));
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
  order_states: { next: { paid: false, delivery_status: "已確認" }, late: { paid: true, delivery_status: "已確認" } },
};
function mount(path = "/customer/personal") { return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/customer/*" element={<CustomerPersonalWorkspace canSwitch={false} loggingOut={false} onLogout={mocks.logout} />} /></Routes></MemoryRouter>); }
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ token: "personal", expiresAt: "2099-01-01", maskedEmail: "p***@example.com", maskedPhone: "", orders });
  mocks.snapshot.mockResolvedValue(structuredClone(data));
  for (const fn of [mocks.profile, mocks.address, mocks.remove, mocks.upload]) fn.mockResolvedValue(undefined);
  mocks.reorder.mockResolvedValue({ domain: "brand.myshopify.com", items: [{ variant: "123", quantity: 2 }] });
  mocks.reorderQuote.mockRejectedValue(new Error("not_portal_quote"));
  mocks.points.mockResolvedValue({ balance: 0, pending: 0, ledger: [] });
  vi.mocked(supabase.rpc).mockImplementation(async (fn: string) => {
    if (fn === "customer_portal_list_guides") return { data: [
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
  it("shows the earliest upcoming order and honest reward availability", async () => {
    mount(); await screen.findByRole("heading", { name: "下一張單狀態" });
    expect(screen.getAllByRole("link", { name: "FCC-1" })[0]).toHaveAttribute("href", "/customer/personal/next");
    expect(screen.getAllByRole("link", { name: "FCC-2" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("待付款").length).toBeGreaterThan(0); expect(await screen.findByText("0 分")).toBeInTheDocument();
  });
  it("navigates with the existing drawer without showing team controls or phone matching", async () => {
    mount(); await screen.findByRole("heading", { name: "下一張單狀態" }); fireEvent.click(screen.getByRole("button", { name: "開啟選單" }));
    for (const name of ["主頁", "到會網站", "活動飯盒", "訂單紀錄（付款單據）", "積分換禮品", "送貨地址", "付款送貨", "我的資料", "關於我們", "客戶清單", "真實案例", "公司訂飯", "服務承諾"]) expect(screen.getAllByRole("link", { name }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "團隊管理" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "VIP 訂飯" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "配對訂單" })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("link", { name: "我的資料" })[0]); await screen.findByRole("heading", { name: "個人資料" });
    expect(screen.getByRole("button", { name: "編輯" })).toBeInTheDocument();
    expect(screen.queryByLabelText("密碼")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("姓名")).not.toBeInTheDocument();
  });
  it("shows a published guide from the sidebar", async () => {
    mount(); await screen.findByRole("heading", { name: "下一張單狀態" });
    fireEvent.click(screen.getByRole("button", { name: "開啟選單" }));
    fireEvent.click(screen.getByRole("link", { name: "關於我們" }));
    expect(await screen.findByRole("heading", { name: "關於我們" })).toBeInTheDocument();
    expect(screen.getByText("我們做到會。")).toBeInTheDocument();
  });
  it("opens configured brand menus on Shopify", async () => {
    mount("/customer/personal/menus"); await screen.findByText("Brand menu"); expect(screen.getByRole("link", { name: /Brand menu/ })).toHaveAttribute("href", "https://brand.myshopify.com");
    expect(screen.getByRole("heading", { name: "最新餐牌" })).toBeInTheDocument();
  });
  it("prepares a cart before navigating and explains unavailable custom options", async () => {
    mount(); fireEvent.click((await screen.findAllByRole("button", { name: "再訂一次" }))[0]);
    expect(await screen.findByRole("link", { name: "前往 Shopify 購物車" })).toHaveAttribute("href", "https://brand.myshopify.com/cart/123:2?storefront=true");
    fireEvent.click(screen.getByRole("button", { name: "取消" })); mocks.reorder.mockRejectedValue({ message: "reorder_options_required" });
    fireEvent.click(screen.getAllByRole("button", { name: "再訂一次" })[0]); expect(await screen.findByRole("alert")).toHaveTextContent("此訂單含套餐或特別選項");
  });
  it("supports empty order history and direct route loading", async () => {
    mocks.session.mockResolvedValue({ token: "personal", orders: [], maskedEmail: "", maskedPhone: "" }); mount("/customer/personal/orders");
    expect(await screen.findByText("目前沒有已綁定的訂單。")).toBeInTheDocument(); expect(screen.getByRole("link", { name: "立即訂購" })).toBeInTheDocument();
  });
  it("saves contact details and independent notification preferences without a password", async () => {
    mount("/customer/personal/profile"); fireEvent.click(await screen.findByRole("button", { name: "編輯" }));
    expect(screen.getByLabelText("登入電郵")).toHaveAttribute("readonly");
    fireEvent.change(screen.getByLabelText("姓名"), { target: { value: "New name" } });
    fireEvent.click(screen.getByLabelText("接收 WhatsApp 通知")); fireEvent.click(screen.getByRole("button", { name: "確定" }));
    await waitFor(() => expect(mocks.profile).toHaveBeenCalledWith(expect.objectContaining({ name: "New name", notify_whatsapp: true, notify_email: true })));
    expect(await screen.findByRole("status")).toHaveTextContent("已儲存。"); expect(screen.queryByLabelText("姓名")).not.toBeInTheDocument();
  });
  it("adds and edits addresses from a side panel, and makes Shopify sync status explicit", async () => {
    mount("/customer/personal/addresses"); await screen.findByText("尚未儲存送貨地址。"); expect(screen.getByText(/Shopify 地址同步尚未接通/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "新增送貨地址" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "新增地址" }));
    expect(screen.getByRole("heading", { name: "新增送貨地址" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "公司" }));
    for (const [label, value] of [[/聯絡人姓名/, "Person"], [/聯絡電話/, "91234567"], [/公司名稱/, "Home"], [/詳細送貨地址/, "Hong Kong"]]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.click(screen.getByLabelText("預設地址")); fireEvent.click(screen.getByRole("button", { name: "儲存地址" }));
    await waitFor(() => expect(mocks.address).toHaveBeenCalledWith({ label: "[company] Home", recipient: "Person", phone: "91234567", address: "Hong Kong", is_default: true }, null));
    expect(screen.queryByRole("heading", { name: "新增送貨地址" })).not.toBeInTheDocument();
  });
  it("opens a saved address in the edit side panel", async () => {
    mocks.snapshot.mockResolvedValue({ ...structuredClone(data), addresses: [{ id: "a1", label: "[company] 興裕", recipient: "陳小明", phone: "91234567", address: "觀塘", is_default: true }] });
    mount("/customer/personal/addresses");
    expect(await screen.findByText("陳小明")).toBeInTheDocument();
    expect(screen.getByText("公司")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "編輯" }));
    expect(screen.getByRole("heading", { name: "編輯送貨地址" })).toBeInTheDocument();
    expect(screen.getByLabelText(/公司名稱/)).toHaveValue("興裕");
    fireEvent.change(screen.getByLabelText(/公司名稱/), { target: { value: "興裕企業" } });
    fireEvent.click(screen.getByRole("button", { name: "儲存地址" }));
    await waitFor(() => expect(mocks.address).toHaveBeenCalledWith(expect.objectContaining({ label: "[company] 興裕企業", is_default: true }), "a1"));
  });
  it("validates evidence files and submits only an unpaid linked order", async () => {
    mount("/customer/personal/payments"); await screen.findByLabelText("選擇訂單"); expect(screen.queryByRole("option", { name: "FCC-2" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("選擇訂單"), { target: { value: "next" } }); fireEvent.change(screen.getByLabelText("付款金額（HKD）"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("FPS／入數紙"), { target: { files: [new File(["bad"], "file.txt", { type: "text/plain" })] } });
    fireEvent.submit(screen.getByLabelText("FPS／入數紙").closest("form")!); expect(await screen.findByRole("alert")).toHaveTextContent("請選擇不超過 10MB"); expect(mocks.upload).not.toHaveBeenCalled();
    const file = new File(["proof"], "proof.pdf", { type: "application/pdf" }); fireEvent.change(screen.getByLabelText("FPS／入數紙"), { target: { files: [file] } });
    fireEvent.submit(screen.getByLabelText("FPS／入數紙").closest("form")!); await waitFor(() => expect(mocks.upload).toHaveBeenCalledWith("next", file, 100));
    expect(await screen.findByRole("status")).toHaveTextContent("付款單據已提交");
  });
  it("keeps entered profile data when saving fails", async () => {
    mocks.profile.mockRejectedValue(new Error("network")); mount("/customer/personal/profile");
    fireEvent.click(await screen.findByRole("button", { name: "編輯" }));
    fireEvent.change(screen.getByLabelText("姓名"), { target: { value: "Keep me" } }); fireEvent.click(screen.getByRole("button", { name: "確定" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("操作未完成"); expect(screen.getByLabelText("姓名")).toHaveValue("Keep me");
  });
  it("offers retry after a failed session and preserves navigation", async () => {
    mocks.session.mockRejectedValueOnce(new Error("offline")); mount(); await screen.findByRole("heading", { name: "未能載入客戶資料" });
    fireEvent.click(screen.getByRole("button", { name: "重試" })); await screen.findByRole("heading", { name: "下一張單狀態" });
  });
  it("does not expose an organization balance or an enabled redemption action", async () => {
    mount("/customer/personal/points"); expect(await screen.findByRole("heading", { name: "獎勵積分" })).toBeInTheDocument();
    expect(await screen.findByText("0 分")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "兌換積分" })).not.toBeInTheDocument();
  });
});
