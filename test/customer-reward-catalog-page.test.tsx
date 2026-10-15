import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { CustomerPortalRewardCatalogPage } from "@/components/settings/CustomerPortalRewardCatalogPage";
const mocks = vi.hoisted(() => ({
  catalog: vi.fn(), page: vi.fn(), save: vi.fn(), link: vi.fn(), edit: true,
  upload: vi.fn(), generate: vi.fn(), imageUrl: vi.fn(),
}));
vi.mock("@/auth/use-page-access", () => ({ useCurrentPageAccess: () => ({ canAccess: () => mocks.edit }) }));
vi.mock("@/lib/customer-reward-catalog", () => ({
  buildRewardCatalogImagePrompt: ({ name = "", description = "" }: { name?: string; description?: string }) =>
    `flat 2D catalog prompt Show the prize name: "${name}". ${description}`.trim(),
  listRewardCatalogOps: mocks.catalog,
  fetchRewardRedemptionPage: mocks.page,
  upsertRewardCatalogItem: mocks.save,
  fulfillRewardRedemption: vi.fn(),
  uploadRewardCatalogImage: mocks.upload,
  generateRewardCatalogImage: mocks.generate,
  rewardCatalogImageUrl: mocks.imageUrl,
}));
vi.mock("@/lib/shopify-customer-bridge", () => ({ linkShopifyCustomer: mocks.link }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) }) } }));
beforeEach(() => {
  mocks.edit = true;
  mocks.catalog.mockReset().mockResolvedValue([]);
  mocks.page.mockReset().mockResolvedValue({ rows: [], total: 0, page: 1 });
  mocks.save.mockReset().mockResolvedValue("id");
  mocks.upload.mockReset().mockResolvedValue("user/img.png");
  mocks.generate.mockReset().mockResolvedValue({ objectPath: "user/ai/img.png", signedUrl: "https://example.com/ai.png" });
  mocks.imageUrl.mockReset().mockResolvedValue("https://example.com/img.png");
});
const mount = () => render(<MemoryRouter><CustomerPortalRewardCatalogPage /></MemoryRouter>);
const openEditor = async () => { fireEvent.click(await screen.findByRole("button", { name: "新增兌換項目" })); return within(await screen.findByRole("dialog")); };
it("does not misrepresent failed data as an empty catalog, and retries", async () => {
  mocks.catalog.mockRejectedValueOnce(new Error("unavailable")); mount();
  await screen.findByRole("alert");
  expect(screen.queryByText("尚未設定兌換項目。")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "兌換目錄" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "重試" }));
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(await screen.findByText("尚未設定兌換項目。")).toBeInTheDocument();
});
it("validates points and preserves the form when saving fails", async () => {
  mount(); const editor = await openEditor();
  fireEvent.change(editor.getByLabelText("名稱"), { target: { value: "  Gift  " } });
  fireEvent.change(editor.getByLabelText("所需積分"), { target: { value: "1.5" } });
  fireEvent.submit(editor.getByLabelText("名稱").closest("form")!);
  expect(await screen.findByRole("alert")).toBeInTheDocument(); expect(mocks.save).not.toHaveBeenCalled();
  fireEvent.change(editor.getByLabelText("所需積分"), { target: { value: "100" } });
  mocks.save.mockRejectedValueOnce(new Error("unavailable"));
  fireEvent.submit(editor.getByLabelText("名稱").closest("form")!);
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ name: "Gift", points: 100 })));
  expect(editor.getByLabelText("名稱")).toHaveValue("  Gift  ");
});
it("prevents duplicate saves and closes the editor after success", async () => {
  let finish!: (value: string) => void; mocks.save.mockImplementation(() => new Promise<string>(resolve => { finish = resolve; }));
  mount(); const editor = await openEditor();
  fireEvent.change(editor.getByLabelText("名稱"), { target: { value: "Gift" } });
  fireEvent.click(editor.getByRole("button", { name: "新增兌換項目" }));
  expect(editor.getByRole("button", { name: "新增兌換項目" })).toBeDisabled();
  finish("id"); expect(await screen.findByRole("status")).toHaveTextContent("已儲存兌換項目。");
  await waitFor(() => expect(screen.queryByLabelText("名稱")).not.toBeInTheDocument());
});
it("allows canceling an edit and hides management controls for read-only users", async () => {
  mocks.catalog.mockResolvedValue([{ id: "item", name: "Gift", kind: "gift", points_cost: 20, stock: 0, description: "", is_active: false }]);
  const view = mount();
  expect(await screen.findByText("Gift")).toBeInTheDocument();
  fireEvent.click(await screen.findByRole("button", { name: "編輯" }));
  expect(screen.getByLabelText("名稱")).toHaveValue("Gift");
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  await waitFor(() => expect(screen.queryByLabelText("名稱")).not.toBeInTheDocument());
  view.unmount(); mocks.edit = false; mount();
  expect(await screen.findByText("Gift")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "新增兌換項目" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("名稱")).not.toBeInTheDocument();
  expect(screen.queryByText("Shopify 客戶對應")).not.toBeInTheDocument();
});
it("keeps manual vouchers available without a Shopify store", async () => {
  mount(); const editor = await openEditor();
  fireEvent.change(editor.getByLabelText("名稱"), { target: { value: "Manual voucher" } });
  fireEvent.change(editor.getByLabelText("類型"), { target: { value: "voucher" } });
  fireEvent.change(editor.getByLabelText("面額（HK$）"), { target: { value: "50" } });
  fireEvent.submit(editor.getByLabelText("名稱").closest("form")!);
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ kind: "voucher", voucherAmount: 50, storeId: null })));
});

