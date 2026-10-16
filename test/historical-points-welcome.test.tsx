import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { HistoricalPointsWelcome } from "@/components/customer-portal/HistoricalPointsWelcome";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), acknowledge: vi.fn() }));
vi.mock("@/lib/historical-reward-notice", () => ({ fetchHistoricalRewardNotice: mocks.fetch, acknowledgeHistoricalRewardNotice: mocks.acknowledge }));
const notice = { batchKey: "history", claimedAt: "2026-10-16T06:00:00Z", expiresAt: "2027-10-16T06:00:00Z", points: 1234 };
function mount() {
  return render(<MemoryRouter initialEntries={["/customer/personal"]}>
    <HistoricalPointsWelcome />
    <Routes><Route path="/customer/personal/points" element={<h1>Points destination</h1>} /><Route path="*" element={<button>Home control</button>} /></Routes>
  </MemoryRouter>);
}
beforeEach(() => { vi.clearAllMocks(); mocks.fetch.mockResolvedValue(notice); mocks.acknowledge.mockResolvedValue(undefined); });
describe("historical points welcome", () => {
  it("shows real credited points, Hong Kong expiry and the standalone illustration", async () => {
    mount();
    const dialog = await screen.findByRole("dialog", { name: /多謝支持，\s*積分已到帳！/ });
    expect(dialog).toHaveAccessibleDescription(/過去 12 個月的合資格訂單\s*已為你累積獎勵積分/);
    expect(screen.getByText("+ 1,234")).toBeVisible();
    expect(screen.getByText(/2027年10月16日/)).toBeVisible();
    expect(dialog.querySelector("img")).toHaveAttribute("src", "/assets/historical-points-thank-you.png");
    expect(mocks.acknowledge).not.toHaveBeenCalled();
  });
  it.each([null, new Error("unavailable")])("keeps login usable when no notice is available (%s)", async value => {
    if (value instanceof Error) mocks.fetch.mockRejectedValue(value); else mocks.fetch.mockResolvedValue(value);
    mount();
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Home control")).toBeVisible();
  });
  it("saves dismissal and does not display an acknowledged notice on the next login", async () => {
    const first = mount();
    fireEvent.click(await screen.findByRole("button", { name: "稍後再看" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.acknowledge).toHaveBeenCalledExactlyOnceWith(notice);
    first.unmount(); mocks.fetch.mockResolvedValue(null); mount();
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("opens the real points route after acknowledgement", async () => {
    mount(); fireEvent.click(await screen.findByRole("button", { name: "查看積分" }));
    expect(await screen.findByRole("heading", { name: "Points destination" })).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("allows a failed acknowledgement to be retried without claiming more points", async () => {
    mocks.acknowledge.mockRejectedValueOnce(new Error("offline")); mount();
    fireEvent.click(await screen.findByRole("button", { name: "稍後再看" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("積分已經到帳，唔會受影響");
    expect(screen.getByRole("dialog")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "稍後再看" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });
  it("prevents repeated acknowledgement clicks while saving", async () => {
    let finish!: () => void;
    mocks.acknowledge.mockReturnValue(new Promise<void>(resolve => { finish = resolve; })); mount();
    const later = await screen.findByRole("button", { name: "稍後再看" });
    fireEvent.click(later); fireEvent.click(later);
    expect(later).toBeDisabled(); expect(mocks.acknowledge).toHaveBeenCalledOnce();
    await act(async () => finish());
  });
  it("provides English UI while keeping the shared Thank you illustration", async () => {
    await i18n.changeLanguage("en-GB"); mount();
    expect(await screen.findByRole("button", { name: "View points" })).toBeVisible();
    expect(screen.getByText(/Use them by 16 October 2027/)).toBeVisible();
  });
});
