import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { RewardRedemptionRecords } from "@/components/customer-portal/RewardRedemptionRecords";
import "@/lib/customer-portal-i18n";

const mocks = vi.hoisted(() => ({ list: vi.fn(), writeText: vi.fn() }));
vi.mock("@/lib/customer-reward-catalog", () => ({
  listPersonalRewardRedemptions: mocks.list,
  listPortalRewardRedemptions: mocks.list,
}));

const issued = { id: "v1", name: "10代金券", kind: "voucher", points: 10, status: "fulfilled", created_at: "2026-10-15T06:32:00Z", voucher_status: "issued", voucher_code: "FCCDABCDEFGHJK", voucher_amount: 10, shop_domain: "foodchannels-catering.myshopify.com" };
const queued = { ...issued, id: "v2", voucher_status: "queued", voucher_code: null };
const gift = { id: "g1", name: "保溫袋", kind: "gift", points: 100, status: "pending", created_at: "2026-10-15T07:32:00Z", voucher_status: null, voucher_code: null, voucher_amount: null, shop_domain: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText: mocks.writeText }, configurable: true });
  mocks.list.mockResolvedValue([issued]);
});

it("lists an issued cash voucher and reveals the created discount code", async () => {
  render(<RewardRedemptionRecords scope="personal" />);
  expect(await screen.findByRole("heading", { name: "現金券", level: 3 })).toBeInTheDocument();
  expect(screen.getByText("10代金券")).toBeInTheDocument();
  expect(screen.getByText("HK$10 · foodchannels-catering.myshopify.com")).toBeInTheDocument();
  expect(screen.getByText("結帳時輸入此券碼")).toBeInTheDocument();
  expect(screen.getByText("你的現金券碼")).toBeInTheDocument();
  expect(screen.getByText("•".repeat(14))).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "顯示折扣碼" }));
  expect(screen.getByText("FCCDABCDEFGHJK")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "複製" }));
  expect(mocks.writeText).toHaveBeenCalledWith("FCCDABCDEFGHJK");
  expect(await screen.findByRole("button", { name: "已複製" })).toBeInTheDocument();
});

it("lists a physical gift redemption with its fulfilment status and no code", async () => {
  mocks.list.mockResolvedValue([gift]);
  render(<RewardRedemptionRecords scope="personal" />);
  expect(await screen.findByRole("heading", { name: "實物", level: 3 })).toBeInTheDocument();
  expect(screen.getByText("保溫袋")).toBeInTheDocument();
  expect(screen.getByText("100 分")).toBeInTheDocument();
  expect(screen.getByText("處理中")).toBeInTheDocument();
  expect(screen.queryByText("你的現金券碼")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "複製" })).not.toBeInTheDocument();
});

it("shows the code hint directly while the discount code is queued", async () => {
  mocks.list.mockResolvedValue([queued]);
  render(<RewardRedemptionRecords scope="personal" />);
  expect(await screen.findByText("準備中")).toBeInTheDocument();
  expect(screen.getByText("折扣碼建立後會在此顯示。")).toBeInTheDocument();
  expect(screen.queryByText("你的現金券碼")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "複製" })).not.toBeInTheDocument();
});

it("labels a completed gift as 已完成", async () => {
  mocks.list.mockResolvedValue([{ ...gift, status: "fulfilled" }]);
  render(<RewardRedemptionRecords scope="personal" />);
  expect(await screen.findByText("已完成")).toBeInTheDocument();
});

it("shows the empty state when there are no redemptions", async () => {
  mocks.list.mockResolvedValue([]);
  render(<RewardRedemptionRecords scope="personal" />);
  expect(await screen.findByText("暫無兌換記錄")).toBeInTheDocument();
});

it("shows the same empty state in the organization scope", async () => {
  mocks.list.mockResolvedValue([]);
  render(<RewardRedemptionRecords scope="organization" organizationId="org-1" />);
  expect(await screen.findByText("暫無兌換記錄")).toBeInTheDocument();
});