it("offers retry when refreshing fails after a successful save", async () => {
  mount(); const editor = await openEditor();
  mocks.page.mockRejectedValueOnce(new Error("unavailable"));
  fireEvent.change(editor.getByLabelText("名稱"), { target: { value: "Gift" } });
  fireEvent.click(editor.getByRole("button", { name: "新增兌換項目" }));
  await screen.findByRole("alert"); expect(screen.getByRole("button", { name: "重試" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "重試" }));
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(mocks.save).toHaveBeenCalledTimes(1);
});

it("uploads or generates a catalog image and saves the object path", async () => {
  mount(); const editor = await openEditor();
  fireEvent.change(editor.getByLabelText("名稱"), { target: { value: "Gift" } });
  const file = new File(["img"], "bag.png", { type: "image/png" });
  fireEvent.change(editor.getByLabelText("選擇圖片"), { target: { files: [file] } });
  await waitFor(() => expect(mocks.upload).toHaveBeenCalledWith(file));
  fireEvent.click(editor.getByRole("button", { name: "新增兌換項目" }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ imageObjectPath: "user/img.png" })));

  mocks.save.mockClear();
  fireEvent.click(await screen.findByRole("button", { name: "新增兌換項目" }));
  const next = within(await screen.findByRole("dialog"));
  fireEvent.change(next.getByLabelText("名稱"), { target: { value: "AI Gift" } });
  fireEvent.click(next.getByRole("tab", { name: "AI 生成" }));
  expect(next.queryByLabelText("獎品名稱")).not.toBeInTheDocument();
  expect((next.getByLabelText("提示詞") as HTMLTextAreaElement).value).toContain("AI Gift");
  let finishGenerate!: (value: { objectPath: string; signedUrl: string }) => void;
  mocks.generate.mockImplementation(() => new Promise(resolve => { finishGenerate = resolve; }));
  fireEvent.click(next.getByRole("button", { name: "AI 生成圖片" }));
  expect(next.getAllByRole("status").some(node => node.textContent?.includes("正在生成"))).toBe(true);
  finishGenerate({ objectPath: "user/ai/img.png", signedUrl: "https://example.com/ai.png" });
  await waitFor(() => expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({
    name: "AI Gift",
    prompt: expect.stringContaining("AI Gift"),
  })));
  await waitFor(() => expect(next.queryByText("正在生成…")).not.toBeInTheDocument());
  fireEvent.click(next.getByRole("button", { name: "新增兌換項目" }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ imageObjectPath: "user/ai/img.png" })));
});
