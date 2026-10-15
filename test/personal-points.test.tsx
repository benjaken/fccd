import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { PersonalPointsPage } from "@/components/customer-portal/PersonalPointsPage";
import "@/lib/customer-personal-i18n";
import "@/lib/customer-portal-i18n";

const mocks = vi.hoisted(() => ({ points: vi.fn(), redeem: vi.fn() }));
vi.mock("@/lib/customer-personal", () => ({ fetchPersonalPoints: mocks.points }));
vi.mock("@/components/customer-portal/RewardRedemptionRecords", () => ({ RewardRedemptionRecords: () => null }));
vi.mock("@/lib/customer-reward-catalog", () => ({
  listRewardCatalog: async () => [
    { id: "voucher", name: "10代金券", kind: "voucher", points_cost: 10, stock: 5 },
    { id: "bag", name: "保溫袋", kind: "gift", points_cost: 100, stock: 5 },
  ], redeemPersonalCatalog: mocks.redeem,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.points.mockResolvedValue({ balance: 59, pending: 0, ledger: [1, 2, 3].map(id => ({ id: String(id), kind: "earn", points: id, created_at: "2026-10-15T06:32:00Z" })) });
  mocks.redeem.mockResolvedValue(undefined);
});
it("shows the real balance, affordable rewards and dated records", async () => {
  render(<PersonalPointsPage />);
  expect(await screen.findByText("59 分")).toBeInTheDocument();
  const buttons = await screen.findAllByRole("button", { name: "兌換", exact: true });
  expect(buttons[0]).toBeEnabled(); expect(buttons[1]).toBeDisabled();
  fireEvent.click(screen.getByRole("tab", { name: "賺取／使用記錄" }));
  expect(screen.queryByRole("button", { name: "查看全部" })).not.toBeInTheDocument();
  expect(screen.getAllByText("完成訂單儲分")).toHaveLength(3);
  expect(document.querySelector("time")).toHaveAttribute("datetime", "2026-10-15T06:32:00Z");
  expect(screen.queryByRole("button", { name: "收起紀錄" })).not.toBeInTheDocument();
});
it("confirms redemption and reloads the balance", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<PersonalPointsPage />); await screen.findByText("59 分");
  mocks.points.mockResolvedValue({ balance: 49, pending: 0, ledger: [] });
  fireEvent.click((await screen.findAllByRole("button", { name: "兌換", exact: true }))[0]);
  expect(await screen.findByText("49 分")).toBeInTheDocument();
  expect(mocks.redeem).toHaveBeenCalledWith(expect.any(String), "voucher");
});
it("does not show a fabricated zero balance after failure and offers retry", async () => {
  mocks.points.mockRejectedValueOnce(new Error("offline"));
  render(<PersonalPointsPage />);
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.queryByText("0 分")).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getAllByRole("button", { name: "兌換", exact: true })[0]).toBeDisabled());
  fireEvent.click(screen.getByRole("button", { name: "重試" }));
  expect(await screen.findByText("59 分")).toBeInTheDocument();
});

it("switches between all three panels and supports keyboard navigation", async () => {
  render(<PersonalPointsPage />);
  await screen.findByText("59 分");
  expect(screen.getAllByRole("tab")).toHaveLength(3);
  expect(screen.getByRole("tab", { name: "兌換", exact: true })).toHaveAttribute("aria-selected", "true");
  fireEvent.click(screen.getByRole("tab", { name: "兌換記錄" }));
  expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  expect(screen.queryByText("10代金券")).not.toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole("tab", { name: "兌換記錄" }), { key: "ArrowRight" });
  expect(screen.getByRole("tab", { name: "兌換", exact: true })).toHaveFocus();
  expect(await screen.findByText("10代金券")).toBeInTheDocument();
});

it("does not list redemption debits in the redemption panel", async () => {
  mocks.points.mockResolvedValue({ balance: 49, pending: 0, ledger: [
    { id: "earned", kind: "earn", points: 59, created_at: "2026-10-15T06:32:00Z" },
    { id: "redeemed", kind: "redeem", points: -10, created_at: "2026-10-15T07:32:00Z" },
  ] });
  render(<PersonalPointsPage />); await screen.findByText("49 分");
  fireEvent.click(screen.getByRole("tab", { name: "兌換記錄" }));
  expect(screen.queryByText("-10")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "賺取／使用記錄" }));
  expect(screen.getByText("-10")).toBeInTheDocument();
  expect(screen.getByText("完成訂單儲分")).toBeInTheDocument();
});

it("starts with ten records, reveals ten more on scroll and resets after switching tabs", async () => {
  let intersect: IntersectionObserverCallback = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: IntersectionObserverCallback) { intersect = callback; }
    observe = vi.fn(); disconnect = disconnect;
  });
  mocks.points.mockResolvedValue({ balance: 59, pending: 0, ledger: Array.from({ length: 25 }, (_, i) => ({ id: String(i), kind: "earn", points: 1, created_at: "2026-10-15T06:32:00Z" })) });
  try {
    render(<PersonalPointsPage />); await screen.findByText("59 分");
    fireEvent.click(screen.getByRole("tab", { name: "賺取／使用記錄" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    act(() => intersect([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver));
    expect(screen.getAllByRole("listitem")).toHaveLength(20);
    act(() => intersect([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver));
    expect(screen.getAllByRole("listitem")).toHaveLength(25);
    expect(document.querySelector(".personal-rewards-load-more")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "兌換記錄" }));
    fireEvent.click(screen.getByRole("tab", { name: "賺取／使用記錄" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
  } finally { vi.unstubAllGlobals(); }
});
